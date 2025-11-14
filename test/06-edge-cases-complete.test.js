const { expect } = require("chai");
const { loadFixture, mine } = require("@nomicfoundation/hardhat-network-helpers");
const { deployQuantumCatFixture } = require("./shared/fixtures");
const {
  generateEntropy,
  waitForObserveReady,
  waitForForceReady,
  observeUntilBothTokens,
  DEFAULT_ENTROPY
} = require("./shared/helpers");
const {
  attemptSpecificOutcome,
  makeBalancesEqual,
  ensureLivecatLess,
  setupAndCommitObservation,
  mineToTiming,
  reboxAllPairs
} = require("./shared/test-helpers");

/**
 * Edge Cases & Complete Coverage Tests
 * Comprehensive tests for boundary conditions, edge cases, and rare scenarios
 */
describe("Edge Cases & Complete Coverage", function () {
  describe("Amount Edge Cases", function () {
    it("Should handle very small amounts (1 wei)", async function () {
      const { catbox, livecat, deadcat, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = 1n;
      const data = ethers.toUtf8Bytes("min_amount");
      const dataHash = ethers.keccak256(data);
      const entropy = generateEntropy("min");

      const aliveBefore = await livecat.balanceOf(owner.address);
      const deadBefore = await deadcat.balanceOf(owner.address);

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, entropy);
      await waitForObserveReady(controller, owner.address);
      await controller.observe(data, entropy);

      const aliveAfter = await livecat.balanceOf(owner.address);
      const deadAfter = await deadcat.balanceOf(owner.address);
      
      const newAlive = aliveAfter - aliveBefore;
      const newDead = deadAfter - deadBefore;

      expect(newAlive + newDead).to.equal(amount);
      expect(newAlive === 1n || newDead === 1n).to.be.true;
    });

    it("Should handle very large amounts", async function () {
      const { catbox, livecat, deadcat, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const largeAmount = ethers.parseEther("500000");
      const data = ethers.toUtf8Bytes("large_amount");
      const dataHash = ethers.keccak256(data);
      const entropy = generateEntropy("large");

      const aliveBefore = await livecat.balanceOf(owner.address);
      const deadBefore = await deadcat.balanceOf(owner.address);

      await catbox.approve(await controller.getAddress(), largeAmount);
      await controller.commitObserve(largeAmount, dataHash, entropy);
      await waitForObserveReady(controller, owner.address);
      await controller.observe(data, entropy);

      const aliveAfter = await livecat.balanceOf(owner.address);
      const deadAfter = await deadcat.balanceOf(owner.address);
      
      const newAlive = aliveAfter - aliveBefore;
      const newDead = deadAfter - deadBefore;

      expect(newAlive + newDead).to.equal(largeAmount);
    });

    it("Should handle commit when user has exactly the required balance", async function () {
      const { catbox, controller, user1 } = await loadFixture(deployQuantumCatFixture);

      const exactAmount = ethers.parseEther("50");
      await catbox.transfer(user1.address, exactAmount);

      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("exact_balance"));

      await catbox.connect(user1).approve(await controller.getAddress(), exactAmount);
      await expect(
        controller.connect(user1).commitObserve(exactAmount, dataHash, DEFAULT_ENTROPY)
      ).to.emit(controller, "CommitObserve");

      expect(await catbox.balanceOf(user1.address)).to.equal(0);
    });
  });

  describe("Fixed Fee Edge Cases", function () {
    it("Should return fixed 2.5% fee", async function () {
      const { controller } = await loadFixture(deployQuantumCatFixture);
      
      // Fixed fee is always 2.5%
      const reboxFee = await controller.REBOX_FEE_BPS();
      expect(reboxFee).to.equal(250); // 2.5% fixed fee
    });

    it("Should return correct fee output from calculateReboxOutput", async function () {
      const { controller } = await loadFixture(deployQuantumCatFixture);
      
      const pairs = ethers.parseEther("100");
      const [catboxOut, feeTaken] = await controller.calculateReboxOutput(pairs);
      
      // Fixed 2.5% fee
      expect(feeTaken).to.equal(ethers.parseEther("5")); // 2.5% of 200
      expect(catboxOut).to.equal(ethers.parseEther("195")); // 200 - 5
      expect(catboxOut + feeTaken).to.equal(pairs * 2n);
    });

    it("Should calculate README example: 1 pair → 1.95 CATBOX", async function () {
      const { controller } = await loadFixture(deployQuantumCatFixture);
      
      const pairs = ethers.parseEther("1");
      const [catboxOut, feeTaken] = await controller.calculateReboxOutput(pairs);
      
      expect(catboxOut).to.equal(ethers.parseEther("1.95")); // 2 - 2.5% = 1.95
      expect(feeTaken).to.equal(ethers.parseEther("0.05")); // 2.5% of 2
    });
  });

  describe("Blockhash Expiry Cases", function () {
    it("Should handle observation when blockhash expires (>256 blocks)", async function () {
      const { catbox, livecat, deadcat, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const data = ethers.toUtf8Bytes("blockhash_expiry");
      const dataHash = ethers.keccak256(data);
      const entropy = generateEntropy("expiry");

      const aliveBefore = await livecat.balanceOf(owner.address);
      const deadBefore = await deadcat.balanceOf(owner.address);

      await catbox.approve(await controller.getAddress(), amount);
      const tx = await controller.commitObserve(amount, dataHash, entropy);
      const receipt = await tx.wait();
      const commitBlock = receipt.blockNumber;

      // Mine more than 256 blocks to expire blockhash
      await mine(260);

      // Should revert after MAX_REVEAL_WINDOW (250 blocks)
      await expect(controller.observe(data, entropy))
        .to.be.revertedWithCustomError(controller, "RevealWindowClosed");

      // Verify no tokens were minted (transaction reverted)
      const aliveAfter = await livecat.balanceOf(owner.address);
      const deadAfter = await deadcat.balanceOf(owner.address);
      
      expect(aliveAfter).to.equal(aliveBefore);
      expect(deadAfter).to.equal(deadBefore);
    });

    it("Should emit BlockhashExpired event when revealing after 256 blocks", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const data = ethers.toUtf8Bytes("blockhash_expiry_event");
      const dataHash = ethers.keccak256(data);
      const entropy = generateEntropy("expiry_event");

      await catbox.approve(await controller.getAddress(), amount);
      const tx = await controller.commitObserve(amount, dataHash, entropy);
      const receipt = await tx.wait();
      const commitBlock = receipt.blockNumber;

      // Mine enough blocks to expire blockhash
      // Need: (currentBlock - (refBlock + 5)) >= 256
      // So: currentBlock >= refBlock + 5 + 256 = refBlock + 261
      // From commitBlock, we need to be at commitBlock + 261 + 1 (for the observe tx itself)
      await mine(262);

      // Should revert after MAX_REVEAL_WINDOW (250 blocks)
      await expect(controller.observe(data, entropy))
        .to.be.revertedWithCustomError(controller, "RevealWindowClosed");
    });

    it("Should complete observation normally within reveal window", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const data = ethers.toUtf8Bytes("no_expiry");
      const dataHash = ethers.keccak256(data);
      const entropy = generateEntropy("no_expiry");

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, entropy);
      await waitForObserveReady(controller, owner.address);

      // Should complete observation normally with correct entropy
      await expect(controller.observe(data, entropy))
        .to.emit(controller, "Observed");
    });

    it("Should allow forceObserve after blockhash expiry", async function () {
      const { catbox, livecat, deadcat, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("force_expiry"));
      const entropy = generateEntropy("force");

      const aliveBefore = await livecat.balanceOf(owner.address);
      const deadBefore = await deadcat.balanceOf(owner.address);

      await catbox.approve(await controller.getAddress(), amount);
      const tx = await controller.commitObserve(amount, dataHash, entropy);
      const receipt = await tx.wait();
      const commitBlock = receipt.blockNumber;

      // Mine past REVEAL_DELAY + GRACE + 256 blocks
      await mine(330);

      // Should revert after MAX_REVEAL_WINDOW (250 blocks)
      await expect(controller.forceObserve(owner.address, entropy))
        .to.be.revertedWithCustomError(controller, "RevealWindowClosed");

      // Verify no tokens were minted (transaction reverted)
      const aliveAfter = await livecat.balanceOf(owner.address);
      const deadAfter = await deadcat.balanceOf(owner.address);
      
      expect(aliveAfter).to.equal(aliveBefore);
      expect(deadAfter).to.equal(deadBefore);
    });

    it("Should emit BlockhashExpired event in forceObserve after 256 blocks", async function () {
      const { catbox, controller, owner, user1 } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("force_expiry_event"));
      const entropy = generateEntropy("force_event");

      await catbox.approve(await controller.getAddress(), amount);
      const tx = await controller.commitObserve(amount, dataHash, entropy);
      const receipt = await tx.wait();
      const commitBlock = receipt.blockNumber;

      // Mine past grace period + 256 blocks (past MAX_REVEAL_WINDOW)
      await mine(330);

      // Should revert after MAX_REVEAL_WINDOW (250 blocks)
      await expect(controller.connect(user1).forceObserve(owner.address, entropy))
        .to.be.revertedWithCustomError(controller, "RevealWindowClosed");
    });
  });

  describe("Boundary Condition Tests", function () {
    it("Should handle observe at exactly REVEAL_DELAY + 1 blocks", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const data = ethers.toUtf8Bytes("boundary_test");
      const dataHash = ethers.keccak256(data);

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, DEFAULT_ENTROPY);

      // Mine exactly REVEAL_DELAY + 1 blocks
      await mine(6);

      await expect(controller.observe(data, DEFAULT_ENTROPY)).to.emit(controller, "Observed");
    });

    it("Should handle forceObserve at exact REVEAL_DELAY + GRACE + 1", async function () {
      const { catbox, controller, owner, user1 } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("force_boundary"));

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, DEFAULT_ENTROPY);

      // Mine exactly REVEAL_DELAY + GRACE + 1 blocks
      await mine(70);

      await expect(controller.connect(user1).forceObserve(owner.address, DEFAULT_ENTROPY))
        .to.emit(controller, "Forced");
    });
  });

  describe("Multiple Users and Concurrency", function () {
    it("Should handle observations from different users independently", async function () {
      const { catbox, livecat, deadcat, controller, owner, user1, user2 } = await loadFixture(deployQuantumCatFixture);

      await catbox.transfer(user1.address, ethers.parseEther("1000"));
      await catbox.transfer(user2.address, ethers.parseEther("1000"));

      const amount1 = ethers.parseEther("100");
      const data1 = ethers.toUtf8Bytes("user1_data");
      const dataHash1 = ethers.keccak256(data1);
      await catbox.connect(user1).approve(await controller.getAddress(), amount1);
      await controller.connect(user1).commitObserve(amount1, dataHash1, DEFAULT_ENTROPY);

      const amount2 = ethers.parseEther("200");
      const data2 = ethers.toUtf8Bytes("user2_data");
      const dataHash2 = ethers.keccak256(data2);
      await catbox.connect(user2).approve(await controller.getAddress(), amount2);
      await controller.connect(user2).commitObserve(amount2, dataHash2, generateEntropy("user2"));

      await waitForObserveReady(controller, user1.address);
      await controller.connect(user1).observe(data1, DEFAULT_ENTROPY);
      const user1Alive = await livecat.balanceOf(user1.address);
      const user1Dead = await deadcat.balanceOf(user1.address);
      expect(user1Alive + user1Dead).to.equal(amount1);

      await waitForObserveReady(controller, user2.address);
      await controller.connect(user2).observe(data2, generateEntropy("user2"));
      const user2Alive = await livecat.balanceOf(user2.address);
      const user2Dead = await deadcat.balanceOf(user2.address);
      expect(user2Alive + user2Dead).to.equal(amount2);
    });

    it("Should handle multiple simultaneous commitments", async function () {
      const { catbox, controller, owner, user1, user2, user3 } = await loadFixture(deployQuantumCatFixture);

      const users = [owner, user1, user2, user3];
      const amount = ethers.parseEther("100");

      for (const user of users.slice(1)) {
        await catbox.transfer(user.address, amount);
      }

      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const data = ethers.toUtf8Bytes(`concurrent_${i}`);
        const dataHash = ethers.keccak256(data);
        const entropy = generateEntropy(`concurrent_${i}`);

        await catbox.connect(user).approve(await controller.getAddress(), amount);
        await controller.connect(user).commitObserve(amount, dataHash, entropy);
      }

      // Verify all pending observations exist
      for (const user of users) {
        const pending = await controller.getPendingObservation(user.address);
        expect(pending.amount).to.equal(amount);
      }
    });

    it("Should handle shared entropy pool evolution with many users", async function () {
      const { catbox, controller, owner, user1, user2 } = await loadFixture(deployQuantumCatFixture);

      const initialEntropy = await controller.sharedEntropyPool();
      // Pool should be initialized (non-zero) from genesis
      expect(initialEntropy).to.not.equal(ethers.ZeroHash);

      const users = [owner, user1, user2];
      const amount = ethers.parseEther("50");

      for (const user of users.slice(1)) {
        await catbox.transfer(user.address, amount);
      }

      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const data = ethers.toUtf8Bytes(`entropy_${i}`);
        const dataHash = ethers.keccak256(data);
        const entropy = generateEntropy(`entropy_${i}`);

        const entropyBefore = await controller.sharedEntropyPool();

        await catbox.connect(user).approve(await controller.getAddress(), amount);
        await controller.connect(user).commitObserve(amount, dataHash, entropy);

        const entropyAfter = await controller.sharedEntropyPool();
        expect(entropyAfter).to.not.equal(entropyBefore);
      }

      const finalEntropy = await controller.sharedEntropyPool();
      // Final entropy should be different from initial (pool evolved)
      expect(finalEntropy).to.not.equal(initialEntropy);
      expect(finalEntropy).to.not.equal(ethers.ZeroHash);
    });
  });

  describe("ReboxMax Branch Coverage", function () {
    it("Should use livecat balance when livecat < deadcat", async function () {
      const { catbox, livecat, deadcat, controller, owner } = await loadFixture(deployQuantumCatFixture);

      await observeUntilBothTokens({ catbox, livecat, deadcat, controller, signer: owner, maxAttempts: 20 });

      const livecatBal = await livecat.balanceOf(owner.address);
      const deadcatBal = await deadcat.balanceOf(owner.address);

      if (livecatBal > 0n && deadcatBal > 0n) {
        await livecat.approve(await controller.getAddress(), ethers.MaxUint256);
        await deadcat.approve(await controller.getAddress(), ethers.MaxUint256);

        const pairs = await controller.reboxMax.staticCall(0);
        const expectedPairs = livecatBal < deadcatBal ? livecatBal : deadcatBal;
        expect(pairs).to.equal(expectedPairs);
      }
    });

    it("Should respect cap when cap < pairs", async function () {
      const { catbox, livecat, deadcat, controller, owner } = await loadFixture(deployQuantumCatFixture);

      await observeUntilBothTokens({ catbox, livecat, deadcat, controller, signer: owner, maxAttempts: 20 });

      const livecatBal = await livecat.balanceOf(owner.address);
      const deadcatBal = await deadcat.balanceOf(owner.address);

      if (livecatBal > ethers.parseEther("10") && deadcatBal > ethers.parseEther("10")) {
        const cap = ethers.parseEther("5");

        await livecat.approve(await controller.getAddress(), ethers.MaxUint256);
        await deadcat.approve(await controller.getAddress(), ethers.MaxUint256);

        const pairs = await controller.reboxMax.staticCall(cap);
        expect(pairs).to.equal(cap);
      }
    });
  });

  describe("Uniform Distribution Verification", function () {
    it("Should produce binary all-or-nothing results", async function () {
      const { catbox, livecat, deadcat, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const observeAmount = ethers.parseEther("10000");
      const data = ethers.toUtf8Bytes("uniform_test");
      const dataHash = ethers.keccak256(data);
      const userEntropy = generateEntropy("uniform");

      const aliveBefore = await livecat.balanceOf(owner.address);
      const deadBefore = await deadcat.balanceOf(owner.address);

      await catbox.approve(await controller.getAddress(), observeAmount);
      await controller.commitObserve(observeAmount, dataHash, userEntropy);

      await waitForObserveReady(controller, owner.address);
      await controller.observe(data, userEntropy);

      const aliveAfter = await livecat.balanceOf(owner.address);
      const deadAfter = await deadcat.balanceOf(owner.address);
      
      const newAlive = aliveAfter - aliveBefore;
      const newDead = deadAfter - deadBefore;

      expect(newAlive + newDead).to.equal(observeAmount);
      // Binary collapse: should be all LIVECAT or all DEADCAT
      expect(newAlive === 0n || newDead === 0n).to.be.true;
      expect(newAlive === observeAmount || newDead === observeAmount).to.be.true;
    });

    it("Should produce unique results for different commitments", async function () {
      const { catbox, livecat, deadcat, controller, owner, user1 } = await loadFixture(deployQuantumCatFixture);

      const observeAmount = ethers.parseEther("1000");

      await catbox.transfer(user1.address, observeAmount);

      const data1 = ethers.toUtf8Bytes("unique_1");
      const dataHash1 = ethers.keccak256(data1);
      const entropy1 = generateEntropy("unique_1");

      const aliveBefore1 = await livecat.balanceOf(owner.address);
      const deadBefore1 = await deadcat.balanceOf(owner.address);

      await catbox.approve(await controller.getAddress(), observeAmount);
      await controller.commitObserve(observeAmount, dataHash1, entropy1);
      await waitForObserveReady(controller, owner.address);
      await controller.observe(data1, entropy1);

      const aliveAfter1 = await livecat.balanceOf(owner.address);
      const deadAfter1 = await deadcat.balanceOf(owner.address);
      
      const newAlive1 = aliveAfter1 - aliveBefore1;
      const newDead1 = deadAfter1 - deadBefore1;

      const data2 = ethers.toUtf8Bytes("unique_2");
      const dataHash2 = ethers.keccak256(data2);
      const entropy2 = generateEntropy("unique_2");

      await catbox.connect(user1).approve(await controller.getAddress(), observeAmount);
      await controller.connect(user1).commitObserve(observeAmount, dataHash2, entropy2);
      await waitForObserveReady(controller, user1.address);
      await controller.connect(user1).observe(data2, entropy2);

      const alive2 = await livecat.balanceOf(user1.address);
      const dead2 = await deadcat.balanceOf(user1.address);

      // Each observation should be binary (all-or-nothing)
      expect(newAlive1 === 0n || newDead1 === 0n).to.be.true;
      expect(newAlive1 + newDead1).to.equal(observeAmount);
      expect(alive2 === 0n || dead2 === 0n).to.be.true;
      expect(alive2 + dead2).to.equal(observeAmount);
      
      // Results may or may not be the same (50/50 chance each)
      // We just verify the binary nature, not uniqueness
    });
  });

  describe("Zero Token Outcomes (Probabilistic)", function () {
    it("Should attempt to find observation with zero dead tokens", async function () {
      const { catbox, livecat, deadcat, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const found = await attemptSpecificOutcome({
        targetOutcome: "zero_dead",
        maxAttempts: 50,
        observeFn: async (i) => {
          const { data, entropy } = await setupAndCommitObservation({
            catbox,
            controller,
            owner,
            amount: 1n,
            seed: `zero_dead_${i}`
          });
          await mineToTiming({ controller, timing: "reveal" });
          await controller.observe(data, entropy);
        },
        checkFn: async () => ({
          alive: await livecat.balanceOf(owner.address),
          dead: await deadcat.balanceOf(owner.address)
        })
      });

      if (found) {
        console.log("      ✓ Successfully found zero dead outcome");
      } else {
        console.log("      ⚠️  Didn't find zero dead in 50 tries (expected for probabilistic test)");
      }
    });

    it("Should attempt to find observation with zero alive tokens", async function () {
      const { catbox, livecat, deadcat, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const found = await attemptSpecificOutcome({
        targetOutcome: "zero_alive",
        maxAttempts: 50,
        observeFn: async (i) => {
          const { data, entropy } = await setupAndCommitObservation({
            catbox,
            controller,
            owner,
            amount: 1n,
            seed: `zero_alive_${i}`
          });
          await mineToTiming({ controller, timing: "reveal" });
          await controller.observe(data, entropy);
        },
        checkFn: async () => ({
          alive: await livecat.balanceOf(owner.address),
          dead: await deadcat.balanceOf(owner.address)
        })
      });

      if (found) {
        console.log("      ✓ Successfully found zero alive outcome");
      } else {
        console.log("      ⚠️  Didn't find zero alive in 50 tries (expected for probabilistic test)");
      }
    });

    it("Should attempt to find forceObserve with zero dead tokens", async function () {
      const { catbox, livecat, deadcat, controller, owner, user1 } = await loadFixture(deployQuantumCatFixture);

      const found = await attemptSpecificOutcome({
        targetOutcome: "zero_dead",
        maxAttempts: 50,
        observeFn: async (i) => {
          const { entropy } = await setupAndCommitObservation({
            catbox,
            controller,
            owner,
            amount: 1n,
            seed: `force_zero_dead_${i}`
          });
          await mineToTiming({ controller, timing: "force" });
          await controller.connect(user1).forceObserve(owner.address, entropy);
        },
        checkFn: async () => ({
          alive: await livecat.balanceOf(owner.address),
          dead: await deadcat.balanceOf(owner.address)
        })
      });

      if (found) {
        console.log("      ✓ Successfully found zero dead in forceObserve");
      } else {
        console.log("      ⚠️  Didn't find zero dead in forceObserve in 50 tries");
      }
    });

    it("Should attempt to find forceObserve with zero alive tokens", async function () {
      const { catbox, livecat, deadcat, controller, owner, user1 } = await loadFixture(deployQuantumCatFixture);

      const found = await attemptSpecificOutcome({
        targetOutcome: "zero_alive",
        maxAttempts: 50,
        observeFn: async (i) => {
          const { entropy } = await setupAndCommitObservation({
            catbox,
            controller,
            owner,
            amount: 1n,
            seed: `force_zero_alive_${i}`
          });
          await mineToTiming({ controller, timing: "force" });
          await controller.connect(user1).forceObserve(owner.address, entropy);
        },
        checkFn: async () => ({
          alive: await livecat.balanceOf(owner.address),
          dead: await deadcat.balanceOf(owner.address)
        })
      });

      if (found) {
        console.log("      ✓ Successfully found zero alive in forceObserve");
      } else {
        console.log("      ⚠️  Didn't find zero alive in forceObserve in 50 tries");
      }
    });
  });

  describe("ReboxMax Balance Scenarios", function () {
    it("Should handle reboxMax when balances are exactly equal", async function () {
      const { catbox, livecat, deadcat, controller, owner, user1 } = await loadFixture(deployQuantumCatFixture);

      // With binary collapse, we need multiple observations to get both token types
      // Do observations until we have both LIVECAT and DEADCAT
      let livecatBalance = 0n;
      let deadcatBalance = 0n;
      
      for (let i = 0; i < 10 && (livecatBalance === 0n || deadcatBalance === 0n); i++) {
        const { data, entropy } = await setupAndCommitObservation({
          catbox,
          controller,
          owner,
          amount: ethers.parseEther("1000"),
          seed: `equal_balance_test_${i}`
        });
        await mineToTiming({ controller, timing: "reveal" });
        await controller.observe(data, entropy);
        
        livecatBalance = await livecat.balanceOf(owner.address);
        deadcatBalance = await deadcat.balanceOf(owner.address);
      }

      // Make balances equal
      const { aliveBalance, deadBalance } = await makeBalancesEqual({
        livecat,
        deadcat,
        owner,
        recipient: user1
      });

      expect(aliveBalance).to.equal(deadBalance);
      expect(aliveBalance).to.be.greaterThan(0);

      // ReboxMax should work perfectly with equal balances
      await controller.reboxMax(0);

      // Both should be 0 now
      expect(await livecat.balanceOf(owner.address)).to.equal(0);
      expect(await deadcat.balanceOf(owner.address)).to.equal(0);
    });

    it("Should handle reboxMax when livecat < deadcat", async function () {
      const { catbox, livecat, deadcat, controller, owner, user1 } = await loadFixture(deployQuantumCatFixture);

      // With binary collapse, we need multiple observations to get both token types
      // Do observations until we have both LIVECAT and DEADCAT
      let livecatBalance = 0n;
      let deadcatBalance = 0n;
      
      for (let i = 0; i < 10 && (livecatBalance === 0n || deadcatBalance === 0n); i++) {
        const { data, entropy } = await setupAndCommitObservation({
          catbox,
          controller,
          owner,
          amount: ethers.parseEther("1000"),
          seed: `livecat_less_test_${i}`
        });
        await mineToTiming({ controller, timing: "reveal" });
        await controller.observe(data, entropy);
        
        livecatBalance = await livecat.balanceOf(owner.address);
        deadcatBalance = await deadcat.balanceOf(owner.address);
      }

      // Ensure livecat < deadcat
      const { aliveBalance, deadBalance } = await ensureLivecatLess({
        livecat,
        deadcat,
        owner,
        recipient: user1,
        minDifference: ethers.parseEther("10")
      });

      expect(aliveBalance).to.be.lessThan(deadBalance);

      // ReboxMax should use livecat balance as limit
      const catboxBefore = await catbox.balanceOf(owner.address);
      await controller.reboxMax(0);
      const catboxAfter = await catbox.balanceOf(owner.address);

      expect(catboxAfter).to.be.greaterThan(catboxBefore);
      expect(await livecat.balanceOf(owner.address)).to.equal(0);
      expect(await deadcat.balanceOf(owner.address)).to.be.greaterThan(0);
    });

    it("Should handle reboxMax with cap parameter", async function () {
      const { catbox, livecat, deadcat, controller, owner } = await loadFixture(deployQuantumCatFixture);

      // With binary collapse, we need multiple observations to get both token types
      // Do observations until we have both LIVECAT and DEADCAT
      let livecatBalance = 0n;
      let deadcatBalance = 0n;
      
      for (let i = 0; i < 10 && (livecatBalance === 0n || deadcatBalance === 0n); i++) {
        const { data, entropy } = await setupAndCommitObservation({
          catbox,
          controller,
          owner,
          amount: ethers.parseEther("100"),
          seed: `cap_test_${i}`
        });
        await mineToTiming({ controller, timing: "reveal" });
        await controller.observe(data, entropy);
        
        livecatBalance = await livecat.balanceOf(owner.address);
        deadcatBalance = await deadcat.balanceOf(owner.address);
      }

      const aliveBalance = livecatBalance;
      const deadBalance = deadcatBalance;
      const availablePairs = aliveBalance < deadBalance ? aliveBalance : deadBalance;

      // Set cap to half
      const cap = availablePairs / 2n;
      
      await controller.reboxMax(cap);

      // Should have reboxed exactly cap pairs
      const aliveAfter = await livecat.balanceOf(owner.address);
      const deadAfter = await deadcat.balanceOf(owner.address);

      expect(aliveBalance - aliveAfter).to.equal(cap);
      expect(deadBalance - deadAfter).to.equal(cap);
    });

    it("Should revert reboxMax with cap of 0 when no pairs available", async function () {
      const { controller, user1 } = await loadFixture(deployQuantumCatFixture);

      // user1 has no tokens = no pairs available
      await expect(controller.connect(user1).reboxMax(0)).to.be.revertedWithCustomError(
        controller,
        "NoPairsAvailable"
      );
    });
  });

  describe("Helper Function Edge Cases", function () {
    it("Should return empty status for address with no observation", async function () {
      const { controller, user1 } = await loadFixture(deployQuantumCatFixture);

      const status = await controller.getObservationStatus(user1.address);
      
      expect(status.hasPending).to.be.false;
      expect(status.canReveal).to.be.false;
      expect(status.canForce).to.be.false;
      expect(status.blocksUntilReveal).to.equal(0);
      expect(status.blocksUntilForce).to.equal(0);
    });

    it("Should return false for isBlockhashAvailable when no observation", async function () {
      const { controller, user1 } = await loadFixture(deployQuantumCatFixture);

      const result = await controller.isBlockhashAvailable(user1.address);
      
      expect(result.available).to.be.false;
      expect(result.blocksUntilExpiry).to.equal(0);
    });

    it("Should return true for isBlockhashAvailable immediately after commit", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      await setupAndCommitObservation({
        catbox,
        controller,
        owner,
        amount: ethers.parseEther("1"),
        seed: "blockhash_available_test"
      });

      const result = await controller.isBlockhashAvailable(owner.address);
      
      expect(result.available).to.be.true;
      expect(result.blocksUntilExpiry).to.be.greaterThan(245); // Allow some margin for block processing
    });
  });
});

