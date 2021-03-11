const fs = require('fs');
const path = require('path');
const configPath = path.join(__dirname, './kncv2_input.json');
const configParams = JSON.parse(fs.readFileSync(configPath, 'utf8'));

task('newKNC', 'deploys new KNCv2 token')
  .addParam('g', 'gas price (in gwei) to use for txns')
  .setAction(async (taskArgs) => {
    const BN = ethers.BigNumber;
    const gasPrice = new BN.from(taskArgs.g).mul(new BN.from(10).pow(new BN.from(9)));
    const [deployer] = await ethers.getSigners();
    deployerAddress = await deployer.getAddress();

    const NewKNC = await ethers.getContractFactory('KyberNetworkTokenV2');
    const newKNC = await upgrades.deployProxy(NewKNC, [configParams['oldknc'], configParams['minter']], {gasPrice: gasPrice});
    await newKNC.deployed();
    console.log(`KNCv2 address: ${newKNC.address}`);
  });
