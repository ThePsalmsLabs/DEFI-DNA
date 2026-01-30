import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { Pool } from 'pg';
import { ethers } from 'ethers';
import { SearchService } from './services/searchService';
import { setWebSocketServer } from './websocket';
import { startBackgroundIndexerIfConfigured } from './indexer/backgroundIndexer';
import { logger, captureException } from './utils/logger';

// Load environment variables
dotenv.config();

// Optional Sentry error tracking (captureException uses this when set)
if (process.env.SENTRY_DSN) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 0.1,
    });
    (global as any).__sentry = Sentry;
    logger.info('Sentry error tracking enabled');
  } catch (e) {
    logger.warn('Sentry init skipped', { error: (e as Error).message });
  }
}

const app = express();
const PORT = process.env.PORT || 4000;

// Initialize database connection if available (DATABASE_URL or DB_* vars)
let dbPool: Pool | undefined;
const hasDbUrl = !!process.env.DATABASE_URL;
const hasDbVars = process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER;
if (hasDbUrl || hasDbVars) {
  try {
    dbPool = hasDbUrl
      ? new Pool({
          connectionString: process.env.DATABASE_URL,
          connectionTimeoutMillis: 5000,
          idleTimeoutMillis: 30000,
          max: 10,
        })
      : new Pool({
          host: process.env.DB_HOST,
          port: parseInt(process.env.DB_PORT || '5432'),
          database: process.env.DB_NAME,
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
          connectionTimeoutMillis: 5000,
          idleTimeoutMillis: 30000,
          max: 10,
        });

    dbPool.query('SELECT NOW()', (err) => {
      if (err) {
        console.warn('⚠️ Database connection test failed:', err.message);
        dbPool = undefined;
      } else {
        console.log('✅ Database connection initialized and tested');
      }
    });

    dbPool.on('error', (err) => {
      console.error('⚠️ Database pool error:', err.message);
    });
  } catch (error: any) {
    console.warn('⚠️ Database connection failed, continuing without DB:', error.message);
    dbPool = undefined;
  }
} else {
  console.log('ℹ️ Database not configured - set DATABASE_URL or DB_HOST/DB_NAME/DB_USER');
}

// Start background indexer when DB and RPC are configured
const positionManagerAddress = process.env.POSITION_MANAGER_ADDRESS || '0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e';
const rpcUrlForIndexer = process.env.RPC_URL_BASE || process.env.RPC_URL || '';
if (dbPool && rpcUrlForIndexer && positionManagerAddress) {
  const indexer = startBackgroundIndexerIfConfigured(
    rpcUrlForIndexer,
    positionManagerAddress,
    dbPool,
    { enableRealtime: process.env.INDEXER_REALTIME !== 'false', enableHistoricalSync: process.env.INDEXER_HISTORICAL_SYNC === 'true' }
  );
  if (indexer) console.log('✅ Background indexer started');
}

// Initialize search service
let searchService: SearchService | undefined;
try {
  const rpcUrl = process.env.RPC_URL_BASE || process.env.RPC_URL || '';
  const dnaSubscriberAddress = process.env.DNA_SUBSCRIBER_ADDRESS || '';
  const dnaReaderAddress = process.env.DNA_READER_ADDRESS || '';

  if (rpcUrl && dnaSubscriberAddress && dnaReaderAddress) {
    const chainId = parseInt(process.env.CHAIN_ID || '8453'); // Base Mainnet default
    searchService = new SearchService(
      rpcUrl,
      dnaSubscriberAddress,
      dnaReaderAddress,
      dbPool,
      chainId
    );
    console.log('✅ Search service initialized');
  } else {
    console.warn('⚠️ Search service not initialized - missing RPC or contract addresses');
  }
} catch (error) {
  console.error('❌ Failed to initialize search service:', error);
}

// Production middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX, 10) : 60,
    message: { error: 'Too many requests', message: 'Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  })
);
app.use(cors({
  origin: process.env.NODE_ENV === 'production' && process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map((o) => o.trim())
    : process.env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'defi-dna-backend',
    version: '1.0.0',
    searchService: searchService ? 'available' : 'unavailable'
  });
});

