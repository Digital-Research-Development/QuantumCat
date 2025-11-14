const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployQuantumCatFixture } = require("./shared/fixtures");

/**
 * ERC-20 Compliance Tests
 * Ensures all three tokens (CATBOX, LIVECAT, DEADCAT) fully comply with ERC-20 standard
 */
describe("ERC-20 Compliance", function () {
  describe("CATBOX Token ERC-20 Compliance", function () {
    it("Should have correct name and symbol", async function () {
      const { catbox } = await loadFixture(deployQuantumCatFixture);

      expect(await catbox.name()).to.equal("CatBox");
      expect(await catbox.symbol()).to.equal("CATBOX");
      expect(await catbox.decimals()).to.equal(18);
    });

    it("Should return correct totalSupply", async function () {
      const { catbox } = await loadFixture(deployQuantumCatFixture);

      const totalSupply = await catbox.totalSupply();
      expect(totalSupply).to.equal(ethers.parseEther("1000000"));
    });

    it("Should return correct balanceOf", async function () {
      const { catbox, owner, user1 } = await loadFixture(deployQuantumCatFixture);

      const ownerBalance = await catbox.balanceOf(owner.address);
      expect(ownerBalance).to.equal(ethers.parseEther("1000000"));

      const user1Balance = await catbox.balanceOf(user1.address);
      expect(user1Balance).to.equal(0);
    });

    it("Should transfer tokens correctly", async function () {
      const { catbox, owner, user1 } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      await catbox.transfer(user1.address, amount);

      expect(await catbox.balanceOf(user1.address)).to.equal(amount);
      expect(await catbox.balanceOf(owner.address)).to.equal(ethers.parseEther("999900"));
    });

    it("Should emit Transfer event on transfer", async function () {
      const { catbox, owner, user1 } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      await expect(catbox.transfer(user1.address, amount))
        .to.emit(catbox, "Transfer")
        .withArgs(owner.address, user1.address, amount);
    });

    it("Should approve allowance correctly", async function () {
      const { catbox, owner, user1 } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      await catbox.approve(user1.address, amount);

      expect(await catbox.allowance(owner.address, user1.address)).to.equal(amount);
    });

    it("Should emit Approval event on approve", async function () {
      const { catbox, owner, user1 } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      await expect(catbox.approve(user1.address, amount))
        .to.emit(catbox, "Approval")
        .withArgs(owner.address, user1.address, amount);
    });

    it("Should transferFrom with valid allowance", async function () {
      const { catbox, owner, user1, user2 } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      await catbox.approve(user1.address, amount);
      await catbox.connect(user1).transferFrom(owner.address, user2.address, amount);

      expect(await catbox.balanceOf(user2.address)).to.equal(amount);
      expect(await catbox.allowance(owner.address, user1.address)).to.equal(0);
    });

    it("Should not transferFrom without sufficient allowance", async function () {
      const { catbox, owner, user1, user2 } = await loadFixture(deployQuantumCatFixture);

      await expect(
        catbox.connect(user1).transferFrom(owner.address, user2.address, ethers.parseEther("100"))
      ).to.be.reverted;
    });

    it("Should allow setting allowance to max uint256", async function () {
      const { catbox, owner, user1 } = await loadFixture(deployQuantumCatFixture);

      await catbox.approve(user1.address, ethers.MaxUint256);
      expect(await catbox.allowance(owner.address, user1.address)).to.equal(ethers.MaxUint256);
    });

    it("Should allow setting allowance to zero", async function () {
      const { catbox, owner, user1 } = await loadFixture(deployQuantumCatFixture);

      await catbox.approve(user1.address, ethers.parseEther("100"));
      await catbox.approve(user1.address, 0);

      expect(await catbox.allowance(owner.address, user1.address)).to.equal(0);
    });
  });

  describe("LIVECAT Token ERC-20 Compliance", function () {
    it("Should have correct name and symbol", async function () {
      const { livecat } = await loadFixture(deployQuantumCatFixture);

      expect(await livecat.name()).to.equal("LiveCat");
      expect(await livecat.symbol()).to.equal("LIVECAT");
      expect(await livecat.decimals()).to.equal(18);
    });

    it("Should return correct totalSupply", async function () {
      const { livecat } = await loadFixture(deployQuantumCatFixture);

      const totalSupply = await livecat.totalSupply();
      expect(totalSupply).to.equal(ethers.parseEther("150000"));
    });

    it("Should transfer LIVECAT tokens correctly", async function () {
      const { livecat, owner, user1 } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      await livecat.transfer(user1.address, amount);

      expect(await livecat.balanceOf(user1.address)).to.equal(amount);
    });

    it("Should emit Transfer event for LIVECAT", async function () {
      const { livecat, owner, user1 } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      await expect(livecat.transfer(user1.address, amount))
        .to.emit(livecat, "Transfer")
        .withArgs(owner.address, user1.address, amount);
    });

    it("Should approve and transferFrom LIVECAT", async function () {
      const { livecat, owner, user1, user2 } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      await livecat.approve(user1.address, amount);
      await livecat.connect(user1).transferFrom(owner.address, user2.address, amount);

      expect(await livecat.balanceOf(user2.address)).to.equal(amount);
    });
  });

  describe("DEADCAT Token ERC-20 Compliance", function () {
    it("Should have correct name and symbol", async function () {
      const { deadcat } = await loadFixture(deployQuantumCatFixture);

      expect(await deadcat.name()).to.equal("DeadCat");
      expect(await deadcat.symbol()).to.equal("DEADCAT");
      expect(await deadcat.decimals()).to.equal(18);
    });

    it("Should return correct totalSupply", async function () {
      const { deadcat } = await loadFixture(deployQuantumCatFixture);

      const totalSupply = await deadcat.totalSupply();
      expect(totalSupply).to.equal(ethers.parseEther("150000"));
    });

    it("Should transfer DEADCAT tokens correctly", async function () {
      const { deadcat, owner, user1 } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      await deadcat.transfer(user1.address, amount);

      expect(await deadcat.balanceOf(user1.address)).to.equal(amount);
    });

    it("Should emit Transfer event for DEADCAT", async function () {
      const { deadcat, owner, user1 } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      await expect(deadcat.transfer(user1.address, amount))
        .to.emit(deadcat, "Transfer")
        .withArgs(owner.address, user1.address, amount);
    });

    it("Should approve and transferFrom DEADCAT", async function () {
      const { deadcat, owner, user1, user2 } = await loadFixture(deployQuantumCatFixture);

      const amount = ethers.parseEther("100");
      await deadcat.approve(user1.address, amount);
      await deadcat.connect(user1).transferFrom(owner.address, user2.address, amount);

      expect(await deadcat.balanceOf(user2.address)).to.equal(amount);
    });
  });

  describe("Cross-Token ERC-20 Behavior", function () {
    it("Should maintain independent balances across all three tokens", async function () {
      const { catbox, livecat, deadcat, owner, user1 } = await loadFixture(deployQuantumCatFixture);

      await catbox.transfer(user1.address, ethers.parseEther("100"));
      await livecat.transfer(user1.address, ethers.parseEther("50"));
      await deadcat.transfer(user1.address, ethers.parseEther("75"));

      expect(await catbox.balanceOf(user1.address)).to.equal(ethers.parseEther("100"));
      expect(await livecat.balanceOf(user1.address)).to.equal(ethers.parseEther("50"));
      expect(await deadcat.balanceOf(user1.address)).to.equal(ethers.parseEther("75"));
    });

    it("Should maintain independent allowances across all three tokens", async function () {
      const { catbox, livecat, deadcat, owner, user1 } = await loadFixture(deployQuantumCatFixture);

      await catbox.approve(user1.address, ethers.parseEther("100"));
      await livecat.approve(user1.address, ethers.parseEther("200"));
      await deadcat.approve(user1.address, ethers.parseEther("300"));

      expect(await catbox.allowance(owner.address, user1.address)).to.equal(ethers.parseEther("100"));
      expect(await livecat.allowance(owner.address, user1.address)).to.equal(ethers.parseEther("200"));
      expect(await deadcat.allowance(owner.address, user1.address)).to.equal(ethers.parseEther("300"));
    });

    it("Should maintain independent total supplies", async function () {
      const { catbox, livecat, deadcat, controller, owner } = await loadFixture(deployQuantumCatFixture);

      const catboxSupplyBefore = await catbox.totalSupply();
      const livecatSupplyBefore = await livecat.totalSupply();
      const deadcatSupplyBefore = await deadcat.totalSupply();

      // Perform an observation to modify supplies
      const amount = ethers.parseEther("100");
      const data = ethers.toUtf8Bytes("test");
      const dataHash = ethers.keccak256(data);
      const entropy = ethers.keccak256(ethers.toUtf8Bytes("entropy"));

      await catbox.approve(await controller.getAddress(), amount);
      await controller.commitObserve(amount, dataHash, entropy);

      // CATBOX supply should decrease
      expect(await catbox.totalSupply()).to.equal(catboxSupplyBefore - amount);
      // LIVECAT and DEADCAT should remain unchanged (until observation revealed)
      expect(await livecat.totalSupply()).to.equal(livecatSupplyBefore);
      expect(await deadcat.totalSupply()).to.equal(deadcatSupplyBefore);
    });
  });

  describe("ERC-20 Edge Cases", function () {
    it("Should handle transfer of zero tokens", async function () {
      const { catbox, owner, user1 } = await loadFixture(deployQuantumCatFixture);

      await expect(catbox.transfer(user1.address, 0)).to.emit(catbox, "Transfer");
      expect(await catbox.balanceOf(user1.address)).to.equal(0);
    });

    it("Should handle transfer to self", async function () {
      const { catbox, owner } = await loadFixture(deployQuantumCatFixture);

      const balanceBefore = await catbox.balanceOf(owner.address);
      await catbox.transfer(owner.address, ethers.parseEther("100"));

      expect(await catbox.balanceOf(owner.address)).to.equal(balanceBefore);
    });

    it("Should handle multiple approvals", async function () {
      const { catbox, owner, user1 } = await loadFixture(deployQuantumCatFixture);

      await catbox.approve(user1.address, ethers.parseEther("100"));
      await catbox.approve(user1.address, ethers.parseEther("200"));

      expect(await catbox.allowance(owner.address, user1.address)).to.equal(ethers.parseEther("200"));
    });

    it("Should handle partial transferFrom", async function () {
      const { catbox, owner, user1, user2 } = await loadFixture(deployQuantumCatFixture);

      const allowance = ethers.parseEther("100");
      await catbox.approve(user1.address, allowance);

      await catbox.connect(user1).transferFrom(owner.address, user2.address, ethers.parseEther("40"));

      expect(await catbox.allowance(owner.address, user1.address)).to.equal(ethers.parseEther("60"));
      expect(await catbox.balanceOf(user2.address)).to.equal(ethers.parseEther("40"));
    });

    it("Should not allow transfer with insufficient balance", async function () {
      const { catbox, user1, user2 } = await loadFixture(deployQuantumCatFixture);

      await expect(
        catbox.connect(user1).transfer(user2.address, ethers.parseEther("1"))
      ).to.be.reverted;
    });

    it("Should query balanceOf for addresses that never received tokens", async function () {
      const { catbox, user3 } = await loadFixture(deployQuantumCatFixture);

      expect(await catbox.balanceOf(user3.address)).to.equal(0);
    });

    it("Should query allowance for addresses that never approved", async function () {
      const { catbox, user1, user2 } = await loadFixture(deployQuantumCatFixture);

      expect(await catbox.allowance(user1.address, user2.address)).to.equal(0);
    });
  });

  describe("ERC-20 Infinite Approval Pattern", function () {
    it("Should handle max uint256 allowance correctly", async function () {
      const { catbox, owner, user1, user2 } = await loadFixture(deployQuantumCatFixture);

      await catbox.approve(user1.address, ethers.MaxUint256);

      const transferAmt = ethers.parseEther("100");
      await catbox.connect(user1).transferFrom(owner.address, user2.address, transferAmt);

      // OpenZeppelin ERC20 decreases allowance even for max uint256 (since v5.x)
      const remainingAllowance = await catbox.allowance(owner.address, user1.address);
      
      // Both behaviors are valid - some implementations keep max, others decrease
      // Just verify it's one of the two
      const isMaxOrDecreased = remainingAllowance === ethers.MaxUint256 || 
                               remainingAllowance === ethers.MaxUint256 - transferAmt;
      expect(isMaxOrDecreased, "Allowance should be either max or decreased").to.be.true;
    });
  });
});

