const {artifacts} = require('hardhat');

const BN = web3.utils.BN;
const {ethAddress, precisionUnits, assertEqual, zeroBN, BPS, zeroAddress} = require('../../helper');
const Helper = require('../../helper');
const nwHelper = require('../networkHelper');

const {expectEvent, expectRevert} = require('@openzeppelin/test-helpers');
const {assert} = require('chai');

const KyberNetwork = artifacts.require('KyberNetwork');
const KyberNetworkProxy = artifacts.require('KyberNetworkProxy.sol');
const KyberMatchingEngine = artifacts.require('KyberMatchingEngine.sol');
const KatanaFeeHandler = artifacts.require('KatanaFeeHandler.sol');
const TestToken = artifacts.require('TestToken.sol');
const BurnKncSanityRate = artifacts.require('MockChainLinkSanityRate.sol');

let admin;
let operator;
let feePool;

let tokens = [];
let tokenDecimals = [];
let networkProxy;
let knc;

let network;
let storage;
let matchingEngine;
let feeHandler;
let reserveInstances;

const numTokens = 8;
const burnBlockInterval = 1;
const gasPrice = new BN(10).pow(new BN(12)); /// 1000 gwei
const negligibleRateDiffBps = 0;
const BRR = [new BN(1000), new BN(8000), new BN(1000)];

const ethToKncPrecision = precisionUnits.div(new BN(2000)); // 1 eth --> 2000 knc
const kncToEthPrecision = precisionUnits.mul(precisionUnits).div(ethToKncPrecision);

contract('KatanaFeeHandler', accounts => {
  before('init account', async () => {
    admin = accounts[1];
    operator = accounts[2];
    feePool = accounts[3];

    for (let i = 0; i < numTokens; i++) {
      tokenDecimals.push(new BN(15).add(new BN(i)));
      token = await TestToken.new('test' + i, 'tst' + i, tokenDecimals[i]);
      tokens.push(token);
    }
    knc = tokens[3];

    networkProxy = await KyberNetworkProxy.new(admin);

    storage = await nwHelper.setupStorage(admin);
    network = await KyberNetwork.new(admin, storage.address);
    await storage.setNetworkContract(network.address, {from: admin});
    await storage.addOperator(operator, {from: admin});
    await network.addOperator(operator, {from: admin});
    await networkProxy.setKyberNetwork(network.address, {from: admin});
    //init matchingEngine, feeHandler
    matchingEngine = await KyberMatchingEngine.new(admin);
    await matchingEngine.setNetworkContract(network.address, {from: admin});
    await matchingEngine.setKyberStorage(storage.address, {from: admin});
    await storage.setFeeAccountedPerReserveType(true, true, true, false, true, true, {from: admin});
    await storage.setEntitledRebatePerReserveType(true, false, true, false, true, true, {from: admin});

    feeHandler = await KatanaFeeHandler.new(
      networkProxy.address,
      knc.address,
      burnBlockInterval,
      admin,
      feePool,
      new BN(1000),
      new BN(5000)
    );
    await feeHandler.setBRRData(BRR[0], BRR[1], BRR[2], {from: admin});
    sanityRate = await BurnKncSanityRate.new();
    await sanityRate.setLatestKncToEthRate(kncToEthPrecision);
    await feeHandler.setBurnConfigParams(sanityRate.address, new BN(10).pow(new BN(18)), {from: admin});
    await network.setContracts(feeHandler.address, matchingEngine.address, zeroAddress, {from: admin});
    // set KyberDao contract
    await network.setKyberDaoContract(zeroAddress, {from: admin});
    // point proxy to network
    await network.addKyberProxy(networkProxy.address, {from: admin});
    //set params, enable network
    await network.setParams(gasPrice, negligibleRateDiffBps, {from: admin});
    await network.setEnable(true, {from: admin});
    // setup reserve
    ({reserveInstances} = await nwHelper.setupReserves(network, tokens, 2, 0, 0, 0, accounts, admin, operator));
    //add and list pair for reserve
    await nwHelper.addReservesToStorage(storage, reserveInstances, tokens, operator);
  });

  it('trade, receive fee and burn', async () => {
    const ethValue = new BN(10).pow(new BN(18));
    const defaultFeeBps = new BN(25);
    let conversionRate = await networkProxy.getExpectedRate(Helper.ethAddress, tokens[0].address, ethValue);
    let txResult = await networkProxy.swapEtherToToken(tokens[0].address, conversionRate.expectedRate, {
      value: ethValue
    });

    const expectedFee = ethValue.mul(defaultFeeBps).div(Helper.BPS);
    const expectedBurnWei = expectedFee.mul(BRR[0]).div(Helper.BPS);
    const expectedRewardWei = expectedFee.mul(BRR[1]).div(Helper.BPS);
    const expectedRebateWei = expectedFee.mul(BRR[2]).div(Helper.BPS);

    await expectEvent.inTransaction(txResult.tx, feeHandler, 'FeeDistributed', {
      token: Helper.ethAddress,
      platformFeeWei: Helper.zeroBN,
      rewardWei: expectedRewardWei,
      burnAmtWei: expectedBurnWei,
      rebateWei: expectedRebateWei
    });

    txResult = await feeHandler.burnKnc();
    expectEvent(txResult, 'KncBurned', {amount: expectedBurnWei});
  });
});
