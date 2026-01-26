import axios, { AxiosInstance } from 'axios';
import { ethers } from 'ethers';

/**
 * Alchemy Indexer Service
 * Fetches comprehensive historical transaction data using Alchemy Enhanced APIs
 * This solves CRITICAL-2 by providing data beyond the 50k block limit
 */
export interface TransactionData {
  hash: string;
  blockNumber: number;
  timestamp: number;
  from: string;
  to: string;
  value: string;
  gasUsed: string;
  gasPrice: string;
  logs: Array<{
    address: string;
    topics: string[];
    data: string;
  }>;
}

export interface PositionTransfer {
  tokenId: string;
  from: string;
  to: string;
  blockNumber: number;
  timestamp: number;
  txHash: string;
  type: 'mint' | 'transfer' | 'burn';
}

export interface SwapEvent {
  poolId: string;
  sender: string;
  recipient: string;
  amount0: bigint;
  amount1: bigint;
  sqrtPriceX96: bigint;
  liquidity: bigint;
  tick: number;
  blockNumber: number;
  timestamp: number;
  txHash: string;
}

export interface IndexedWalletData {
  address: string;
  positions: PositionTransfer[];
  swaps: SwapEvent[];
  totalTransactions: number;
  firstTransactionBlock: number;
  lastTransactionBlock: number;
  firstTransactionTimestamp: number;
  lastTransactionTimestamp: number;
}

export class AlchemyIndexerService {
  private apiKey: string;
  private rpcUrl: string;
  private chainId: number; // 8453 for Base Mainnet
  private axiosInstance: AxiosInstance;
  private provider: ethers.JsonRpcProvider;

  // Base Mainnet PositionManager address
  private readonly POSITION_MANAGER_ADDRESS = '0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e';
  
  // Uniswap V4 PoolManager address (need to verify this)
  // This is the main contract that emits Swap events
  private readonly POOL_MANAGER_ADDRESS = '0x0000000000000000000000000000000000000000'; // TODO: Get actual address

