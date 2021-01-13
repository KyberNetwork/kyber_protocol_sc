#!/bin/sh
while getopts "f:" arg; do
  case $arg in
    f) FILE=$OPTARG;;
  esac
done

export NODE_OPTIONS=--max-old-space-size=4096

yarn hardhat clean
yarn hardhat compile

if [ -n "$FILE" ]
then
  yarn hardhat coverage --testfiles $FILE --solcoverjs ".solcover.js"
else
  yarn hardhat coverage --solcoverjs ".solcover.js"
fi
