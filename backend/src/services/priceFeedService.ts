import { ethers } from 'ethers';

/**
 * Price Feed Service
 * Fetches token prices in USD from Chainlink (on-chain) and Coingecko (fallback).
 * Caches prices in memory with 5-minute TTL.
 */

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Chainlink price feed addresses on Base Mainnet
const CHAINLINK_FEEDS: Record<string, string> = {
  '0x4200000000000000000000000000000000000006': '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70', // WETH/USD
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': '0x7e860098f58bbfc8648a4311b374b1d669a2bc6b', // USDC/USD
};

const ABI = ['function latestAnswer() view returns (int256)'];

export interface PriceCacheEntry {
  price: number;
  timestamp: number;
}

export class PriceFeedService {
  private provider: ethers.JsonRpcProvider;
  private cache: Map<string, PriceCacheEntry> = new Map();
  private coingeckoApiKey: string | undefined;

  constructor(rpcUrl: string, coingeckoApiKey?: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.coingeckoApiKey = coingeckoApiKey || process.env.COINGECKO_API_KEY;
  }

  /**
   * Get token price in USD. Checks cache first, then Chainlink, then Coingecko.
   */
  async getPrice(tokenAddress: string, _symbol?: string): Promise<number | null> {
    const key = tokenAddress.toLowerCase();
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.price;
    }

    // Try Chainlink first (on-chain, most reliable)
    const chainlinkPrice = await this.getChainlinkPrice(key);
    if (chainlinkPrice != null) {
      this.cache.set(key, { price: chainlinkPrice, timestamp: Date.now() });
      return chainlinkPrice;
    }

    // Fallback to Coingecko
    const coingeckoPrice = await this.getCoingeckoPrice(key);
    if (coingeckoPrice != null) {
      this.cache.set(key, { price: coingeckoPrice, timestamp: Date.now() });
      return coingeckoPrice;
    }

    return null;
  }

  async getChainlinkPrice(tokenAddress: string): Promise<number | null> {
    const feedAddress = CHAINLINK_FEEDS[tokenAddress];
    if (!feedAddress) return null;

    try {
      const contract = new ethers.Contract(feedAddress, ABI, this.provider);
      const answer = await contract.latestAnswer();
      return Number(answer) / 1e8; // Chainlink uses 8 decimals
    } catch (e) {
      return null;
    }
  }

  async getCoingeckoPrice(tokenAddress: string): Promise<number | null> {
    try {
      const url = `https://api.coingecko.com/api/v3/simple/token_price/base?contract_addresses=${tokenAddress}&vs_currencies=usd`;
      const headers: Record<string, string> = {};
      if (this.coingeckoApiKey) {
        headers['x-cg-pro-api-key'] = this.coingeckoApiKey;
      }
      const res = await fetch(url, { headers });
      const data = (await res.json()) as Record<string, { usd?: number }>;
      const price = data[tokenAddress]?.usd;
      return typeof price === 'number' ? price : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Clear cache (e.g. for tests or forced refresh).
   */
  clearCache(): void {
    this.cache.clear();
  }
}
