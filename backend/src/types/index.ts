/**
 * Type definitions for DeFi DNA Platform
 */

import { ethers } from 'ethers';

// Position data structure
export interface Position {
  tokenId: string;
  poolId: string;
  liquidity: string;
  tickLower: number;
  tickUpper: number;
  isActive: boolean;
  isSubscribed: boolean;
  fromDatabase?: boolean;
}

// On-chain data from DNASubscriber contract
export interface OnChainUserStats {
  totalSwaps: bigint;
  totalVolumeUsd: bigint;
  totalFeesEarned: bigint;
  totalPositions: number;
  activePositions: number;
  uniquePools: number;
  firstActionTimestamp: bigint | number;
  lastActionTimestamp: bigint | number;
}

// Database data structure
export interface DatabaseUserData {
  recentActivity?: Array<{
    type: 'swap' | 'mint' | 'burn' | 'collect';
    poolId: string;
    timestamp: number;
    txHash?: string;
  }>;
  poolStats?: Array<{
    pool_id: string;
    swap_count: string;
    total_volume: string;
    first_interaction: Date | null;
    last_interaction: Date | null;
  }>;
}

// Position data from DNASubscriber contract
export interface SubscribedPositionData {
  poolId: string | number[] | bigint;
  liquidity?: bigint | string;
  tickLower: number | bigint;
  tickUpper: number | bigint;
  isActive: boolean;
}

// Position snapshot from DNAReader contract
export interface PositionSnapshot {
  owner: string;
  poolId: string | bigint | number[];
  liquidity?: bigint | string;
  tickLower: number | bigint;
  tickUpper: number | bigint;
  isInRange: boolean;
}

// Transfer event from PositionManager (compatible with ethers EventLog)
export interface TransferEvent {
  args?: {
    from?: string;
    to?: string;
    tokenId?: bigint | string | number;
  } | null;
  blockNumber?: number;
  transactionHash?: string;
}

// Alchemy API transfer response
export interface AlchemyTransfer {
  hash?: string;
  blockNum?: string | number;
  blockTimestamp?: string | Date;
  from?: string;
  to?: string;
  tokenId?: string | number;
  tokenIds?: string[] | number[];
  value?: bigint | string | number;
}

// Alchemy JSON-RPC API response structure
export interface AlchemyJsonRpcResponse {
  id: number;
  jsonrpc: string;
  result?: {
    transfers?: AlchemyTransfer[];
    pageKey?: string;
  };
  error?: {
    message?: string;
    code?: number;
  };
}

// Error type for better error handling
export interface AppError extends Error {
  code?: string | number;
  statusCode?: number;
}
