#!/bin/bash

# Railway CLI Deployment Script for DeFi DNA Backend
# This script helps you deploy and configure the backend on Railway

set -e

echo "🚂 Railway CLI Deployment Setup"
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo -e "${RED}❌ Railway CLI is not installed${NC}"
    echo "Install it with: npm i -g @railway/cli"
    exit 1
fi

echo -e "${GREEN}✅ Railway CLI found${NC}"
echo ""

# Step 1: Login to Railway
echo -e "${YELLOW}Step 1: Login to Railway${NC}"
echo "Checking login status..."
if railway whoami &> /dev/null; then
    echo -e "${GREEN}✅ Already logged in${NC}"
    railway whoami
else
    echo -e "${YELLOW}⚠️  Not logged in. Please login:${NC}"
    echo "Run: railway login"
    exit 1
fi
echo ""

# Step 2: Initialize/Link Project
echo -e "${YELLOW}Step 2: Initialize Railway Project${NC}"
if [ -f ".railway/project.json" ]; then
    echo -e "${GREEN}✅ Project already linked${NC}"
    railway status
else
    echo "Creating new Railway project..."
    railway init
fi
echo ""

# Step 3: Add PostgreSQL Database
echo -e "${YELLOW}Step 3: Add PostgreSQL Database${NC}"
echo "Adding PostgreSQL service..."
railway add --database postgres
echo -e "${GREEN}✅ PostgreSQL database added${NC}"
echo ""

# Step 4: Set Environment Variables
echo -e "${YELLOW}Step 4: Setting Environment Variables${NC}"
echo "Setting up database connection variables..."

# Database variables (auto-provided by Railway)
railway variables set DB_HOST='${{Postgres.PGHOST}}'
railway variables set DB_PORT='${{Postgres.PGPORT}}'
railway variables set DB_NAME='${{Postgres.PGDATABASE}}'
railway variables set DB_USER='${{Postgres.PGUSER}}'
railway variables set DB_PASSWORD='${{Postgres.PGPASSWORD}}'

echo -e "${GREEN}✅ Database variables set${NC}"
echo ""

# Step 5: Set other required variables
echo -e "${YELLOW}Step 5: Setting Application Variables${NC}"
echo "You'll need to set these manually or via Railway dashboard:"
echo ""
echo "Required variables:"
echo "  - CHAIN_ID (8453 for Base Mainnet, 84532 for Base Sepolia)"
echo "  - RPC_URL_BASE (your Alchemy RPC URL)"
echo "  - DNA_SUBSCRIBER_ADDRESS (deployed contract address)"
echo "  - DNA_READER_ADDRESS (deployed contract address)"
echo "  - ADVANCED_POSITION_MANAGER_ADDRESS (deployed contract address)"
echo "  - COINGECKO_API_KEY (for price feeds)"
echo "  - GRAPH_API_KEY (for The Graph)"
echo "  - PORT (4000)"
echo "  - NODE_ENV (production)"
echo "  - FRONTEND_URL (your frontend URL)"
echo ""

# Step 6: Deploy
echo -e "${YELLOW}Step 6: Deploy to Railway${NC}"
echo "Ready to deploy? (y/n)"
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo "Deploying..."
    railway up
    echo -e "${GREEN}✅ Deployment initiated!${NC}"
else
    echo "Deployment cancelled. Run 'railway up' when ready."
fi

echo ""
echo -e "${GREEN}🎉 Setup Complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Set remaining environment variables in Railway dashboard"
echo "2. Check deployment logs: railway logs"
echo "3. Get your Railway URL: railway domain"
echo "4. Update frontend .env.local with Railway API URL"
