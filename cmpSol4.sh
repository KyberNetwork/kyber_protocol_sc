#!/bin/sh
export NODE_OPTIONS=--max-old-space-size=4096
yarn hardhat compile --config hardhatConfigSol4.js &&
node contractSizeReport.js
