require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config(); // To load environment variables for deployment

// Make sure you have a .env file with your keys, or update placeholders
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "your_private_key_placeholder";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "your_etherscan_api_key";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.18", // Match the pragma in your contract
    settings: {
      optimizer: {
        enabled: true,
        runs: 200, // Standard optimization setting
      },
    },
  },
  defaultNetwork: "hardhat", // Use local network for quick tests
  networks: {
    hardhat: {
      chainId: 31337, // Standard chain ID for Hardhat Network
    },
    localhost: { // For running against a local node like Hardhat node or Ganache
        url: "http://127.0.0.1:8545/",
        chainId: 31337, // Should match the local node's chain ID
    },
    sepolia: { // Example configuration for Sepolia testnet
        url: SEPOLIA_RPC_URL,
        accounts: [`0x${PRIVATE_KEY}`], // Use environment variable for security
        chainId: 11155111, // Sepolia's chain ID
    },
    // Add other networks like Goerli, mainnet etc. if needed
    // goerli: { ... }
  },
  etherscan: {
    // Your API key for Etherscan verification
    apiKey: ETHERSCAN_API_KEY,
  },
  gasReporter: { // Optional: For checking gas usage of functions
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
    // coinmarketcap: process.env.COINMARKETCAP_API_KEY, // Optionally add API key for USD conversion
    // outputFile: "gas-report.txt", // Optional: Log to a file
    // noColors: true, // Optional: If outputting to file
  },
  paths: {
    sources: "./contracts", // Where your contracts are
    tests: "./test",         // Where your tests are
    cache: "./cache",
    artifacts: "./artifacts", // Contract compilation output
  },
  mocha: { // Timeout for tests, especially needed for slower testnets
    timeout: 40000 // 40 seconds
  }
};