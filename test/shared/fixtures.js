const { ethers } = require("hardhat");

/**
 * Shared test fixtures for QuantumCat tests
 * Centralizes deployment logic and common utilities
 */

/**
 * Deploy the complete QuantumCat ERC-20 system
 * @returns {Promise<Object>} Contract instances and signers
 */
async function deployQuantumCatFixture() {
  const [owner, user1, user2, user3] = await ethers.getSigners();

  // Pre-compute controller address using nonce
  const deployerNonce = await ethers.provider.getTransactionCount(owner.address);
  const controllerAddress = ethers.getCreateAddress({
    from: owner.address,
    nonce: deployerNonce + 3 // After deploying 3 tokens
  });

  // Test supply values: 1M CATBOX, 30% split into genesis supply
  const initialCatboxSupply = ethers.parseEther("1000000"); // 1M CATBOX for testing
  const genesisLivecatSupply = ethers.parseEther("150000"); // 150K LIVECAT (15% of total, 50% of 30%)
  const genesisDeadcatSupply = ethers.parseEther("150000"); // 150K DEADCAT (15% of total, 50% of 30%)

  // Deploy tokens
  const CATBOXToken = await ethers.getContractFactory("CATBOXToken");
  const LIVECATToken = await ethers.getContractFactory("LIVECATToken");
  const DEADCATToken = await ethers.getContractFactory("DEADCATToken");

  const catbox = await CATBOXToken.deploy(
    controllerAddress,
    owner.address,
    initialCatboxSupply
  );

  const livecat = await LIVECATToken.deploy(
    controllerAddress,
    owner.address,
    genesisLivecatSupply
  );
  
  const deadcat = await DEADCATToken.deploy(
    controllerAddress,
    owner.address,
    genesisDeadcatSupply
  );

  // Deploy controller (with fixed 4% fee)
  const QuantumCatController = await ethers.getContractFactory("QuantumCatController");
  const controller = await QuantumCatController.deploy(
    await catbox.getAddress(),
    await livecat.getAddress(),
    await deadcat.getAddress()
  );

  // Verify controller address matches
  const actualControllerAddress = await controller.getAddress();
  if (actualControllerAddress !== controllerAddress) {
    throw new Error("Controller address mismatch!");
  }

  return { catbox, livecat, deadcat, controller, owner, user1, user2, user3 };
}

module.exports = {
  deployQuantumCatFixture
};

