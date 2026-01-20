#!/bin/bash

# DeFi DNA - Production Deployment Script
# Uses cast wallet (keystore) for secure deployment

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Functions
print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "ℹ️  $1"
}

# Check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"

    # Check forge
    if ! command -v forge &> /dev/null; then
        print_error "Foundry not installed. Install from https://getfoundry.sh"
        exit 1
    fi
    print_success "Foundry installed"

    # Check cast
    if ! command -v cast &> /dev/null; then
        print_error "Cast not installed"
        exit 1
    fi
    print_success "Cast installed"

    # Check for wallet
    if ! cast wallet list &> /dev/null; then
        print_warning "No wallets found. Create one with:"
        echo "    cast wallet new ~/keystore"
        exit 1
    fi
    print_success "Wallet configured"

    echo ""
}

# Select network
select_network() {
    print_header "Select Network"
    echo "1) Base Sepolia (Testnet)"
    echo "2) Base Mainnet (Production)"
    echo "3) Cancel"
    read -p "Enter choice [1-3]: " network_choice

    case $network_choice in
        1)
            NETWORK="base-sepolia"
            RPC_URL="https://sepolia.base.org"
            CHAIN_ID=84532
            SCRIPT_NAME="DeployBaseSepolia"
            ;;
        2)
            NETWORK="base-mainnet"
            RPC_URL="https://mainnet.base.org"
            CHAIN_ID=8453
            SCRIPT_NAME="DeployBaseMainnet"
            ;;
        3)
            echo "Deployment cancelled"
            exit 0
            ;;
        *)
            print_error "Invalid choice"
            exit 1
            ;;
    esac

    print_success "Selected: $NETWORK"
    echo ""
}

# Select wallet
select_wallet() {
    print_header "Select Deployment Wallet"

    # List available wallets
    cast wallet list

    echo ""
    read -p "Enter wallet name: " WALLET_NAME

    # Get wallet address
    WALLET_ADDRESS=$(cast wallet address --account "$WALLET_NAME" 2>/dev/null || echo "")

    if [ -z "$WALLET_ADDRESS" ]; then
        print_error "Wallet '$WALLET_NAME' not found"
        exit 1
    fi

    print_success "Wallet: $WALLET_ADDRESS"

    # Check balance
    BALANCE=$(cast balance "$WALLET_ADDRESS" --rpc-url "$RPC_URL")
    BALANCE_ETH=$(echo "scale=4; $BALANCE / 1000000000000000000" | bc)

    print_info "Balance: $BALANCE_ETH ETH"

    # Check minimum balance
    if [ "$NETWORK" = "base-mainnet" ]; then
        MIN_BALANCE=50000000000000000  # 0.05 ETH
    else
        MIN_BALANCE=10000000000000000  # 0.01 ETH
    fi

    if [ "$BALANCE" -lt "$MIN_BALANCE" ]; then
        print_error "Insufficient balance for deployment"
        exit 1
    fi

    print_success "Sufficient balance"
    echo ""
}

# Pre-deployment checks
pre_deployment_checks() {
    print_header "Pre-Deployment Checks"

    # Run tests
    print_info "Running tests..."
    if forge test --summary > /dev/null 2>&1; then
        print_success "All tests passing"
    else
        print_error "Tests failing - fix before deploying"
        exit 1
    fi

    # Check contract sizes
    print_info "Checking contract sizes..."
    forge build --sizes > /dev/null 2>&1
    print_success "Contracts compiled"

    # Format check
    if forge fmt --check > /dev/null 2>&1; then
        print_success "Code formatted correctly"
    else
        print_warning "Code formatting issues found. Run: forge fmt"
    fi

    echo ""
}

# Simulate deployment
simulate_deployment() {
    print_header "Simulating Deployment"

    print_info "Running dry-run simulation..."

    if forge script "script/DeployProduction.s.sol:$SCRIPT_NAME" \
        --rpc-url "$RPC_URL" \
        --account "$WALLET_NAME" \
        --sender "$WALLET_ADDRESS" \
        2>&1 | tee deploy-simulation.log; then
        print_success "Simulation successful"
    else
        print_error "Simulation failed. Check deploy-simulation.log"
        exit 1
    fi

    echo ""
    print_warning "Review simulation output carefully before proceeding"
    read -p "Continue with deployment? (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        print_info "Deployment cancelled"
        exit 0
    fi
}

