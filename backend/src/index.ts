import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { Pool } from 'pg';
import { ethers } from 'ethers';
import { SearchService } from './services/searchService';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Initialize database connection if available
let dbPool: Pool | undefined;
if (process.env.DB_HOST && process.env.DB_NAME) {
  try {
    dbPool = new Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      // Add connection timeout and retry settings
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      max: 10, // Maximum number of clients in the pool
    });

    // Test connection
    dbPool.query('SELECT NOW()', (err) => {
      if (err) {
        console.warn('⚠️ Database connection test failed:', err.message);
        dbPool = undefined; // Don't use broken connection
      } else {
        console.log('✅ Database connection initialized and tested');
      }
    });

    // Handle pool errors gracefully
    dbPool.on('error', (err) => {
      console.error('⚠️ Database pool error:', err.message);
      // Don't crash - just log the error
    });
  } catch (error: any) {
    console.warn('⚠️ Database connection failed, continuing without DB:', error.message);
    dbPool = undefined;
  }
} else {
  console.log('ℹ️ Database not configured (DB_HOST or DB_NAME missing) - continuing without DB');
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

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
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
    console.error('Search error:', error);
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
    console.error('Profile error:', error);
    
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

// WebSocket server
const server = createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('Received:', data);
      
      // Handle subscription
      if (data.type === 'subscribe' && data.address) {
        ws.send(JSON.stringify({ 
          type: 'subscribed', 
          address: data.address 
        }));
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
  console.error('❌ Uncaught Exception:', error);
  // Don't exit in production - let Railway handle restarts
  if (process.env.NODE_ENV === 'production') {
    console.error('Continuing in production mode...');
  } else {
    process.exit(1);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit in production
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});
