#!/bin/bash

node contractSizeReport.js $TRAVIS_PULL_REQUEST_BRANCH
node gasUsageReport.js $TRAVIS_PULL_REQUEST_BRANCH