# Deploy contracts
deploy_contracts() {
    print_header "Deploying Contracts to $NETWORK"

    if [ "$NETWORK" = "base-mainnet" ]; then
        print_warning "⚠️  WARNING: DEPLOYING TO MAINNET ⚠️"
        print_warning "This will use REAL ETH and deploy to PRODUCTION"
        echo ""
        read -p "Type 'DEPLOY TO MAINNET' to confirm: " mainnet_confirm

        if [ "$mainnet_confirm" != "DEPLOY TO MAINNET" ]; then
            print_info "Deployment cancelled"
            exit 0
        fi
    fi

    # Get BaseScan API key for verification
    if [ -n "$BASESCAN_API_KEY" ]; then
        VERIFY_FLAG="--verify --etherscan-api-key $BASESCAN_API_KEY"
    else
        print_warning "BASESCAN_API_KEY not set - contracts will not be verified automatically"
        VERIFY_FLAG=""
    fi

    print_info "Starting deployment..."
    echo ""

    # Deploy
    if forge script "script/DeployProduction.s.sol:$SCRIPT_NAME" \
        --rpc-url "$RPC_URL" \
        --account "$WALLET_NAME" \
        --sender "$WALLET_ADDRESS" \
        --broadcast \
        $VERIFY_FLAG \
        2>&1 | tee deploy-output.log; then
        print_success "Deployment successful!"
    else
        print_error "Deployment failed. Check deploy-output.log"
        exit 1
    fi
}

# Post-deployment verification
post_deployment() {
    print_header "Post-Deployment Verification"

    # Check if deployment JSON exists
    DEPLOYMENT_FILE="deployments/${NETWORK}.json"

    if [ -f "$DEPLOYMENT_FILE" ]; then
        print_success "Deployment info saved to $DEPLOYMENT_FILE"

        # Extract addresses
        DNA_SUBSCRIBER=$(jq -r '.contracts.DNASubscriber' "$DEPLOYMENT_FILE")
        DNA_READER=$(jq -r '.contracts.DNAReader' "$DEPLOYMENT_FILE")
        ADVANCED_PM=$(jq -r '.contracts.AdvancedPositionManager' "$DEPLOYMENT_FILE")

        echo ""
        print_info "Deployed Addresses:"
        echo "  DNASubscriber:           $DNA_SUBSCRIBER"
        echo "  DNAReader:               $DNA_READER"
        echo "  AdvancedPositionManager: $ADVANCED_PM"
        echo ""

        # Test read functions
        print_info "Testing contracts..."

        # Test DNASubscriber
        TOTAL_USERS=$(cast call "$DNA_SUBSCRIBER" "totalUsers()" --rpc-url "$RPC_URL" 2>/dev/null || echo "error")
        if [ "$TOTAL_USERS" = "0" ]; then
            print_success "DNASubscriber working (totalUsers = 0)"
        else
            print_warning "DNASubscriber may have issues"
        fi

        # Generate update commands
        print_info "Update your .env files with these addresses:"
        echo ""
        echo "Backend (.env.production):"
        echo "DNA_SUBSCRIBER_ADDRESS=$DNA_SUBSCRIBER"
        echo "DNA_READER_ADDRESS=$DNA_READER"
        echo "ADVANCED_POSITION_MANAGER=$ADVANCED_PM"
        echo ""
        echo "Frontend (.env.local):"
        echo "NEXT_PUBLIC_DNA_SUBSCRIBER_ADDRESS=$DNA_SUBSCRIBER"
        echo "NEXT_PUBLIC_DNA_READER_ADDRESS=$DNA_READER"
        echo "NEXT_PUBLIC_ADVANCED_POSITION_MANAGER=$ADVANCED_PM"
        echo "NEXT_PUBLIC_CHAIN_ID=$CHAIN_ID"

    else
        print_warning "Deployment file not found"
    fi

    echo ""
    print_success "Deployment complete!"
    print_info "Next steps:"
    echo "  1. Verify contracts on BaseScan (if not auto-verified)"
    echo "  2. Update backend and frontend .env files"
    echo "  3. Test contracts thoroughly"
    echo "  4. Monitor for issues"
}

# Main execution
main() {
    clear
    print_header "DeFi DNA - Production Deployment"
    echo ""

    check_prerequisites
    select_network
    select_wallet
    pre_deployment_checks
    simulate_deployment
    deploy_contracts
    post_deployment

    echo ""
    print_success "All done! 🎉"
}

# Run main function
main
