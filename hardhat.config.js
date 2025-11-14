require("@nomicfoundation/hardhat-toolbox");
require("hardhat-contract-sizer");
require("hardhat-abi-exporter");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.30",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200, // Lower runs = cheaper deployment (testnet optimized)
      },
      viaIR: false, // Enable if needed for complex contracts
    },
  },
  networks: {
    hardhat: {
      chainId: 8453, // Base mainnet chainId
      forking: process.env.BASE_FORK
        ? {
            url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
          }
        : undefined,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    // Base Networks (Recommended for QuantumCat)
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      accounts: (process.env.PRIVATE_KEY && process.env.PRIVATE_KEY.length >= 64) ? [process.env.PRIVATE_KEY] : [],
      chainId: 84532,
      gasPrice: 100000000, // 0.1 gwei (10x cheaper for testnet)
    },
    base: {
      url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      accounts: (process.env.PRIVATE_KEY && process.env.PRIVATE_KEY.length >= 64) ? [process.env.PRIVATE_KEY] : [],
      chainId: 8453,
      gasPrice: 1000000000, // 1 gwei
      // WARNING: Immutable contract - all parameters are PERMANENT after deployment!
    },
    // Ethereum Networks (High gas cost - not recommended for memecoins)
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: (process.env.PRIVATE_KEY && process.env.PRIVATE_KEY.length >= 64) ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155111,
    },
    mainnet: {
      url: process.env.MAINNET_RPC_URL || "",
      accounts: (process.env.MAINNET_PRIVATE_KEY && process.env.MAINNET_PRIVATE_KEY.length >= 64) ? [process.env.MAINNET_PRIVATE_KEY] : [],
      chainId: 1,
      // WARNING: Immutable contract - all parameters are PERMANENT after deployment!
    },
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY || "",
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      base: process.env.BASESCAN_API_KEY || "",
      baseSepolia: process.env.BASESCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org"
        }
      },
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org"
        }
      }
    ]
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    coinmarketcap: process.env.COINMARKETCAP_API_KEY || "",
    outputFile: process.env.GAS_REPORT_FILE || undefined,
    noColors: process.env.CI === "true",
    token: "ETH", // Base uses ETH for gas
    L2: "base", // Specify Base L2
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    strict: true,
    only: ["QuantumCat"],
  },
  abiExporter: {
    path: "./abis",
    runOnCompile: true,
    clear: true,
    flat: true,
    spacing: 2,
    pretty: false,
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  // Include test mocks in compilation
  sourcePaths: ["./contracts", "./test/mocks"],
  mocha: {
    timeout: 200000,
    reporter: process.env.CI ? "json" : "spec",
  },
};
