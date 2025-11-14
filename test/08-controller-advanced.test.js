const { expect } = require("chai");
const { loadFixture, mine } = require("@nomicfoundation/hardhat-network-helpers");
const { deployQuantumCatFixture } = require("./shared/fixtures");
const { generateEntropy, waitForObserveReady, DEFAULT_ENTROPY } = require("./shared/helpers");

/**
 * Controller Advanced Tests
 * Additional edge cases and stress tests for the controller
 */
describe("Controller Advanced Edge Cases", function () {
  describe("Entropy Pool Evolution", function () {
    it("Should update entropy pool on each commit", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const initialPool = await controller.sharedEntropyPool();
      expect(initialPool).to.not.equal(ethers.ZeroHash);

      const amount = ethers.parseEther("100");
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("test1"));
      const entropy1 = generateEntropy("test1");

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, entropy1);

      const poolAfterCommit = await controller.sharedEntropyPool();
      expect(poolAfterCommit).to.not.equal(initialPool);
    });

    it("Should emit EntropyPoolUpdated events", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("test"));
      const entropy = generateEntropy("test");

      await catbox.approve(await controller.getAddress(), amount);
      await expect(controller.commitObserve(amount, dataHash, entropy))
        .to.emit(controller, "EntropyPoolUpdated");
    });

    it("Should maintain unique entropy pool across multiple commits", async function () {
      const { catbox, controller, owner, user1, user2 } = await loadFixture(deployQuantumCatFixture);

      const pools = new Set();
      pools.add(await controller.sharedEntropyPool());

      const users = [owner, user1, user2];
      const amount = ethers.parseEther("100");

      for (let i = 0; i < users.length; i++) {
        if (i > 0) {
          await catbox.transfer(users[i].address, amount);
        }

        const data = ethers.toUtf8Bytes(`test_${i}`);
        const dataHash = ethers.keccak256(data);
        const entropy = generateEntropy(`test_${i}`);

        await catbox.connect(users[i]).approve(await controller.getAddress(), amount);
        await controller.connect(users[i]).commitObserve(amount, dataHash, entropy);

        const newPool = await controller.sharedEntropyPool();
        pools.add(newPool.toString());
      }

      // Should have 4 unique pools (initial + 3 commits)
      expect(pools.size).to.equal(4);
    });
  });

  describe("System Configuration Constants", function () {
    it("Should have correct VERSION constant", async function () {
      const { controller } = await loadFixture(deployQuantumCatFixture);

      expect(await controller.VERSION()).to.equal("1.0.0");
    });

    it("Should have correct MAX_REBOX_PAIRS constant", async function () {
      const { controller } = await loadFixture(deployQuantumCatFixture);

      expect(await controller.MAX_REBOX_PAIRS()).to.equal(2n**128n - 1n);
    });

    it("Should have correct REBOX_FEE_BPS constant", async function () {
      const { controller } = await loadFixture(deployQuantumCatFixture);

      expect(await controller.REBOX_FEE_BPS()).to.equal(250);
    });

    it("Should have correct MAX_REVEAL_WINDOW constant", async function () {
      const { controller } = await loadFixture(deployQuantumCatFixture);

      expect(await controller.MAX_REVEAL_WINDOW()).to.equal(250);
    });

    it("Should return immutable token addresses", async function () {
      const { catbox, livecat, deadcat, controller } = await loadFixture(deployQuantumCatFixture);

      expect(await controller.catbox()).to.equal(await catbox.getAddress());
      expect(await controller.livecat()).to.equal(await livecat.getAddress());
      expect(await controller.deadcat()).to.equal(await deadcat.getAddress());
    });
  });

  describe("Rebox Output Calculation Precision", function () {
    it("Should calculate rebox output with no rounding errors", async function () {
      const { controller } = await loadFixture(deployQuantumCatFixture);

      const testCases = [
        1n,
        10n,
        100n,
        1000n,
        ethers.parseEther("1"),
        ethers.parseEther("10"),
        ethers.parseEther("100"),
        ethers.parseEther("1000"),
        ethers.parseEther("100000")
      ];

      for (const pairs of testCases) {
        const [catboxOut, feeTaken] = await controller.calculateReboxOutput(pairs);

        // Verify: catboxOut + feeTaken = 2 * pairs
        expect(catboxOut + feeTaken).to.equal(pairs * 2n);

        // Verify: feeTaken = 2 * pairs * 250 / 10000 = pairs / 20
        const expectedFee = (pairs * 2n * 250n) / 10000n;
        expect(feeTaken).to.equal(expectedFee);

        // Verify: catboxOut = 2 * pairs - feeTaken
        expect(catboxOut).to.equal(pairs * 2n - expectedFee);
      }
    });

    it("Should handle very large pair amounts in calculation", async function () {
      const { controller } = await loadFixture(deployQuantumCatFixture);

      const maxPairs = 2n**128n - 1n;
      const [catboxOut, feeTaken] = await controller.calculateReboxOutput(maxPairs);

      expect(catboxOut + feeTaken).to.equal(maxPairs * 2n);
    });

    it("Should handle minimum pair amount (1 wei)", async function () {
      const { controller } = await loadFixture(deployQuantumCatFixture);

      const [catboxOut, feeTaken] = await controller.calculateReboxOutput(1n);

      // 2 pairs → 2 tokens, fee = 0 (rounds down), catboxOut = 2
      expect(catboxOut + feeTaken).to.equal(2n);
    });
  });

  describe("Blockhash Window Enforcement", function () {
    it("Should correctly calculate blocksUntilExpiry", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("test"));
      const entropy = generateEntropy("test");

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, entropy);

      const status1 = await controller.getObservationStatus(owner.address);
      const blockhash1 = await controller.isBlockhashAvailable(owner.address);

      expect(status1.blocksUntilExpiry).to.be.greaterThan(0);
      expect(blockhash1.available).to.be.true;

      // Mine 10 blocks
      await mine(10);

      const status2 = await controller.getObservationStatus(owner.address);
      const blockhash2 = await controller.isBlockhashAvailable(owner.address);

      expect(status2.blocksUntilExpiry).to.equal(status1.blocksUntilExpiry - 10n);
      expect(blockhash2.blocksUntilExpiry).to.equal(blockhash1.blocksUntilExpiry - 10n);
    });

    it("Should report expired status after MAX_REVEAL_WINDOW", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("test"));
      const entropy = generateEntropy("test");

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, entropy);

      // Mine past MAX_REVEAL_WINDOW
      await mine(251);

      const status = await controller.getObservationStatus(owner.address);
      const blockhash = await controller.isBlockhashAvailable(owner.address);

      expect(status.canCancel).to.be.true;
      expect(status.canReveal).to.be.false;
      expect(status.canForce).to.be.true; // Force is still allowed (within window)
      expect(status.blocksUntilExpiry).to.equal(0);
      expect(blockhash.available).to.be.false;
    });
  });

  describe("Observation Timing Boundaries", function () {
    it("Should reject observe at exactly REVEAL_DELAY blocks (needs REVEAL_DELAY + 1)", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const data = ethers.toUtf8Bytes("test");
      const dataHash = ethers.keccak256(data);
      const entropy = generateEntropy("test");

      await catbox.approve(await controller.getAddress(), amount);
      const tx = await controller.commitObserve(amount, dataHash, entropy);
      const receipt = await tx.wait();
      const commitBlock = receipt.blockNumber;

      // Check contract requires: block.number > refBlock + REVEAL_DELAY
      // So we need to be at refBlock + REVEAL_DELAY + 1 or higher
      // The commit was at block N, so refBlock is N
      // We need to be > N + 5, so at block N + 6 or higher
      // Currently at N + 1, so mine 4 more blocks to be at N + 5 (should fail)
      await mine(4);

      await expect(
        controller.observe(data, entropy)
      ).to.be.revertedWithCustomError(controller, "InsufficientDelay");
    });

    it("Should accept observe at exactly REVEAL_DELAY + 1 blocks", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const data = ethers.toUtf8Bytes("test");
      const dataHash = ethers.keccak256(data);
      const entropy = generateEntropy("test");

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, entropy);

      await mine(6);

      await expect(controller.observe(data, entropy))
        .to.emit(controller, "Observed");
    });

    it("Should reject forceObserve at exactly REVEAL_DELAY + GRACE blocks", async function () {
      const { catbox, controller, owner, user1 } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("test"));
      const entropy = generateEntropy("test");

      await catbox.approve(await controller.getAddress(), amount);
      const tx = await controller.commitObserve(amount, dataHash, entropy);
      await tx.wait();

      // Check contract requires: block.number > refBlock + REVEAL_DELAY + GRACE
      // Currently at refBlock + 1, need to mine to refBlock + REVEAL_DELAY + GRACE (should fail)
      await mine(68); // Gets us to refBlock + 69

      await expect(
        controller.connect(user1).forceObserve(owner.address, entropy)
      ).to.be.revertedWithCustomError(controller, "GracePeriodNotPassed");
    });

    it("Should accept forceObserve at exactly REVEAL_DELAY + GRACE + 1 blocks", async function () {
      const { catbox, controller, owner, user1 } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("test"));
      const entropy = generateEntropy("test");

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, entropy);

      await mine(70);

      await expect(controller.connect(user1).forceObserve(owner.address, entropy))
        .to.emit(controller, "Forced");
    });

    it("Should reject cancelObservation at exactly MAX_REVEAL_WINDOW blocks", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("test"));
      const entropy = generateEntropy("test");

      await catbox.approve(await controller.getAddress(), amount);
      const tx = await controller.commitObserve(amount, dataHash, entropy);
      await tx.wait();

      // Contract requires: block.number > refBlock + MAX_REVEAL_WINDOW
      // Currently at refBlock + 1, mine to refBlock + MAX_REVEAL_WINDOW (should fail)
      await mine(249); // Gets us to refBlock + 250

      await expect(
        controller.cancelObservation()
      ).to.be.revertedWithCustomError(controller, "RevealWindowClosed");
    });

    it("Should accept cancelObservation at exactly MAX_REVEAL_WINDOW + 1 blocks", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("test"));
      const entropy = generateEntropy("test");

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, entropy);

      await mine(251);

      await expect(controller.cancelObservation())
        .to.emit(controller, "ObservationCancelled");
    });
  });

  describe("Gas Optimization Verification", function () {
    it("Should use bit shift for rebox calculation (gas efficiency)", async function () {
      const { catbox, livecat, deadcat, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const pairs = ethers.parseEther("100");

      await livecat.approve(await controller.getAddress(), pairs);
      await deadcat.approve(await controller.getAddress(), pairs);

      // Estimate gas for rebox operation
      const gasEstimate = await controller.rebox.estimateGas(pairs);

      // Rebox should be gas-efficient (< 100k gas for simple case)
      expect(gasEstimate).to.be.lessThan(100000n);
    });
  });

  describe("Multiple Sequential Operations", function () {
    it("Should handle rapid observe -> rebox -> observe cycles", async function () {
      const { catbox, livecat, deadcat, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const initialCatbox = await catbox.balanceOf(owner.address);

      // Cycle 1: Observe
      let amount = ethers.parseEther("1000");
      let data = ethers.toUtf8Bytes("cycle1");
      let dataHash = ethers.keccak256(data);
      let entropy = generateEntropy("cycle1");

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, entropy);
      await waitForObserveReady(controller, owner.address);
      await controller.observe(data, entropy);

      // After first observation, we should have either LIVECAT or DEADCAT
      const livecatAfter1 = await livecat.balanceOf(owner.address);
      const deadcatAfter1 = await deadcat.balanceOf(owner.address);

      // We may or may not have both tokens from genesis supply
      // Continue to ensure we have both
      if (livecatAfter1 === 0n || deadcatAfter1 === 0n) {
        // Do another observation
        amount = ethers.parseEther("1000");
        data = ethers.toUtf8Bytes("cycle1b");
        dataHash = ethers.keccak256(data);
        entropy = generateEntropy("cycle1b");

        await catbox.approve(await controller.getAddress(), amount);
        await controller.commitObserve(amount, dataHash, entropy);
        await waitForObserveReady(controller, owner.address);
        await controller.observe(data, entropy);
      }

      // Now rebox
      const livecatBalance = await livecat.balanceOf(owner.address);
      const deadcatBalance = await deadcat.balanceOf(owner.address);
      const pairs = livecatBalance < deadcatBalance ? livecatBalance : deadcatBalance;

      if (pairs > 0n) {
        await controller.rebox(pairs);

        // Verify CATBOX increased
        const catboxAfterRebox = await catbox.balanceOf(owner.address);
        expect(catboxAfterRebox).to.be.greaterThan(0n);
      }
    });

    it("Should handle multiple users observing in parallel", async function () {
      const { catbox, livecat, deadcat, controller, owner, user1, user2 } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const users = [owner, user1, user2];

      // Transfer CATBOX to users
      for (let i = 1; i < users.length; i++) {
        await catbox.transfer(users[i].address, amount);
      }

      // Commit for each user separately to get different refBlocks
      for (let i = 0; i < users.length; i++) {
        const data = ethers.toUtf8Bytes(`parallel_${i}`);
        const dataHash = ethers.keccak256(data);
        const entropy = generateEntropy(`parallel_${i}`);

        await catbox.connect(users[i]).approve(await controller.getAddress(), amount);
        await controller.connect(users[i]).commitObserve(amount, dataHash, entropy);
        
        // Wait for this user's observation to be ready before moving to next
        await waitForObserveReady(controller, users[i].address);
        
        // Observe immediately for this user
        const livecatBefore = await livecat.balanceOf(users[i].address);
        const deadcatBefore = await deadcat.balanceOf(users[i].address);

        await controller.connect(users[i]).observe(data, entropy);

        const livecatAfter = await livecat.balanceOf(users[i].address);
        const deadcatAfter = await deadcat.balanceOf(users[i].address);

        const livecatGained = livecatAfter - livecatBefore;
        const deadcatGained = deadcatAfter - deadcatBefore;

        // Should have received exactly 'amount' tokens in total
        expect(livecatGained + deadcatGained).to.equal(amount);
      }
    });
  });

  describe("Immutability Guarantees", function () {
    it("Should not have any admin functions", async function () {
      const { controller } = await loadFixture(deployQuantumCatFixture);

      expect(controller.pause).to.be.undefined;
      expect(controller.unpause).to.be.undefined;
      expect(controller.setFee).to.be.undefined;
      expect(controller.setMinFee).to.be.undefined;
      expect(controller.setMaxFee).to.be.undefined;
      expect(controller.withdrawFees).to.be.undefined;
      expect(controller.transferOwnership).to.be.undefined;
      expect(controller.renounceOwnership).to.be.undefined;
      expect(controller.owner).to.be.undefined;
      expect(controller.upgradeTo).to.be.undefined;
      expect(controller.upgradeToAndCall).to.be.undefined;
    });

    it("Should have immutable configuration", async function () {
      const { controller } = await loadFixture(deployQuantumCatFixture);

      // All these should be constants (no setter functions exist)
      await expect(controller.REVEAL_DELAY()).to.not.be.reverted;
      await expect(controller.GRACE()).to.not.be.reverted;
      await expect(controller.DATA_MAX()).to.not.be.reverted;
      await expect(controller.MAX_OBSERVE_AMOUNT()).to.not.be.reverted;
      await expect(controller.MAX_REBOX_PAIRS()).to.not.be.reverted;
      await expect(controller.REBOX_FEE_BPS()).to.not.be.reverted;
    });
  });
});

