const { ethers } = require("hardhat");
const { mine } = require("@nomicfoundation/hardhat-network-helpers");

/**
 * Shared test helpers for QuantumCat tests
 * Centralizes common test utilities and helper functions
 */

/**
 * Generate deterministic entropy for testing
 * @param {string} seed - Seed string for entropy generation
 * @returns {string} Keccak256 hash of the seed
 */
function generateEntropy(seed) {
  return ethers.keccak256(ethers.toUtf8Bytes(`test_entropy_${seed}`));
}

/**
 * Wait for observation to be ready for reveal
 * @param {Contract} controller - Controller contract instance
 * @param {string} address - Address to check
 * @param {number} maxIterations - Maximum iterations to wait
 */
async function waitForObserveReady(controller, address, maxIterations = 256) {
  for (let i = 0; i < maxIterations; i++) {
    if (await controller.canObserve(address)) {
      return;
    }
    await mine(1);
  }
  throw new Error("observe readiness timeout");
}

/**
 * Wait for observation to be ready for force reveal
 * @param {Contract} controller - Controller contract instance
 * @param {string} address - Address to check
 * @param {number} maxIterations - Maximum iterations to wait
 */
async function waitForForceReady(controller, address, maxIterations = 512) {
  for (let i = 0; i < maxIterations; i++) {
    if (await controller.canForceObserve(address)) {
      return;
    }
    await mine(1);
  }
  throw new Error("force observe readiness timeout");
}

/**
 * Perform a complete observation cycle (commit + reveal)
 * @param {Object} params - Parameters
 * @param {Contract} params.catbox - CATBOX token instance
 * @param {Contract} params.controller - Controller instance
 * @param {Signer} params.signer - Signer to use
 * @param {BigInt} params.amount - Amount to observe
 * @param {string} params.seed - Seed for data and entropy
 * @returns {Promise<Object>} Observation results with alive and dead amounts
 */
async function performObservation({ catbox, controller, signer, amount, seed }) {
  const data = ethers.toUtf8Bytes(`observe_${seed}`);
  const dataHash = ethers.keccak256(data);
  const entropy = generateEntropy(seed);

  await catbox.connect(signer).approve(await controller.getAddress(), amount);
  await controller.connect(signer).commitObserve(amount, dataHash, entropy);
  await waitForObserveReady(controller, signer.address);
  
  const tx = await controller.connect(signer).observe(data, entropy);
  const receipt = await tx.wait();

  // Parse the Observed event
  const event = receipt.logs.find(log => {
    try {
      const parsed = controller.interface.parseLog(log);
      return parsed && parsed.name === "Observed";
    } catch {
      return false;
    }
  });

  if (event) {
    const parsed = controller.interface.parseLog(event);
    return {
      alive: parsed.args.alive,
      dead: parsed.args.dead,
      receipt
    };
  }

  return { alive: 0n, dead: 0n, receipt };
}

/**
 * Perform multiple observations to get both LIVECAT and DEADCAT tokens
 * @param {Object} params - Parameters
 * @param {Contract} params.catbox - CATBOX token instance
 * @param {Contract} params.livecat - LIVECAT token instance
 * @param {Contract} params.deadcat - DEADCAT token instance
 * @param {Contract} params.controller - Controller instance
 * @param {Signer} params.signer - Signer to use
 * @param {number} maxAttempts - Maximum observation attempts
 * @returns {Promise<void>}
 */
async function observeUntilBothTokens({ catbox, livecat, deadcat, controller, signer, maxAttempts = 10 }) {
  for (let i = 0; i < maxAttempts; i++) {
    const amount = ethers.parseEther("100");
    await performObservation({ catbox, controller, signer, amount, seed: `both_tokens_${i}` });

    const aliveBal = await livecat.balanceOf(signer.address);
    const deadBal = await deadcat.balanceOf(signer.address);
    
    if (aliveBal > 0n && deadBal > 0n) {
      return; // Success - have both types
    }
  }
}

/**
 * Constants used across tests
 */
const DEFAULT_ENTROPY = generateEntropy("default");
const REVEAL_DELAY = 5;
const GRACE_PERIOD = 64;
const DATA_MAX = 256;

module.exports = {
  generateEntropy,
  waitForObserveReady,
  waitForForceReady,
  performObservation,
  observeUntilBothTokens,
  DEFAULT_ENTROPY,
  REVEAL_DELAY,
  GRACE_PERIOD,
  DATA_MAX
};

