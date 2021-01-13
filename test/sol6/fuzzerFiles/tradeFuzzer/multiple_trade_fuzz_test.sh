#!/bin/sh

for _ in {1..100}
do
    yarn hardhat test --no-compile test/sol6/tradeFuzzTests.js
done
