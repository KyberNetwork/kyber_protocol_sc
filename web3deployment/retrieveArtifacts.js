const fs = require('fs');
const util = require('util');
const readdir = util.promisify(fs.readdir);
const path = require("path");
const artifactsPath = path.join(__dirname, "../artifacts/");
const hardhatConfigSol5 = path.join(__dirname, "../hardhatConfigSol5.js");
const hardhatConfigSol4 = path.join(__dirname, "../hardhatConfigSol4.js");
const execSync = require('child_process').execSync;

module.exports.retrieveArtifacts = main;
async function main(skipCompilation) {
  if (!skipCompilation) {
    compileContracts();
  }
  let output = await packageArtifacts();
  return output;
}

async function packageArtifacts() {
  let result = {};
  files = await readdir(artifactsPath);
  files.forEach(file => {
    content = JSON.parse(fs.readFileSync(path.join(artifactsPath, file)));
    result[content.contractName] = content;
  })
  return result;
}


function compileContracts() {
  console.log("Compiling contracts...");
  execSync(`yarn hardhat compile`, { encoding: 'utf-8' });
  execSync(`yarn hardhat compile --config ${hardhatConfigSol5}`, { encoding: 'utf-8'});
  execSync(`yarn hardhat compile --config ${hardhatConfigSol4}`, { encoding: 'utf-8'});
}

main();
