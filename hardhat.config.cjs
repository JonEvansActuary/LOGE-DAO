require("@nomiclabs/hardhat-ethers");
require("@nomicfoundation/hardhat-verify");

module.exports = {
  solidity: {
    version: "0.8.26",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  networks: {
    polygon: {
      url: "https://polygon-mainnet.g.alchemy.com/v2/eXLrvUv2WskoG2N-d9gEG",
      chainId: 137,
      timeout: 180000,
      gasMultiplier: 1.2,
    },
  },

  etherscan: {
    apiKey: "V6AXDUCE54FHH4P8BCFKTPSQGG415J4A6A",
  },
};