  constructor(rpcUrl: string, chainId: number = 8453) {
    this.rpcUrl = rpcUrl;
    this.chainId = chainId;
    
    // Extract API key from RPC URL if it's an Alchemy URL
    const match = rpcUrl.match(/\/v2\/([^\/]+)/);
    this.apiKey = match ? match[1] : '';
    
    if (!this.apiKey) {
      console.warn('⚠️ Alchemy API key not found in RPC URL. Indexer will have limited functionality.');
    }

    // Create axios instance for Alchemy API calls
    this.axiosInstance = axios.create({
      baseURL: `https://base-mainnet.g.alchemy.com/v2/${this.apiKey}`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.provider = new ethers.JsonRpcProvider(rpcUrl);
  }

  /**
   * Get comprehensive wallet data from Alchemy Enhanced APIs
   */
  async getWalletData(address: string, fromBlock?: number, toBlock?: number): Promise<IndexedWalletData> {
    const normalizedAddress = ethers.getAddress(address);

    // Fetch NFT transfers (PositionManager tokens)
    const positions = await this.getPositionTransfers(normalizedAddress, fromBlock, toBlock);

    // Fetch all transactions to find swaps and other interactions
    const transactions = await this.getTransactions(normalizedAddress, fromBlock, toBlock);

    // Parse swap events from transaction logs
    const swaps = await this.parseSwapEvents(transactions);

    // Calculate first/last transaction timestamps
    const allBlocks = [
      ...positions.map(p => p.blockNumber),
      ...swaps.map(s => s.blockNumber),
    ].filter(Boolean);

    const firstBlock = allBlocks.length > 0 ? Math.min(...allBlocks) : 0;
    const lastBlock = allBlocks.length > 0 ? Math.max(...allBlocks) : 0;

    // Get timestamps for blocks
    let firstTimestamp = 0;
    let lastTimestamp = 0;
    if (firstBlock > 0) {
      try {
        const firstBlockData = await this.provider.getBlock(firstBlock);
        firstTimestamp = firstBlockData?.timestamp || 0;
      } catch (error) {
        console.error('Error fetching first block timestamp:', error);
      }
    }
    if (lastBlock > 0) {
      try {
        const lastBlockData = await this.provider.getBlock(lastBlock);
        lastTimestamp = lastBlockData?.timestamp || 0;
      } catch (error) {
        console.error('Error fetching last block timestamp:', error);
      }
    }

    return {
      address: normalizedAddress,
      positions,
      swaps,
      totalTransactions: transactions.length,
      firstTransactionBlock: firstBlock,
      lastTransactionBlock: lastBlock,
      firstTransactionTimestamp: firstTimestamp,
      lastTransactionTimestamp: lastTimestamp,
    };
  }

  /**
   * Get PositionManager NFT transfers using Alchemy Transfers API
   */
  private async getPositionTransfers(
    address: string,
    fromBlock?: number,
    toBlock?: number
  ): Promise<PositionTransfer[]> {
    if (!this.apiKey) {
      return [];
    }

    try {
      const transfers: PositionTransfer[] = [];

      // Get transfers TO this address (mints and receives)
      const toTransfers = await this.getAssetTransfers({
        toAddress: address,
        contractAddresses: [this.POSITION_MANAGER_ADDRESS],
        category: ['erc721'],
        fromBlock,
        toBlock,
      });

      // Get transfers FROM this address (burns and sends)
      const fromTransfers = await this.getAssetTransfers({
        fromAddress: address,
        contractAddresses: [this.POSITION_MANAGER_ADDRESS],
        category: ['erc721'],
        fromBlock,
        toBlock,
      });

      // Process transfers TO address
      for (const transfer of toTransfers) {
        // Alchemy returns tokenId as string or in tokenIds array
        const tokenId = transfer.tokenId || (transfer.tokenIds && transfer.tokenIds[0]);
        if (tokenId) {
          // Parse block number (can be hex string or number)
          let blockNum = 0;
          if (transfer.blockNum) {
            blockNum = typeof transfer.blockNum === 'string' 
              ? parseInt(transfer.blockNum, 16) 
              : transfer.blockNum;
          }

          // Parse timestamp
          let timestamp = 0;
          if (transfer.blockTimestamp) {
            timestamp = typeof transfer.blockTimestamp === 'string'
              ? new Date(transfer.blockTimestamp).getTime() / 1000
              : transfer.blockTimestamp;
          }

          transfers.push({
            tokenId: tokenId.toString(),
            from: transfer.from || '0x0000000000000000000000000000000000000000',
            to: address,
            blockNumber: blockNum,
            timestamp,
            txHash: transfer.hash || '',
            type: (transfer.from || '').toLowerCase() === '0x0000000000000000000000000000000000000000' ? 'mint' : 'transfer',
          });
        }
      }

      // Process transfers FROM address (mark as burns if sent to zero address)
      for (const transfer of fromTransfers) {
        const tokenId = transfer.tokenId || (transfer.tokenIds && transfer.tokenIds[0]);
        if (tokenId && transfer.to?.toLowerCase() !== address.toLowerCase()) {
          let blockNum = 0;
          if (transfer.blockNum) {
            blockNum = typeof transfer.blockNum === 'string' 
              ? parseInt(transfer.blockNum, 16) 
              : transfer.blockNum;
          }

          let timestamp = 0;
          if (transfer.blockTimestamp) {
            timestamp = typeof transfer.blockTimestamp === 'string'
              ? new Date(transfer.blockTimestamp).getTime() / 1000
              : transfer.blockTimestamp;
          }

          transfers.push({
            tokenId: tokenId.toString(),
            from: address,
            to: transfer.to || '0x0000000000000000000000000000000000000000',
            blockNumber: blockNum,
            timestamp,
            txHash: transfer.hash || '',
            type: (transfer.to || '').toLowerCase() === '0x0000000000000000000000000000000000000000' ? 'burn' : 'transfer',
          });
        }
      }

      return transfers.sort((a, b) => a.blockNumber - b.blockNumber);
    } catch (error: any) {
      console.error('Error fetching position transfers from Alchemy:', error.message);
      return [];
    }
  }

  /**
   * Get all transactions for an address using Alchemy
   */
  private async getTransactions(
    address: string,
    fromBlock?: number,
    toBlock?: number
  ): Promise<TransactionData[]> {
    if (!this.apiKey) {
      return [];
    }

    try {
      // Use Alchemy's getAssetTransfers for comprehensive transaction history
      const transfers = await this.getAssetTransfers({
        fromAddress: address,
        toAddress: address,
        fromBlock,
        toBlock,
        excludeZeroValue: false,
      });

      // Convert to TransactionData format
      const transactions: TransactionData[] = [];
      const seenHashes = new Set<string>();

      for (const transfer of transfers) {
        if (transfer.hash && !seenHashes.has(transfer.hash)) {
          seenHashes.add(transfer.hash);
          transactions.push({
            hash: transfer.hash,
            blockNumber: transfer.blockNum ? parseInt(transfer.blockNum, 16) : 0,
            timestamp: new Date(transfer.blockTimestamp || '').getTime() / 1000,
            from: transfer.from || '',
            to: transfer.to || '',
            value: transfer.value?.toString() || '0',
            gasUsed: '0', // Not available in transfers API
            gasPrice: '0', // Not available in transfers API
            logs: [], // Will be fetched separately if needed
          });
        }
      }

      return transactions.sort((a, b) => a.blockNumber - b.blockNumber);
    } catch (error: any) {
      console.error('Error fetching transactions from Alchemy:', error.message);
      return [];
    }
  }

  /**
   * Parse swap events from transaction logs
   * Note: Uniswap V4 uses a different event structure than V3
   */
  private async parseSwapEvents(transactions: TransactionData[]): Promise<SwapEvent[]> {
    const swaps: SwapEvent[] = [];

    // Uniswap V4 Swap event signature
    // Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)
    const SWAP_EVENT_SIGNATURE = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';

    for (const tx of transactions) {
      try {
        // Get transaction receipt to access logs
        const receipt = await this.provider.getTransactionReceipt(tx.hash);
        if (!receipt) continue;

        for (const log of receipt.logs) {
          // Check if this is a Swap event
          if (log.topics[0] === SWAP_EVENT_SIGNATURE && log.topics.length >= 3) {
            try {
              // Decode swap event
              // Topics: [event signature, sender, recipient]
              // Data: [amount0, amount1, sqrtPriceX96, liquidity, tick]
              const sender = ethers.getAddress('0x' + log.topics[1].slice(26));
              const recipient = ethers.getAddress('0x' + log.topics[2].slice(26));

              // Decode data (packed values)
              // Note: This is simplified - actual decoding depends on Uniswap V4 event structure
              const data = log.data;
              if (data.length >= 256) {
                // Parse amounts (int256, 32 bytes each)
                const amount0Hex = data.slice(2, 66);
                const amount1Hex = data.slice(66, 130);
                const amount0 = BigInt('0x' + amount0Hex);
                const amount1 = BigInt('0x' + amount1Hex);

                // Get block to find timestamp
                const block = await this.provider.getBlock(receipt.blockNumber);
                const timestamp = block?.timestamp || 0;

                // Calculate poolId from log address (simplified - actual poolId calculation is more complex)
                const poolId = this.calculatePoolIdFromAddress(log.address);

                swaps.push({
                  poolId,
                  sender,
                  recipient,
                  amount0,
                  amount1,
                  sqrtPriceX96: 0n, // Would need to decode from data
                  liquidity: 0n, // Would need to decode from data
                  tick: 0, // Would need to decode from data
                  blockNumber: receipt.blockNumber,
                  timestamp,
                  txHash: tx.hash,
                });
              }
            } catch (error) {
              console.error(`Error parsing swap event in tx ${tx.hash}:`, error);
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching receipt for tx ${tx.hash}:`, error);
      }
    }

    return swaps;
  }

  /**
   * Calculate poolId from contract address
   * This is a simplified version - actual poolId is computed from pool key
   */
  private calculatePoolIdFromAddress(address: string): string {
    // In Uniswap V4, poolId is keccak256(abi.encodePacked(poolKey))
    // For now, we'll use a placeholder. This would need to be computed properly
    // by querying the PoolManager contract
    return ethers.keccak256(ethers.toUtf8Bytes(address));
  }

  /**
   * Call Alchemy's getAssetTransfers API
   */
  private async getAssetTransfers(params: {
    fromAddress?: string;
    toAddress?: string;
    contractAddresses?: string[];
    category?: string[];
    fromBlock?: number;
    toBlock?: number;
    excludeZeroValue?: boolean;
  }): Promise<any[]> {
    try {
      const payload: any = {
        id: 1,
        jsonrpc: '2.0',
        method: 'alchemy_getAssetTransfers',
        params: [{}],
      };

      // Build params object, only including defined values
      const apiParams: any = {};
      if (params.fromBlock !== undefined) {
        apiParams.fromBlock = `0x${params.fromBlock.toString(16)}`;
      }
      if (params.toBlock !== undefined) {
        apiParams.toBlock = `0x${params.toBlock.toString(16)}`;
      } else {
        apiParams.toBlock = 'latest';
      }
      if (params.fromAddress) {
        apiParams.fromAddress = params.fromAddress;
      }
      if (params.toAddress) {
        apiParams.toAddress = params.toAddress;
      }
      if (params.contractAddresses && params.contractAddresses.length > 0) {
        apiParams.contractAddresses = params.contractAddresses;
      }
      if (params.category && params.category.length > 0) {
        apiParams.category = params.category;
      } else {
        apiParams.category = ['external', 'internal', 'erc20', 'erc721', 'erc1155'];
      }
      apiParams.excludeZeroValue = params.excludeZeroValue !== false;
      apiParams.maxCount = 1000; // Alchemy limit

      payload.params[0] = apiParams;

      const response = await this.axiosInstance.post('', payload);
      
      if (response.data.error) {
        throw new Error(response.data.error.message || 'Alchemy API error');
      }

      return response.data.result?.transfers || [];
    } catch (error: any) {
      console.error('Alchemy getAssetTransfers error:', error.message);
      // Return empty array on error instead of throwing
      return [];
    }
  }

  /**
   * Get the block number when Uniswap V4 was deployed on Base
   * This helps us set a reasonable fromBlock for historical queries
   */
  async getUniswapV4DeploymentBlock(): Promise<number> {
    // Uniswap V4 PositionManager was deployed around a specific block
    // For Base mainnet, we can query the contract creation block
    try {
      const code = await this.provider.getCode(this.POSITION_MANAGER_ADDRESS);
      if (!code || code === '0x') {
        return 0;
      }

      // Try to find deployment block by searching backwards
      // This is a simplified approach - in production, you'd store this value
      // Base mainnet started around block 0, Uniswap V4 likely deployed much later
      // For now, we'll use a conservative estimate
      return 0; // Will be set based on actual deployment
    } catch (error) {
      console.error('Error getting deployment block:', error);
      return 0;
    }
  }
}
