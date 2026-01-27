import { ethers } from 'ethers';
import { Pool } from 'pg';
import { DNASubscriberABI, DNAReaderABI } from '../types/contracts';
import { AlchemyIndexerService, IndexedWalletData } from './alchemyIndexerService';
import * as dbQueries from '../db/queries';
import type {
  Position,
  OnChainUserStats,
  DatabaseUserData,
  SubscribedPositionData,
  PositionSnapshot,
  TransferEvent,
  AppError,
} from '../types';

interface PoolInteraction {
  poolId: string;
  poolKey?: {
    currency0: string;
    currency1: string;
    fee: number;
    tickSpacing: number;
    hooks: string;
  };
  totalSwaps: number;
  totalVolumeUsd: number;
  totalFeesEarned: number;
  firstInteraction: number;
  lastInteraction: number;
  positions?: Array<{
    tokenId: string;
    liquidity: string;
    tickLower: number;
    tickUpper: number;
    isActive: boolean;
  }>;
}

interface WalletSearchResult {
  address: string;
  summary: {
    totalSwaps: number;
    totalVolumeUsd: number;
    totalFeesEarned: number;
    totalPositions: number;
    activePositions: number;
    uniquePools: number;
    dnaScore: number;
    tier: string;
    firstActionTimestamp: number;
    lastActionTimestamp: number;
  };
  poolInteractions: PoolInteraction[];
  recentActivity?: Array<{
    type: 'swap' | 'mint' | 'burn' | 'collect';
    poolId: string;
    timestamp: number;
    txHash?: string;
  }>;
}

// PositionManager ABI (ERC721 + PositionManager functions)
const POSITION_MANAGER_ABI = [
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function balanceOf(address owner) view returns (uint256)',
  'function getPoolAndPositionInfo(uint256 tokenId) view returns (tuple, uint256)',
  'function getPositionLiquidity(uint256 tokenId) view returns (uint128)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
];

// Base Mainnet PositionManager address
const BASE_POSITION_MANAGER = '0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e';

// Uniswap V4 deployment block on Base Mainnet (May 2024)
// This is when Uniswap V4 PositionManager was deployed
const UNISWAP_V4_DEPLOYMENT_BLOCK = 14506421;

export class SearchService {
  private provider: ethers.JsonRpcProvider;
  private dnaSubscriber: ethers.Contract;
  private dnaReader: ethers.Contract;
  private positionManager: ethers.Contract;
  private db?: Pool;
  private indexer?: AlchemyIndexerService;
  private chainId: number;

  constructor(
    rpcUrl: string,
    dnaSubscriberAddress: string,
    dnaReaderAddress: string,
    dbPool?: Pool,
    chainId: number = 8453 // Base Mainnet
  ) {
    // Validate inputs
    if (!rpcUrl || typeof rpcUrl !== 'string') {
      throw new Error('Invalid RPC URL provided to SearchService');
    }
    if (!dnaSubscriberAddress || !ethers.isAddress(dnaSubscriberAddress)) {
      throw new Error('Invalid DNA_SUBSCRIBER_ADDRESS provided');
    }
    if (!dnaReaderAddress || !ethers.isAddress(dnaReaderAddress)) {
      throw new Error('Invalid DNA_READER_ADDRESS provided');
    }

    try {
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to initialize blockchain provider: ${errorMessage}`);
    }

    this.chainId = chainId;

    // Initialize contracts with error handling
    try {
      this.dnaSubscriber = new ethers.Contract(
        dnaSubscriberAddress,
        DNASubscriberABI,
        this.provider
      );
      this.dnaReader = new ethers.Contract(
        dnaReaderAddress,
        DNAReaderABI,
        this.provider
      );
      // Initialize PositionManager contract
      this.positionManager = new ethers.Contract(
        BASE_POSITION_MANAGER,
        POSITION_MANAGER_ABI,
        this.provider
      );
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to initialize contracts: ${errorMessage}`);
    }

    this.db = dbPool;

