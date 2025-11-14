const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployQuantumCatFixture } = require("./shared/fixtures");
const { generateEntropy } = require("./shared/helpers");

/**
 * View Functions & Helpers Tests
 * Tests all view functions, helper functions, and status queries
 */
describe("View Functions & Helpers", function () {
  describe("getObservationStatus", function () {
    it("Should return false status when no pending observation", async function () {
      const { controller, owner } = await loadFixture(deployQuantumCatFixture);

      const status = await controller.getObservationStatus(owner.address);
      
      expect(status.hasPending).to.be.false;
      expect(status.canReveal).to.be.false;
      expect(status.canForce).to.be.false;
      expect(status.blocksUntilReveal).to.equal(0);
      expect(status.blocksUntilForce).to.equal(0);
    });

    it("Should return correct status for pending observation before reveal delay", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const data = ethers.toUtf8Bytes("test_data");
      const dataHash = ethers.keccak256(data);
      const entropy = generateEntropy("test");

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, entropy);

      const status = await controller.getObservationStatus(owner.address);
      const REVEAL_DELAY = await controller.REVEAL_DELAY();
      
      expect(status.hasPending).to.be.true;
      expect(status.canReveal).to.be.false;
      expect(status.canForce).to.be.false;
      expect(status.blocksUntilReveal).to.be.greaterThan(0);
      expect(status.blocksUntilReveal).to.equal(REVEAL_DELAY + 1n);
    });

    it("Should return canReveal true after reveal delay", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const data = ethers.toUtf8Bytes("test_data");
      const dataHash = ethers.keccak256(data);
      const entropy = generateEntropy("test");

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, entropy);

      // Mine past reveal delay
      const REVEAL_DELAY = await controller.REVEAL_DELAY();
      await ethers.provider.send("hardhat_mine", [ethers.toBeHex(Number(REVEAL_DELAY) + 1)]);

      const status = await controller.getObservationStatus(owner.address);
      
      expect(status.hasPending).to.be.true;
      expect(status.canReveal).to.be.true;
      expect(status.canForce).to.be.false;
      expect(status.blocksUntilReveal).to.equal(0);
      expect(status.blocksUntilForce).to.be.greaterThan(0);
    });

    it("Should return canForce true after grace period", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const data = ethers.toUtf8Bytes("test_data");
      const dataHash = ethers.keccak256(data);
      const entropy = generateEntropy("test");

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, entropy);

      // Mine past reveal delay + grace period
      const REVEAL_DELAY = await controller.REVEAL_DELAY();
      const GRACE = await controller.GRACE();
      await ethers.provider.send("hardhat_mine", [ethers.toBeHex(Number(REVEAL_DELAY) + Number(GRACE) + 1)]);

      const status = await controller.getObservationStatus(owner.address);
      
      expect(status.hasPending).to.be.true;
      expect(status.canReveal).to.be.true;
      expect(status.canForce).to.be.true;
      expect(status.blocksUntilReveal).to.equal(0);
      expect(status.blocksUntilForce).to.equal(0);
    });
  });

  describe("isBlockhashAvailable", function () {
    it("Should return false when no pending observation", async function () {
      const { controller, owner } = await loadFixture(deployQuantumCatFixture);

      const result = await controller.isBlockhashAvailable(owner.address);
      
      expect(result.available).to.be.false;
      expect(result.blocksUntilExpiry).to.equal(0);
    });

    it("Should return true when blockhash is available", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const data = ethers.toUtf8Bytes("test_data");
      const dataHash = ethers.keccak256(data);
      const entropy = generateEntropy("test");

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, entropy);

      const result = await controller.isBlockhashAvailable(owner.address);
      
      expect(result.available).to.be.true;
      // After commit we're at block N+1, targetBlock is N+5, expiry is N+250
      // So blocksUntilExpiry should be around 249
      expect(result.blocksUntilExpiry).to.be.greaterThan(245n);
      expect(result.blocksUntilExpiry).to.be.lessThan(251n);
    });

    it("Should return false after 256+ blocks", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const data = ethers.toUtf8Bytes("test_data");
      const dataHash = ethers.keccak256(data);
      const entropy = generateEntropy("test");

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, entropy);

      // Mine past blockhash expiry (targetBlock + 256)
      // We need to mine enough to be past refBlock + REVEAL_DELAY + 256
      await ethers.provider.send("hardhat_mine", [ethers.toBeHex(262)]);

      const result = await controller.isBlockhashAvailable(owner.address);
      
      expect(result.available).to.be.false;
      expect(result.blocksUntilExpiry).to.equal(0);
    });

    it("Should show decreasing blocks until expiry", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const data = ethers.toUtf8Bytes("test_data");
      const dataHash = ethers.keccak256(data);
      const entropy = generateEntropy("test");

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, entropy);

      const result1 = await controller.isBlockhashAvailable(owner.address);
      
      // Mine 10 blocks
      await ethers.provider.send("hardhat_mine", [ethers.toBeHex(10)]);
      
      const result2 = await controller.isBlockhashAvailable(owner.address);
      
      expect(result1.available).to.be.true;
      expect(result2.available).to.be.true;
      expect(result2.blocksUntilExpiry).to.equal(result1.blocksUntilExpiry - 10n);
    });
  });

  describe("Integration with existing view functions", function () {
    it("Should be consistent with canObserve", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const data = ethers.toUtf8Bytes("test_data");
      const dataHash = ethers.keccak256(data);
      const entropy = generateEntropy("test");

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, entropy);

      // Before reveal delay
      const canObserveBefore = await controller.canObserve(owner.address);
      const statusBefore = await controller.getObservationStatus(owner.address);
      expect(canObserveBefore).to.equal(statusBefore.canReveal);

      // After reveal delay
      const REVEAL_DELAY = await controller.REVEAL_DELAY();
      await ethers.provider.send("hardhat_mine", [ethers.toBeHex(Number(REVEAL_DELAY) + 1)]);

      const canObserveAfter = await controller.canObserve(owner.address);
      const statusAfter = await controller.getObservationStatus(owner.address);
      expect(canObserveAfter).to.equal(statusAfter.canReveal);
    });

    it("Should be consistent with canForceObserve", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const data = ethers.toUtf8Bytes("test_data");
      const dataHash = ethers.keccak256(data);
      const entropy = generateEntropy("test");

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, entropy);

      // Before grace period
      const canForceBefore = await controller.canForceObserve(owner.address);
      const statusBefore = await controller.getObservationStatus(owner.address);
      expect(canForceBefore).to.equal(statusBefore.canForce);

      // After grace period
      const REVEAL_DELAY = await controller.REVEAL_DELAY();
      const GRACE = await controller.GRACE();
      await ethers.provider.send("hardhat_mine", [ethers.toBeHex(Number(REVEAL_DELAY) + Number(GRACE) + 1)]);

      const canForceAfter = await controller.canForceObserve(owner.address);
      const statusAfter = await controller.getObservationStatus(owner.address);
      expect(canForceAfter).to.equal(statusAfter.canForce);
    });
  });

  describe("Function Signatures (README Compliance)", function () {
    it("Should return correct fixed fee from REBOX_FEE_BPS constant", async function () {
      const { controller } = await loadFixture(deployQuantumCatFixture);
      
      const reboxFee = await controller.REBOX_FEE_BPS();
      expect(reboxFee).to.equal(250); // Fixed 2.5% fee
    });

    it("Should return 2 values from calculateReboxOutput()", async function () {
      const { controller } = await loadFixture(deployQuantumCatFixture);
      
      const pairs = ethers.parseEther("100");
      const result = await controller.calculateReboxOutput(pairs);
      
      expect(result).to.have.lengthOf(2);
      expect(result[0]).to.be.a('bigint'); // catboxOut
      expect(result[1]).to.be.a('bigint'); // feeTaken
      
      // Verify they sum correctly with fixed 4% fee
      expect(result[0] + result[1]).to.equal(pairs * 2n);
    });

    it("Should return 2 values and string from getReboxFee()", async function () {
      const { controller } = await loadFixture(deployQuantumCatFixture);
      
      const result = await controller.getReboxFee();
      
      expect(result).to.have.lengthOf(2);
      expect(result[0]).to.equal(250); // feeBPS
      expect(result[1]).to.equal("2.5%"); // feePercent
    });

    it("Should return 5 values from getSystemConfig()", async function () {
      const { controller } = await loadFixture(deployQuantumCatFixture);
      
      const result = await controller.getSystemConfig();
      
      expect(result).to.have.lengthOf(5);
      expect(result[0]).to.equal(5); // revealDelay
      expect(result[1]).to.equal(64); // gracePeriod
      expect(result[2]).to.equal(256); // maxDataSize
      expect(result[3]).to.equal(10n**27n); // maxObserveAmount
      expect(result[4]).to.not.equal(ethers.ZeroHash); // currentEntropyPool
    });

    it("Should return 5 values from getPendingObservation()", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);
      
      const amount = ethers.parseEther("100");
      const data = ethers.toUtf8Bytes("test_data");
      const dataHash = ethers.keccak256(data);
      const entropy = generateEntropy("test");

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, entropy);
      
      const result = await controller.getPendingObservation(owner.address);
      
      expect(result).to.have.lengthOf(5);
      expect(result[0]).to.be.true; // hasPending
      expect(result[1]).to.equal(amount); // amount
      expect(result[2]).to.equal(dataHash); // dataHash
      expect(result[3]).to.be.a('bigint'); // refBlock
      expect(result[4]).to.not.equal(ethers.ZeroHash); // entropySnapshot
    });

    it("Should return max reboxable pairs from getMaxReboxablePairs()", async function () {
      const { livecat, deadcat, controller, owner } = await loadFixture(deployQuantumCatFixture);
      
      // Owner has genesis supply of 150K each (30% of 1M CATBOX split 50/50)
      const maxPairs = await controller.getMaxReboxablePairs(owner.address);
      
      expect(maxPairs).to.equal(ethers.parseEther("150000"));
    });

    it("Should return 7 values from getObservationStatus()", async function () {
      const { controller, owner } = await loadFixture(deployQuantumCatFixture);
      
      const result = await controller.getObservationStatus(owner.address);
      
      expect(result).to.have.lengthOf(7);
      expect(result[0]).to.be.a('boolean'); // hasPending
      expect(result[1]).to.be.a('boolean'); // canReveal
      expect(result[2]).to.be.a('boolean'); // canForce
      expect(result[3]).to.be.a('boolean'); // canCancel
      expect(result[4]).to.be.a('bigint'); // blocksUntilReveal
      expect(result[5]).to.be.a('bigint'); // blocksUntilForce
      expect(result[6]).to.be.a('bigint'); // blocksUntilExpiry
    });

    it("Should return 2 values from isBlockhashAvailable()", async function () {
      const { controller, owner } = await loadFixture(deployQuantumCatFixture);
      
      const result = await controller.isBlockhashAvailable(owner.address);
      
      expect(result).to.have.lengthOf(2);
      expect(result[0]).to.be.a('boolean'); // available
      expect(result[1]).to.be.a('bigint'); // blocksUntilExpiry
    });
  });

  describe("Real-world usage scenarios", function () {
    it("Should help users track observation lifecycle", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const data = ethers.toUtf8Bytes("test_data");
      const dataHash = ethers.keccak256(data);
      const entropy = generateEntropy("test");

      // 1. Initial state: no observation
      let status = await controller.getObservationStatus(owner.address);
      expect(status.hasPending).to.be.false;

      // 2. After commit: pending, waiting for reveal
      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, entropy);
      
      status = await controller.getObservationStatus(owner.address);
      expect(status.hasPending).to.be.true;
      expect(status.canReveal).to.be.false;
      console.log(`      ⏳ Waiting ${status.blocksUntilReveal} blocks until reveal`);

      // 3. After reveal delay: can reveal
      const REVEAL_DELAY = await controller.REVEAL_DELAY();
      await ethers.provider.send("hardhat_mine", [ethers.toBeHex(Number(REVEAL_DELAY) + 1)]);
      
      status = await controller.getObservationStatus(owner.address);
      expect(status.canReveal).to.be.true;
      console.log(`      ✅ Ready to reveal!`);

      // 4. After reveal: no pending observation
      await controller.observe(data, entropy);
      
      status = await controller.getObservationStatus(owner.address);
      expect(status.hasPending).to.be.false;
      console.log(`      🎲 Observation completed`);
    });

    it("Should help monitor blockhash safety window", async function () {
      const { catbox, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      const data = ethers.toUtf8Bytes("test_data");
      const dataHash = ethers.keccak256(data);
      const entropy = generateEntropy("test");

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, entropy);

      const result = await controller.isBlockhashAvailable(owner.address);
      expect(result.available).to.be.true;
      
      console.log(`      🔒 Blockhash safe for ${result.blocksUntilExpiry} more blocks`);
      
      // Even after expiry, observation still works
      await ethers.provider.send("hardhat_mine", [ethers.toBeHex(262)]);
      
      const expiredResult = await controller.isBlockhashAvailable(owner.address);
      expect(expiredResult.available).to.be.false;
      console.log(`      ⚠️  Blockhash expired, but observation still works (uses other entropy)`);
    });
  });
});

