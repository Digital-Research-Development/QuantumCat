const { expect } = require("chai");
const { loadFixture, mine } = require("@nomicfoundation/hardhat-network-helpers");
const { deployQuantumCatFixture } = require("./shared/fixtures");
const {
  generateEntropy,
  waitForObserveReady,
  waitForForceReady,
  performObservation,
  observeUntilBothTokens,
  DEFAULT_ENTROPY
} = require("./shared/helpers");

/**
 * Core Functionality Tests
 * Tests commit-reveal observation, force observe, and rebox functionality
 */
describe("Core Observe & Rebox Functionality", function () {
  describe("Commit Phase", function () {
    it("Should commit observation and burn CATBOX", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const data = ethers.toUtf8Bytes("test_data");
      const dataHash = ethers.keccak256(data);

      const balanceBefore = await catbox.balanceOf(owner.address);

      await catbox.approve(await controller.getAddress(), amount);
      await expect(controller.commitObserve(amount, dataHash, DEFAULT_ENTROPY))
        .to.emit(controller, "CommitObserve");

      const balanceAfter = await catbox.balanceOf(owner.address);
      expect(balanceBefore - balanceAfter).to.equal(amount);

      const pending = await controller.getPendingObservation(owner.address);
      expect(pending.amount).to.equal(amount);
      expect(pending.dataHash).to.equal(dataHash);
    });

    it("Should update shared entropy pool on commit", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const poolBefore = await controller.sharedEntropyPool();
      // Pool should be initialized (non-zero) from genesis
      expect(poolBefore).to.not.equal(ethers.ZeroHash);

      const amount = ethers.parseEther("100");
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("test"));

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, DEFAULT_ENTROPY);

      const poolAfter = await controller.sharedEntropyPool();
      // Pool should change after commit
      expect(poolAfter).to.not.equal(ethers.ZeroHash);
      expect(poolAfter).to.not.equal(poolBefore);
    });

    it("Should revert if already has pending observation", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("test"));

      await catbox.approve(await controller.getAddress(), amount * 2n);
      await controller.commitObserve(amount, dataHash, DEFAULT_ENTROPY);

      await expect(
        controller.commitObserve(amount, dataHash, DEFAULT_ENTROPY)
      ).to.be.revertedWithCustomError(controller, "PendingObservationExists");
    });

    it("Should revert if amount is 0", async function () {
      const { controller } = await loadFixture(deployQuantumCatFixture);

      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("test"));

      await expect(
        controller.commitObserve(0, dataHash, DEFAULT_ENTROPY)
      ).to.be.revertedWithCustomError(controller, "InvalidAmount");
    });

    it("Should revert if entropy is zero", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("test"));

      await catbox.approve(await controller.getAddress(), amount);

      await expect(
        controller.commitObserve(amount, dataHash, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(controller, "ZeroEntropy");
    });

    it("Should revert if insufficient CATBOX balance", async function () {
      const { controller, user1 } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("test"));

      await expect(
        controller.connect(user1).commitObserve(amount, dataHash, DEFAULT_ENTROPY)
      ).to.be.reverted; // ERC20 insufficient balance
    });
  });

  describe("Reveal Phase", function () {
    it("Should reveal observation and mint LIVECAT and DEADCAT", async function () {
      const { catbox, livecat, deadcat, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const data = ethers.toUtf8Bytes("test_reveal");
      const dataHash = ethers.keccak256(data);

      // Record initial balances (genesis supply)
      const initialLivecatBalance = await livecat.balanceOf(owner.address);
      const initialDeadcatBalance = await deadcat.balanceOf(owner.address);

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, DEFAULT_ENTROPY);

      await waitForObserveReady(controller, owner.address);

      await expect(controller.observe(data, DEFAULT_ENTROPY))
        .to.emit(controller, "Observed");

      const finalLivecatBalance = await livecat.balanceOf(owner.address);
      const finalDeadcatBalance = await deadcat.balanceOf(owner.address);

      // Calculate the newly minted tokens (subtract genesis supply)
      const newLivecat = finalLivecatBalance - initialLivecatBalance;
      const newDeadcat = finalDeadcatBalance - initialDeadcatBalance;

      expect(newLivecat + newDeadcat).to.equal(amount);
      // Binary collapse: should be all LIVECAT or all DEADCAT
      expect(newLivecat === 0n || newDeadcat === 0n).to.be.true;
      expect(newLivecat === amount || newDeadcat === amount).to.be.true;

      // Pending should be cleared
      const pending = await controller.getPendingObservation(owner.address);
      expect(pending.amount).to.equal(0);
    });

    it("Should update shared entropy pool on observe", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const data = ethers.toUtf8Bytes("test_entropy");
      const dataHash = ethers.keccak256(data);

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, DEFAULT_ENTROPY);

      const poolAfterCommit = await controller.sharedEntropyPool();

      await waitForObserveReady(controller, owner.address);
      await controller.observe(data, DEFAULT_ENTROPY);

      const poolAfterObserve = await controller.sharedEntropyPool();

      expect(poolAfterObserve).to.not.equal(poolAfterCommit);
    });

    it("Should revert if trying to observe before delay", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const data = ethers.toUtf8Bytes("test");
      const dataHash = ethers.keccak256(data);

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, DEFAULT_ENTROPY);

      await expect(
        controller.observe(data, DEFAULT_ENTROPY)
      ).to.be.revertedWithCustomError(controller, "InsufficientDelay");
    });

    it("Should revert if no pending observation", async function () {
      const { controller } = await loadFixture(deployQuantumCatFixture);

      const data = ethers.toUtf8Bytes("test");

      await expect(
        controller.observe(data, DEFAULT_ENTROPY)
      ).to.be.revertedWithCustomError(controller, "NoPendingObservation");
    });

    it("Should revert if data doesn't match hash", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const data = ethers.toUtf8Bytes("correct_data");
      const wrongData = ethers.toUtf8Bytes("wrong_data");
      const dataHash = ethers.keccak256(data);

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, DEFAULT_ENTROPY);

      await waitForObserveReady(controller, owner.address);

      await expect(
        controller.observe(wrongData, DEFAULT_ENTROPY)
      ).to.be.revertedWithCustomError(controller, "HashMismatch");
    });

    it("Should revert if data is too long", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const longData = new Uint8Array(300); // Exceeds DATA_MAX
      const dataHash = ethers.keccak256(longData);

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, DEFAULT_ENTROPY);

      await waitForObserveReady(controller, owner.address);

      await expect(
        controller.observe(longData, DEFAULT_ENTROPY)
      ).to.be.revertedWithCustomError(controller, "DataTooLarge");
    });

    it("Should handle maximum data length (256 bytes)", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const maxData = new Uint8Array(256); // Exactly DATA_MAX
      for (let i = 0; i < 256; i++) {
        maxData[i] = i % 256;
      }
      const dataHash = ethers.keccak256(maxData);

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, DEFAULT_ENTROPY);
      await waitForObserveReady(controller, owner.address);
      
      await expect(controller.observe(maxData, DEFAULT_ENTROPY)).to.not.be.reverted;
    });

    it("Should allow multiple sequential observations", async function () {
      const { catbox, livecat, deadcat, controller, owner } = await loadFixture(deployQuantumCatFixture);

      // Record initial balances (genesis supply)
      const initialLivecatBalance = await livecat.balanceOf(owner.address);
      const initialDeadcatBalance = await deadcat.balanceOf(owner.address);

      for (let i = 0; i < 3; i++) {
        const amount = ethers.parseEther("50");
        const data = ethers.toUtf8Bytes(`sequential_${i}`);
        const dataHash = ethers.keccak256(data);
        const entropy = generateEntropy(`sequential_${i}`);

        await catbox.approve(await controller.getAddress(), amount);
        await controller.commitObserve(amount, dataHash, entropy);
        await waitForObserveReady(controller, owner.address);
        await controller.observe(data, entropy);

        // Verify observation completed
        const pending = await controller.getPendingObservation(owner.address);
        expect(pending.amount).to.equal(0);
      }

      // Should have received total tokens equal to total observed (plus genesis)
      const finalLivecatBalance = await livecat.balanceOf(owner.address);
      const finalDeadcatBalance = await deadcat.balanceOf(owner.address);
      
      // Calculate newly minted tokens
      const newLivecat = finalLivecatBalance - initialLivecatBalance;
      const newDeadcat = finalDeadcatBalance - initialDeadcatBalance;
      
      expect(newLivecat + newDeadcat).to.equal(ethers.parseEther("150"));
    });
  });

  describe("Force Observe", function () {
    it("Should allow anyone to force observe after grace period", async function () {
      const { catbox, livecat, deadcat, controller, owner, user1 } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("test"));

      // Record initial balances (genesis supply)
      const initialLivecatBalance = await livecat.balanceOf(owner.address);
      const initialDeadcatBalance = await deadcat.balanceOf(owner.address);

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, DEFAULT_ENTROPY);

      await waitForForceReady(controller, owner.address);

      await expect(controller.connect(user1).forceObserve(owner.address, DEFAULT_ENTROPY))
        .to.emit(controller, "Forced");

      const finalLivecatBalance = await livecat.balanceOf(owner.address);
      const finalDeadcatBalance = await deadcat.balanceOf(owner.address);

      // Calculate newly minted tokens
      const newLivecat = finalLivecatBalance - initialLivecatBalance;
      const newDeadcat = finalDeadcatBalance - initialDeadcatBalance;

      expect(newLivecat + newDeadcat).to.equal(amount);
    });

    it("Should update shared entropy pool on force observe", async function () {
      const { catbox, controller, owner, user1 } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("test"));

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, DEFAULT_ENTROPY);

      const poolAfterCommit = await controller.sharedEntropyPool();

      await waitForForceReady(controller, owner.address);
      await controller.connect(user1).forceObserve(owner.address, DEFAULT_ENTROPY);

      const poolAfterForce = await controller.sharedEntropyPool();
      expect(poolAfterForce).to.not.equal(poolAfterCommit);
    });

    it("Should revert if trying to force observe too early", async function () {
      const { catbox, controller, owner, user1 } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("test"));

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, DEFAULT_ENTROPY);

      await expect(
        controller.connect(user1).forceObserve(owner.address, DEFAULT_ENTROPY)
      ).to.be.revertedWithCustomError(controller, "GracePeriodNotPassed");
    });

    it("Should revert if no pending observation", async function () {
      const { controller, user1 } = await loadFixture(deployQuantumCatFixture);

      await expect(
        controller.connect(user1).forceObserve(user1.address, DEFAULT_ENTROPY)
      ).to.be.revertedWithCustomError(controller, "NoPendingObservation");
    });

    it("Should produce deterministic outcomes independent of caller", async function () {
      const { catbox, controller, owner, user1, user2 } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("321");
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("force_determinism"));

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, DEFAULT_ENTROPY);

      const snapshotId = await ethers.provider.send("evm_snapshot", []);

      await waitForForceReady(controller, owner.address);
      const tx1 = await controller.connect(user1).forceObserve(owner.address, DEFAULT_ENTROPY);
      const receipt1 = await tx1.wait();

      const event1 = receipt1.logs
        .map(log => {
          try {
            return controller.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find(parsed => parsed && parsed.name === "Forced");

      const alive1 = event1.args.alive;
      const dead1 = event1.args.dead;

      await ethers.provider.send("evm_revert", [snapshotId]);

      await waitForForceReady(controller, owner.address);
      const tx2 = await controller.connect(user2).forceObserve(owner.address, DEFAULT_ENTROPY);
      const receipt2 = await tx2.wait();

      const event2 = receipt2.logs
        .map(log => {
          try {
            return controller.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find(parsed => parsed && parsed.name === "Forced");

      expect(event2.args.alive).to.equal(alive1);
      expect(event2.args.dead).to.equal(dead1);
    });
  });

  describe("Rebox", function () {
    it("Should rebox equal pairs back to CATBOX with fixed 2.5% fee", async function () {
      const { catbox, livecat, deadcat, controller, owner } = await loadFixture(deployQuantumCatFixture);

      await observeUntilBothTokens({ catbox, livecat, deadcat, controller, signer: owner });

      const aliveBefore = await livecat.balanceOf(owner.address);
      const deadBefore = await deadcat.balanceOf(owner.address);
      const catboxBefore = await catbox.balanceOf(owner.address);

      const pairs = aliveBefore < deadBefore ? aliveBefore : deadBefore;

      await livecat.approve(await controller.getAddress(), pairs);
      await deadcat.approve(await controller.getAddress(), pairs);

      // Get expected fee before reboxing (fixed 2.5%)
      const [expectedCatboxOut, expectedFee] = await controller.calculateReboxOutput(pairs);

      await expect(controller.rebox(pairs))
        .to.emit(controller, "Reboxed");

      const aliveAfter = await livecat.balanceOf(owner.address);
      const deadAfter = await deadcat.balanceOf(owner.address);
      const catboxAfter = await catbox.balanceOf(owner.address);

      expect(aliveBefore - aliveAfter).to.equal(pairs);
      expect(deadBefore - deadAfter).to.equal(pairs);

      // Check actual gain matches calculateReboxOutput prediction
      const actualGain = catboxAfter - catboxBefore;
      expect(actualGain).to.equal(expectedCatboxOut);
    });

    it("Should revert if pairs is 0", async function () {
      const { controller } = await loadFixture(deployQuantumCatFixture);

      await expect(
        controller.rebox(0)
      ).to.be.revertedWithCustomError(controller, "NoPairsAvailable");
    });

    it("Should reboxMax all available pairs", async function () {
      const { catbox, livecat, deadcat, controller, owner } = await loadFixture(deployQuantumCatFixture);

      await observeUntilBothTokens({ catbox, livecat, deadcat, controller, signer: owner });

      const catboxBefore = await catbox.balanceOf(owner.address);

      const pairs = await controller.reboxMax.staticCall(0);
      expect(pairs).to.be.gt(0);

      await controller.reboxMax(0);

      const catboxAfter = await catbox.balanceOf(owner.address);
      expect(catboxAfter).to.be.gt(catboxBefore);
    });

    it("Should reboxMax with cap parameter", async function () {
      const { catbox, livecat, deadcat, controller, owner } = await loadFixture(deployQuantumCatFixture);

      await observeUntilBothTokens({ catbox, livecat, deadcat, controller, signer: owner });

      const cap = ethers.parseEther("5");
      const pairs = await controller.reboxMax.staticCall(cap);

      expect(pairs).to.be.lte(cap);
    });
  });

  describe("Cancel Observation", function () {
    it("Should cancel observation after reveal window expires", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("test"));

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, DEFAULT_ENTROPY);

      // Mine past MAX_REVEAL_WINDOW (250 blocks)
      await mine(251);

      const balanceBefore = await catbox.balanceOf(owner.address);

      await expect(controller.cancelObservation())
        .to.emit(controller, "ObservationCancelled")
        .withArgs(owner.address, amount);

      const balanceAfter = await catbox.balanceOf(owner.address);
      expect(balanceAfter - balanceBefore).to.equal(amount);

      // Pending should be cleared
      const pending = await controller.getPendingObservation(owner.address);
      expect(pending.amount).to.equal(0);
    });

    it("Should revert cancelObservation if no pending observation", async function () {
      const { controller, owner } = await loadFixture(deployQuantumCatFixture);

      await expect(
        controller.cancelObservation()
      ).to.be.revertedWithCustomError(controller, "NoPendingObservation");
    });

    it("Should revert cancelObservation if reveal window not expired", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("test"));

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, DEFAULT_ENTROPY);

      await expect(
        controller.cancelObservation()
      ).to.be.revertedWithCustomError(controller, "RevealWindowClosed");
    });

    it("Should allow committing again after cancellation", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("test"));

      await catbox.approve(await controller.getAddress(), amount * 2n);
      await controller.commitObserve(amount, dataHash, DEFAULT_ENTROPY);

      // Mine past MAX_REVEAL_WINDOW
      await mine(251);

      await controller.cancelObservation();

      // Should be able to commit again
      await expect(
        controller.commitObserve(amount, dataHash, DEFAULT_ENTROPY)
      ).to.emit(controller, "CommitObserve");
    });
  });

  describe("View Functions", function () {
    it("Should correctly report canObserve", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const data = ethers.toUtf8Bytes("test");
      const dataHash = ethers.keccak256(data);

      expect(await controller.canObserve(owner.address)).to.equal(false);

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, DEFAULT_ENTROPY);

      expect(await controller.canObserve(owner.address)).to.equal(false);

      await waitForObserveReady(controller, owner.address);
      expect(await controller.canObserve(owner.address)).to.equal(true);

      await controller.observe(data, DEFAULT_ENTROPY);
      expect(await controller.canObserve(owner.address)).to.equal(false);
    });

    it("Should correctly report canForceObserve", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("test"));

      expect(await controller.canForceObserve(owner.address)).to.equal(false);

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, DEFAULT_ENTROPY);

      expect(await controller.canForceObserve(owner.address)).to.equal(false);

      await waitForForceReady(controller, owner.address);
      expect(await controller.canForceObserve(owner.address)).to.equal(true);
    });

    it("Should correctly report canCancelObservation", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("test"));

      expect(await controller.canCancelObservation(owner.address)).to.equal(false);

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, DEFAULT_ENTROPY);

      expect(await controller.canCancelObservation(owner.address)).to.equal(false);

      // Mine past MAX_REVEAL_WINDOW (250 blocks)
      await mine(251);

      expect(await controller.canCancelObservation(owner.address)).to.equal(true);
    });
  });
});

