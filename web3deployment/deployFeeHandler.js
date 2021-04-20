const fs = require('fs');
const path = require('path');
const configPath = path.join(__dirname, './katana_mainnet_feehandler.json');
const configParams = JSON.parse(fs.readFileSync(configPath, 'utf8'));

task('deployKatanaFee', 'deploys katana feeHandler')
  .addParam("g", "gas price to use")
  .setAction(async (taskArgs, hre) => {
  const [deployer] = await ethers.getSigners();
  const BN = ethers.BigNumber;
  const gasPrice = new BN.from(taskArgs.g).mul(new BN.from(10).pow(new BN.from(9)));
  deployerAddress = await deployer.getAddress();

  const KatanaFeeHandler = await ethers.getContractFactory('KatanaFeeHandler');
  const feeHandler = await KatanaFeeHandler.deploy(
    configParams['kyberProxy'],
    configParams['kncV2'],
    configParams['burnBlockInterval'],
    configParams['daoOperator'],
    configParams['treasury'],
    configParams['rewardBps'],
    configParams['rebateBps'],
    {gasPrice: gasPrice}
  );
  await feeHandler.deployed();
  console.log(`katana feeHandler:${feeHandler.address}`);
  await hre.run('verify', {
    address: feeHandler.address,
    constructorArguments: [
      configParams['kyberProxy'],
      configParams['kncV2'],
      configParams['burnBlockInterval'],
      configParams['daoOperator'],
      configParams['treasury'],
      configParams['rewardBps'],
      configParams['rebateBps']
    ]
  });
});
