const fs = require('fs');
const path = require('path');

task('newKNC', 'deploys new KNCv2 token')
  .addParam('input', 'Input JSON file for deployment')
  .setAction(async (taskArgs) => {
  const configPath = path.join(__dirname, taskArgs.input);
  const configParams = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  // note: gas price is set in hardhat config
  const BN = ethers.BigNumber;
  const [deployer] = await ethers.getSigners();
  deployerAddress = await deployer.getAddress();

  const NewKNC = await ethers.getContractFactory('KyberNetworkTokenV2');
  const newKNC = await upgrades.deployProxy(NewKNC, [configParams['oldknc'], configParams['minter']]);
  await newKNC.deployed();
  console.log(`KNCv2 address: ${newKNC.address}`);
});
