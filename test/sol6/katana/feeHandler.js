const {artifacts} = require('hardhat');

const KatanaFeeHandler = artifacts.require('KatanaFeeHandler.sol');
const Proxy = artifacts.require('SimpleKyberProxy.sol');
const Token = artifacts.require('Token');
const BurnKncSanityRate = artifacts.require('MockChainLinkSanityRate.sol');

const BN = web3.utils.BN;
const {ethAddress, precisionUnits, assertEqual, zeroBN, BPS, zeroAddress} = require('../../helper');
const Helper = require('../../helper');

const {expectEvent, expectRevert} = require('@openzeppelin/test-helpers');
const {assert} = require('chai');

let knc;
let daoOperator;
let feeHandler;
let platformWallet;
let sanityRate;

const BURN_BLOCK_INTERVAL = 3;
const SANITY_RATE_DIFF = 1000; // 10%
const weiToBurn = precisionUnits.mul(new BN(2)); // 2 eth
const ethToKncPrecision = precisionUnits.div(new BN(200)); // 1 eth --> 200 knc
const kncToEthPrecision = precisionUnits.mul(precisionUnits).div(ethToKncPrecision);

const rewardBps = new BN(8000);
const rebateBps = new BN(500);

contract('KatanaFeeHandler', accounts => {
  before('setup', async () => {
    daoOperator = accounts[1];
    kyberNetwork = accounts[2];
    feePool = accounts[3];
    platformWallet = accounts[4];
    knc = await Token.new('KyberNetworkCrystal', 'KNC', 18);

    proxy = await Proxy.new();
    await proxy.setPairRate(ethAddress, knc.address, ethToKncPrecision);
    await knc.transfer(proxy.address, precisionUnits.mul(new BN(10000)));

    sanityRate = await BurnKncSanityRate.new();
    await sanityRate.setLatestKncToEthRate(kncToEthPrecision);
  });

  describe('whitebox test', async () => {
    beforeEach('init fee handler', async () => {
      feeHandler = await KatanaFeeHandler.new(
        proxy.address,
        knc.address,
        BURN_BLOCK_INTERVAL,
        daoOperator,
        feePool,
        rewardBps,
        rebateBps
      );
    });

    it('handleFee - FeeDistributed (no BRR)', async () => {
      const platformFeeWei = new BN(10).pow(new BN(18));
      let txResult = await feeHandler.handleFees(ethAddress, [], [], platformWallet, platformFeeWei, zeroBN, {
        from: kyberNetwork,
        value: platformFeeWei
      });
      expectEvent(txResult, 'FeeDistributed', {
        token: ethAddress,
        platformWallet: platformWallet,
        platformFeeWei: platformFeeWei,
        rewardWei: zeroBN,
        rebateWei: zeroBN,
        rebateWallets: [],
        rebatePercentBpsPerWallet: [],
        burnAmtWei: zeroBN
      });
      assertEqual(await feeHandler.totalPayoutBalance(), platformFeeWei);
      assertEqual(await feeHandler.feePerPlatformWallet(platformWallet), platformFeeWei);

      // claim platform fee
      txResult = await feeHandler.claimPlatformFee(platformWallet);
      expectEvent(txResult, 'PlatformFeePaid', {
        platformWallet: platformWallet,
        token: ethAddress,
        amount: platformFeeWei.sub(new BN(1))
      });
    });

    it('handleFee - FeeDistributed (with BRR)', async () => {
      let platformWallet = accounts[1];
      const platformFeeWei = new BN(2).mul(precisionUnits);
      const brrFeeWei = new BN(10).pow(new BN(18));
      const rebateBpsPerWallet = [new BN(2000), new BN(3000), new BN(5000)];
      const rebateWallets = [accounts[6], accounts[7], accounts[8]];

      let beforeFeeBalance = await Helper.getBalancePromise(feePool);
      let txResult = await feeHandler.handleFees(
        ethAddress,
        rebateWallets,
        rebateBpsPerWallet,
        platformWallet,
        platformFeeWei,
        brrFeeWei,
        {from: kyberNetwork, value: platformFeeWei.add(brrFeeWei)}
      );

      const BRRData = await feeHandler.readBRRData();
      let {expectedRewardWei, expectedRebateWei, expectedBurnWei, rebateWeiArr} = getExpectedFees(
        brrFeeWei,
        BRRData.rewardBps,
        BRRData.rebateBps,
        rebateBpsPerWallet
      );

      expectEvent(txResult, 'FeeDistributed', {
        token: ethAddress,
        platformWallet: platformWallet,
        platformFeeWei: platformFeeWei,
        rewardWei: expectedRewardWei,
        rebateWei: expectedRebateWei,
        burnAmtWei: expectedBurnWei,
        rebateWallets: rebateWallets
      });
      for (let i = 0; i < txResult.logs[0].args.rebateWallets.length; i++) {
        Helper.assertEqual(
          txResult.logs[0].args.rebatePercentBpsPerWallet[i],
          rebateBpsPerWallet[i],
          'unexpected rebate percent bps'
        );
      }
      Helper.assertSameEtherBalance(feePool, beforeFeeBalance.add(expectedRewardWei));
      // should not allow to claim Staker reward
      await expectRevert.unspecified(feeHandler.claimStakerReward(accounts[0], new BN(1)));

      //claim rebate fee
      expectedRebates = txResult = await feeHandler.claimReserveRebate(rebateWallets[0]);
      expectEvent(txResult, 'RebatePaid', {
        rebateWallet: rebateWallets[0],
        token: ethAddress,
        amount: rebateWeiArr[0].sub(new BN(1))
      });
    });

    it('knc burned', async () => {
      let networkFeeBps = new BN(25);
      let platformWallet = accounts[1];
      const platformFeeWei = new BN(2).mul(precisionUnits);
      const brrFeeWei = new BN(30).mul(precisionUnits);
      const rebateBpsPerWallet = [new BN(2000), new BN(3000), new BN(5000)];
      const rebateWallets = [accounts[6], accounts[7], accounts[8]];

      // deploy new sanity rate instance
      await feeHandler.setBurnConfigParams(sanityRate.address, weiToBurn, {from: daoOperator});

      await feeHandler.handleFees(
        ethAddress,
        rebateWallets,
        rebateBpsPerWallet,
        platformWallet,
        platformFeeWei,
        brrFeeWei,
        {from: kyberNetwork, value: platformFeeWei.add(brrFeeWei)}
      );
      let burnPerCall = await feeHandler.weiToBurn();
      let expectedEthtoKncRate = (await proxy.getExpectedRate(ethAddress, knc.address, burnPerCall)).expectedRate;
      let txResult = await feeHandler.burnKnc();

      expectEvent(txResult, 'KncBurned', {
        kncTWei: burnPerCall
          .sub(burnPerCall.mul(networkFeeBps).div(BPS))
          .mul(expectedEthtoKncRate)
          .div(precisionUnits),
        token: ethAddress,
        amount: burnPerCall
      });
    });

    it('test set brr data', async () => {
      const burnBps = new BN(2000);
      const rewardBps = new BN(4000);
      const rebateBps = new BN(4000);
      await expectRevert(feeHandler.setBRRData(burnBps, rewardBps, rebateBps), 'only daoOperator');
      await expectRevert(
        feeHandler.setBRRData(burnBps, rewardBps, rebateBps.add(new BN(1)), {from: daoOperator}),
        'Bad BRR values'
      );

      let txResult = await feeHandler.setBRRData(burnBps, rewardBps, rebateBps, {from: daoOperator});

      expectEvent(txResult, 'BRRUpdated', {rewardBps: rewardBps, rebateBps: rebateBps, burnBps: burnBps});

      const BRRData = await feeHandler.readBRRData();
      assertEqual(BRRData.rewardBps, rewardBps);
      assertEqual(BRRData.rebateBps, rebateBps);
    });

    it('test set fee pool', async () => {
      await expectRevert(feeHandler.setFeePool(accounts[0]), 'only daoOperator');
      await expectRevert(feeHandler.setFeePool(Helper.zeroAddress, {from: daoOperator}), 'feePool 0');

      let txResult = await feeHandler.setFeePool(accounts[0], {from: daoOperator});
      expectEvent(txResult, 'FeePoolUpdated', {feePool: accounts[0]});
    });

    it('BurnConfigSet', async () => {
      Helper.assertEqual(await feeHandler.getLatestSanityRate(), zeroBN);
      let txResult = await feeHandler.setBurnConfigParams(accounts[1], weiToBurn, {from: daoOperator});
      expectEvent(txResult, 'BurnConfigSet', {
        sanityRate: accounts[1],
        weiToBurn: weiToBurn
      });
      txResult = await feeHandler.setBurnConfigParams(sanityRate.address, new BN(10000), {from: daoOperator});
      expectEvent(txResult, 'BurnConfigSet', {
        sanityRate: sanityRate.address,
        weiToBurn: new BN(10000)
      });

      await feeHandler.setBurnConfigParams(sanityRate.address, new BN(10000), {from: daoOperator});

      Helper.assertEqualArray(await feeHandler.getSanityRateContracts(), [sanityRate.address, accounts[1]]);
      Helper.assertEqual(await feeHandler.getLatestSanityRate(), kncToEthPrecision);
      Helper.assertEqual(await feeHandler.weiToBurn(), new BN(10000));
    });

    it('set DaoOperator', async () => {
      await expectRevert(feeHandler.setDaoOperator(accounts[3]), 'only daoOperator');
      await expectRevert(feeHandler.setDaoOperator(zeroAddress, {from: daoOperator}), 'daoOperator 0');

      let txResult = await feeHandler.setDaoOperator(accounts[3], {from: daoOperator});
      expectEvent(txResult, 'DaoOperatorUpdated', {daoOperator: accounts[3]});

      assert.equal(await feeHandler.daoOperator(), accounts[3]);
    });

    it('setKyberProxy', async () => {
      await expectRevert(feeHandler.setKyberProxy(accounts[2]), 'only daoOperator');
      await expectRevert(feeHandler.setKyberProxy(zeroAddress, {from: daoOperator}), 'kyberNetworkProxy 0');

      let txResult = await feeHandler.setKyberProxy(accounts[2], {from: daoOperator});
      expectEvent(txResult, 'KyberProxyUpdated', {kyberProxy: accounts[2]});
      assert.equal(await feeHandler.kyberProxy(), accounts[2]);
    });
  });
});

function getExpectedFees (brrFeeWei, rewardBps, rebateBps, rebateBpsArr) {
  let expectedRewardWei = brrFeeWei.mul(rewardBps).div(BPS);
  let totalRebateWei = brrFeeWei.mul(rebateBps).div(BPS);
  let expectedRebateWei = new BN(0);
  let rebateWeiArr = [];
  for (let i = 0; i < rebateBpsArr.length; i++) {
    let walletRebateWei = totalRebateWei.mul(rebateBpsArr[i]).div(BPS);
    expectedRebateWei = expectedRebateWei.add(walletRebateWei);
    rebateWeiArr.push(walletRebateWei);
  }

  return {
    expectedRewardWei,
    expectedRebateWei,
    expectedBurnWei: brrFeeWei.sub(expectedRebateWei).sub(expectedRewardWei),
    rebateWeiArr
  };
}
