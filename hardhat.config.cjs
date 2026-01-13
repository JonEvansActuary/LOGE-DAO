require("@nomiclabs/hardhat-ethers");
require("@nomicfoundation/hardhat-verify");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.26",
    settings: {
      evmVersion: "cancun",
      optimizer: { enabled: true, runs: 200 },
    },
  },

  networks: {
    polygon: {
      url: process.env.POLYGON_RPC_URL,
      chainId: 137,
      timeout: 180000,
      gasMultiplier: 1.2,
    },
  },

  // Use ONE key (Etherscan v2 style). Works for Polygonscan too via the plugin.
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};
