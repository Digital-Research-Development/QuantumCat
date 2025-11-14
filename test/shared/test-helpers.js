const { ethers } = require("hardhat");
const { mine } = require("@nomicfoundation/hardhat-network-helpers");

/**
 * Advanced test helpers for edge cases and coverage testing
 */

/**
 * Attempt to trigger a specific random outcome (zero alive or zero dead)
 * @param {Object} params - Parameters
 * @param {string} params.targetOutcome - "zero_alive" or "zero_dead"
 * @param {number} params.maxAttempts - Maximum attempts (default: 50)
 * @param {Function} params.observeFn - Async function that performs observation (receives iteration index)
 * @param {Function} params.checkFn - Async function that returns {alive, dead} balances
 * @returns {Promise<boolean>} True if target outcome achieved
 */
async function attemptSpecificOutcome({ targetOutcome, maxAttempts = 50, observeFn, checkFn }) {
  for (let i = 0; i < maxAttempts; i++) {
    await observeFn(i);
    
    const { alive, dead } = await checkFn();
    
    const foundTarget = 
      (targetOutcome === "zero_dead" && dead === 0n && alive > 0n) ||
      (targetOutcome === "zero_alive" && alive === 0n && dead > 0n);
    
    if (foundTarget) {
      return true;
    }
  }
  
  return false;
}

/**
 * Make two token balances equal by transferring excess to another address
 * @param {Object} params - Parameters
 * @returns {Promise<{aliveBalance, deadBalance}>} Final equal balances
 */
async function makeBalancesEqual({ livecat, deadcat, owner, recipient }) {
  let aliveBalance = await livecat.balanceOf(owner.address);
  let deadBalance = await deadcat.balanceOf(owner.address);

  if (aliveBalance > deadBalance) {
    const diff = aliveBalance - deadBalance;
    await livecat.connect(owner).transfer(recipient.address, diff);
  } else if (deadBalance > aliveBalance) {
    const diff = deadBalance - aliveBalance;
    await deadcat.connect(owner).transfer(recipient.address, diff);
  }

  aliveBalance = await livecat.balanceOf(owner.address);
  deadBalance = await deadcat.balanceOf(owner.address);
  
  return { aliveBalance, deadBalance };
}

/**
 * Ensure livecat balance is less than deadcat balance
 * @param {Object} params - Parameters
 * @returns {Promise<{aliveBalance, deadBalance}>} Final balances
 */
async function ensureLivecatLess({ livecat, deadcat, owner, recipient, minDifference }) {
  let aliveBalance = await livecat.balanceOf(owner.address);
  let deadBalance = await deadcat.balanceOf(owner.address);

  if (aliveBalance >= deadBalance) {
    const transferAmount = aliveBalance - deadBalance + minDifference;
    await livecat.connect(owner).transfer(recipient.address, transferAmount);
  }

  aliveBalance = await livecat.balanceOf(owner.address);
  deadBalance = await deadcat.balanceOf(owner.address);
  
  return { aliveBalance, deadBalance };
}

/**
 * Setup observation and mine to specific timing point
 * @param {Object} params - Parameters
 * @returns {Promise<{data, dataHash, entropy}>} Observation data
 */
async function setupAndCommitObservation({ catbox, controller, owner, amount, seed }) {
  const data = ethers.toUtf8Bytes(seed);
  const dataHash = ethers.keccak256(data);
  const entropy = ethers.keccak256(ethers.toUtf8Bytes(`entropy_${seed}`));

  await catbox.connect(owner).approve(await controller.getAddress(), amount);
  await controller.connect(owner).commitObserve(amount, dataHash, entropy);

  return { data, dataHash, entropy };
}

/**
 * Mine blocks to reach reveal or force observe timing
 * @param {Object} params - Parameters
 */
async function mineToTiming({ controller, timing }) {
  const REVEAL_DELAY = await controller.REVEAL_DELAY();
  const GRACE = await controller.GRACE();
  
  let blocks;
  switch (timing) {
    case "reveal":
      blocks = Number(REVEAL_DELAY) + 1;
      break;
    case "force":
      blocks = Number(REVEAL_DELAY) + Number(GRACE) + 1;
      break;
    case "blockhash_expiry":
      blocks = 262;
      break;
    default:
      throw new Error(`Unknown timing: ${timing}`);
  }
  
  await mine(blocks);
}

/**
 * Rebox all available pairs to clean up balances
 * @param {Object} params - Parameters
 */
async function reboxAllPairs({ livecat, deadcat, controller, owner }) {
  const aliveBalance = await livecat.balanceOf(owner.address);
  const deadBalance = await deadcat.balanceOf(owner.address);
  const pairs = aliveBalance < deadBalance ? aliveBalance : deadBalance;
  
  if (pairs > 0n) {
    await controller.connect(owner).rebox(pairs);
  }
  
  return pairs;
}

module.exports = {
  attemptSpecificOutcome,
  makeBalancesEqual,
  ensureLivecatLess,
  setupAndCommitObservation,
  mineToTiming,
  reboxAllPairs
};

