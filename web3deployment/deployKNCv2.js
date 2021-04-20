const fs = require('fs');
const path = require('path');
const configPath = path.join(__dirname, './kncv2_input.json');
const configParams = JSON.parse(fs.readFileSync(configPath, 'utf8'));

task('newKNC', 'deploys new KNCv2 token').setAction(async () => {
  // note: gas price is set in hardhat config
  const BN = ethers.BigNumber;
  const [deployer] = await ethers.getSigners();
  deployerAddress = await deployer.getAddress();

  const NewKNC = await ethers.getContractFactory('KyberNetworkTokenV2');
  const newKNC = await upgrades.deployProxy(NewKNC, [configParams['oldknc'], configParams['minter']]);
  await newKNC.deployed();
  console.log(`KNCv2 address: ${newKNC.address}`);
});
