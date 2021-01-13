module.exports = {
  solidity: {
    version: "0.4.18",
    optimizer: require("./solcOptimiserSettings.js")
  },

  paths: {
    sources: "./contracts/sol4",
    tests: "./test/sol4",
  }
};