    // Initialize Alchemy indexer if RPC URL contains Alchemy API key
    if (rpcUrl.includes('alchemy.com')) {
      try {
        this.indexer = new AlchemyIndexerService(rpcUrl, chainId);
        console.log('✅ Alchemy indexer initialized');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.warn('⚠️ Failed to initialize Alchemy indexer:', errorMessage);
        this.indexer = undefined;
      }
    }
  }

  /**
   * Search for wallet interactions across all pools
   */
  async searchWallet(walletAddress: string): Promise<WalletSearchResult> {
    if (!ethers.isAddress(walletAddress)) {
      throw new Error('Invalid wallet address');
    }

    const normalizedAddress = ethers.getAddress(walletAddress);

    // Check database cache first
    if (this.db) {
      try {
        const cachedUser = await dbQueries.getUser(this.db, normalizedAddress);
        
        if (cachedUser) {
          const cacheAge = Date.now() - new Date(cachedUser.updated_at).getTime();
          const cacheMaxAge = 5 * 60 * 1000;
          
          if (cacheAge < cacheMaxAge) {
            const poolInteractions = await this.getPoolInteractionsFromDB(normalizedAddress);
            const recentActivity = await this.getRecentActivityFromDB(normalizedAddress);
            
            return {
              address: normalizedAddress,
              summary: {
                totalSwaps: cachedUser.total_swaps || 0,
                totalVolumeUsd: Number(cachedUser.total_volume_usd) || 0,
                totalFeesEarned: Number(cachedUser.total_fees_earned) || 0,
                totalPositions: cachedUser.total_positions || 0,
                activePositions: cachedUser.active_positions || 0,
                uniquePools: cachedUser.unique_pools || 0,
                dnaScore: cachedUser.dna_score || 0,
                tier: cachedUser.tier || 'Novice',
                firstActionTimestamp: cachedUser.first_action_timestamp ? Number(cachedUser.first_action_timestamp) : 0,
                lastActionTimestamp: cachedUser.last_action_timestamp ? Number(cachedUser.last_action_timestamp) : 0,
              },
              poolInteractions,
              recentActivity,
            };
          }
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error fetching cached data:', errorMessage);
      }
    }

    // Fetch fresh data
    const onChainData = await this.fetchOnChainData(normalizedAddress);
    const dbData = this.db ? await this.fetchDatabaseData(normalizedAddress) : null;

    // Fetch indexed data from Alchemy
    let indexedData: IndexedWalletData | null = null;
    if (this.indexer) {
      try {
        const deploymentBlock = await this.indexer.getUniswapV4DeploymentBlock();
        const currentBlock = await this.provider.getBlockNumber();
        
        indexedData = await this.indexer.getWalletData(
          normalizedAddress,
          deploymentBlock,
          currentBlock
        );
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error fetching indexed data:', errorMessage);
      }
    }

    const positions = await this.fetchPositions(normalizedAddress, indexedData);

    const poolInteractions = await this.aggregatePoolInteractions(
      normalizedAddress,
      onChainData,
      dbData,
      positions,
      indexedData
    );

    const dnaScore = await this.calculateDNAScore(normalizedAddress);
    const tier = await this.getTier(normalizedAddress);

    const totalPositions = positions.length;
    const activePositions = positions.filter(p => p.isActive).length;
    
    const uniquePoolsSet = new Set<string>();
    positions.forEach(p => {
      if (p.poolId && p.poolId !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
        uniquePoolsSet.add(p.poolId.toLowerCase());
      }
    });
    if (indexedData) {
      indexedData.swaps.forEach(swap => {
        if (swap.poolId) {
          uniquePoolsSet.add(swap.poolId.toLowerCase());
        }
      });
    }
    const uniquePools = uniquePoolsSet.size;

    const totalSwaps = indexedData 
      ? indexedData.swaps.length 
      : (Number(onChainData.totalSwaps) || 0);
    
    const totalVolumeUsd = indexedData && indexedData.swaps.length > 0
      ? this.calculateVolumeFromSwaps(indexedData.swaps)
      : (Number(onChainData.totalVolumeUsd) / 1e18 || 0);

    const firstActionTimestamp = indexedData && indexedData.firstTransactionTimestamp > 0
      ? indexedData.firstTransactionTimestamp
      : (Number(onChainData.firstActionTimestamp) || 0);
    
    const lastActionTimestamp = indexedData && indexedData.lastTransactionTimestamp > 0
      ? indexedData.lastTransactionTimestamp
      : (Number(onChainData.lastActionTimestamp) || 0);

    const recentActivity = indexedData 
      ? this.buildRecentActivityFromIndexedData(indexedData)
      : (dbData?.recentActivity || undefined);

    const result: WalletSearchResult = {
      address: normalizedAddress,
      summary: {
        totalSwaps,
        totalVolumeUsd,
        totalFeesEarned: Number(onChainData.totalFeesEarned) / 1e18 || 0,
        totalPositions: totalPositions || Number(onChainData.totalPositions) || 0,
        activePositions: activePositions || Number(onChainData.activePositions) || 0,
        uniquePools: uniquePools || Number(onChainData.uniquePools) || 0,
        dnaScore: Number(dnaScore) || 0,
        tier: tier || 'Novice',
        firstActionTimestamp,
        lastActionTimestamp,
      },
      poolInteractions,
      recentActivity,
    };

    // Save to database for caching
    if (this.db) {
      try {
        await this.saveToDatabase(normalizedAddress, result, positions);
        console.log(`✅ Saved data to database for ${normalizedAddress}`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error saving to database:', errorMessage);
      }
    }

    return result;
  }

  /**
   * Save wallet data to database
   */
  private async saveToDatabase(
    address: string,
    result: WalletSearchResult,
    positions: Position[]
  ): Promise<void> {
    if (!this.db) return;

    try {
      // Save user summary
      await dbQueries.upsertUser(this.db, address, {
        dnaScore: result.summary.dnaScore,
        tier: result.summary.tier,
        totalSwaps: result.summary.totalSwaps,
        totalVolumeUsd: result.summary.totalVolumeUsd,
        totalFeesEarned: result.summary.totalFeesEarned,
        totalPositions: result.summary.totalPositions,
        activePositions: result.summary.activePositions,
        uniquePools: result.summary.uniquePools,
        firstActionTimestamp: result.summary.firstActionTimestamp || undefined,
        lastActionTimestamp: result.summary.lastActionTimestamp || undefined,
      });

      // Save positions
      for (const position of positions) {
        await dbQueries.upsertPosition(this.db, {
          tokenId: position.tokenId,
          ownerAddress: address,
          poolId: position.poolId,
          liquidity: position.liquidity,
          tickLower: position.tickLower,
          tickUpper: position.tickUpper,
          isActive: position.isActive,
          isSubscribed: position.isSubscribed || false,
        });
      }

      // Save pool interactions
      for (const interaction of result.poolInteractions) {
        await dbQueries.upsertPoolInteraction(this.db, {
          userAddress: address,
          poolId: interaction.poolId,
          totalSwaps: interaction.totalSwaps,
          totalVolumeUsd: interaction.totalVolumeUsd,
          totalFeesEarned: interaction.totalFeesEarned,
          firstInteraction: interaction.firstInteraction || undefined,
          lastInteraction: interaction.lastInteraction || undefined,
        });
      }

      // Save recent activity
      if (result.recentActivity) {
        for (const activity of result.recentActivity.slice(0, 50)) {
          await dbQueries.insertUserAction(this.db, {
            address,
            actionType: activity.type,
            poolId: activity.poolId,
            txHash: activity.txHash,
            timestamp: activity.timestamp,
          });
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error in saveToDatabase:', errorMessage);
      throw error;
    }
  }

  /**
   * Get pool interactions from database
   */
  private async getPoolInteractionsFromDB(address: string): Promise<PoolInteraction[]> {
    if (!this.db) return [];

    try {
      const dbInteractions = await dbQueries.getUserPoolInteractions(this.db, address);
      
      return dbInteractions.map(interaction => ({
        poolId: interaction.pool_id,
        totalSwaps: interaction.total_swaps,
        totalVolumeUsd: Number(interaction.total_volume_usd) || 0,
        totalFeesEarned: Number(interaction.total_fees_earned) || 0,
        firstInteraction: interaction.first_interaction ? Number(interaction.first_interaction) : 0,
        lastInteraction: interaction.last_interaction ? Number(interaction.last_interaction) : 0,
      }));
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error fetching pool interactions from DB:', errorMessage);
      return [];
    }
  }

  /**
   * Get recent activity from database
   */
  private async getRecentActivityFromDB(address: string): Promise<Array<{
    type: 'swap' | 'mint' | 'burn' | 'collect';
    poolId: string;
    timestamp: number;
    txHash?: string;
  }>> {
    if (!this.db) return [];

    try {
      const actions = await dbQueries.getRecentUserActions(this.db, address, 50);
      
      return actions.map(action => ({
        type: action.action_type as 'swap' | 'mint' | 'burn' | 'collect',
        poolId: action.pool_id || '',
        timestamp: Number(action.timestamp),
        txHash: action.tx_hash || undefined,
      }));
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error fetching recent activity from DB:', errorMessage);
      return [];
    }
  }

  /**
   * Fetch on-chain user stats from DNASubscriber
   */
  private async fetchOnChainData(address: string): Promise<OnChainUserStats> {
    try {
      const stats = await this.dnaSubscriber.getUserStats(address);
      return {
        totalSwaps: stats.totalSwaps,
        totalVolumeUsd: stats.totalVolumeUsd,
        totalFeesEarned: stats.totalFeesEarned,
        totalPositions: stats.totalPositions,
        activePositions: stats.activePositions,
        uniquePools: stats.uniquePools,
        firstActionTimestamp: stats.firstActionTimestamp,
        lastActionTimestamp: stats.lastActionTimestamp,
      };
    } catch (error: unknown) {
      const appError = error as AppError;
      console.error('Error fetching on-chain data:', appError);
      if (appError.message) {
        console.error('Error message:', appError.message);
      }
      if (appError.code) {
        console.error('Error code:', appError.code);
      }
      return {
        totalSwaps: 0n,
        totalVolumeUsd: 0n,
        totalFeesEarned: 0n,
        totalPositions: 0,
        activePositions: 0,
        uniquePools: 0,
        firstActionTimestamp: 0n,
        lastActionTimestamp: 0n,
      };
    }
  }

  /**
   * Fetch historical data from database if available
   */
  private async fetchDatabaseData(address: string): Promise<DatabaseUserData | null> {
    if (!this.db) return null;

    try {
      // Get recent activity
      const activityResult = await this.db.query(
        `SELECT action_type, pool_id, tx_hash, block_number, timestamp
         FROM user_actions
         WHERE address = $1
         ORDER BY timestamp DESC
         LIMIT 50`,
        [address]
      );

      const recentActivity = activityResult.rows.map((row) => ({
        type: row.action_type === 'swap' ? 'swap' as const : 
              row.action_type === 'mint' ? 'mint' as const :
              row.action_type === 'burn' ? 'burn' as const : 'collect' as const,
        poolId: row.pool_id,
        timestamp: new Date(row.timestamp).getTime() / 1000,
        txHash: row.tx_hash,
      }));

      // Get pool-specific stats
      const poolStatsResult = await this.db.query(
        `SELECT 
           pool_id,
           COUNT(*) as swap_count,
           SUM(amount_usd) as total_volume,
           MIN(timestamp) as first_interaction,
           MAX(timestamp) as last_interaction
         FROM user_actions
         WHERE address = $1 AND action_type = 'swap'
         GROUP BY pool_id`,
        [address]
      );

      return {
        recentActivity,
        poolStats: poolStatsResult.rows,
      };
    } catch (error) {
      console.error('Error fetching database data:', error);
      return null;
    }
  }

  /**
   * Fetch position details for the wallet
   */
  private async fetchPositions(address: string, indexedData?: IndexedWalletData | null): Promise<Position[]> {
    const positions: Position[] = [];
    const tokenIdSet = new Set<string>();

    // Check database first
    if (this.db) {
      try {
        const dbPositions = await dbQueries.getUserPositions(this.db, address);
        console.log(`📊 Found ${dbPositions.length} positions in database for ${address}`);
        
        for (const dbPos of dbPositions) {
          tokenIdSet.add(dbPos.token_id);
          positions.push({
            tokenId: dbPos.token_id,
            poolId: dbPos.pool_id,
            liquidity: dbPos.liquidity || '0',
            tickLower: dbPos.tick_lower || 0,
            tickUpper: dbPos.tick_upper || 0,
            isActive: dbPos.is_active,
            isSubscribed: dbPos.is_subscribed,
            fromDatabase: true,
          });
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error fetching positions from database:', errorMessage);
      }
    }

    // Get positions from DNASubscriber
    try {
      const subscribedTokenIds = await this.dnaSubscriber.getOwnerTokenIds(address);
      
      if (subscribedTokenIds && subscribedTokenIds.length > 0) {
        for (let i = 0; i < Math.min(20, subscribedTokenIds.length); i++) {
          try {
            const tokenId = subscribedTokenIds[i].toString();
            tokenIdSet.add(tokenId);
            
            const positionData = await this.dnaSubscriber.getPosition(subscribedTokenIds[i]) as SubscribedPositionData;
            
            let poolIdHex = '0x';
            if (Array.isArray(positionData.poolId)) {
              poolIdHex = '0x' + positionData.poolId.map((b: number) => 
                b.toString(16).padStart(2, '0')
              ).join('');
            } else if (typeof positionData.poolId === 'string') {
              poolIdHex = positionData.poolId;
            } else {
              poolIdHex = '0x' + positionData.poolId.toString(16).padStart(64, '0');
            }

            positions.push({
              tokenId,
              poolId: poolIdHex,
              liquidity: positionData.liquidity?.toString() || '0',
              tickLower: Number(positionData.tickLower) || 0,
              tickUpper: Number(positionData.tickUpper) || 0,
              isActive: positionData.isActive || false,
              isSubscribed: true,
            });
          } catch (error) {
            console.error(`Error fetching subscribed position ${subscribedTokenIds[i]}:`, error);
          }
        }
      }
    } catch (error) {
      console.log('No subscribed positions found (this is normal if positions not subscribed)');
    }

    // Use indexed data
    if (indexedData && indexedData.positions.length > 0) {
      console.log(`Using indexed data: ${indexedData.positions.length} position transfers found`);
      
      for (const transfer of indexedData.positions) {
        if (tokenIdSet.has(transfer.tokenId)) {
          continue;
        }

        try {
          const currentOwner = await this.positionManager.ownerOf(transfer.tokenId);
          if (currentOwner.toLowerCase() !== address.toLowerCase()) {
            continue;
          }

          const snapshot = await this.dnaReader.getPositionSnapshot(transfer.tokenId) as PositionSnapshot;
          
          if (snapshot.owner && snapshot.owner.toLowerCase() === address.toLowerCase()) {
            let poolIdHex = '0x';
            if (typeof snapshot.poolId === 'string') {
              poolIdHex = snapshot.poolId.startsWith('0x') 
                ? snapshot.poolId 
                : '0x' + snapshot.poolId;
            } else if (snapshot.poolId) {
              const poolIdStr = snapshot.poolId.toString();
              poolIdHex = poolIdStr.startsWith('0x') 
                ? poolIdStr 
                : '0x' + poolIdStr.padStart(64, '0');
            }

            positions.push({
              tokenId: transfer.tokenId,
              poolId: poolIdHex,
              liquidity: snapshot.liquidity?.toString() || '0',
              tickLower: Number(snapshot.tickLower) || 0,
              tickUpper: Number(snapshot.tickUpper) || 0,
              isActive: snapshot.isInRange || false,
              isSubscribed: false,
            });
            tokenIdSet.add(transfer.tokenId);
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          if (!errorMessage.includes('ERC721: invalid token ID')) {
            console.error(`Error fetching indexed position ${transfer.tokenId}:`, errorMessage);
          }
        }
      }
    }

    // Query blockchain if no positions found
    if (positions.length === 0) {
      try {
        console.log(`Querying blockchain for ${address}...`);
        
        const currentBlock = await this.provider.getBlockNumber();
        const fromBlock = UNISWAP_V4_DEPLOYMENT_BLOCK;
        
        console.log(`Querying blocks ${fromBlock} to ${currentBlock} (${currentBlock - fromBlock} blocks)`);
      
        const transferFilter = this.positionManager.filters.Transfer(null, address);
        const CHUNK_SIZE = 50000;
        let allTransfers: TransferEvent[] = [];
        let allFromTransfers: TransferEvent[] = [];
        
        for (let chunkStart = fromBlock; chunkStart < currentBlock; chunkStart += CHUNK_SIZE) {
          const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, currentBlock);
          
          try {
            console.log(`  Querying chunk: ${chunkStart} to ${chunkEnd}...`);
            
        const transfers = await this.positionManager.queryFilter(
            transferFilter,
            chunkStart,
            chunkEnd
          );
          allTransfers.push(...(transfers as TransferEvent[]));
          
          const fromTransfers = await this.positionManager.queryFilter(
            this.positionManager.filters.Transfer(address, null),
            chunkStart,
            chunkEnd
          );
          allFromTransfers.push(...(fromTransfers as TransferEvent[]));
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`Error querying chunk ${chunkStart}-${chunkEnd}:`, errorMessage);
          }
        }
        
        console.log(`Found ${allTransfers.length} Transfer events to ${address}`);

        const receivedTokenIds = new Set<string>();
        for (const event of allTransfers) {
          if (event.args && event.args.tokenId !== undefined) {
            receivedTokenIds.add(String(event.args.tokenId));
          }
        }

        for (const event of allFromTransfers) {
          if (event.args && event.args.to && event.args.to.toLowerCase() !== address.toLowerCase() && event.args.tokenId !== undefined) {
            receivedTokenIds.delete(String(event.args.tokenId));
          }
        }

        console.log(`Found ${receivedTokenIds.size} unique positions for ${address}`);

        let fetchedCount = 0;
        const maxToFetch = 100;

        for (const tokenIdStr of receivedTokenIds) {
          if (tokenIdSet.has(tokenIdStr)) {
            continue;
          }
          
          if (fetchedCount >= maxToFetch) {
            console.log(`⚠️ Reached fetch limit (${maxToFetch}), skipping remaining positions`);
            break;
          }

          try {
            const currentOwner = await this.positionManager.ownerOf(tokenIdStr);
            if (currentOwner.toLowerCase() !== address.toLowerCase()) {
              continue;
            }

            const snapshot = await this.dnaReader.getPositionSnapshot(tokenIdStr) as PositionSnapshot;
            
            if (snapshot.owner && snapshot.owner.toLowerCase() === address.toLowerCase()) {
              let poolIdHex = '0x';
              if (typeof snapshot.poolId === 'string') {
                poolIdHex = snapshot.poolId.startsWith('0x') 
                  ? snapshot.poolId 
                  : '0x' + snapshot.poolId;
              } else if (snapshot.poolId) {
                const poolIdStr = snapshot.poolId.toString();
                poolIdHex = poolIdStr.startsWith('0x') 
                  ? poolIdStr 
                  : '0x' + poolIdStr.padStart(64, '0');
              }

              positions.push({
                tokenId: tokenIdStr,
                poolId: poolIdHex,
                liquidity: snapshot.liquidity?.toString() || '0',
                tickLower: Number(snapshot.tickLower) || 0,
                tickUpper: Number(snapshot.tickUpper) || 0,
                isActive: snapshot.isInRange || false,
                isSubscribed: tokenIdSet.has(tokenIdStr),
              });
              fetchedCount++;
            }
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            if (!errorMessage.includes('ERC721: invalid token ID')) {
              console.error(`Error fetching position ${tokenIdStr}:`, errorMessage);
            }
          }
        }

        console.log(`Fetched ${fetchedCount} additional positions from PositionManager`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error querying PositionManager events:', errorMessage);
      }
    }

    return positions;
  }

  /**
   * Aggregate pool interactions from multiple sources
   */
  private async aggregatePoolInteractions(
    address: string,
    onChainData: OnChainUserStats,
    dbData: DatabaseUserData | null,
    positions: Position[],
    indexedData?: IndexedWalletData | null
  ): Promise<PoolInteraction[]> {
    const poolMap = new Map<string, PoolInteraction>();

    // Add positions to pool map
    for (const position of positions) {
      // Normalize poolId to lowercase for consistent mapping
      const poolId = position.poolId.toLowerCase();
      if (!poolMap.has(poolId)) {
        poolMap.set(poolId, {
          poolId,
          totalSwaps: 0,
          totalVolumeUsd: 0,
          totalFeesEarned: 0,
          firstInteraction: 0,
          lastInteraction: 0,
          positions: [],
        });
      }

      const pool = poolMap.get(poolId)!;
      pool.positions = pool.positions || [];
      pool.positions.push({
        tokenId: position.tokenId,
        liquidity: position.liquidity,
        tickLower: position.tickLower,
        tickUpper: position.tickUpper,
        isActive: position.isActive,
      });
    }

    // Add database stats if available
    if (dbData?.poolStats) {
      for (const stat of dbData.poolStats) {
        // Normalize poolId to lowercase
        const poolId = (stat.pool_id || '').toLowerCase();
        if (!poolId) continue;

        if (!poolMap.has(poolId)) {
          poolMap.set(poolId, {
            poolId,
            totalSwaps: 0,
            totalVolumeUsd: 0,
            totalFeesEarned: 0,
            firstInteraction: 0,
            lastInteraction: 0,
          });
        }

        const pool = poolMap.get(poolId)!;
        const swapCount = parseInt(stat.swap_count, 10) || 0;
        const totalVolume = parseFloat(stat.total_volume) || 0;
        pool.totalSwaps += swapCount;
        pool.totalVolumeUsd += totalVolume;
        
        if (stat.first_interaction) {
          const firstTs = new Date(stat.first_interaction).getTime() / 1000;
          if (pool.firstInteraction === 0 || firstTs < pool.firstInteraction) {
            pool.firstInteraction = firstTs;
          }
        }
        if (stat.last_interaction) {
          const lastTs = new Date(stat.last_interaction).getTime() / 1000;
          if (lastTs > pool.lastInteraction) {
            pool.lastInteraction = lastTs;
          }
        }
      }
    }

    if (indexedData && indexedData.swaps.length > 0) {
      for (const swap of indexedData.swaps) {
        const poolId = swap.poolId.toLowerCase();
        if (!poolId || poolId === '0x0000000000000000000000000000000000000000000000000000000000000000') {
          continue;
        }

        if (!poolMap.has(poolId)) {
          poolMap.set(poolId, {
            poolId,
            totalSwaps: 0,
            totalVolumeUsd: 0,
            totalFeesEarned: 0,
            firstInteraction: 0,
            lastInteraction: 0,
          });
        }

        const pool = poolMap.get(poolId)!;
        pool.totalSwaps += 1;
        
        const volume = (Number(swap.amount0) + Number(swap.amount1)) / 1e18;
        pool.totalVolumeUsd += Math.abs(volume);
        
        if (swap.timestamp > 0) {
          if (!pool.firstInteraction || swap.timestamp < pool.firstInteraction) {
            pool.firstInteraction = swap.timestamp;
          }
          if (swap.timestamp > pool.lastInteraction) {
            pool.lastInteraction = swap.timestamp;
          }
        }
      }
    }

    return Array.from(poolMap.values());
  }

  /**
   * Calculate total volume from swap events
   */
  private calculateVolumeFromSwaps(swaps: Array<{ amount0: bigint; amount1: bigint }>): number {
    let totalVolume = 0;
    for (const swap of swaps) {
      const volume0 = Math.abs(Number(swap.amount0)) / 1e18;
      const volume1 = Math.abs(Number(swap.amount1)) / 1e18;
      totalVolume += Math.max(volume0, volume1);
    }
    return totalVolume;
  }

  /**
   * Build recent activity array from indexed data
   */
  private buildRecentActivityFromIndexedData(indexedData: IndexedWalletData): Array<{
    type: 'swap' | 'mint' | 'burn' | 'collect';
    poolId: string;
    timestamp: number;
    txHash?: string;
  }> {
    const activity: Array<{
      type: 'swap' | 'mint' | 'burn' | 'collect';
      poolId: string;
      timestamp: number;
      txHash?: string;
    }> = [];

    for (const swap of indexedData.swaps.slice(0, 20)) {
      activity.push({
        type: 'swap',
        poolId: swap.poolId,
        timestamp: swap.timestamp,
        txHash: swap.txHash,
      });
    }

    for (const position of indexedData.positions.filter(p => p.type === 'mint').slice(0, 10)) {
      activity.push({
        type: 'mint',
        poolId: '',
        timestamp: position.timestamp,
        txHash: position.txHash,
      });
    }

    for (const position of indexedData.positions.filter(p => p.type === 'burn').slice(0, 10)) {
      activity.push({
        type: 'burn',
        poolId: '',
        timestamp: position.timestamp,
        txHash: position.txHash,
      });
    }

    return activity.sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
  }

  /**
   * Calculate DNA score on-chain
   */
  private async calculateDNAScore(address: string): Promise<bigint> {
    try {
      return await this.dnaSubscriber.calculateDNAScore(address);
    } catch (error) {
      console.error('Error calculating DNA score:', error);
      return 0n;
    }
  }

  /**
   * Get user tier on-chain
   */
  private async getTier(address: string): Promise<string> {
    try {
      return await this.dnaSubscriber.getUserTier(address);
    } catch (error) {
      console.error('Error getting tier:', error);
      return 'Novice';
    }
  }
}
