#!/bin/bash

# QuantumCat Test Execution Script
# Run this script to execute all tests and generate coverage reports

set -e

echo "================================"
echo "QuantumCat Test Suite"
echo "================================"
echo ""

cd "$(dirname "$0")/.."

echo "📦 Installing dependencies..."
npm install --silent

echo ""
echo "🧪 Running test suite..."
echo ""

npx hardhat test

echo ""
echo "================================"
echo "✅ All tests completed!"
echo "================================"
echo ""

echo "To run specific test files:"
echo "  npx hardhat test test/01-deployment-initialization.test.js"
echo "  npx hardhat test test/02-core-observe-rebox.test.js"
echo "  npx hardhat test test/03-security-access-control.test.js"
echo "  npx hardhat test test/04-randomness-algorithm.test.js"
echo "  npx hardhat test test/05-view-functions.test.js"
echo "  npx hardhat test test/06-edge-cases-complete.test.js"
echo "  npx hardhat test test/07-erc20-compliance.test.js"
echo "  npx hardhat test test/08-controller-advanced.test.js"
echo ""

echo "To generate coverage report:"
echo "  npx hardhat coverage"
echo ""

