
let Token;
let KyberNetworkTokenV2;

const Helper = require("../helper.js");

const BN = ethers.BigNumber;
const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

let { zeroBN, zeroAddress, precisionUnits } = require("../helper.js");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
precisionUnits = toEthersBN(precisionUnits);

let oldKNC;
let newKNC;
let tokenProxy;
let minter;
let owner;
let user;


contract('KyberNetworkTokenV2', function(accounts) {
    before(`Global init data`, async() => {
        [deployer, user, owner, minter] = await ethers.getSigners();
        Token = await ethers.getContractFactory('Token');
        oldKNC = await Token.deploy("Kyber Network Crystal", "KNC", 18);
        KyberNetworkTokenV2 = (await ethers.getContractFactory("KyberNetworkTokenV2")).connect(owner);
    });

    describe(`Test constructor`, async() => {
        it(`test invalid old knc or minter address`, async() => {
            // invalid old knc
            await expectRevert.unspecified(
                upgrades.deployProxy(KyberNetworkTokenV2, [zeroAddress, minter.address])
            );
            // invalid minter
            await expectRevert.unspecified(
                upgrades.deployProxy(KyberNetworkTokenV2, [oldKNC.address, zeroAddress])
            );
        });

        it(`test correct setup data after deployed`, async() => {
            tokenProxy = await upgrades.deployProxy(KyberNetworkTokenV2, [oldKNC.address, minter.address]);
            Helper.assertEqual(zeroBN, await tokenProxy.totalSupply());
            Helper.assertEqual(oldKNC.address, await tokenProxy.oldKNC());
            Helper.assertEqual(minter.address, await tokenProxy.minter());
            Helper.assertEqual(owner.address, await tokenProxy.owner());
        });
    });

    describe(`Test mint`, async() => {
        beforeEach(`init new token implementation and proxy before each test`, async() => {
            newKNC = await deployKNC(KyberNetworkTokenV2, [oldKNC.address, minter.address]);
        });

        it(`test mint reverts not minter`, async() => {
            newKNC = newKNC.connect(user);
            await expectRevert(
                newKNC.mint(user.address, precisionUnits),
                "only minter"
            );
            await expectRevert(
                newKNC.mint(user.address, precisionUnits),
                "only minter"
            );
        });

        it(`test mint reverts recipient is zero address`, async() => {
            await expectRevert(
                newKNC.connect(minter).mint(zeroAddress, precisionUnits),
                "ERC20: mint to the zero address"
            );
        });

        it(`test mint reverts amount is too high`, async() => {
            let maxUInt = ethers.constants.MaxUint256;
            newKNC = newKNC.connect(minter);
            await newKNC.mint(user.address, maxUInt);
            await expectRevert(
                newKNC.mint(user.address, maxUInt),
                "SafeMath: addition overflow"
            );
            await expectRevert(
                newKNC.mint(user.address, ethers.constants.One),
                "SafeMath: addition overflow"
            );
        });

        it(`test balance, total supply change correctly`, async() => {
            let userBalance = await newKNC.balanceOf(user.address);
            let totalSupply = await newKNC.totalSupply();
            let amount = new BN.from(10).pow(new BN.from(20));
            await newKNC.connect(minter).mint(user.address, amount);
            Helper.assertEqual(
                userBalance.add(amount),
                await newKNC.balanceOf(user.address)
            );
            Helper.assertEqual(
                totalSupply.add(amount),
                await newKNC.totalSupply()
            )
        });

        it(`test mint events`, async() => {
            let amount = new BN.from(10).pow(new BN.from(20));
            let tx = await (await newKNC.connect(minter).mint(user.address, amount)).wait();
            console.log(tx);
            expectEvent(tx, 'Transfer', {
                from: zeroAddress,
                to: user.address,
                value: amount
            });
            expectEvent(tx, 'Minted', {
                account: user.address,
                amount: amount,
                minter: minter.address
            });
        });

        it(`test mint after change minter, balance + total supply change correctly`, async() => {
            let amount = new BN.from(10).pow(new BN.from(20));
            newKNC = newKNC.connect(minter);
            await newKNC.mint(user.address, amount);
            let userBalance = await newKNC.balanceOf(user.address);
            let totalSupply = await newKNC.totalSupply();
            await newKNC.changeMinter(user);
            newKNC = newKNC.connect(user);
            await newKNC.mint(user.address, amount);
            Helper.assertEqual(
                userBalance.add(amount),
                await newKNC.balanceOf(user.address)
            );
            Helper.assertEqual(
                totalSupply.add(amount),
                await newKNC.totalSupply()
            )
        });
    });

    describe(`Test mintWithOldKNC`, async() => {
        beforeEach(`init before each test`, async() => {
            newKNC = await KyberNetworkTokenV2.new(oldKNC.address, minter, { from: owner });
        });

        it(`test revert not enough balance`, async() => {
            let userOldKncBalance = await oldKNC.balanceOf(user);
            // approve enough allowance
            await oldKNC.approve(newKNC.address, userOldKncBalance.mul(new BN(2)), { from: user });
            await expectRevert.unspecified(
                newKNC.mintWithOldKnc(userOldKncBalance.add(new BN(1)), { from: user })
            );
        });

        it(`test revert not enough allowance`, async() => {
            let userAllowance = await oldKNC.allowance(user, newKNC.address);
            if (userAllowance.eq(new BN(0))) {
                userAllowance = new BN.from(10).pow(new BN.from(20));
                await oldKNC.approve(newKNC.address, userAllowance, { from: user });
            }
            // transfer enough old knc token to user
            await oldKNC.transfer(user, userAllowance.mul(new BN(2)));
            await expectRevert.unspecified(
                newKNC.mintWithOldKnc(userAllowance.add(new BN(1)), { from: user })
            );
        });

        it(`test old/new balances + total supplies change correctly and events`, async() => {
            let amount = new BN.from(10).pow(new BN.from(20));
            await oldKNC.approve(newKNC.address, amount.mul(new BN(2)), { from: user });
            await oldKNC.transfer(user, amount.mul(new BN(2)));
            let userOldKncBalance = await oldKNC.balanceOf(user);
            let oldKncSupply = await oldKNC.totalSupply();
            let userNewKncBalance = await newKNC.balanceOf(user);
            let newKncSupply = await newKNC.totalSupply();
            let tx = await newKNC.mintWithOldKnc(amount, { from: user });
            Helper.assertEqual(
                userOldKncBalance.sub(amount),
                await oldKNC.balanceOf(user)
            );
            Helper.assertEqual(
                oldKncSupply.sub(amount),
                await oldKNC.totalSupply()
            );
            Helper.assertEqual(
                userNewKncBalance.add(amount),
                await newKNC.balanceOf(user)
            );
            Helper.assertEqual(
                newKncSupply.add(amount),
                await newKNC.totalSupply()
            );
            expectEvent(tx, "Migrated", {
                account: user,
                amount: amount
            });
            expectEvent(tx, "Transfer", {
                from: zeroAddress,
                to: user,
                value: amount
            });
        });
    });

    describe(`Test other ERC20 functions`, async() => {
        beforeEach(`init before each test`, async() => {
            newKNC = await KyberNetworkTokenV2.new(oldKNC.address, minter, { from: owner });
        });

        describe(`Test transfer`, async() => {
            it(`test reverts not enough fund`, async() => {
                let userBalance = await newKNC.balanceOf(user);
                await expectRevert(
                    newKNC.transfer(owner, userBalance.add(new BN(1)), { from: user }),
                    "ERC20: transfer amount exceeds balance"
                );
            });

            it(`test reverts invalid recipient`, async() => {
                let amount = new BN(10).pow(new BN(18));
                await newKNC.mint(user, amount, { from: minter });
                await expectRevert(
                    newKNC.transfer(zeroAddress, amount, { from: user }),
                    "ERC20: transfer to the zero address"
                );
            });

            it(`test sender/receiver balances change correctly`, async() => {
                let amount = new BN(10).pow(new BN(18));
                await newKNC.mint(user, amount, { from: minter });
                let userBalance = await newKNC.balanceOf(user);
                let recipientBalance = await newKNC.balanceOf(owner);
                let totalSupply = await newKNC.totalSupply();
                await newKNC.transfer(owner, amount, { from: user });
                Helper.assertEqual(
                    userBalance.sub(amount), await newKNC.balanceOf(user),
                );
                Helper.assertEqual(
                    recipientBalance.add(amount), await newKNC.balanceOf(owner),
                );
                Helper.assertEqual(
                    totalSupply, await newKNC.totalSupply(),
                )
            });
        });

        describe(`Test transferFrom`, async() => {
            it(`test reverts invalid from/to`, async() => {
                let amount = new BN(10).pow(new BN(18));
                await newKNC.mint(user, amount, { from: minter });
                await expectRevert(
                    newKNC.transferFrom(zeroAddress, owner, amount, { from: user }),
                    "ERC20: transfer from the zero address"
                );
                await expectRevert(
                    newKNC.transferFrom(user, zeroAddress, amount, { from: user }),
                    "ERC20: transfer to the zero address"
                );
            });

            it(`test reverts not enough balance or allowance`, async() => {
                let amount = new BN(10).pow(new BN(18));
                await newKNC.mint(user, amount, { from: minter });
                let userBalance = await newKNC.balanceOf(user);
                await expectRevert(
                    newKNC.transferFrom(user, owner, userBalance.add(new BN(1)), { from: user }),
                    "ERC20: transfer amount exceeds balance"
                );
                await newKNC.approve(user, userBalance.sub(new BN(1)), { from: user });
                await expectRevert(
                    newKNC.transferFrom(user, owner, userBalance, { from: user }),
                    "ERC20: transfer amount exceeds allowance"
                );
            });

            it(`test balance + allowance change correctly`, async() => {
                let amount = new BN(10).pow(new BN(18));
                await newKNC.mint(user, amount, { from: minter });
                await newKNC.approve(minter, amount.mul(new BN(2)), { from: user });
                let userBalance = await newKNC.balanceOf(user);
                let recipientBalance = await newKNC.balanceOf(owner);
                let allowance = await newKNC.allowance(user, minter);
                let totalSupply = await newKNC.totalSupply();
                await newKNC.transferFrom(user, owner, amount, { from: minter });
                Helper.assertEqual(
                    userBalance.sub(amount), await newKNC.balanceOf(user),
                );
                Helper.assertEqual(
                    recipientBalance.add(amount), await newKNC.balanceOf(owner),
                );
                Helper.assertEqual(
                    allowance.sub(amount), await newKNC.allowance(user, minter),
                );
                Helper.assertEqual(
                    totalSupply, await newKNC.totalSupply(),
                )
            });
        });

        describe(`Test approve`, async() => {
            it(`test reverts invalid spender`, async() => {
                let amount = new BN(10).pow(new BN(18));
                await expectRevert(
                    newKNC.approve(zeroAddress, amount, { from: user }),
                    "ERC20: approve to the zero address"
                );
            });

            it(`test allowance changes correctly`, async() => {
                let amount = new BN(10).pow(new BN(18));
                await newKNC.approve(minter, amount.mul(new BN(2)), { from: user });
                Helper.assertEqual(
                    amount.mul(new BN(2)), await newKNC.allowance(user, minter),
                );
                await newKNC.approve(minter, amount, { from: user });
                Helper.assertEqual(
                    amount, await newKNC.allowance(user, minter),
                );
            });
        });

        describe(`Test burn`, async() => {
            it(`test reverts amount exceeds balance`, async() => {
                let amount = new BN(10).pow(new BN(18));
                await newKNC.mint(user, amount, { from: minter });
                let userBalance = await newKNC.balanceOf(user);
                await expectRevert(
                    newKNC.burn(userBalance.add(new BN(1)), { from: user }),
                    "ERC20: burn amount exceeds balance"
                );
            });

            it(`test balance + total supply change correctly`, async() => {
                let amount = new BN(10).pow(new BN(18));
                await newKNC.mint(user, amount.mul(new BN(3)), { from: minter });
                let userBalance = await newKNC.balanceOf(user);
                let totalSupply = await newKNC.totalSupply();
                await newKNC.burn(amount, { from: user });
                Helper.assertEqual(
                    userBalance.isub(amount), await newKNC.balanceOf(user),
                );
                Helper.assertEqual(
                    totalSupply.isub(amount), await newKNC.totalSupply(),
                );
                amount.iadd(new BN(1));
                await newKNC.burn(amount, { from: user });
                Helper.assertEqual(
                    userBalance.isub(amount), await newKNC.balanceOf(user),
                );
                Helper.assertEqual(
                    totalSupply.isub(amount), await newKNC.totalSupply(),
                );
            });
        });

        describe(`Test burnFrom`, async() => {
            it(`test reverts amount exceeds balance/allowance`, async() => {
                let amount = new BN(10).pow(new BN(18));
                await newKNC.mint(user, amount, { from: minter });
                await newKNC.approve(minter, new BN(0), { from: user });
                let userBalance = await newKNC.balanceOf(user);
                await expectRevert(
                    newKNC.burnFrom(user, userBalance, { from: minter }),
                    "ERC20: burn amount exceeds allowance"
                );
                await newKNC.approve(minter, userBalance.mul(new BN(2)), { from: user });
                await expectRevert(
                    newKNC.burnFrom(user, userBalance.add(new BN(1)), { from: minter }),
                    "ERC20: burn amount exceeds balance"
                );
            });

            it(`test balance, allowance, total supply change correctly`, async() => {
                let amount = new BN(10).pow(new BN(18));
                await newKNC.mint(user, amount, { from: minter });
                let userBalance = await newKNC.balanceOf(user);
                await newKNC.approve(minter, amount.mul(new BN(2)), { from: user });
                let allowance = await newKNC.allowance(user, minter);
                let totalSupply = await newKNC.totalSupply();
                await newKNC.burnFrom(user, amount, { from: minter });
                Helper.assertEqual(
                    userBalance.sub(amount), await newKNC.balanceOf(user),
                );
                Helper.assertEqual(
                    allowance.sub(amount), await newKNC.allowance(user, minter),
                );
                Helper.assertEqual(
                    totalSupply.sub(amount), await newKNC.totalSupply(),
                );
            });
        });
    });

    describe(`Test changeMinter`, async() => {
        beforeEach(`init before each test`, async() => {
            newKNC = await KyberNetworkTokenV2.new(oldKNC.address, minter, { from: owner });
        });

        it(`test reverts not minter`, async() => {
            await expectRevert(
                newKNC.changeMinter(user, { from: user }),
                "only minter"
            );
        });

        it(`test reverts new minter is zero address`, async() => {
            await expectRevert(
                newKNC.changeMinter(zeroAddress, { from: minter }),
                "invalid minter"
            );
        });

        it(`test minter changes and events`, async() => {
            let tx = await newKNC.changeMinter(user, { from: minter });
            Helper.assertEqual(user, await newKNC.minter());
            expectEvent(tx, "MinterChanged", {
                oldMinter: minter,
                newMinter: user
            });
        });
    });

    describe(`Test emergencyERC20Drain`, async() => {
        let token;
        beforeEach(`init before each test`, async() => {
            newKNC = await KyberNetworkTokenV2.new(oldKNC.address, minter, { from: owner });
            token = await Token.new("Test", "TST", 18);
        });

        it(`test reverts not owner`, async() => {
            let amount = new BN(10).pow(new BN(18));
            await token.transfer(newKNC.address, amount);
            await expectRevert(
                newKNC.emergencyERC20Drain(token.address, amount, { from: user }),
                "Ownable: caller is not the owner"
            );
        });

        it(`test reverts not enough token`, async() => {
            let amount = new BN(10).pow(new BN(18));
            await token.transfer(newKNC.address, amount);
            await expectRevert.unspecified(
                newKNC.emergencyERC20Drain(token.address, amount.add(new BN(1)), { from: owner }),
            );
        });

        it(`test balances change correctly`, async() => {
            let amount = new BN(10).pow(new BN(18));
            await token.transfer(newKNC.address, amount);
            let ownerBalance = await token.balanceOf(owner);
            let contractBalance = await token.balanceOf(newKNC.address);
            await newKNC.emergencyERC20Drain(token.address, amount, { from: owner });
            Helper.assertEqual(
                ownerBalance.add(amount), await token.balanceOf(owner)
            );
            Helper.assertEqual(
                contractBalance.sub(amount), await token.balanceOf(newKNC.address)
            );
        });
    });
});

async function deployKNC(knc, ctor, tokenProxy) {
    if (tokenProxy == undefined) {
        return await upgrades.deployProxy(knc, ctor)
    } else {
        return await upgrades.upgradeProxy(tokenProxy.address, knc, ctor)
    }
}

function toEthersBN(num) {
    return new BN.from(num.toString());
}
