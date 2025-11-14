# 🐱⚛️ QuantumCat - Schrödinger's Memecoin

A quantum-inspired ERC-20 token system where cats exist in superposition until observed, creating a unique DeFi game with cryptographic randomness and deflationary mechanics.

[![Solidity](https://img.shields.io/badge/Solidity-0.8.30-e6e6e6?logo=solidity)](https://soliditylang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Hardhat](https://img.shields.io/badge/Built%20with-Hardhat-ffdb1c)](https://hardhat.org/)

## 🎯 Concept

Inspired by Schrödinger's famous thought experiment, QuantumCat implements a memecoin where tokens exist in three quantum states:

- **CATBOX** 📦 - Superposed state (both alive and dead simultaneously)
- **LIVECAT** 😺 - Observed alive state  
- **DEADCAT** 💀 - Observed dead state

Users can **observe** CATBOX tokens to collapse them into LIVECAT and DEADCAT with cryptographic randomness, or **rebox** equal pairs back into CATBOX (with a deflationary fee).

## ✨ Key Features

### 🔒 **Zero Admin Control**
- Fully immutable contracts - no owner, no pause, no upgrades
- All parameters locked forever at deployment
- 100% trustless and decentralized
- Perfect for renounced memecoin launches

### 🎲 **Quantum Observation Mechanics**
- **Commit-Reveal Pattern**: Prevents manipulation with cryptographic commitment
- **Uniform Random Distribution**: Each observation gets unique 50/50 average split
- **Quantum Entanglement Protocol**: All observations cryptographically linked via shared entropy pool
- **Deterministic Outcomes**: Same inputs + block state = same result (observe and forceObserve identical)

### 💰 **Eternal Economics (Fixed Fee System)**
- **Fixed 2.5% rebox fee**: Immutable and predictable for all reboxing operations
- **Deflationary pressure**: Creates gradual supply reduction over time
- **Long-term sustainability**: Balanced fee ensures eternal operation
- **Predictable**: Fee is constant and transparent (250 basis points)

### 🔐 **Security First**
- Reentrancy guards on all state-changing functions
- State changes before external calls
- High-entropy RNG combining multiple sources:
  - Commitment-linked blockhash
  - `block.prevrandao` (post-Merge randomness)
  - Recent block state
  - User-provided entropy
  - Shared entropy pool (quantum entanglement)
- Comprehensive test coverage with edge cases

### 📊 **Exchange Compatible**
- Three separate ERC-20 tokens
- No custom transfer logic
- Works with any DEX or CEX
- Standard interfaces for wallet support

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│         QuantumCatController (Immutable)            │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │  Observe: CATBOX → LIVECAT + DEADCAT         │  │
│  │  - commitObserve() - Burn CATBOX, commit     │  │
│  │  - observe() - Reveal after delay            │  │
│  │  - forceObserve() - Finalize stuck reveals   │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │  Rebox: LIVECAT + DEADCAT → CATBOX (minus fee) │
│  │  - rebox() - Burn pairs, mint CATBOX         │  │
│  │  - reboxMax() - Rebox all available pairs    │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
            ↓ mints/burns ↓
┌───────────────────────────────────────────────────┐
│  📦 CATBOX    😺 LIVECAT    💀 DEADCAT           │
│  (ERC-20)     (ERC-20)      (ERC-20)             │
│  Superposed   Alive         Dead                  │
└───────────────────────────────────────────────────┘
```

## 🎮 How It Works

### 1️⃣ Observe (Collapse the Wavefunction)

```solidity
// Step 1: Commit observation
bytes32 dataHash = keccak256(abi.encodePacked("my_secret_data"));
bytes32 userEntropy = keccak256(abi.encodePacked(block.timestamp, msg.sender));
controller.commitObserve(1000 ether, dataHash, userEntropy);

// Step 2: Wait 5+ blocks for reveal delay

// Step 3: Reveal observation
controller.observe("my_secret_data");
// Receive random amounts of LIVECAT + DEADCAT (totaling 1000 tokens)
```

**Process:**
1. User burns CATBOX tokens and commits to future reveal data
2. Wait minimum 5 blocks for blockhash entropy
3. Reveal data to trigger random split
4. Receive LIVECAT and DEADCAT based on cryptographic randomness

**Safety Features:**
- If user fails to reveal, anyone can `forceObserve()` after 64 additional blocks
- Force observation produces identical results to user reveal
- No tokens are ever lost or stuck

### 2️⃣ Rebox (Recombine the States)

```solidity
// Burn 1 LIVECAT + 1 DEADCAT → Get back CATBOX (minus fixed 2.5% fee)
controller.rebox(100 ether); // Rebox 100 pairs

// Or rebox all available pairs
controller.reboxMax(0); // 0 = no cap

// Check fee (immutable 2.5%)
uint96 fee = controller.REBOX_FEE_BPS(); // Returns 250 (2.5% in basis points)
```

**Fixed Fee Mechanics:**
- **Fixed 2.5% fee on all rebox operations** (immutable)
- **Example**: 1 pair → 1.95 CATBOX (2 tokens - 2.5% = 1.95)
- **100 pairs** → 195 CATBOX (200 tokens - 5 tokens fee = 195)
- Fee tokens are **permanently destroyed** (never minted back)
- Creates **predictable deflationary pressure**
- **No manipulation possible** due to fixed, immutable fee
- Ensures long-term sustainability with balanced economics

### 3️⃣ Helper Functions (Status & Monitoring)

```solidity
// Check comprehensive observation status
(bool hasPending, bool canReveal, bool canForce, 
 uint256 blocksUntilReveal, uint256 blocksUntilForce) 
    = controller.getObservationStatus(userAddress);

// Check if blockhash is still available (within 256 blocks)
(bool available, uint256 blocksUntilExpiry) 
    = controller.isBlockhashAvailable(userAddress);

// Calculate rebox output before executing (includes fixed 2.5% fee)
(uint256 catboxOut, uint256 feeTaken) 
    = controller.calculateReboxOutput(pairs);

// Get fixed fee constant
uint96 fee = controller.REBOX_FEE_BPS(); // Returns 250 (2.5%)

// Simple boolean checks
bool canRevealNow = controller.canObserve(userAddress);
bool canForceNow = controller.canForceObserve(userAddress);
```

**Use Cases:**
- ⏰ **Timing optimization**: Know exactly when to reveal
- 🔍 **Status monitoring**: Build UIs showing observation progress
- 💰 **Cost calculation**: Preview rebox returns before committing
- 🛡️ **Safety checks**: Ensure blockhash availability for optimal entropy

## 🔬 Quantum Entanglement Protocol

Unlike traditional RNG systems where each random outcome is independent, QuantumCat implements **Quantum Entanglement**: all observations are cryptographically linked through an evolving shared entropy pool.

```solidity
// Each observation updates the shared pool
sharedEntropyPool = keccak256(abi.encodePacked(
    sharedEntropyPool,  // Previous state
    msg.sender,
    amount,
    dataHash,
    userEntropy,
    block.number,
    block.timestamp
));

// Pool state is used in future randomness generation
randomness = keccak256(abi.encodePacked(
    commitLinkedHash,
    block.prevrandao,
    userEntropy,
    entropySnapshot,  // Pool state at commit time
    sharedEntropyPool // Current pool state
));
```

**Benefits:**
- Creates cryptographic dependency between all observations
- Makes it exponentially harder to predict future outcomes
- Mimics quantum entanglement in physics
- Adds an additional layer of security to the RNG system

## 📈 Tokenomics (Example Production Deployment)

### Initial Distribution (662,607,015 CATBOX)
*Supply based on Planck's constant (6.62607015 × 10⁻³⁴)*

- 🌊 **30% Liquidity Pools** (199M CATBOX)
  - CATBOX/ETH pools on Base DEXs
  
- 🔬 **30% Initial Observation Liquidity Pools** (199M CATBOX)
  - Creates a random amount of LIVECAT/DEADCAT
  - Enables LIVECAT/DEADCAT arbitrage pairs
  
- 🌍 **20% Community** (133M CATBOX)
  - Airdrops, rewards
  
- 👥 **20% Creator Allocation & Reserves** (133M CATBOX)

### Fixed Fee Economics

The fee is **fixed at 2.5%** for all rebox operations (immutable):

| Operation | Input | Fee | Output |
|-----------|-------|-----|--------|
| Rebox 1 pair | 1 LIVECAT + 1 DEADCAT (2 tokens) | 0.05 tokens (2.5%) | 1.95 CATBOX |
| Rebox 10 pairs | 10 LIVECAT + 10 DEADCAT (20 tokens) | 0.5 tokens (2.5%) | 19.5 CATBOX |
| Rebox 100 pairs | 100 LIVECAT + 100 DEADCAT (200 tokens) | 5 tokens (2.5%) | 195 CATBOX |
| Rebox 1000 pairs | 1000 LIVECAT + 1000 DEADCAT (2000 tokens) | 50 tokens (2.5%) | 1950 CATBOX |

### Long-term Sustainability

The fixed 2.5% fee provides balanced economics:

- **Predictable**: Fee never changes - always 2.5% of rebox amount
- **Deflationary**: Each rebox cycle permanently burns 2.5% of tokens
- **Sustainable**: Moderate fee encourages reboxing while reducing supply
- **No manipulation**: Immutable fee prevents gaming or exploitation
- **Result**: Gradual, predictable supply reduction over time

## 🛠️ Installation

```bash
# Clone repository
git clone https://github.com/yourusername/QuantumCat.git
cd QuantumCat/solidity

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your settings
# Required: PRIVATE_KEY, RPC URLs, API keys
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with gas reporting
npm run test:gas

# Run coverage
npm run test:coverage

# Run specific test suite
npx hardhat test test/02-core-observe-rebox.test.js

# Run security tests
npm run test:security
```

### Test Coverage

- ✅ Deployment and initialization
- ✅ Core observation mechanics (commit-reveal)
- ✅ Rebox functionality
- ✅ Random distribution uniformity
- ✅ Security (reentrancy, manipulation attempts)
- ✅ Edge cases (force observe, zero amounts, etc.)
- ✅ ERC-20 compliance

## 🚀 Deployment

### Testnet Deployment (Base Sepolia)

```bash
# Configure in .env
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
PRIVATE_KEY=your_private_key
BASESCAN_API_KEY=your_api_key

# Deploy
npm run deploy:base-sepolia
```

### Production Deployment (Base Mainnet)

```bash
# Configure in .env
BASE_RPC_URL=https://mainnet.base.org
PRIVATE_KEY=your_private_key
BASESCAN_API_KEY=your_api_key
INITIAL_HOLDER_ADDRESS=0x... # Address to receive initial supply

# Deploy with production mode (uses optimal parameters)
DEPLOYMENT_MODE=production npm run deploy:base

# This will:
# - Deploy with 662M CATBOX initial supply
# - Set 2.5% rebox fee (immutable)
# - Require 15-second confirmation
# - Auto-verify contracts on Basescan
# - Generate deployment report
```

### Deployment Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `INITIAL_CATBOX_SUPPLY` | 662,607,015 | Initial supply (18 decimals) |
| `REBOX_FEE_BPS` | 250 (2.5%) | Fixed rebox fee (immutable) |
| `INITIAL_HOLDER_ADDRESS` | Deployer | Receives initial CATBOX supply |
| `DEPLOYMENT_MODE` | testing | Set to `production` for mainnet |

⚠️ **CRITICAL**: All parameters are immutable after deployment!

## 📝 Contract Addresses

### Base Sepolia (Testnet)
```
CATBOX:    [Deployed after testnet deployment]
LIVECAT:   [Deployed after testnet deployment]
DEADCAT:   [Deployed after testnet deployment]
Controller: [Deployed after testnet deployment]
```

### Base Mainnet (Production)
```
CATBOX:    [To be deployed]
LIVECAT:   [To be deployed]
DEADCAT:   [To be deployed]
Controller: [To be deployed]
```

Check `/deployments` folder for latest deployment info.

## 🎯 Post-Deployment Setup

### 1. Initial Observation (Create LIVECAT/DEADCAT Supply)

To create initial LIVECAT/DEADCAT supply, you'll need to perform observations using the Hardhat console:

```bash
# Use Hardhat console to commit and reveal observations
npx hardhat console --network base

# Example: Observe 30% of supply (~199M CATBOX)
const amount = ethers.parseEther("199000000")
const dataHash = ethers.keccak256(ethers.toUtf8Bytes("initial_observation"))
const entropy = ethers.randomBytes(32)

await controller.commitObserve(amount, dataHash, entropy)
# Wait 5+ blocks, then reveal
await controller.observe(ethers.toUtf8Bytes("initial_observation"))
```

### 2. Add Liquidity

Create pools on Base DEXs (Uniswap, Aerodrome, etc.):

- **CATBOX/ETH** - Main superposition pool
- **LIVECAT/DEADCAT** - Arbitrage pair
- **LIVECAT/ETH** - Individual state trading
- **DEADCAT/ETH** - Individual state trading

### 3. Lock Liquidity

Send LP tokens to burn address:
```
0x000000000000000000000000000000000000dEaD
```

### 4. Announce Renouncement

Let the community know the contracts are fully autonomous!

## 🔧 Interacting with Deployed Contracts

After deployment, you can interact with contracts using Hardhat console:

```bash
# Connect to deployed contracts
npx hardhat console --network baseSepolia

# Example: Check balances
const catbox = await ethers.getContractAt("CATBOXToken", "CATBOX_ADDRESS")
const balance = await catbox.balanceOf("YOUR_ADDRESS")

# Example: Check observation status
const controller = await ethers.getContractAt("QuantumCatController", "CONTROLLER_ADDRESS")
const status = await controller.getObservationStatus("YOUR_ADDRESS")

# Example: Get current rebox fee
const fee = await controller.getCurrentReboxFee()
```

For comprehensive testing, use the test suite (see **Testing** section above).

## 🔐 Security

### ⚠️ IMPORTANT: Security Audit Recommendations

**Before deploying with significant value, a professional security audit is STRONGLY RECOMMENDED.**

#### Why You Need an Audit

- ✅ **Comprehensive Testing**: While we have 138+ passing tests with extensive coverage, professional auditors use specialized tools and expertise
- ✅ **Third-Party Verification**: Independent review catches issues that internal testing might miss
- ✅ **Community Confidence**: Audited contracts inspire trust and attract more users
- ✅ **Immutability Risk**: Once deployed, bugs CANNOT be fixed - audit before launch

#### Recommended Audit Firms

| Firm | Cost Estimate | Timeline | Notes |
|------|---------------|----------|-------|
| [Trail of Bits](https://www.trailofbits.com/) | $30k-50k | 2-4 weeks | Top tier, comprehensive |
| [ConsenSys Diligence](https://consensys.net/diligence/) | $25k-45k | 2-4 weeks | Ethereum specialists |
| [OpenZeppelin](https://www.openzeppelin.com/security-audits) | $20k-40k | 3-5 weeks | OZ contracts expertise |
| [Cyfrin (Code4rena)](https://www.codehawks.com/) | $15k-30k | 2-3 weeks | Competitive audit platform |
| [Sherlock](https://www.sherlock.xyz/) | $10k-25k | 2-4 weeks | Contest-based auditing |

#### Deployment Strategy Without Audit

If deploying without an audit (testnet or low-value deployment):

1. ✅ **Start Small**: Deploy with minimal liquidity first ($1k-5k max)
2. ✅ **Monitor Closely**: Watch all transactions for unusual behavior  
3. ✅ **Test Extensively**: Use Base Sepolia testnet for at least 2 weeks
4. ✅ **Community Testing**: Let power users test before adding significant liquidity
5. ✅ **Gradual Scaling**: Increase liquidity slowly if no issues found
6. ⚠️ **Risk Disclosure**: Clearly communicate "unaudited" status to users

### Audit Status
- ⚠️ **NOT AUDITED** - Professional third-party audit recommended before mainnet deployment
- ✅ Comprehensive internal testing (138+ tests passing)
- ✅ Based on OpenZeppelin battle-tested contracts (v5.4.0)
- ✅ Zero admin functions = reduced attack surface
- ✅ Immutable design = no upgrade vectors

### Security Design

The protocol addresses common concerns through careful design:

#### ✅ Blockhash Expiry (Fully Handled)
- **Challenge**: Ethereum's `blockhash()` only stores 256 blocks of history
- **Solution**: Multi-layered entropy system doesn't rely solely on blockhash
  - Uses `block.prevrandao` (Ethereum's post-Merge randomness beacon)
  - Recent block state (timestamp, number, chainid)
  - User-provided entropy (your secret data)
  - Shared entropy pool (quantum entanglement)
  - Even if blockhash returns 0, other sources provide sufficient entropy
- **Safety**: Grace period (69 blocks) is well within 256 block window
- **Testing**: Comprehensive tests verify correct behavior even after 260+ blocks
- **Helper**: `isBlockhashAvailable()` view function to check status

#### ✅ MEV Resistance (Well Protected)
- **Challenge**: Miners/validators could theoretically manipulate transaction ordering
- **Protection**: Commit-reveal pattern makes outcome unpredictable until reveal
  - Committed data hash prevents pre-reveal manipulation
  - User entropy requirement (32 bytes) adds personal randomness
  - Multiple block state sources sampled at reveal time
  - Quantum entanglement links all observations cryptographically
- **Result**: Attacker would need to control multiple blocks AND know your secret data

#### ⚠️ Gas Costs (Inherent to Security)
- **Reality**: Two transactions required (commit + reveal)
- **Why**: Necessary for secure commit-reveal pattern
- **Mitigation**: Deploy on Layer 2 networks (Base recommended)
  - Base: ~$0.01-0.05 per transaction
  - Ethereum L1: ~$5-50 per transaction
- **Helper**: `getObservationStatus()` for timing optimization

### Best Practices

For optimal security and user experience:

- ✅ **Use strong user entropy**: Generate random 32-byte values, don't reuse
- ✅ **Reveal promptly**: Reveal within 69 blocks (though safe after that too)
- ✅ **Check status**: Use `getObservationStatus()` to track timing
- ✅ **L2 deployment**: Base for low gas costs (~$0.01-0.05 per transaction)
- ✅ **Monitor blockhash**: Use `isBlockhashAvailable()` if revealing late

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow Solidity style guide
- Add tests for new features
- Update documentation
- Run linter before committing: `npm run lint`
- Format code: `npm run format`

## 📚 Resources

### Technical Docs

- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)
- [Hardhat Documentation](https://hardhat.org/docs)
- [ERC-20 Standard](https://eips.ethereum.org/EIPS/eip-20)

### Quantum Physics

- [Schrödinger's Cat](https://en.wikipedia.org/wiki/Schr%C3%B6dinger%27s_cat)
- [Quantum Superposition](https://en.wikipedia.org/wiki/Quantum_superposition)
- [Wave Function Collapse](https://en.wikipedia.org/wiki/Wave_function_collapse)

### Base Network

- [Base Documentation](https://docs.base.org/)
- [Base Sepolia Testnet](https://sepolia.basescan.org/)
- [Base Mainnet](https://basescan.org/)

## ❓ FAQ

### Why three tokens?

Separating states into distinct ERC-20 tokens enables:
- Seamless DEX integration without custom logic
- Arbitrage opportunities between states
- Individual state trading and speculation
- Standard wallet/exchange support

### How is randomness guaranteed?

Multi-layer entropy from:
1. Commit-reveal pattern (prevents pre-observation manipulation)
2. Blockhash of commit-linked block
3. `block.prevrandao` (Ethereum post-Merge randomness)
4. Recent block state
5. User-provided entropy (your secret data)
6. Quantum entanglement protocol (shared pool)

### What happens if I don't reveal?

After 64 blocks (GRACE period), anyone can call `forceObserve()` on your behalf. You'll receive the exact same tokens as if you revealed yourself - no penalty!

### What if I reveal after 256 blocks (blockhash expiry)?

No problem! The system is designed to work even if blockhash returns 0:
- Multiple entropy sources ensure randomness (prevrandao, timestamp, user entropy, etc.)
- Comprehensive tests verify correct behavior even after 260+ blocks
- Use `isBlockhashAvailable()` view function to check blockhash status
- Use `getObservationStatus()` to track timing and reveal readiness

### How do I check my observation status?

Use the new helper functions:
```solidity
// Get comprehensive status
(bool hasPending, bool canReveal, bool canForce, 
 uint256 blocksUntilReveal, uint256 blocksUntilForce) 
    = controller.getObservationStatus(myAddress);

// Check blockhash availability
(bool available, uint256 blocksUntilExpiry) 
    = controller.isBlockhashAvailable(myAddress);
```

### Can the contract be upgraded?

**NO.** The contracts are fully immutable:
- No owner or admin functions
- No pause functionality  
- No upgrade mechanisms
- All parameters locked at deployment

This is a feature, not a bug! True decentralization.

### How does the fixed fee system work?

The fee is **always 2.5%** of the rebox amount:

```solidity
// Fixed fee constant (immutable)
uint96 public constant REBOX_FEE_BPS = 250; // 2.5%

// Rebox calculation
uint256 base = 2 * pairs; // Total tokens from burning pairs
uint256 feeTokens = (base * 250) / 10_000; // 2.5% fee
uint256 catboxOut = base - feeTokens; // Output after fee
```

**Benefits:**
- **Predictable**: Fee is always 2.5%, never changes
- **Simple**: Easy to calculate rebox returns
- **Fair**: Same fee for all users, all amounts, all times
- **No manipulation**: Immutable fee prevents gaming
- **Balanced**: 2.5% provides deflation without discouraging use

Fee tokens are permanently destroyed (never minted back), creating:
- Predictable deflationary pressure
- Value accrual to remaining tokens
- Long-term supply reduction
- Sustainable economics

### Why Base network?

Base offers:
- 🚀 Low transaction costs (perfect for gaming mechanics)
- ⚡ Fast block times (5 blocks = ~10 seconds)
- 🛡️ Ethereum security (Optimistic Rollup)
- 🌊 Growing DeFi ecosystem
- 🎯 Memecoin-friendly community

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This is experimental software. Use at your own risk.

- Not financial advice
- No guarantees or warranties
- Cryptocurrency trading involves risk
- May contain bugs despite testing
- Immutable = cannot fix issues post-deployment

DO YOUR OWN RESEARCH before deploying or using this protocol.

## 🙏 Acknowledgments

- Inspired by Erwin Schrödinger's thought experiment
- Built with [OpenZeppelin](https://openzeppelin.com/) contracts
- Powered by [Hardhat](https://hardhat.org/) development environment
- Deployed on [Base](https://base.org/) L2 network

---

<div align="center">

**🐱⚛️ QuantumCat - Where Memecoins Meet Quantum Physics 🐱⚛️**

</div>

