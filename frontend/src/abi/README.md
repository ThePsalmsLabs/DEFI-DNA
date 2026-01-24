# Contract ABIs

This directory contains the Application Binary Interfaces (ABIs) for all DeFi DNA Platform smart contracts.

## Files

- `DNASubscriber.json` - ABI for the DNASubscriber contract
- `DNAReader.json` - ABI for the DNAReader contract  
- `AdvancedPositionManager.json` - ABI for the AdvancedPositionManager contract
- `index.ts` - TypeScript exports for all ABIs

## Updating ABIs

When contracts are updated and recompiled, follow these steps to update the ABIs:

1. **Compile contracts:**
   ```bash
   cd contracts
   forge build
   ```

2. **Extract ABIs:**
   ```bash
   # From project root
   jq '.abi' contracts/out/DNASubscriber.sol/DNASubscriber.json > frontend/src/abi/DNASubscriber.json
   jq '.abi' contracts/out/DNAReader.sol/DNAReader.json > frontend/src/abi/DNAReader.json
   jq '.abi' contracts/out/AdvancedPositionManager.sol/AdvancedPositionManager.json > frontend/src/abi/AdvancedPositionManager.json
   ```

3. **Or use the automated script:**
   ```bash
   # Create a script in package.json or run manually
   cd contracts && \
   jq '.abi' out/DNASubscriber.sol/DNASubscriber.json > ../frontend/src/abi/DNASubscriber.json && \
   jq '.abi' out/DNAReader.sol/DNAReader.json > ../frontend/src/abi/DNAReader.json && \
   jq '.abi' out/AdvancedPositionManager.sol/AdvancedPositionManager.json > ../frontend/src/abi/AdvancedPositionManager.json
   ```

## Usage

Import ABIs in your TypeScript/React code:

```typescript
import { DNASubscriber, DNAReader, AdvancedPositionManager } from '@/abi';
// or
import { ABIs } from '@/abi';

// Use with ethers.js
import { Contract } from 'ethers';
const contract = new Contract(address, DNASubscriber, provider);
```

## Last Updated

These ABIs were last extracted on: **January 21, 2025**

Make sure to update this timestamp when you regenerate the ABIs.
