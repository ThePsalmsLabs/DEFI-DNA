#!/bin/bash

# Railway Deployment Script for DeFi DNA Backend
# Run this script to deploy and configure the backend

set -e

cd "$(dirname "$0")"

echo "🚂 Railway Deployment for DeFi DNA Backend"
echo "==========================================="
echo ""

# Check Railway CLI
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Install with: npm i -g @railway/cli"
    exit 1
fi

echo "✅ Railway CLI found"
echo ""

# Check login
if ! railway whoami &> /dev/null; then
    echo "❌ Not logged in. Please run: railway login"
    exit 1
fi

echo "✅ Logged in: $(railway whoami | grep -o '[^@]*@[^@]*')"
echo ""

# Check if project is linked
if [ ! -f ".railway/project.json" ]; then
    echo "⚠️  Project not linked. Initializing..."
    railway init --name defi-dna-backend
fi

echo "✅ Project linked"
echo ""

# Add PostgreSQL if not exists
echo "📦 Adding PostgreSQL database..."
railway add --database postgres || echo "Database may already exist"
echo ""

# Deploy to create service
echo "🚀 Deploying backend (this will create a service)..."
echo "Note: This may take a few minutes"
railway up
echo ""

# Wait a moment for service to be created
sleep 5

# Set environment variables
echo "⚙️  Setting environment variables..."

# Database variables (Railway auto-provides these via Postgres service)
echo "Setting database variables..."
railway variables --set "DB_HOST=\${{Postgres.PGHOST}}" || true
railway variables --set "DB_PORT=\${{Postgres.PGPORT}}" || true
railway variables --set "DB_NAME=\${{Postgres.PGDATABASE}}" || true
railway variables --set "DB_USER=\${{Postgres.PGUSER}}" || true
railway variables --set "DB_PASSWORD=\${{Postgres.PGPASSWORD}}" || true

# Application variables
echo "Setting application variables..."
railway variables --set "CHAIN_ID=8453"
railway variables --set "RPC_URL_BASE=https://base-mainnet.g.alchemy.com/v2/f_SNCtMgIYAJswII3Y2BkjcSAWMpfNTh"
railway variables --set "PORT=4000"
railway variables --set "NODE_ENV=production"

# Contract addresses
echo "Setting contract addresses..."
railway variables --set "DNA_SUBSCRIBER_ADDRESS=0xeac0cccaf338264f74d6bb7e033a24df8b201884"
railway variables --set "DNA_READER_ADDRESS=0x4a870f11df9677d73862c384258cecf4247e094d"
railway variables --set "ADVANCED_POSITION_MANAGER_ADDRESS=0xe1d264209e4ed85219ef10b6fa1b26dde2b7273c"

# Feature flags
echo "Setting feature flags..."
railway variables --set "ENABLE_INDEXER=true"
railway variables --set "ENABLE_CRON_JOBS=true"
railway variables --set "ENABLE_WEBSOCKET=true"
railway variables --set "LOG_LEVEL=info"

echo ""
echo "✅ Environment variables set"
echo ""

# Get Railway URL
echo "🌐 Getting Railway URL..."
RAILWAY_URL=$(railway domain 2>&1 | grep -o 'https://[^ ]*' | head -1 || echo "Check Railway dashboard for URL")
echo "Backend URL: $RAILWAY_URL"
echo ""

# Show status
echo "📊 Deployment Status:"
railway status
echo ""

echo "🎉 Deployment complete!"
echo ""
echo "⚠️  IMPORTANT: You still need to set these variables manually in Railway dashboard:"
echo "   - COINGECKO_API_KEY (for price feeds)"
echo "   - GRAPH_API_KEY (for The Graph)"
echo "   - FRONTEND_URL (your frontend domain)"
echo ""
echo "Next steps:"
echo "1. View logs: railway logs"
echo "2. Check variables: railway variables"
echo "3. Update frontend .env.local with: NEXT_PUBLIC_API_URL=$RAILWAY_URL"
echo "4. Test health endpoint: curl $RAILWAY_URL/health"
