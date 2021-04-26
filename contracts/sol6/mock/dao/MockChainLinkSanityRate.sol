
pragma solidity 0.6.6;

import "../reserves/ISanityRate.sol";


contract MockChainLinkSanityRate is ISanityRate {
    uint256 public latestAnswerValue;

    function setLatestKncToEthRate(uint256 _kncEthRate) external {
        latestAnswerValue = _kncEthRate;
    }

    function latestAnswer() external view override returns (uint256) {
        return latestAnswerValue;
    }
}
