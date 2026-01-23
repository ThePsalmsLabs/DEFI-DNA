#!/bin/bash

# Verify DeFi DNA Platform Contracts on Base Mainnet
# Run this script from the contracts directory

set -e

# Export API key
export BASESCAN_API_KEY=6ABTFVR9RNERQ6U2CWXT4NDRB6FT95KPH6

# Contract addresses (from latest deployment)
DNASUBSCRIBER="0x5f25b856f2515e7d6b7700601dec56b5a1e1d2f8"
DNAREADER="0x3b43b906964f93e395b852aa74fb5533c08161be"
ADVANCED_POSITION_MANAGER="0x9f7a02ff5b5e091f2a14459ed3d074bb8d3d32c3"

echo "=========================================="
echo "  Verifying Contracts on Base Mainnet"
echo "=========================================="
echo ""
echo "Using BaseScan API Key: ${BASESCAN_API_KEY:0:10}..."
echo ""

# Verify DNASubscriber
echo "[1/3] Verifying DNASubscriber..."
forge verify-contract \
  $DNASUBSCRIBER \
  src/DNASubscriber.sol:DNASubscriber \
  --chain-id 8453 \
  --etherscan-api-key $BASESCAN_API_KEY \
  --verifier basescan \
  --verifier-url https://api.basescan.org/api \
  --watch || echo "⚠️  DNASubscriber verification failed or already verified"

echo ""

# Verify DNAReader
echo "[2/3] Verifying DNAReader..."
forge verify-contract \
  $DNAREADER \
  src/DNAReader.sol:DNAReader \
  --chain-id 8453 \
  --etherscan-api-key $BASESCAN_API_KEY \
  --verifier basescan \
  --verifier-url https://api.basescan.org/api \
  --watch || echo "⚠️  DNAReader verification failed or already verified"

echo ""

# Verify AdvancedPositionManager
echo "[3/3] Verifying AdvancedPositionManager..."
forge verify-contract \
  $ADVANCED_POSITION_MANAGER \
  src/AdvancedPositionManager.sol:AdvancedPositionManager \
  --chain-id 8453 \
  --etherscan-api-key $BASESCAN_API_KEY \
  --verifier basescan \
  --verifier-url https://api.basescan.org/api \
  --watch || echo "⚠️  AdvancedPositionManager verification failed or already verified"

echo ""
echo "=========================================="
echo "  Verification Complete"
echo "=========================================="
echo ""
echo "View contracts on BaseScan:"
echo "  DNASubscriber: https://basescan.org/address/$DNASUBSCRIBER"
echo "  DNAReader: https://basescan.org/address/$DNAREADER"
echo "  AdvancedPositionManager: https://basescan.org/address/$ADVANCED_POSITION_MANAGER"
echo ""
