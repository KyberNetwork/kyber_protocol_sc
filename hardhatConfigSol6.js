module.exports = {
  solidity: {
    version: "0.6.6",
    optimizer: require("./solcOptimiserSettings.js")
  },

  paths: {
    sources: "./contracts/sol6",
    tests: "./test/sol6",
  }
};
