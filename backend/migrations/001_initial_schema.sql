-- DeFi DNA Platform - Initial Database Schema
-- This migration creates all tables needed for the platform

-- Users table - stores wallet addresses and their aggregated stats
CREATE TABLE IF NOT EXISTS users (
  address VARCHAR(42) PRIMARY KEY,
  dna_score INTEGER DEFAULT 0,
  tier VARCHAR(20) DEFAULT 'Novice',
  total_swaps INTEGER DEFAULT 0,
  total_volume_usd NUMERIC(20,2) DEFAULT 0,
  total_fees_earned NUMERIC(20,2) DEFAULT 0,
  total_positions INTEGER DEFAULT 0,
  active_positions INTEGER DEFAULT 0,
  unique_pools INTEGER DEFAULT 0,
  first_action_timestamp BIGINT,
  last_action_timestamp BIGINT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Positions table - stores Uniswap V4 position NFTs
CREATE TABLE IF NOT EXISTS positions (
  token_id VARCHAR(78) PRIMARY KEY,
  owner_address VARCHAR(42) NOT NULL,
  pool_id VARCHAR(66) NOT NULL,
  liquidity NUMERIC(78,0),
  tick_lower INTEGER,
  tick_upper INTEGER,
  is_active BOOLEAN DEFAULT true,
  is_subscribed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Transactions table - stores all on-chain transactions
CREATE TABLE IF NOT EXISTS transactions (
  tx_hash VARCHAR(66) PRIMARY KEY,
  block_number BIGINT NOT NULL,
  block_timestamp BIGINT NOT NULL,
  from_address VARCHAR(42),
  to_address VARCHAR(42),
  action_type VARCHAR(20) NOT NULL, -- swap, mint, burn, collect
  pool_id VARCHAR(66),
  token_id VARCHAR(78),
  amount_0 NUMERIC(78,0),
  amount_1 NUMERIC(78,0),
  amount_usd NUMERIC(20,2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Pool interactions table - aggregates user activity per pool
CREATE TABLE IF NOT EXISTS pool_interactions (
  id SERIAL PRIMARY KEY,
  user_address VARCHAR(42) NOT NULL,
  pool_id VARCHAR(66) NOT NULL,
  total_swaps INTEGER DEFAULT 0,
  total_volume_usd NUMERIC(20,2) DEFAULT 0,
  total_fees_earned NUMERIC(20,2) DEFAULT 0,
  first_interaction BIGINT,
  last_interaction BIGINT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_address, pool_id)
);

-- User actions table - for recent activity timeline
CREATE TABLE IF NOT EXISTS user_actions (
  id SERIAL PRIMARY KEY,
  address VARCHAR(42) NOT NULL,
  action_type VARCHAR(20) NOT NULL, -- swap, mint, burn, collect
  pool_id VARCHAR(66),
  tx_hash VARCHAR(66),
  block_number BIGINT,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_positions_owner ON positions(owner_address);
CREATE INDEX IF NOT EXISTS idx_positions_pool ON positions(pool_id);
CREATE INDEX IF NOT EXISTS idx_positions_active ON positions(is_active);
CREATE INDEX IF NOT EXISTS idx_transactions_block ON transactions(block_number);
CREATE INDEX IF NOT EXISTS idx_transactions_from ON transactions(from_address);
CREATE INDEX IF NOT EXISTS idx_transactions_to ON transactions(to_address);
CREATE INDEX IF NOT EXISTS idx_transactions_pool ON transactions(pool_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(action_type);
CREATE INDEX IF NOT EXISTS idx_pool_interactions_user ON pool_interactions(user_address);
CREATE INDEX IF NOT EXISTS idx_pool_interactions_pool ON pool_interactions(pool_id);
CREATE INDEX IF NOT EXISTS idx_user_actions_address ON user_actions(address);
CREATE INDEX IF NOT EXISTS idx_user_actions_timestamp ON user_actions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_user_actions_type ON user_actions(action_type);

-- Add foreign key constraints (optional, can be removed if causing issues)
-- ALTER TABLE positions ADD CONSTRAINT fk_positions_owner FOREIGN KEY (owner_address) REFERENCES users(address) ON DELETE CASCADE;
-- ALTER TABLE pool_interactions ADD CONSTRAINT fk_pool_interactions_user FOREIGN KEY (user_address) REFERENCES users(address) ON DELETE CASCADE;
-- ALTER TABLE user_actions ADD CONSTRAINT fk_user_actions_user FOREIGN KEY (address) REFERENCES users(address) ON DELETE CASCADE;