// Search endpoint
app.get('/api/v1/search', async (req, res) => {
  try {
    const wallet = req.query.wallet as string;

    if (!wallet) {
      return res.status(400).json({ 
        error: 'Wallet address is required',
        message: 'Please provide a wallet address in the query parameter: ?wallet=0x...'
      });
    }
    if (!ethers.isAddress(wallet)) {
      return res.status(400).json({ 
        error: 'Invalid address',
        message: 'Please provide a valid Ethereum address (0x followed by 40 hex characters).'
      });
    }

    if (!searchService) {
      return res.status(503).json({ 
        error: 'Search service unavailable',
        message: 'Search service is not properly configured. Please check backend configuration.'
      });
    }

    // Add timeout protection for search requests
    let result;
    try {
      result = await Promise.race([
        searchService.searchWallet(wallet),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Search timeout after 30 seconds')), 30000)
        )
      ]) as any;
    } catch (error: any) {
      if (error.message?.includes('timeout')) {
        return res.status(504).json({ 
          error: 'Request timeout',
          message: 'The search request took too long. Please try again.'
        });
      }
      throw error; // Re-throw other errors to be caught by outer try-catch
    }

    res.json(result);
  } catch (error: any) {
    logger.error('Search error', { error: error?.message, wallet: req.query.wallet });
    res.status(500).json({ 
      error: 'Search failed',
      message: error.message || 'An error occurred while searching for wallet data'
    });
  }
});

