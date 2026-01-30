import { Pool } from 'pg';
import { ethers } from 'ethers';

/**
 * Database Query Helpers
 * Provides functions for common database operations
 */

export interface UserRow {
  address: string;
  dna_score: number;
  tier: string;
  total_swaps: number;
  total_volume_usd: number;
  total_fees_earned: number;
  total_positions: number;
  active_positions: number;
  unique_pools: number;
  first_action_timestamp: number | null;
  last_action_timestamp: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface PositionRow {
  token_id: string;
  owner_address: string;
  pool_id: string;
  liquidity: string | null;
  tick_lower: number | null;
  tick_upper: number | null;
  is_active: boolean;
  is_subscribed: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface TransactionRow {
  tx_hash: string;
  block_number: number;
  block_timestamp: number;
  from_address: string | null;
  to_address: string | null;
  action_type: string;
  pool_id: string | null;
  token_id: string | null;
  amount_0: string | null;
  amount_1: string | null;
  amount_usd: number | null;
  created_at: Date;
}

export interface PoolInteractionRow {
  id: number;
  user_address: string;
  pool_id: string;
  total_swaps: number;
  total_volume_usd: number;
  total_fees_earned: number;
  first_interaction: number | null;
  last_interaction: number | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Upsert user data (insert or update)
 */
export async function upsertUser(
  pool: Pool,
  address: string,
  data: {
    dnaScore?: number;
    tier?: string;
    totalSwaps?: number;
    totalVolumeUsd?: number;
    totalFeesEarned?: number;
    totalPositions?: number;
    activePositions?: number;
    uniquePools?: number;
    firstActionTimestamp?: number;
    lastActionTimestamp?: number;
  }
): Promise<void> {
  const normalizedAddress = ethers.getAddress(address);

  await pool.query(
    `INSERT INTO users (
      address, dna_score, tier, total_swaps, total_volume_usd, 
      total_fees_earned, total_positions, active_positions, 
      unique_pools, first_action_timestamp, last_action_timestamp, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
    ON CONFLICT (address) DO UPDATE SET
      dna_score = COALESCE(EXCLUDED.dna_score, users.dna_score),
      tier = COALESCE(EXCLUDED.tier, users.tier),
      total_swaps = COALESCE(EXCLUDED.total_swaps, users.total_swaps),
      total_volume_usd = COALESCE(EXCLUDED.total_volume_usd, users.total_volume_usd),
      total_fees_earned = COALESCE(EXCLUDED.total_fees_earned, users.total_fees_earned),
      total_positions = COALESCE(EXCLUDED.total_positions, users.total_positions),
      active_positions = COALESCE(EXCLUDED.active_positions, users.active_positions),
      unique_pools = COALESCE(EXCLUDED.unique_pools, users.unique_pools),
      first_action_timestamp = LEAST(
        COALESCE(EXCLUDED.first_action_timestamp, users.first_action_timestamp),
        COALESCE(users.first_action_timestamp, EXCLUDED.first_action_timestamp)
      ),
      last_action_timestamp = GREATEST(
        COALESCE(EXCLUDED.last_action_timestamp, users.last_action_timestamp),
        COALESCE(users.last_action_timestamp, EXCLUDED.last_action_timestamp)
      ),
      updated_at = NOW()`,
    [
      normalizedAddress,
      data.dnaScore ?? null,
      data.tier ?? null,
      data.totalSwaps ?? null,
      data.totalVolumeUsd ?? null,
      data.totalFeesEarned ?? null,
      data.totalPositions ?? null,
      data.activePositions ?? null,
      data.uniquePools ?? null,
      data.firstActionTimestamp ?? null,
      data.lastActionTimestamp ?? null,
    ]
  );
}

/**
 * Get user data from database
 */
export async function getUser(
  pool: Pool,
  address: string
): Promise<UserRow | null> {
  const normalizedAddress = ethers.getAddress(address);

  const result = await pool.query<UserRow>(
    'SELECT * FROM users WHERE address = $1',
    [normalizedAddress]
  );

  return result.rows[0] || null;
}

/**
 * Upsert position data
 */
export async function upsertPosition(
  pool: Pool,
  position: {
    tokenId: string;
    ownerAddress: string;
    poolId: string;
    liquidity?: string;
    tickLower?: number;
    tickUpper?: number;
    isActive?: boolean;
    isSubscribed?: boolean;
  }
): Promise<void> {
  await pool.query(
    `INSERT INTO positions (
      token_id, owner_address, pool_id, liquidity, 
      tick_lower, tick_upper, is_active, is_subscribed, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    ON CONFLICT (token_id) DO UPDATE SET
      owner_address = EXCLUDED.owner_address,
      pool_id = EXCLUDED.pool_id,
      liquidity = COALESCE(EXCLUDED.liquidity, positions.liquidity),
      tick_lower = COALESCE(EXCLUDED.tick_lower, positions.tick_lower),
      tick_upper = COALESCE(EXCLUDED.tick_upper, positions.tick_upper),
      is_active = COALESCE(EXCLUDED.is_active, positions.is_active),
      is_subscribed = COALESCE(EXCLUDED.is_subscribed, positions.is_subscribed),
      updated_at = NOW()`,
    [
      position.tokenId,
      ethers.getAddress(position.ownerAddress),
      position.poolId.toLowerCase(),
      position.liquidity || null,
      position.tickLower || null,
      position.tickUpper || null,
      position.isActive ?? true,
      position.isSubscribed ?? false,
    ]
  );
}

/**
 * Get positions for a user
 */
export async function getUserPositions(
  pool: Pool,
  address: string
): Promise<PositionRow[]> {
  const normalizedAddress = ethers.getAddress(address);

  const result = await pool.query<PositionRow>(
    'SELECT * FROM positions WHERE owner_address = $1 ORDER BY created_at DESC',
    [normalizedAddress]
  );

  return result.rows;
}

/**
 * Insert transaction
 */
export async function insertTransaction(
  pool: Pool,
  transaction: {
    txHash: string;
    blockNumber: number;
    blockTimestamp: number;
    fromAddress?: string;
    toAddress?: string;
    actionType: string;
    poolId?: string;
    tokenId?: string;
    amount0?: bigint | string;
    amount1?: bigint | string;
    amountUsd?: number;
  }
): Promise<void> {
  await pool.query(
    `INSERT INTO transactions (
      tx_hash, block_number, block_timestamp, from_address, to_address,
      action_type, pool_id, token_id, amount_0, amount_1, amount_usd
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (tx_hash) DO NOTHING`,
    [
      transaction.txHash,
      transaction.blockNumber,
      transaction.blockTimestamp,
      transaction.fromAddress ? ethers.getAddress(transaction.fromAddress) : null,
      transaction.toAddress ? ethers.getAddress(transaction.toAddress) : null,
      transaction.actionType,
      transaction.poolId ? transaction.poolId.toLowerCase() : null,
      transaction.tokenId || null,
      transaction.amount0?.toString() || null,
      transaction.amount1?.toString() || null,
      transaction.amountUsd || null,
    ]
  );
}

/**
 * Upsert pool interaction
 */
export async function upsertPoolInteraction(
  pool: Pool,
  interaction: {
    userAddress: string;
    poolId: string;
    totalSwaps?: number;
    totalVolumeUsd?: number;
    totalFeesEarned?: number;
    firstInteraction?: number;
    lastInteraction?: number;
  }
): Promise<void> {
  await pool.query(
    `INSERT INTO pool_interactions (
      user_address, pool_id, total_swaps, total_volume_usd,
      total_fees_earned, first_interaction, last_interaction, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    ON CONFLICT (user_address, pool_id) DO UPDATE SET
      total_swaps = COALESCE(EXCLUDED.total_swaps, pool_interactions.total_swaps),
      total_volume_usd = COALESCE(EXCLUDED.total_volume_usd, pool_interactions.total_volume_usd),
      total_fees_earned = COALESCE(EXCLUDED.total_fees_earned, pool_interactions.total_fees_earned),
      first_interaction = LEAST(
        COALESCE(EXCLUDED.first_interaction, pool_interactions.first_interaction),
        COALESCE(pool_interactions.first_interaction, EXCLUDED.first_interaction)
      ),
      last_interaction = GREATEST(
        COALESCE(EXCLUDED.last_interaction, pool_interactions.last_interaction),
        COALESCE(pool_interactions.last_interaction, EXCLUDED.last_interaction)
      ),
      updated_at = NOW()`,
    [
      ethers.getAddress(interaction.userAddress),
      interaction.poolId.toLowerCase(),
      interaction.totalSwaps ?? null,
      interaction.totalVolumeUsd ?? null,
      interaction.totalFeesEarned ?? null,
      interaction.firstInteraction ?? null,
      interaction.lastInteraction ?? null,
    ]
  );
}

/**
 * Get pool interactions for a user
 */
export async function getUserPoolInteractions(
  pool: Pool,
  address: string
): Promise<PoolInteractionRow[]> {
  const normalizedAddress = ethers.getAddress(address);

  const result = await pool.query<PoolInteractionRow>(
    'SELECT * FROM pool_interactions WHERE user_address = $1 ORDER BY total_volume_usd DESC',
    [normalizedAddress]
  );

  return result.rows;
}

/**
 * Insert user action (for recent activity timeline)
 */
export async function insertUserAction(
  pool: Pool,
  action: {
    address: string;
    actionType: string;
    poolId?: string;
    txHash?: string;
    blockNumber?: number;
    timestamp: number;
  }
): Promise<void> {
  await pool.query(
    `INSERT INTO user_actions (
      address, action_type, pool_id, tx_hash, block_number, timestamp
    ) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT DO NOTHING`,
    [
      ethers.getAddress(action.address),
      action.actionType,
      action.poolId ? action.poolId.toLowerCase() : null,
      action.txHash || null,
      action.blockNumber || null,
      action.timestamp,
    ]
  );
}

/**
 * Get recent user actions
 */
export async function getRecentUserActions(
  pool: Pool,
  address: string,
  limit: number = 50
): Promise<Array<{
  action_type: string;
  pool_id: string | null;
  tx_hash: string | null;
  timestamp: number;
}>> {
  const normalizedAddress = ethers.getAddress(address);

  const result = await pool.query(
    `SELECT action_type, pool_id, tx_hash, timestamp
     FROM user_actions
     WHERE address = $1
     ORDER BY timestamp DESC
     LIMIT $2`,
    [normalizedAddress, limit]
  );

  return result.rows;
}

/**
 * Get leaderboard users
 */
export async function getLeaderboard(
  pool: Pool,
  limit: number = 100,
  offset: number = 0
): Promise<UserRow[]> {
  const result = await pool.query<UserRow>(
    `SELECT * FROM users
     WHERE dna_score > 0
     ORDER BY dna_score DESC, total_volume_usd DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return result.rows;
}

/**
 * Get leaderboard count
 */
export async function getLeaderboardCount(pool: Pool): Promise<number> {
  const result = await pool.query<{ count: string }>(
    'SELECT COUNT(*) as count FROM users WHERE dna_score > 0'
  );

  return parseInt(result.rows[0].count, 10);
}

// --- Analytics queries ---

export interface PlatformOverviewRow {
  total_users: string;
  total_volume_usd: string;
  total_fees_earned: string;
  total_positions: string;
  active_positions: string;
  avg_dna_score: string;
}

/**
 * Get platform-wide aggregated statistics for analytics overview
 */
export async function getPlatformOverview(pool: Pool): Promise<PlatformOverviewRow | null> {
  const result = await pool.query<PlatformOverviewRow>(
    `SELECT
      COUNT(*)::text AS total_users,
      COALESCE(SUM(total_volume_usd), 0)::text AS total_volume_usd,
      COALESCE(SUM(total_fees_earned), 0)::text AS total_fees_earned,
      COALESCE(SUM(total_positions), 0)::text AS total_positions,
      COALESCE(SUM(active_positions), 0)::text AS active_positions,
      COALESCE(ROUND(AVG(dna_score)::numeric, 2), 0)::text AS avg_dna_score
     FROM users
     WHERE dna_score > 0`
  );
  return result.rows[0] || null;
}

export interface TierDistributionRow {
  tier: string;
  count: string;
}

/**
 * Get user count per tier for analytics
 */
export async function getTierDistribution(pool: Pool): Promise<TierDistributionRow[]> {
  const result = await pool.query<TierDistributionRow>(
    `SELECT tier, COUNT(*)::text AS count
     FROM users
     WHERE dna_score > 0 AND tier IS NOT NULL AND tier != ''
     GROUP BY tier
     ORDER BY count DESC`
  );
  return result.rows;
}

export interface TopPoolRow {
  pool_id: string;
  total_volume: string;
  total_swaps: string;
  unique_users: string;
  fees_earned: string;
}

/**
 * Get top pools by volume for analytics
 */
export async function getTopPools(pool: Pool, limit: number = 10): Promise<TopPoolRow[]> {
  const result = await pool.query<TopPoolRow>(
    `SELECT
      pool_id,
      COALESCE(SUM(total_volume_usd), 0)::text AS total_volume,
      COALESCE(SUM(total_swaps), 0)::text AS total_swaps,
      COUNT(DISTINCT user_address)::text AS unique_users,
      COALESCE(SUM(total_fees_earned), 0)::text AS fees_earned
     FROM pool_interactions
     GROUP BY pool_id
     ORDER BY SUM(total_volume_usd) DESC NULLS LAST
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

export interface ActivityTimeSeriesRow {
  date: string;
  swaps: string;
  mints: string;
  burns: string;
  collects: string;
}

/**
 * Get daily activity counts for time-series chart (from user_actions)
 */
export async function getActivityTimeSeries(
  pool: Pool,
  days: number = 30
): Promise<ActivityTimeSeriesRow[]> {
  const result = await pool.query<ActivityTimeSeriesRow>(
    `SELECT
      to_char(to_timestamp(timestamp)::date, 'YYYY-MM-DD') AS date,
      COUNT(*) FILTER (WHERE action_type = 'swap')::text AS swaps,
      COUNT(*) FILTER (WHERE action_type = 'mint')::text AS mints,
      COUNT(*) FILTER (WHERE action_type = 'burn')::text AS burns,
      COUNT(*) FILTER (WHERE action_type = 'collect')::text AS collects
     FROM user_actions
     WHERE timestamp >= EXTRACT(EPOCH FROM (NOW() - ($1 || ' days')::interval))::bigint
     GROUP BY to_timestamp(timestamp)::date
     ORDER BY date ASC`,
    [days]
  );
  return result.rows;
}

export interface ScoreDistributionRow {
  range: string;
  count: string;
}

/**
 * Get DNA score distribution in buckets (0-10, 11-20, ... 91-100)
 */
export async function getScoreDistribution(pool: Pool): Promise<ScoreDistributionRow[]> {
  const result = await pool.query<ScoreDistributionRow>(
    `SELECT
      CASE
        WHEN dna_score <= 10 THEN '0-10'
        WHEN dna_score <= 20 THEN '11-20'
        WHEN dna_score <= 30 THEN '21-30'
        WHEN dna_score <= 40 THEN '31-40'
        WHEN dna_score <= 50 THEN '41-50'
        WHEN dna_score <= 60 THEN '51-60'
        WHEN dna_score <= 70 THEN '61-70'
        WHEN dna_score <= 80 THEN '71-80'
        WHEN dna_score <= 90 THEN '81-90'
        ELSE '91-100'
      END AS range,
      COUNT(*)::text AS count
     FROM users
     WHERE dna_score >= 0 AND dna_score <= 100
     GROUP BY 1
     ORDER BY MIN(dna_score) ASC`
  );
  return result.rows;
}
