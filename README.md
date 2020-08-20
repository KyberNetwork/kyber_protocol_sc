## Introduction
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
1. Clone repo
2. `npm ci`

## Compilation
`./cmp.sh`

## Testing with Buidler
1. If contracts have not been compiled, run `./cmp.sh`. This step can be skipped subsequently.
2. Run full regression `./tst.sh`
3. Use `-f` for running a specific test file.

### Example Commands
`./tst.sh`
`./tst.sh -f ./test/sol4/kyberReserve.js` (Test only kyberReserve.js)

## Coverage with `buidler-coverage`
1. Run `./coverage.sh`
2. Use `-f` for running a specific test file.

### Example Commands
`./coverage.sh -f ./test/sol6/kyberNetwork.js` (Coverage for only kyberNetwork.js)