// Leaderboard endpoint (CRITICAL-3: database-powered)
app.get('/api/v1/leaderboard', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    if (!dbPool) {
      return res.status(503).json({
        error: 'Database unavailable',
        message: 'Leaderboard requires database connection. Please configure database.',
        data: []
      });
    }

    // Import queries dynamically to avoid issues if DB is not available
    const dbQueries = await import('./db/queries');
    
    const users = await dbQueries.getLeaderboard(dbPool, limit, offset);
    const total = await dbQueries.getLeaderboardCount(dbPool);

    res.json({
      users: users.map(user => ({
        address: user.address,
        dnaScore: user.dna_score,
        tier: user.tier,
        totalSwaps: user.total_swaps,
        totalVolumeUsd: Number(user.total_volume_usd) || 0,
        totalFeesEarned: Number(user.total_fees_earned) || 0,
        totalPositions: user.total_positions,
        activePositions: user.active_positions,
        uniquePools: user.unique_pools,
        firstActionTimestamp: user.first_action_timestamp ? Number(user.first_action_timestamp) : null,
        lastActionTimestamp: user.last_action_timestamp ? Number(user.last_action_timestamp) : null,
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  } catch (error: any) {
    console.error('Leaderboard error:', error);
    res.status(500).json({
      error: 'Failed to fetch leaderboard',
      message: error.message || 'An error occurred while fetching leaderboard data',
      data: []
    });
  }
});

app.get('/api/v1/profile/:address', async (req, res) => {
  try {
    const address = req.params.address;

    if (!address || !ethers.isAddress(address)) {
      return res.status(400).json({ 
        error: 'Invalid address',
        message: 'Please provide a valid Ethereum address'
      });
    }

    if (!searchService) {
      return res.status(503).json({ 
        error: 'Search service unavailable',
        message: 'Search service is not properly configured. Please check backend configuration.'
      });
    }

    // Use search service to get wallet data with timeout protection
    let walletData;
    try {
      walletData = await Promise.race([
        searchService.searchWallet(address),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Search timeout after 30 seconds')), 30000)
        )
      ]) as any;
    } catch (error: any) {
      if (error.message?.includes('timeout')) {
        return res.status(504).json({ 
          error: 'Request timeout',
          message: 'The search request took too long. Please try again.'
        });
      }
      throw error; // Re-throw other errors
    }

    // Transform to profile format expected by frontend
    const profile = {
      address: walletData.address,
      dnaScore: walletData.summary.dnaScore,
      tier: walletData.summary.tier,
      migrationPath: {
        v2: null, // TODO: Add V2/V3 migration tracking
        v3: null,
        v4: address, // V4 is primary
      },
      stats: {
        v2: {
          totalSwaps: 0,
          totalVolume: 0,
          totalPositions: 0,
          firstAction: null,
        },
        v3: {
          totalSwaps: 0,
          totalVolume: 0,
          totalPositions: 0,
          activePositions: 0,
          totalFeesEarned: 0,
          firstAction: null,
        },
        v4: {
          totalSwaps: walletData.summary.totalSwaps,
          totalVolume: walletData.summary.totalVolumeUsd,
          totalPositions: walletData.summary.totalPositions,
          activePositions: walletData.summary.activePositions,
          totalFeesEarned: walletData.summary.totalFeesEarned,
          totalLiquidityProvided: '0', // TODO: Calculate from positions
          uniquePools: walletData.summary.uniquePools,
          uniqueHooksUsed: 0, // TODO: Extract from pool interactions
          firstAction: walletData.summary.firstActionTimestamp 
            ? new Date(walletData.summary.firstActionTimestamp * 1000).toISOString()
            : null,
        },
      },
      scoreBreakdown: {
        earlyAdopter: 0, // TODO: Calculate from firstAction timestamps
        volume: Math.min(25, (Math.log10(walletData.summary.totalVolumeUsd + 1) / Math.log10(1000000)) * 25),
        lpEfficiency: walletData.summary.totalFeesEarned > 0 
          ? Math.min(25, (walletData.summary.totalFeesEarned / (walletData.summary.totalVolumeUsd || 1)) * 25)
          : 0,
        diversity: Math.min(15, (walletData.summary.uniquePools / 50) * 15),
        consistency: 15, // TODO: Calculate based on activity frequency
      },
      achievements: [], // TODO: Fetch from DNASubscriber contract
      recentActivity: {
        day_count: 0, // TODO: Calculate from activity
        week_count: 0,
        month_count: 0,
      },
      updatedAt: new Date().toISOString(),
    };

    res.json(profile);
  } catch (error: any) {
    logger.error('Profile error', { error: error?.message, address: req.params.address });
    // Check if it's a "not found" type error
    if (error.message?.includes('not found') || error.message?.includes('No data')) {
      return res.status(404).json({ 
        error: 'Profile not found',
        message: 'This address has no activity tracked by DeFi DNA yet.'
      });
    }

    res.status(500).json({ 
      error: 'Failed to fetch profile',
      message: error.message || 'An error occurred while fetching profile data'
    });
  }
});

// --- Analytics endpoints ---

app.get('/api/v1/analytics/overview', async (req, res) => {
  try {
    if (!dbPool) {
      return res.status(503).json({
        error: 'Database unavailable',
        message: 'Analytics requires database connection.',
      });
    }
    const dbQueries = await import('./db/queries');
    const row = await dbQueries.getPlatformOverview(dbPool);
    if (!row) {
      return res.json({
        totalUsers: 0,
        totalVolumeUsd: 0,
        totalFeesEarned: 0,
        totalPositions: 0,
        activePositions: 0,
        avgDnaScore: 0,
      });
    }
    res.json({
      totalUsers: parseInt(row.total_users, 10) || 0,
      totalVolumeUsd: parseFloat(row.total_volume_usd) || 0,
      totalFeesEarned: parseFloat(row.total_fees_earned) || 0,
      totalPositions: parseInt(row.total_positions, 10) || 0,
      activePositions: parseInt(row.active_positions, 10) || 0,
      avgDnaScore: parseFloat(row.avg_dna_score) || 0,
    });
  } catch (error: any) {
    logger.error('Analytics overview error', { error: error?.message });
    res.status(500).json({
      error: 'Failed to fetch analytics overview',
      message: error.message || 'An error occurred',
    });
  }
});

app.get('/api/v1/analytics/tiers', async (req, res) => {
  try {
    if (!dbPool) {
      return res.status(503).json({
        error: 'Database unavailable',
        message: 'Analytics requires database connection.',
      });
    }
    const dbQueries = await import('./db/queries');
    const rows = await dbQueries.getTierDistribution(dbPool);
    res.json({
      tiers: rows.map((r) => ({ tier: r.tier, count: parseInt(r.count, 10) || 0 })),
    });
  } catch (error: any) {
    logger.error('Analytics tiers error', { error: error?.message });
    res.status(500).json({
      error: 'Failed to fetch tier distribution',
      message: error.message || 'An error occurred',
    });
  }
});

app.get('/api/v1/analytics/pools', async (req, res) => {
  try {
    if (!dbPool) {
      return res.status(503).json({
        error: 'Database unavailable',
        message: 'Analytics requires database connection.',
      });
    }
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const dbQueries = await import('./db/queries');
    const rows = await dbQueries.getTopPools(dbPool, limit);
    res.json({
      pools: rows.map((r) => ({
        poolId: r.pool_id,
        totalVolume: parseFloat(r.total_volume) || 0,
        totalSwaps: parseInt(r.total_swaps, 10) || 0,
        uniqueUsers: parseInt(r.unique_users, 10) || 0,
        feesEarned: parseFloat(r.fees_earned) || 0,
      })),
    });
  } catch (error: any) {
    logger.error('Analytics pools error', { error: error?.message });
    res.status(500).json({
      error: 'Failed to fetch top pools',
      message: error.message || 'An error occurred',
    });
  }
});

app.get('/api/v1/analytics/activity', async (req, res) => {
  try {
    if (!dbPool) {
      return res.status(503).json({
        error: 'Database unavailable',
        message: 'Analytics requires database connection.',
      });
    }
    const period = (req.query.period as string) || '30d';
    const daysMatch = period.match(/^(\d+)d$/);
    const days = daysMatch ? Math.min(parseInt(daysMatch[1], 10), 90) : 30;
    const dbQueries = await import('./db/queries');
    const rows = await dbQueries.getActivityTimeSeries(dbPool, days);
    res.json({
      data: rows.map((r) => ({
        date: r.date,
        swaps: parseInt(r.swaps, 10) || 0,
        mints: parseInt(r.mints, 10) || 0,
        burns: parseInt(r.burns, 10) || 0,
        collects: parseInt(r.collects, 10) || 0,
      })),
    });
  } catch (error: any) {
    logger.error('Analytics activity error', { error: error?.message });
    res.status(500).json({
      error: 'Failed to fetch activity time series',
      message: error.message || 'An error occurred',
    });
  }
});

app.get('/api/v1/analytics/scores', async (req, res) => {
  try {
    if (!dbPool) {
      return res.status(503).json({
        error: 'Database unavailable',
        message: 'Analytics requires database connection.',
      });
    }
    const dbQueries = await import('./db/queries');
    const rows = await dbQueries.getScoreDistribution(dbPool);
    res.json({
      distribution: rows.map((r) => ({
        range: r.range,
        count: parseInt(r.count, 10) || 0,
      })),
    });
  } catch (error: any) {
    logger.error('Analytics scores error', { error: error?.message });
    res.status(500).json({
      error: 'Failed to fetch score distribution',
      message: error.message || 'An error occurred',
    });
  }
});

// WebSocket server
const server = createServer(app);
const wss = new WebSocketServer({ server });
setWebSocketServer(wss);

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'subscribe' && data.address) {
        ws.send(JSON.stringify({ type: 'subscribed', address: data.address }));
      }
      if (data.type === 'unsubscribe' && data.address) {
        // subscription tracking can be added here if needed
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

// Start server with error handling
server.listen(PORT, () => {
  console.log(`🚀 DeFi DNA Backend running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
}).on('error', (error: any) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Please use a different port.`);
    process.exit(1);
  } else {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
});

// Handle uncaught exceptions gracefully
process.on('uncaughtException', (error) => {
  captureException(error);
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  if (process.env.NODE_ENV === 'production') {
    logger.error('Continuing in production mode...');
  } else {
    process.exit(1);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  captureException(reason);
  logger.error('Unhandled Rejection', { reason: String(reason) });
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});
