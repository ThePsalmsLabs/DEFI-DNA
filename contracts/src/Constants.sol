// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// =============================================================================
// BASE SEPOLIA TESTNET CONTRACTS (Chain ID: 84532)
// Official Uniswap V4 Deployments: https://docs.uniswap.org/contracts/v4/deployments
// =============================================================================

// Uniswap V4 Pool Manager
address constant POOL_MANAGER = 0x7Da1D65F8B249183667cdE74C5CBD46dD38AA829;

// Uniswap V4 Position Manager (POSM)
address constant POSITION_MANAGER = 0xcDbe7b1ed817eF0005ECe6a3e576fbAE2EA5EAFE;

// Uniswap V4 State View
address constant STATE_VIEW = 0x571291b572Ed32ce6751a2cb2F1c6D5E14af1062;

// Uniswap V4 Quoter
address constant QUOTER = 0x4A6513C898Fe1B2D0e78Bec9Bd5a52B8B132FC2E;

// Uniswap V4 Position Descriptor
address constant POSITION_DESCRIPTOR = 0xE2E65b3A27e3ee7b158AE01f31b4F5dC09c5B2f6;

// Uniswap Universal Router
address constant UNIVERSAL_ROUTER = 0x492E6456D9528771018DeB9E87ef7750EF184104;

// Permit2 (same across all chains)
address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

// =============================================================================
// BASE SEPOLIA TOKENS
// =============================================================================

// Wrapped ETH (Base native)
address constant WETH = 0x4200000000000000000000000000000000000006;

// Test USDC (Base Sepolia)
address constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

// =============================================================================
// BASE MAINNET CONTRACTS (Chain ID: 8453)
// Official Uniswap V4 Deployments: https://docs.uniswap.org/contracts/v4/deployments
// =============================================================================

// Uncomment these for Base mainnet deployment
// address constant POOL_MANAGER = 0x498581ff718922c3f8e6a244956af099b2652b2b;
// address constant POSITION_MANAGER = 0x7c5f5a4bbd8fd63184577525326123b519429bdc;
// address constant STATE_VIEW = 0xa3c0c9b65bad0b08107aa264b0f3db444b867a71;
// address constant QUOTER = 0x0d5e0f971ed27fbff6c2837bf31316121532048d;
// address constant POSITION_DESCRIPTOR = 0x18f7c53df810ae64edeb0bbba87a36be06c61db3;
// address constant UNIVERSAL_ROUTER = 0x6ff5693b99212da76ad316178a184ab56d299b43;
// address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

// =============================================================================
// ETHEREUM MAINNET CONTRACTS (Chain ID: 1)
// Official Uniswap V4 Deployments: https://docs.uniswap.org/contracts/v4/deployments
// =============================================================================

// Uncomment these for Ethereum mainnet deployment
// address constant POOL_MANAGER = 0x000000000004444c5dc75cB358380D2e3dE08A90;
// address constant POSITION_MANAGER = 0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e;
// address constant STATE_VIEW = 0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227;
// address constant QUOTER = 0x52f0e24d1c21c8a0cb1e5a5dd6198556bd9e1203;
// address constant POSITION_DESCRIPTOR = 0xd1428ba554f4c8450b763a0b2040a4935c63f06c;
// address constant UNIVERSAL_ROUTER = 0x66a9893cc07d91d95644aedd05d03f95e1dba8af;
// address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

// =============================================================================
// TICK CONSTANTS
// =============================================================================

int24 constant MIN_TICK = -887272;
int24 constant MAX_TICK = 887272;
int24 constant MIN_TICK_SPACING = 1;
int24 constant MAX_TICK_SPACING = 16383;
uint160 constant MIN_SQRT_PRICE = 4295128739;
uint160 constant MAX_SQRT_PRICE = 1461446703485210103287273052203988822378723970342;
