import { ethers } from 'ethers';
import { Pool } from 'pg';
import * as db from '../db/queries';
import { broadcastLeaderboardUpdate, broadcastUserAction } from '../websocket';
import { PriceFeedService } from '../services/priceFeedService';

const POSITION_MANAGER_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'function getPoolAndPositionInfo(uint256 tokenId) view returns (tuple, uint256)',
  'function getPositionLiquidity(uint256 tokenId) view returns (uint128)',
  'function ownerOf(uint256 tokenId) view returns (address)',
];

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const CHUNK_SIZE = 2000;
const UNISWAP_V4_DEPLOYMENT_BLOCK = 14506421;

export interface BackgroundIndexerConfig {
  rpcUrl: string;
  positionManagerAddress: string;
  dbPool: Pool;
  chainId?: number;
  enableRealtime?: boolean;
  enableHistoricalSync?: boolean;
}

export class BackgroundIndexer {
  private provider: ethers.JsonRpcProvider;
  private positionManager: ethers.Contract;
  private dbPool: Pool;
  private priceFeed: PriceFeedService;
  private lastProcessedBlock: number = 0;
  private isRunning: boolean = false;
  private stopRequested: boolean = false;

  constructor(config: BackgroundIndexerConfig) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.positionManager = new ethers.Contract(
      config.positionManagerAddress,
      POSITION_MANAGER_ABI,
      this.provider
    );
    this.dbPool = config.dbPool;
    this.priceFeed = new PriceFeedService(config.rpcUrl);
  }

  /**
   * Start real-time indexing: watch new blocks and process Transfer events.
   */
  async startRealtime(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.stopRequested = false;

    const currentBlock = await this.provider.getBlockNumber();
    this.lastProcessedBlock = currentBlock;
    console.log(`[Indexer] Starting real-time from block ${currentBlock}`);

    this.provider.on('block', async (blockNumber: number) => {
      if (this.stopRequested) return;
      try {
        await this.processBlockRange(this.lastProcessedBlock + 1, blockNumber);
        this.lastProcessedBlock = blockNumber;
      } catch (err: any) {
        console.error('[Indexer] Error processing block:', err.message);
      }
    });
  }

  /**
   * Run historical sync from V4 deployment block to current (chunked).
   */
  async runHistoricalSync(): Promise<void> {
    const currentBlock = await this.provider.getBlockNumber();
    let fromBlock = UNISWAP_V4_DEPLOYMENT_BLOCK;
    console.log(`[Indexer] Historical sync from ${fromBlock} to ${currentBlock}`);

    while (fromBlock < currentBlock && !this.stopRequested) {
      const toBlock = Math.min(fromBlock + CHUNK_SIZE - 1, currentBlock);
      try {
        await this.processBlockRange(fromBlock, toBlock);
        fromBlock = toBlock + 1;
        const pct = ((toBlock - UNISWAP_V4_DEPLOYMENT_BLOCK) / (currentBlock - UNISWAP_V4_DEPLOYMENT_BLOCK)) * 100;
        if (Math.floor(pct) % 10 === 0 && fromBlock > UNISWAP_V4_DEPLOYMENT_BLOCK + CHUNK_SIZE) {
          console.log(`[Indexer] Historical progress: ${pct.toFixed(1)}%`);
        }
      } catch (err: any) {
        console.error(`[Indexer] Historical chunk ${fromBlock}-${toBlock} failed:`, err.message);
        fromBlock = toBlock + 1;
      }
    }
    console.log('[Indexer] Historical sync complete');
  }

  /**
   * Process Transfer events in a block range and persist to DB.
   */
  private async processBlockRange(fromBlock: number, toBlock: number): Promise<void> {
    const filter = this.positionManager.filters.Transfer();
    const events = await this.positionManager.queryFilter(filter, fromBlock, toBlock);

    for (const event of events) {
      if (this.stopRequested) break;
      try {
        const ev = event as ethers.EventLog;
        const from = ev.args?.from?.toLowerCase?.() ?? '';
        const to = ev.args?.to?.toLowerCase?.() ?? '';
        const tokenId = ev.args?.tokenId?.toString?.() ?? '';

        if (!tokenId) continue;

        const block = await this.provider.getBlock(event.blockNumber).catch(() => null);
        const blockTimestamp = block?.timestamp ?? Math.floor(Date.now() / 1000);

        if (from === ZERO_ADDRESS) {
          await this.handleMint(tokenId, to, event.blockNumber, blockTimestamp, event.transactionHash);
        } else if (to === ZERO_ADDRESS) {
          await this.handleBurn(tokenId, from, event.blockNumber, blockTimestamp, event.transactionHash);
        } else {
          await this.handleTransfer(tokenId, from, to, event.blockNumber, blockTimestamp, event.transactionHash);
        }
      } catch (err: any) {
        console.error('[Indexer] Process event error:', err.message);
      }
    }
  }

  private async handleMint(
    tokenId: string,
    owner: string,
    blockNumber: number,
    blockTimestamp: number,
    txHash: string
  ): Promise<void> {
    await db.upsertUser(this.dbPool, owner, {
      totalPositions: 1,
      activePositions: 1,
      firstActionTimestamp: this.dbPool ? blockTimestamp : undefined,
      lastActionTimestamp: blockTimestamp,
    });

    let poolId = '0x0';
    let liquidity: string | undefined;
    try {
      const liq = await this.positionManager.getPositionLiquidity(tokenId);
      liquidity = liq.toString();
      // PoolId from PoolKey requires contract-specific encoding; keep 0x0 for now
    } catch (_e) {
      // store without pool details
    }

    await db.upsertPosition(this.dbPool, {
      tokenId,
      ownerAddress: owner,
      poolId,
      liquidity,
      isActive: true,
      isSubscribed: false,
    });

    await db.insertUserAction(this.dbPool, {
      address: owner,
      actionType: 'mint',
      poolId: poolId !== '0x0' ? poolId : undefined,
      txHash,
      blockNumber,
      timestamp: blockTimestamp,
    });

    broadcastUserAction({
      address: owner,
      actionType: 'mint',
      poolId: poolId !== '0x0' ? poolId : undefined,
      timestamp: Date.now(),
    });
  }

  private async handleBurn(
    tokenId: string,
    owner: string,
    blockNumber: number,
    blockTimestamp: number,
    txHash: string
  ): Promise<void> {
    await db.upsertPosition(this.dbPool, {
      tokenId,
      ownerAddress: owner,
      poolId: '0x0',
      isActive: false,
    });

    await this.dbPool.query(
      'UPDATE users SET active_positions = GREATEST(0, COALESCE(active_positions, 0) - 1), last_action_timestamp = $2, updated_at = NOW() WHERE address = $1',
      [owner, blockTimestamp]
    );

    await db.insertUserAction(this.dbPool, {
      address: owner,
      actionType: 'burn',
      txHash,
      blockNumber,
      timestamp: blockTimestamp,
    });

    broadcastUserAction({ address: owner, actionType: 'burn', timestamp: Date.now() });
  }

  private async handleTransfer(
    tokenId: string,
    from: string,
    to: string,
    blockNumber: number,
    blockTimestamp: number,
    txHash: string
  ): Promise<void> {
    await db.upsertPosition(this.dbPool, {
      tokenId,
      ownerAddress: to,
      poolId: '0x0',
      isActive: true,
    });

    await db.upsertUser(this.dbPool, to, {
      lastActionTimestamp: blockTimestamp,
    });

    await db.insertUserAction(this.dbPool, {
      address: to,
      actionType: 'transfer',
      txHash,
      blockNumber,
      timestamp: blockTimestamp,
    });

    broadcastUserAction({ address: to, actionType: 'transfer', timestamp: Date.now() });
  }

  stop(): void {
    this.stopRequested = true;
    this.isRunning = false;
  }
}

/**
 * Start background indexer if DB and RPC are configured.
 */
export function startBackgroundIndexerIfConfigured(
  rpcUrl: string,
  positionManagerAddress: string,
  dbPool: Pool | undefined,
  options: { enableRealtime?: boolean; enableHistoricalSync?: boolean } = {}
): BackgroundIndexer | null {
  if (!dbPool || !rpcUrl || !positionManagerAddress) return null;

  const indexer = new BackgroundIndexer({
    rpcUrl,
    positionManagerAddress,
    dbPool,
    enableRealtime: options.enableRealtime ?? true,
    enableHistoricalSync: options.enableHistoricalSync ?? false,
  });

  if (options.enableRealtime !== false) {
    indexer.startRealtime().catch((err) => console.error('[Indexer] startRealtime failed:', err));
  }
  if (options.enableHistoricalSync) {
    indexer.runHistoricalSync().catch((err) => console.error('[Indexer] historical sync failed:', err));
  }

  return indexer;
}
