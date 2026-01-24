import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { Pool } from 'pg';
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
  // TODO: Implement profile endpoint
  res.json({ address: req.params.address });
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
