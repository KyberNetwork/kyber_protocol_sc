'use strict';
const fs = require('fs');
const util = require('util');
const got = require('got');
const yargs = require('yargs');

let path = 'artifacts/contracts';

let argv = yargs.default('branch', 'Katalyst').alias('b', 'branch').argv;

const readdir = util.promisify(fs.readdir);

async function getFiles(dir, files_, names_){
  var files = await readdir(dir);
  for (var i in files){
      var fullDir = dir + '/' + files[i];
      if (fs.statSync(fullDir).isDirectory()){
          await getFiles(fullDir, files_, names_);
      } else {
          files_.push(fullDir);
          names_.push(files[i]);
      }
  }
  return (files_, names_);
}

async function generateCodeSizeReport() {
  let result = {};
  let fileDirs = [];
  let fileNames = [];
  await getFiles(path, fileDirs, fileNames);

  for (let i = 0; i < fileDirs.length; i++) {
    let fileDir = fileDirs[i];
    let rawData = fs.readFileSync(fileDir);
    let contractData = JSON.parse(rawData);
    if (contractData.deployedBytecode != undefined) {
      let codeSize = contractData.deployedBytecode.length / 2 - 1;
      if (codeSize > 0) {
        result[fileNames[i]] = codeSize;
      }
    }
  }
  return result;
}

async function writeReport(report) {
  let jsonContent = JSON.stringify(report, null, '\t');
  let reportDir = 'report';
  if (process.env.TRAVIS_BRANCH !== undefined) {
    reportDir = `report/${process.env.TRAVIS_BRANCH}`;
  }
  let reportFile = `${reportDir}/contractSize.json`;
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, {recursive: true});
  }
  fs.writeFile(reportFile, jsonContent, 'utf8', function (err) {
    if (err) {
      console.log('An error occured while writing JSON Object to File.');
      return console.log(err);
    }
  });
}

async function getRemoteReport() {
  try {
    const url = `http://katalyst-coverage.knstats.com/report/${argv.branch}/contractSize.json`;
    return await got(url).json();
  } catch (error) {
    // console.log(error);
    return false;
  }
}

async function compareContractSize() {
  let contractSizeReport = await generateCodeSizeReport();
  await writeReport(contractSizeReport);
  let remoteReport = await getRemoteReport();
  if (!remoteReport) {
    console.log(`Could not get report for ${argv.branch}`);
    console.log("Current contract size report");
    console.table(contractSizeReport);
    return false;
  }
  let diffDict = {};
  for (let contract in contractSizeReport) {
    if (contract in remoteReport) {
      let baseBranchSize = remoteReport[contract];
      let currentSize = contractSizeReport[contract];
      let diff = currentSize - baseBranchSize;
      if (diff != 0) {
        diffDict[contract] = {
          [argv.branch]: baseBranchSize,
          current: currentSize,
          diff: diff,
        };
      }
    }
  }
  for (let contract in remoteReport) {
    if (contract in remoteReport && !(contract in diffDict)) {
      let baseBranchSize = remoteReport[contract];
      let currentSize = contractSizeReport[contract];
      let diff = currentSize - baseBranchSize;
      if (diff != 0) {
        diffDict[contract] = {
          [argv.branch]: baseBranchSize,
          current: currentSize,
          diff: diff,
        };
      }
    }
  }
  if (Object.keys(diffDict).length > 0) {
    console.log(`There is change in following contract size with ${argv.branch}`);
    console.table(diffDict);
  } else {
    console.log("Contract size didn't change");
    console.table(contractSizeReport);
  }
}

compareContractSize();
