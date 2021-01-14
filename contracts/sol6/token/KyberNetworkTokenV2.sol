pragma solidity 0.6.6;


import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

interface IERC20Burnable {
    function burnFrom(address _from, uint256 _value) external returns (bool);
}

contract KyberNetworkTokenV2 is ERC20Burnable, Ownable {
    using SafeERC20 for IERC20;

    address public immutable oldKNC;
    address public minter;

    event Minted(address indexed account, uint256 indexed amount, address indexed minter);
    event BurntAndMinted(address indexed account, uint256 indexed amount);
    event MinterChanged(address indexed oldMinter, address indexed newMinter);

    modifier onlyMinter() {
        require(msg.sender == minter, "only minter");
        _;
    }

    constructor(address _oldKNC, address _minter)
        public ERC20("Kyber Network Crystal V2", "KNCv2")
    {
        require(_oldKNC != address(0), "invalid old knc");
        require(_minter != address(0), "invalid minter");
        oldKNC = _oldKNC;
        minter = _minter;
    }

    function mint(address account, uint256 amount) external onlyMinter {
        super._mint(account, amount);
        emit Minted(account, amount, minter);
    }

    /// @dev burn old knc and mint new knc for msg.sender, ratio 1:1
    function mintWithOldKnc(uint256 amount) external {
        IERC20Burnable(oldKNC).burnFrom(msg.sender, amount);

        super._mint(msg.sender, amount);
        emit BurntAndMinted(msg.sender, amount);
    }

    function changeMinter(address newMinter) external onlyMinter {
        require(newMinter != address(0), "invalid minter");
        if (minter != newMinter) {
            emit MinterChanged(minter, newMinter);
            minter = newMinter;
        }
    }

    /// @dev emergency withdraw ERC20, can only call by the owner
    /// to withdraw tokens that have been sent to this address
    function emergencyERC20Drain(
        IERC20 token,
        uint amount
    ) external onlyOwner {
        token.safeTransfer(owner(), amount);
    }
}
