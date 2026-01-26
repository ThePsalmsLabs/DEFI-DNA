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
    });
    console.log('✅ Database connection initialized');
  } catch (error) {
    console.warn('⚠️ Database connection failed, continuing without DB:', error);
  }
}

// Initialize search service
let searchService: SearchService | undefined;
try {
  const rpcUrl = process.env.RPC_URL_BASE || process.env.RPC_URL || '';
  const dnaSubscriberAddress = process.env.DNA_SUBSCRIBER_ADDRESS || '';
  const dnaReaderAddress = process.env.DNA_READER_ADDRESS || '';

  if (rpcUrl && dnaSubscriberAddress && dnaReaderAddress) {
    searchService = new SearchService(
      rpcUrl,
      dnaSubscriberAddress,
      dnaReaderAddress,
      dbPool
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

    const result = await searchService.searchWallet(wallet);
    res.json(result);
  } catch (error: any) {
    console.error('Search error:', error);
    res.status(500).json({ 
      error: 'Search failed',
      message: error.message || 'An error occurred while searching for wallet data'
    });
  }
});

// API routes placeholder
app.get('/api/v1/leaderboard', async (req, res) => {
  // TODO: Implement leaderboard endpoint
  res.json([]);
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

    // Use search service to get wallet data
    const walletData = await searchService.searchWallet(address);

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

// Start server
server.listen(PORT, () => {
  console.log(`🚀 DeFi DNA Backend running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});
