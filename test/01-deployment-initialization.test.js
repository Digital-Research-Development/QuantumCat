const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployQuantumCatFixture } = require("./shared/fixtures");
const { generateEntropy, DEFAULT_ENTROPY } = require("./shared/helpers");

/**
 * Deployment and Initialization Tests
 * Tests contract deployment, configuration, and initial state
 */
describe("Deployment & Initialization", function () {
  describe("Successful Deployment", function () {
    it("Should deploy all contracts with correct addresses", async function () {
      const { catbox, livecat, deadcat, controller } = await loadFixture(deployQuantumCatFixture);

      expect(await catbox.getAddress()).to.be.properAddress;
      expect(await livecat.getAddress()).to.be.properAddress;
      expect(await deadcat.getAddress()).to.be.properAddress;
      expect(await controller.getAddress()).to.be.properAddress;
    });

    it("Should set correct token names and symbols", async function () {
      const { catbox, livecat, deadcat } = await loadFixture(deployQuantumCatFixture);

      expect(await catbox.name()).to.equal("CatBox");
      expect(await catbox.symbol()).to.equal("CATBOX");

      expect(await livecat.name()).to.equal("LiveCat");
      expect(await livecat.symbol()).to.equal("LIVECAT");

      expect(await deadcat.name()).to.equal("DeadCat");
      expect(await deadcat.symbol()).to.equal("DEADCAT");
    });

    it("Should have 18 decimals for all tokens", async function () {
      const { catbox, livecat, deadcat } = await loadFixture(deployQuantumCatFixture);

      expect(await catbox.decimals()).to.equal(18);
      expect(await livecat.decimals()).to.equal(18);
      expect(await deadcat.decimals()).to.equal(18);
    });

    it("Should mint initial CATBOX supply to owner", async function () {
      const { catbox, owner } = await loadFixture(deployQuantumCatFixture);

      expect(await catbox.balanceOf(owner.address)).to.equal(ethers.parseEther("1000000"));
    });

    it("Should mint genesis LIVECAT supply to owner", async function () {
      const { livecat, owner } = await loadFixture(deployQuantumCatFixture);

      expect(await livecat.balanceOf(owner.address)).to.equal(ethers.parseEther("150000"));
    });

    it("Should mint genesis DEADCAT supply to owner", async function () {
      const { deadcat, owner } = await loadFixture(deployQuantumCatFixture);

      expect(await deadcat.balanceOf(owner.address)).to.equal(ethers.parseEther("150000"));
    });

    it("Should have correct total supplies at genesis", async function () {
      const { catbox, livecat, deadcat } = await loadFixture(deployQuantumCatFixture);

      expect(await catbox.totalSupply()).to.equal(ethers.parseEther("1000000"));
      expect(await livecat.totalSupply()).to.equal(ethers.parseEther("150000"));
      expect(await deadcat.totalSupply()).to.equal(ethers.parseEther("150000"));
    });

    it("Should set controller as minter in tokens", async function () {
      const { catbox, livecat, deadcat, controller } = await loadFixture(deployQuantumCatFixture);

      const controllerAddr = await controller.getAddress();
      expect(await catbox.controller()).to.equal(controllerAddr);
      expect(await livecat.controller()).to.equal(controllerAddr);
      expect(await deadcat.controller()).to.equal(controllerAddr);
    });

    it("Should set correct fixed fee constant", async function () {
      const { controller } = await loadFixture(deployQuantumCatFixture);

      expect(await controller.REBOX_FEE_BPS()).to.equal(250); // 2.5% fixed fee
    });

    it("Should set correct constants", async function () {
      const { controller } = await loadFixture(deployQuantumCatFixture);

      expect(await controller.REVEAL_DELAY()).to.equal(5);
      expect(await controller.GRACE()).to.equal(64);
      expect(await controller.DATA_MAX()).to.equal(256);
      expect(await controller.MAX_OBSERVE_AMOUNT()).to.equal(10n**27n); // 1 billion tokens
    });

    it("Should initialize sharedEntropyPool with genesis entropy (non-zero)", async function () {
      const { controller } = await loadFixture(deployQuantumCatFixture);

      const pool = await controller.sharedEntropyPool();
      // Should NOT be zero anymore (initialized with deployment entropy)
      expect(pool).to.not.equal(ethers.ZeroHash);
      console.log("      ✓ Initial entropy pool:", pool.slice(0, 10) + "...");
    });

    it("Should have version constant set", async function () {
      const { controller } = await loadFixture(deployQuantumCatFixture);
      
      const version = await controller.VERSION();
      expect(version).to.equal("1.0.0");
    });
  });

  describe("Constructor Validation", function () {
    it("Should revert CATBOXToken deployment with zero controller address", async function () {
      const [owner] = await ethers.getSigners();
      const CATBOXToken = await ethers.getContractFactory("CATBOXToken");

      await expect(
        CATBOXToken.deploy(ethers.ZeroAddress, owner.address, ethers.parseEther("1000000"))
      ).to.be.revertedWithCustomError(CATBOXToken, "ZeroAddress");
    });

    it("Should revert CATBOXToken deployment with zero initial holder address", async function () {
      const [owner] = await ethers.getSigners();
      const CATBOXToken = await ethers.getContractFactory("CATBOXToken");

      await expect(
        CATBOXToken.deploy(owner.address, ethers.ZeroAddress, ethers.parseEther("1000000"))
      ).to.be.revertedWithCustomError(CATBOXToken, "ZeroAddress");
    });

    it("Should revert LIVECATToken deployment with zero controller address", async function () {
      const [owner] = await ethers.getSigners();
      const LIVECATToken = await ethers.getContractFactory("LIVECATToken");

      await expect(
        LIVECATToken.deploy(ethers.ZeroAddress, owner.address, ethers.parseEther("1000000"))
      ).to.be.revertedWithCustomError(LIVECATToken, "ZeroAddress");
    });

    it("Should revert LIVECATToken deployment with zero initial holder when supply is non-zero", async function () {
      const [owner] = await ethers.getSigners();
      const LIVECATToken = await ethers.getContractFactory("LIVECATToken");

      await expect(
        LIVECATToken.deploy(owner.address, ethers.ZeroAddress, ethers.parseEther("1000000"))
      ).to.be.revertedWithCustomError(LIVECATToken, "ZeroAddress");
    });

    it("Should allow LIVECATToken deployment with zero supply and zero holder", async function () {
      const [owner] = await ethers.getSigners();
      const LIVECATToken = await ethers.getContractFactory("LIVECATToken");

      // Zero supply with zero holder should work (for backwards compatibility)
      await expect(
        LIVECATToken.deploy(owner.address, ethers.ZeroAddress, 0)
      ).to.not.be.reverted;
    });

    it("Should revert DEADCATToken deployment with zero controller address", async function () {
      const [owner] = await ethers.getSigners();
      const DEADCATToken = await ethers.getContractFactory("DEADCATToken");

      await expect(
        DEADCATToken.deploy(ethers.ZeroAddress, owner.address, ethers.parseEther("1000000"))
      ).to.be.revertedWithCustomError(DEADCATToken, "ZeroAddress");
    });

    it("Should revert DEADCATToken deployment with zero initial holder when supply is non-zero", async function () {
      const [owner] = await ethers.getSigners();
      const DEADCATToken = await ethers.getContractFactory("DEADCATToken");

      await expect(
        DEADCATToken.deploy(owner.address, ethers.ZeroAddress, ethers.parseEther("1000000"))
      ).to.be.revertedWithCustomError(DEADCATToken, "ZeroAddress");
    });

    it("Should allow DEADCATToken deployment with zero supply and zero holder", async function () {
      const [owner] = await ethers.getSigners();
      const DEADCATToken = await ethers.getContractFactory("DEADCATToken");

      // Zero supply with zero holder should work (for backwards compatibility)
      await expect(
        DEADCATToken.deploy(owner.address, ethers.ZeroAddress, 0)
      ).to.not.be.reverted;
    });

    it("Should revert Controller deployment with zero CATBOX address", async function () {
      const [owner] = await ethers.getSigners();
      const deployerNonce = await ethers.provider.getTransactionCount(owner.address);
      const controllerAddress = ethers.getCreateAddress({
        from: owner.address,
        nonce: deployerNonce + 2
      });

      const LIVECATToken = await ethers.getContractFactory("LIVECATToken");
      const DEADCATToken = await ethers.getContractFactory("DEADCATToken");

      const livecat = await LIVECATToken.deploy(controllerAddress, owner.address, 0);
      const deadcat = await DEADCATToken.deploy(controllerAddress, owner.address, 0);

      const QuantumCatController = await ethers.getContractFactory("QuantumCatController");

      await expect(
        QuantumCatController.deploy(
          ethers.ZeroAddress,
          await livecat.getAddress(),
          await deadcat.getAddress()
        )
      ).to.be.revertedWithCustomError(QuantumCatController, "ZeroAddress");
    });

    it("Should revert Controller deployment with zero LIVECAT address", async function () {
      const [owner] = await ethers.getSigners();
      const deployerNonce = await ethers.provider.getTransactionCount(owner.address);
      const controllerAddress = ethers.getCreateAddress({
        from: owner.address,
        nonce: deployerNonce + 2
      });

      const CATBOXToken = await ethers.getContractFactory("CATBOXToken");
      const DEADCATToken = await ethers.getContractFactory("DEADCATToken");

      const catbox = await CATBOXToken.deploy(controllerAddress, owner.address, ethers.parseEther("1000000"));
      const deadcat = await DEADCATToken.deploy(controllerAddress, owner.address, 0);

      const QuantumCatController = await ethers.getContractFactory("QuantumCatController");

      await expect(
        QuantumCatController.deploy(
          await catbox.getAddress(),
          ethers.ZeroAddress,
          await deadcat.getAddress()
        )
      ).to.be.revertedWithCustomError(QuantumCatController, "ZeroAddress");
    });

    it("Should revert Controller deployment with zero DEADCAT address", async function () {
      const [owner] = await ethers.getSigners();
      const deployerNonce = await ethers.provider.getTransactionCount(owner.address);
      const controllerAddress = ethers.getCreateAddress({
        from: owner.address,
        nonce: deployerNonce + 2
      });

      const CATBOXToken = await ethers.getContractFactory("CATBOXToken");
      const LIVECATToken = await ethers.getContractFactory("LIVECATToken");

      const catbox = await CATBOXToken.deploy(controllerAddress, owner.address, ethers.parseEther("1000000"));
      const livecat = await LIVECATToken.deploy(controllerAddress, owner.address, 0);

      const QuantumCatController = await ethers.getContractFactory("QuantumCatController");

      await expect(
        QuantumCatController.deploy(
          await catbox.getAddress(),
          await livecat.getAddress(),
          ethers.ZeroAddress
        )
      ).to.be.revertedWithCustomError(QuantumCatController, "ZeroAddress");
    });

    it("Should revert Controller deployment with non-contract CATBOX address", async function () {
      const [owner, user1] = await ethers.getSigners();
      
      const QuantumCatController = await ethers.getContractFactory("QuantumCatController");

      await expect(
        QuantumCatController.deploy(
          user1.address, // EOA instead of contract
          user1.address,
          user1.address
        )
      ).to.be.revertedWithCustomError(QuantumCatController, "NotAContract");
    });

    it("Should revert Controller deployment with non-contract LIVECAT address", async function () {
      const [owner, user1] = await ethers.getSigners();
      const deployerNonce = await ethers.provider.getTransactionCount(owner.address);
      const controllerAddress = ethers.getCreateAddress({
        from: owner.address,
        nonce: deployerNonce + 1
      });

      const CATBOXToken = await ethers.getContractFactory("CATBOXToken");
      const catbox = await CATBOXToken.deploy(controllerAddress, owner.address, ethers.parseEther("1000000"));
      
      const QuantumCatController = await ethers.getContractFactory("QuantumCatController");

      await expect(
        QuantumCatController.deploy(
          await catbox.getAddress(),
          user1.address, // EOA instead of contract
          user1.address
        )
      ).to.be.revertedWithCustomError(QuantumCatController, "NotAContract");
    });

    it("Should revert Controller deployment with non-contract DEADCAT address", async function () {
      const [owner, user1] = await ethers.getSigners();
      const deployerNonce = await ethers.provider.getTransactionCount(owner.address);
      const controllerAddress = ethers.getCreateAddress({
        from: owner.address,
        nonce: deployerNonce + 2
      });

      const CATBOXToken = await ethers.getContractFactory("CATBOXToken");
      const LIVECATToken = await ethers.getContractFactory("LIVECATToken");
      
      const catbox = await CATBOXToken.deploy(controllerAddress, owner.address, ethers.parseEther("1000000"));
      const livecat = await LIVECATToken.deploy(controllerAddress, owner.address, 0);
      
      const QuantumCatController = await ethers.getContractFactory("QuantumCatController");

      await expect(
        QuantumCatController.deploy(
          await catbox.getAddress(),
          await livecat.getAddress(),
          user1.address // EOA instead of contract
        )
      ).to.be.revertedWithCustomError(QuantumCatController, "NotAContract");
    });

    // Note: Controller no longer requires initialSupply parameter (using fixed 4% fee)
  });

  describe("ETH Rejection", function () {
    it("Should reject ETH sent to controller via receive", async function () {
      const { controller, owner } = await loadFixture(deployQuantumCatFixture);

      await expect(
        owner.sendTransaction({ to: await controller.getAddress(), value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(controller, "ETHNotAccepted");
    });

    it("Should reject ETH sent to controller via fallback with data", async function () {
      const { controller, owner } = await loadFixture(deployQuantumCatFixture);

      await expect(
        owner.sendTransaction({
          to: await controller.getAddress(),
          value: ethers.parseEther("1"),
          data: "0x1234"
        })
      ).to.be.revertedWithCustomError(controller, "ETHNotAccepted");
    });

    it("Should reject ETH sent via fallback without value", async function () {
      const { controller, owner } = await loadFixture(deployQuantumCatFixture);

      await expect(
        owner.sendTransaction({
          to: await controller.getAddress(),
          data: "0xdeadbeef"
        })
      ).to.be.revertedWithCustomError(controller, "ETHNotAccepted");
    });
  });

  describe("Immutability Guarantees", function () {
    it("Should have immutable controller address in tokens", async function () {
      const { catbox, livecat, deadcat, controller } = await loadFixture(deployQuantumCatFixture);

      const controllerAddr = await controller.getAddress();
      expect(await catbox.controller()).to.equal(controllerAddr);
      expect(await livecat.controller()).to.equal(controllerAddr);
      expect(await deadcat.controller()).to.equal(controllerAddr);
    });

    it("Should have immutable token addresses in controller", async function () {
      const { catbox, livecat, deadcat, controller } = await loadFixture(deployQuantumCatFixture);

      expect(await controller.catbox()).to.equal(await catbox.getAddress());
      expect(await controller.livecat()).to.equal(await livecat.getAddress());
      expect(await controller.deadcat()).to.equal(await deadcat.getAddress());
    });

    it("Should have immutable fixed rebox fee", async function () {
      const { controller } = await loadFixture(deployQuantumCatFixture);
      expect(await controller.REBOX_FEE_BPS()).to.equal(250); // Fixed 2.5% fee
    });

    it("Should have immutable constants", async function () {
      const { controller } = await loadFixture(deployQuantumCatFixture);

      expect(await controller.REVEAL_DELAY()).to.equal(5);
      expect(await controller.GRACE()).to.equal(64);
      expect(await controller.DATA_MAX()).to.equal(256);
    });

    it("Should have no owner or admin functions", async function () {
      const { controller } = await loadFixture(deployQuantumCatFixture);
      
      expect(controller.owner).to.be.undefined;
      expect(controller.pause).to.be.undefined;
      expect(controller.upgradeTo).to.be.undefined;
      expect(controller.setMinFeeBps).to.be.undefined;
      expect(controller.setMaxFeeBps).to.be.undefined;
    });
  });
});
