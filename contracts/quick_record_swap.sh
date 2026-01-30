#!/bin/bash
# Quick script to call recordSwap on DNASubscriber

CONTRACT="0xeac0cccaf338264f74d6bb7e033a24df8b201884"
USER="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
VOLUME="1000000000000000000000"  # $1,000

# PoolId calculation (WETH/USDC 0.3% pool)
POOL_ID=$(cast keccak "abi.encode((address,address,uint24,int24,address))" \
  0x4200000000000000000000000000000000000006 \
  0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 \
  3000 60 0x0000000000000000000000000000000000000000)

echo "Calling recordSwap..."
echo "Contract: $CONTRACT"
echo "User: $USER"
echo "PoolId: $POOL_ID"
echo "Volume: $VOLUME ($(echo "scale=2; $VOLUME / 10^18" | bc) USD)"

cast send $CONTRACT \
  "recordSwap(address,(bytes32),uint128)" \
  $USER \
  $POOL_ID \
  $VOLUME \
  --rpc-url ${RPC_URL:-https://base-mainnet.g.alchemy.com/v2/YOUR_KEY} \
  --private-key ${PRIVATE_KEY}

