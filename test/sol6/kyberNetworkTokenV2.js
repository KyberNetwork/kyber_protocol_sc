let Token;
let KyberNetworkTokenV2;

const Helper = require('../helper.js');

const BN = ethers.BigNumber;
const {expectEvent, expectRevert} = require('@openzeppelin/test-helpers');

let {zeroBN, zeroAddress, precisionUnits} = require('../helper.js');
const {web3} = require('@openzeppelin/test-helpers/src/setup');
const {assert} = require('chai');
zeroBN = toEthersBN(zeroBN);
oneBN = ethers.constants.One;
twoBN = ethers.constants.Two;
precisionUnits = toEthersBN(precisionUnits);

let oldKNC;
let newKNC;
let tokenProxy;
let minter;
let owner;
let user;

contract('KyberNetworkTokenV2', function(accounts) {
  before(`Global init data`, async () => {
    [deployer, user, owner, minter] = await ethers.getSigners();
    Token = await ethers.getContractFactory('Token');
    oldKNC = await Token.deploy('Kyber Network Crystal', 'KNC', 18);
    KyberNetworkTokenV2 = (await ethers.getContractFactory('KyberNetworkTokenV2')).connect(owner);
  });

  describe(`Test constructor`, async () => {
    it(`test invalid old knc or minter address`, async () => {
      // invalid old knc
      await expectRevert.unspecified(upgrades.deployProxy(KyberNetworkTokenV2, [zeroAddress, minter.address]));
      // invalid minter
      await expectRevert.unspecified(upgrades.deployProxy(KyberNetworkTokenV2, [oldKNC.address, zeroAddress]));
    });

    it(`test correct setup data after deployed`, async () => {
      tokenProxy = await upgrades.deployProxy(KyberNetworkTokenV2, [oldKNC.address, minter.address]);
      Helper.assertEqual(zeroBN, await tokenProxy.totalSupply());
      Helper.assertEqual(oldKNC.address, await tokenProxy.oldKNC());
      Helper.assertEqual(minter.address, await tokenProxy.minter());
      Helper.assertEqual(owner.address, await tokenProxy.owner());
    });
  });

  describe(`Test mint`, async () => {
    beforeEach(`init new token implementation and proxy before each test`, async () => {
      newKNC = await deployKNC(KyberNetworkTokenV2, [oldKNC.address, minter.address]);
    });

    it(`test mint reverts not minter`, async () => {
      newKNC = newKNC.connect(user);
      await expectRevert(newKNC.mint(user.address, precisionUnits), 'only minter');
      await expectRevert(newKNC.mint(user.address, precisionUnits), 'only minter');
    });

    it(`test mint reverts recipient is zero address`, async () => {
      await expectRevert(newKNC.connect(minter).mint(zeroAddress, precisionUnits), 'ERC20: mint to the zero address');
    });

    it(`test mint reverts amount is too high`, async () => {
      let maxUInt = ethers.constants.MaxUint256;
      newKNC = newKNC.connect(minter);
      await newKNC.mint(user.address, maxUInt);
      await expectRevert(newKNC.mint(user.address, maxUInt), 'SafeMath: addition overflow');
      await expectRevert(newKNC.mint(user.address, oneBN), 'SafeMath: addition overflow');
    });

    it(`test balance, total supply change correctly`, async () => {
      let userBalance = await newKNC.balanceOf(user.address);
      let totalSupply = await newKNC.totalSupply();
      let amount = new BN.from(10).pow(new BN.from(20));
      await newKNC.connect(minter).mint(user.address, amount);
      Helper.assertEqual(userBalance.add(amount), await newKNC.balanceOf(user.address));
      Helper.assertEqual(totalSupply.add(amount), await newKNC.totalSupply());
    });

    it(`test mint events`, async () => {
      let amount = new BN.from(10).pow(new BN.from(20));
      let tx = await (await newKNC.connect(minter).mint(user.address, amount)).wait();
      expectEvent({logs: tx.events}, 'Transfer', {
        from: zeroAddress,
        to: user.address
      });
      expectEvent({logs: tx.events}, 'Minted', {
        account: user.address,
        minter: minter.address
      });
      // separate check for values
      Helper.assertEqual(tx.events[0].args['value'], amount, 'transfer value different');
      Helper.assertEqual(tx.events[1].args['amount'], amount, 'amount value different');
    });

    it(`test mint after change minter, balance + total supply change correctly`, async () => {
      let amount = new BN.from(10).pow(new BN.from(20));
      newKNC = newKNC.connect(minter);
      await newKNC.mint(user.address, amount);
      let userBalance = await newKNC.balanceOf(user.address);
      let totalSupply = await newKNC.totalSupply();
      await newKNC.changeMinter(user.address);
      await newKNC.connect(user).mint(user.address, amount);
      Helper.assertEqual(userBalance.add(amount), await newKNC.balanceOf(user.address));
      Helper.assertEqual(totalSupply.add(amount), await newKNC.totalSupply());
    });
  });

  describe(`Test mintWithOldKNC`, async () => {
    beforeEach(`init new token implementation and proxy before each test`, async () => {
      newKNC = await deployKNC(KyberNetworkTokenV2, [oldKNC.address, minter.address]);
    });

    it(`test revert not enough balance`, async () => {
      let userOldKncBalance = await oldKNC.balanceOf(user.address);
      // approve enough allowance
      await oldKNC.connect(user).approve(newKNC.address, userOldKncBalance.mul(twoBN));
      await expectRevert.unspecified(newKNC.connect(user).mintWithOldKnc(userOldKncBalance.add(oneBN)));
    });

    it(`test revert not enough allowance`, async () => {
      let userAllowance = await oldKNC.allowance(user.address, newKNC.address);
      if (userAllowance.eq(zeroBN)) {
        userAllowance = new BN.from(10).pow(new BN.from(20));
        await oldKNC.connect(user).approve(newKNC.address, userAllowance);
      }
      // transfer enough old knc token to user
      await oldKNC.transfer(user.address, userAllowance.mul(twoBN));
      await expectRevert.unspecified(newKNC.connect(user).mintWithOldKnc(userAllowance.add(oneBN)));
    });

    it(`test old/new balances + total supplies change correctly and events`, async () => {
      let amount = new BN.from(10).pow(new BN.from(20));
      await oldKNC.connect(user).approve(newKNC.address, amount.mul(twoBN));
      await oldKNC.transfer(user.address, amount.mul(twoBN));
      let userOldKncBalance = await oldKNC.balanceOf(user.address);
      let oldKncSupply = await oldKNC.totalSupply();
      let userNewKncBalance = await newKNC.balanceOf(user.address);
      let newKncSupply = await newKNC.totalSupply();
      let tx = await (await newKNC.connect(user).mintWithOldKnc(amount)).wait();
      Helper.assertEqual(userOldKncBalance.sub(amount), await oldKNC.balanceOf(user.address));
      Helper.assertEqual(oldKncSupply.sub(amount), await oldKNC.totalSupply());
      Helper.assertEqual(userNewKncBalance.add(amount), await newKNC.balanceOf(user.address));
      Helper.assertEqual(newKncSupply.add(amount), await newKNC.totalSupply());
      expectEvent({logs: tx.events}, 'Migrated', {
        account: user.address
      });
      expectEvent({logs: tx.events}, 'Transfer', {
        from: zeroAddress,
        to: user.address
      });
      // separate check for values
      Helper.assertEqual(tx.events[0].args['value'], amount, 'value different');
      Helper.assertEqual(tx.events[tx.events.length - 1].args['amount'], amount, 'amount different');
    });
  });

  describe(`Test other ERC20 functions`, async () => {
    beforeEach(`init new token implementation and proxy before each test`, async () => {
      newKNC = await deployKNC(KyberNetworkTokenV2, [oldKNC.address, minter.address]);
    });

    describe(`Test transfer`, async () => {
      it(`test reverts not enough fund`, async () => {
        let userBalance = await newKNC.balanceOf(user.address);
        await expectRevert(
          newKNC.connect(user).transfer(owner.address, userBalance.add(oneBN)),
          'ERC20: transfer amount exceeds balance'
        );
      });

      it(`test reverts invalid recipient`, async () => {
        let amount = precisionUnits;
        await newKNC.connect(minter).mint(user.address, amount);
        await expectRevert(newKNC.connect(user).transfer(zeroAddress, amount), 'ERC20: transfer to the zero address');
      });

      it(`test sender/receiver balances change correctly`, async () => {
        let amount = precisionUnits;
        await newKNC.connect(minter).mint(user.address, amount);
        let userBalance = await newKNC.balanceOf(user.address);
        let recipientBalance = await newKNC.balanceOf(owner.address);
        let totalSupply = await newKNC.totalSupply();
        await newKNC.connect(user).transfer(owner.address, amount);
        Helper.assertEqual(userBalance.sub(amount), await newKNC.balanceOf(user.address));
        Helper.assertEqual(recipientBalance.add(amount), await newKNC.balanceOf(owner.address));
        Helper.assertEqual(totalSupply, await newKNC.totalSupply());
      });
    });

    describe(`Test transferFrom`, async () => {
      it(`test reverts invalid from/to`, async () => {
        let amount = precisionUnits;
        await newKNC.connect(minter).mint(user.address, amount);
        await expectRevert(
          newKNC.connect(user).transferFrom(zeroAddress, owner.address, amount),
          'ERC20: transfer from the zero address'
        );
        await expectRevert(
          newKNC.connect(user).transferFrom(user.address, zeroAddress, amount),
          'ERC20: transfer to the zero address'
        );
      });

      it(`test reverts not enough balance or allowance`, async () => {
        let amount = precisionUnits;
        await newKNC.connect(minter).mint(user.address, amount);
        let userBalance = await newKNC.balanceOf(user.address);
        await expectRevert(
          newKNC.connect(user).transferFrom(user.address, owner.address, userBalance.add(oneBN)),
          'ERC20: transfer amount exceeds balance'
        );
        await newKNC.connect(user).approve(user.address, userBalance.sub(oneBN));
        await expectRevert(
          newKNC.connect(user).transferFrom(user.address, owner.address, userBalance),
          'ERC20: transfer amount exceeds allowance'
        );
      });

      it(`test balance + allowance change correctly`, async () => {
        let amount = precisionUnits;
        await newKNC.connect(minter).mint(user.address, amount);
        await newKNC.connect(user).approve(minter.address, amount.mul(twoBN));
        let userBalance = await newKNC.balanceOf(user.address);
        let recipientBalance = await newKNC.balanceOf(owner.address);
        let allowance = await newKNC.allowance(user.address, minter.address);
        let totalSupply = await newKNC.totalSupply();
        await newKNC.connect(minter).transferFrom(user.address, owner.address, amount);
        Helper.assertEqual(userBalance.sub(amount), await newKNC.balanceOf(user.address));
        Helper.assertEqual(recipientBalance.add(amount), await newKNC.balanceOf(owner.address));
        Helper.assertEqual(allowance.sub(amount), await newKNC.allowance(user.address, minter.address));
        Helper.assertEqual(totalSupply, await newKNC.totalSupply());
      });
    });

    describe(`Test approve`, async () => {
      it(`test reverts invalid spender`, async () => {
        let amount = precisionUnits;
        await expectRevert(newKNC.connect(user).approve(zeroAddress, amount), 'ERC20: approve to the zero address');
      });

      it(`test allowance changes correctly`, async () => {
        let amount = precisionUnits;
        await newKNC.connect(user).approve(minter.address, amount.mul(twoBN));
        Helper.assertEqual(amount.mul(twoBN), await newKNC.allowance(user.address, minter.address));
        await newKNC.connect(user).approve(minter.address, amount);
        Helper.assertEqual(amount, await newKNC.allowance(user.address, minter.address));
      });
    });

    describe(`Test burn`, async () => {
      it(`test reverts amount exceeds balance`, async () => {
        let amount = precisionUnits;
        await newKNC.connect(minter).mint(user.address, amount);
        let userBalance = await newKNC.balanceOf(user.address);
        await expectRevert(newKNC.connect(user).burn(userBalance.add(oneBN)), 'ERC20: burn amount exceeds balance');
      });

      it(`test balance + total supply change correctly`, async () => {
        let amount = precisionUnits;
        await newKNC.connect(minter).mint(user.address, amount.mul(new BN.from(3)));
        let userBalance = await newKNC.balanceOf(user.address);
        let totalSupply = await newKNC.totalSupply();
        await newKNC.connect(user).burn(amount);
        Helper.assertEqual(userBalance.sub(amount), await newKNC.balanceOf(user.address));
        Helper.assertEqual(totalSupply.sub(amount), await newKNC.totalSupply());
        userBalance = userBalance.sub(amount);
        totalSupply = totalSupply.sub(amount);
        amount = amount.add(oneBN);
        await newKNC.connect(user).burn(amount);
        Helper.assertEqual(userBalance.sub(amount), await newKNC.balanceOf(user.address));
        Helper.assertEqual(totalSupply.sub(amount), await newKNC.totalSupply());
      });
    });

    describe(`Test burnFrom`, async () => {
      it(`test reverts amount exceeds balance/allowance`, async () => {
        let amount = precisionUnits;
        await newKNC.connect(minter).mint(user.address, amount);
        await newKNC.connect(user).approve(minter.address, zeroBN);
        let userBalance = await newKNC.balanceOf(user.address);
        await expectRevert(
          newKNC.connect(minter).burnFrom(user.address, userBalance),
          'ERC20: burn amount exceeds allowance'
        );
        await newKNC.connect(user).approve(minter.address, userBalance.mul(twoBN));
        await expectRevert(
          newKNC.connect(minter).burnFrom(user.address, userBalance.add(oneBN)),
          'ERC20: burn amount exceeds balance'
        );
      });

      it(`test balance, allowance, total supply change correctly`, async () => {
        let amount = precisionUnits;
        await newKNC.connect(minter).mint(user.address, amount);
        let userBalance = await newKNC.balanceOf(user.address);
        await newKNC.connect(user).approve(minter.address, amount.mul(twoBN));
        let allowance = await newKNC.allowance(user.address, minter.address);
        let totalSupply = await newKNC.totalSupply();
        await newKNC.connect(minter).burnFrom(user.address, amount);
        Helper.assertEqual(userBalance.sub(amount), await newKNC.balanceOf(user.address));
        Helper.assertEqual(allowance.sub(amount), await newKNC.allowance(user.address, minter.address));
        Helper.assertEqual(totalSupply.sub(amount), await newKNC.totalSupply());
      });
    });
  });

  describe(`Test changeMinter`, async () => {
    beforeEach(`init new token implementation and proxy before each test`, async () => {
      newKNC = await deployKNC(KyberNetworkTokenV2, [oldKNC.address, minter.address]);
    });

    it(`test reverts not minter`, async () => {
      await expectRevert(newKNC.connect(user).changeMinter(user.address), 'only minter');
    });

    it(`test reverts new minter is zero address`, async () => {
      await expectRevert(newKNC.connect(minter).changeMinter(zeroAddress), 'invalid minter');
    });

    it(`test minter changes and events`, async () => {
      let tx = await (await newKNC.connect(minter).changeMinter(user.address)).wait();
      Helper.assertEqual(user.address, await newKNC.minter());
      expectEvent({logs: tx.events}, 'MinterChanged', {
        oldMinter: minter.address,
        newMinter: user.address
      });
    });
  });

  describe(`Test emergencyERC20Drain`, async () => {
    let token;
    beforeEach(`init new token implementation and proxy before each test`, async () => {
      newKNC = await deployKNC(KyberNetworkTokenV2, [oldKNC.address, minter.address]);
      token = await Token.deploy('Test', 'TST', 18);
    });

    it(`test reverts not owner`, async () => {
      let amount = precisionUnits;
      await token.transfer(newKNC.address, amount);
      await expectRevert(
        newKNC.connect(user).emergencyERC20Drain(token.address, amount),
        'Ownable: caller is not the owner'
      );
    });

    it(`test reverts not enough token`, async () => {
      let amount = precisionUnits;
      await token.transfer(newKNC.address, amount);
      await expectRevert.unspecified(newKNC.connect(owner).emergencyERC20Drain(token.address, amount.add(oneBN)));
    });

    it(`test balances change correctly`, async () => {
      let amount = precisionUnits;
      await token.transfer(newKNC.address, amount);
      let ownerBalance = await token.balanceOf(owner.address);
      let contractBalance = await token.balanceOf(newKNC.address);
      await newKNC.connect(owner).emergencyERC20Drain(token.address, amount);
      Helper.assertEqual(ownerBalance.add(amount), await token.balanceOf(owner.address));
      Helper.assertEqual(contractBalance.sub(amount), await token.balanceOf(newKNC.address));
    });
  });

  describe(`Test changing implementation contract`, async () => {
    it('should have proxy address changed when deployProxy() is called', async() => {
        newKNC = await deployKNC(KyberNetworkTokenV2, [oldKNC.address, minter.address]);
        let currentKNCAddress = newKNC.address;
        newKNC = await deployKNC(KyberNetworkTokenV2, [oldKNC.address, minter.address]);
        assert.notEqual(newKNC.address, currentKNCAddress, 'proxy address should have changed');
    });

    it('should have contract state remain unchanged when upgradeProxy() is called', async () => {
      newKNC = await deployKNC(KyberNetworkTokenV2, [oldKNC.address, minter.address]);
      await oldKNC.connect(deployer).transfer(user.address, precisionUnits.mul(twoBN));
      // mint some tokens to minter and owner
      newKNC = newKNC.connect(minter);
      await newKNC.mint(minter.address, precisionUnits.mul(twoBN));
      await newKNC.mint(owner.address, precisionUnits);
      // user migrates some old KNC
      await oldKNC.connect(user).approve(newKNC.address, precisionUnits.mul(twoBN));
      await newKNC.connect(user).mintWithOldKnc(precisionUnits);
      let totalSupply = await newKNC.totalSupply();
      let userBalance = await newKNC.balanceOf(user.address);
      let ownerBalance = await newKNC.balanceOf(owner.address);
      let minterBalance = await newKNC.balanceOf(minter.address);
      let currentKNCAddress = newKNC.address;
      // update implementation contract
      newKNC = await deployKNC(KyberNetworkTokenV2, [oldKNC.address, minter.address], newKNC);
      Helper.assertEqual(currentKNCAddress, newKNC.address, 'proxy contract changed');
      Helper.assertEqual(
        totalSupply,
        await newKNC.totalSupply(),
        'total supply changed after implementation contract change'
      );
      Helper.assertEqual(
        userBalance,
        await newKNC.balanceOf(user.address),
        'user balance changed after implementation contract change'
      );
      Helper.assertEqual(
        ownerBalance,
        await newKNC.balanceOf(owner.address),
        'owner balance changed after implementation contract change'
      );
      Helper.assertEqual(
        minterBalance,
        await newKNC.balanceOf(minter.address),
        'minter balance changed after implementation contract change'
      );
    });
  });
});

async function deployKNC(knc, ctor, tokenProxy) {
  if (tokenProxy == undefined) {
    return await upgrades.deployProxy(knc, ctor);
  } else {
    return await upgrades.upgradeProxy(tokenProxy.address, knc, ctor);
  }
}

function toEthersBN(num) {
  return new BN.from(num.toString());
}
