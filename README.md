## Introduction
[![built-with openzeppelin](https://img.shields.io/badge/built%20with-OpenZeppelin-3677FF)](https://docs.openzeppelin.com/)
[![Build Status](https://api.travis-ci.com/KyberNetwork/kyber_protocol_sc.svg?branch=master&status=passed)](https://travis-ci.com/github/KyberNetwork/kyber_protocol_sc)


This repository contains kyber protocol smart contracts.
For more details, please visit our [developer portal](https://developer.kyber.network/)

## API
Public facing interfaces for kyber network (folder: contracts/sol6):
1. IKyberNetworkProxy.sol
     - Get rate
     - trade functions.
     - get hint handler address.
2. ISimpleKyberProxy.sol - Simple trade functions.
3. IKyberHintHandler.sol - 
    - Build hints for advanced trade functionality.
    - Parse hints to check correctnes.


## Setup
- Clone repo
- yarn

## Compilation
yarn compile

## Testing with Buidler
1. Compile if haven't done so yet.
2. yarn test = Run full regression

### Single file regression
`./tst.sh -f ./test/sol6/kyberNetwork.js`

## Coverage
yarn coverage

### Single file coverage
`./coverage.sh -f ./test/sol6/kyberNetwork.js` (Coverage for only kyberNetwork.js)
