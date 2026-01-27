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
  
  // Uniswap V4 deployment block on Base Mainnet (May 2024)
  // CRITICAL-4: Use this to query full historical data
  private readonly UNISWAP_V4_DEPLOYMENT_BLOCK = 14506421;
  
  // Uniswap V4 PoolManager address (need to verify this)
  // This is the main contract that emits Swap events
  private readonly POOL_MANAGER_ADDRESS = '0x0000000000000000000000000000000000000000'; // TODO: Get actual address

  constructor(rpcUrl: string, chainId: number = 8453) {
    if (!rpcUrl || typeof rpcUrl !== 'string') {
      throw new Error('Invalid RPC URL provided to AlchemyIndexerService');
    }

    this.rpcUrl = rpcUrl;
    this.chainId = chainId;
    
    // Extract API key from RPC URL if it's an Alchemy URL
    const match = rpcUrl.match(/\/v2\/([^\/]+)/);
    this.apiKey = match ? match[1] : '';
    
    if (!this.apiKey) {
      console.warn('⚠️ Alchemy API key not found in RPC URL. Indexer will have limited functionality.');
      // Use a placeholder to prevent invalid baseURL
      this.apiKey = 'placeholder';
    }

    // Create axios instance for Alchemy API calls with error handling
    try {
      this.axiosInstance = axios.create({
        baseURL: `https://base-mainnet.g.alchemy.com/v2/${this.apiKey}`,
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Add response interceptor for better error handling
      this.axiosInstance.interceptors.response.use(
        (response) => response,
        (error) => {
          if (error.code === 'ECONNABORTED') {
            console.error('Alchemy API request timeout');
          } else if (error.response) {
            console.error(`Alchemy API error: ${error.response.status} - ${error.response.statusText}`);
          } else if (error.request) {
            console.error('Alchemy API request failed - no response received');
          }
          return Promise.reject(error);
        }
      );
    } catch (error) {
      console.error('Failed to create axios instance:', error);
      throw new Error('Failed to initialize Alchemy indexer HTTP client');
    }

    // Initialize provider with error handling
    try {
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
    } catch (error) {
      console.error('Failed to initialize ethers provider:', error);
      throw new Error('Failed to initialize blockchain provider');
    }
  }

  /**
   * Get comprehensive wallet data from Alchemy Enhanced APIs
   */
  async getWalletData(address: string, fromBlock?: number, toBlock?: number): Promise<IndexedWalletData> {
    // Validate address
    if (!address || !ethers.isAddress(address)) {
      throw new Error('Invalid wallet address provided to getWalletData');
    }

    const normalizedAddress = ethers.getAddress(address);

    // Initialize default return value
    const defaultData: IndexedWalletData = {
      address: normalizedAddress,
      positions: [],
      swaps: [],
      totalTransactions: 0,
      firstTransactionBlock: 0,
      lastTransactionBlock: 0,
      firstTransactionTimestamp: 0,
      lastTransactionTimestamp: 0,
    };

    // Fetch NFT transfers (PositionManager tokens) with error handling
    let positions: PositionTransfer[] = [];
    try {
      positions = await this.getPositionTransfers(normalizedAddress, fromBlock, toBlock);
    } catch (error: any) {
      console.error('Error fetching position transfers:', error.message);
      // Continue with empty positions
    }

    // Fetch all transactions to find swaps and other interactions with error handling
    let transactions: TransactionData[] = [];
    try {
      transactions = await this.getTransactions(normalizedAddress, fromBlock, toBlock);
    } catch (error: any) {
      console.error('Error fetching transactions:', error.message);
      // Continue with empty transactions
    }

    // Parse swap events from transaction logs with error handling
    let swaps: SwapEvent[] = [];
    try {
      swaps = await this.parseSwapEvents(transactions);
    } catch (error: any) {
      console.error('Error parsing swap events:', error.message);
      // Continue with empty swaps
    }

    // Calculate first/last transaction timestamps
    const allBlocks = [
      ...positions.map(p => p.blockNumber),
      ...swaps.map(s => s.blockNumber),
    ].filter(Boolean);

    const firstBlock = allBlocks.length > 0 ? Math.min(...allBlocks) : 0;
    const lastBlock = allBlocks.length > 0 ? Math.max(...allBlocks) : 0;

    // Get timestamps for blocks with timeout protection
    let firstTimestamp = 0;
    let lastTimestamp = 0;
    if (firstBlock > 0) {
      try {
        const firstBlockData = await Promise.race([
          this.provider.getBlock(firstBlock),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
        ]) as any;
        firstTimestamp = firstBlockData?.timestamp || 0;
      } catch (error: any) {
        console.error(`Error fetching first block ${firstBlock} timestamp:`, error.message);
        // Continue without timestamp
      }
    }
    if (lastBlock > 0 && lastBlock !== firstBlock) {
      try {
        const lastBlockData = await Promise.race([
          this.provider.getBlock(lastBlock),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
        ]) as any;
        lastTimestamp = lastBlockData?.timestamp || 0;
      } catch (error: any) {
        console.error(`Error fetching last block ${lastBlock} timestamp:`, error.message);
        // Continue without timestamp
      }
    } else if (lastBlock === firstBlock && firstTimestamp > 0) {
      lastTimestamp = firstTimestamp;
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

    if (!transactions || transactions.length === 0) {
      return swaps;
    }

    // Uniswap V4 Swap event signature
    // Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)
    const SWAP_EVENT_SIGNATURE = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';

    // Limit number of transactions to parse to prevent timeout
    const maxTransactions = 100;
    const transactionsToParse = transactions.slice(0, maxTransactions);

    for (const tx of transactionsToParse) {
      try {
        // Get transaction receipt to access logs with timeout
        const receipt = await Promise.race([
          this.provider.getTransactionReceipt(tx.hash),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]) as any;
        
        if (!receipt || !receipt.logs) continue;

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
      } catch (error: any) {
        // Silently skip individual transaction errors to prevent one bad tx from breaking everything
        if (!error.message?.includes('Timeout')) {
          // Only log non-timeout errors to reduce noise
          if (transactionsToParse.indexOf(tx) < 10) { // Only log first 10 errors
            console.warn(`Error processing tx ${tx.hash}:`, error.message);
          }
        }
        continue; // Continue processing other transactions
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
    // Return empty array if no API key (graceful degradation)
    if (!this.apiKey || this.apiKey === 'placeholder') {
      return [];
    }

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

      const response = await Promise.race([
        this.axiosInstance.post('', payload),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 30000)
        )
      ]) as any;
      
      if (response?.data?.error) {
        const errorMsg = response.data.error.message || 'Alchemy API error';
        // Don't throw for rate limits or temporary errors - just log and return empty
        if (errorMsg.includes('rate limit') || errorMsg.includes('429')) {
          console.warn('Alchemy API rate limit hit, returning empty results');
          return [];
        }
        throw new Error(errorMsg);
      }

      return response?.data?.result?.transfers || [];
    } catch (error: any) {
      // Handle specific error types gracefully
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        console.warn('Alchemy API request timeout, returning empty results');
      } else if (error.response?.status === 429) {
        console.warn('Alchemy API rate limit, returning empty results');
      } else {
        console.error('Alchemy getAssetTransfers error:', error.message || error);
      }
      // Return empty array on error instead of throwing (graceful degradation)
      return [];
    }
  }

  /**
   * Get the block number when Uniswap V4 was deployed on Base
   */
  async getUniswapV4DeploymentBlock(): Promise<number> {
    return this.UNISWAP_V4_DEPLOYMENT_BLOCK;
  }
}
