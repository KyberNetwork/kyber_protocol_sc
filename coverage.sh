#!/bin/sh
while getopts "f:" arg; do
  case $arg in
    f) FILE=$OPTARG;;
  esac
done

export NODE_OPTIONS=--max-old-space-size=4096

yarn hardhat clean
yarn hardhat compile --config ./hardhatCoverageSol4.js

if [ -n "$FILE" ]
then
    yarn hardhat coverage --config ./hardhatConfigSol6.js --testfiles $FILE --solcoverjs ".solcover.js" --temp ""
else
    yarn hardhat coverage --config ./hardhatConfigSol6.js --testfiles "" --solcoverjs ".solcover.js" --temp ""
fi
