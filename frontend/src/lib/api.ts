/**
 * Centralized API client for backend.
 * - Request timeout (10s)
 * - Consistent error parsing and user-friendly messages
 * - Optional retries with exponential backoff
 */

import type {
  PlatformOverview,
  TierDistribution,
  TopPoolsResponse,
  ActivityData,
  ScoreDistribution,
} from '@/types/analytics';

const DEFAULT_TIMEOUT_MS = 10000;
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function getMessageForStatus(status: number, bodyMessage?: string): string {
  switch (status) {
    case 400:
      return bodyMessage || 'Invalid request. Please check your input.';
    case 404:
      return bodyMessage || 'Not found. The resource may have been removed or the endpoint may be updating.';
    case 429:
      return 'Too many requests. Please wait a moment and try again.';
    case 503:
      return bodyMessage || 'Service temporarily unavailable. Please try again in a few moments.';
    case 504:
      return bodyMessage || 'Request took too long. Please try again.';
    case 500:
    default:
      return bodyMessage || 'Something went wrong. Please try again later.';
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res;
  } catch (e) {
    clearTimeout(timeout);
    if ((e as Error).name === 'AbortError') {
      throw new ApiError('Request timed out. Please try again.', 408);
    }
    throw e;
  }
}

export interface ApiClientOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

/**
 * GET request with timeout and optional retries.
 */
export async function apiGet<T = unknown>(
  path: string,
  options: ApiClientOptions = {}
): Promise<T> {
  const { timeout = DEFAULT_TIMEOUT_MS, retries = 2, retryDelay = 1000 } = options;
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, { method: 'GET' }, timeout);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = getMessageForStatus(res.status, (data as { message?: string }).message);
        throw new ApiError(message, res.status, (data as { error?: string }).error);
      }
      return data as T;
    } catch (e) {
      lastError = e;
      if (e instanceof ApiError && (e.status === 404 || e.status === 400)) {
        throw e;
      }
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, retryDelay * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError instanceof ApiError ? lastError : new ApiError('Request failed. Please try again.', 0);
}

/**
 * Search wallet - GET /api/v1/search?wallet=0x...
 */
export async function searchWallet(walletAddress: string): Promise<import('@/types/search').WalletSearchResult> {
  return apiGet<import('@/types/search').WalletSearchResult>(
    `/api/v1/search?wallet=${encodeURIComponent(walletAddress)}`,
    { retries: 1 }
  );
}

/**
 * Get profile - GET /api/v1/profile/:address
 */
export async function getProfile(address: string): Promise<unknown> {
  return apiGet(`/api/v1/profile/${encodeURIComponent(address)}`, { retries: 2 });
}

/**
 * Get leaderboard - GET /api/v1/leaderboard
 */
export async function getLeaderboard(params?: { limit?: number; offset?: number }) {
  const q = new URLSearchParams();
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.offset != null) q.set('offset', String(params.offset));
  const query = q.toString();
  return apiGet<{ users: unknown[]; pagination: unknown }>(
    `/api/v1/leaderboard${query ? `?${query}` : ''}`
  );
}

// --- Analytics ---

/**
 * Get platform overview - GET /api/v1/analytics/overview
 */
export async function getAnalyticsOverview(): Promise<PlatformOverview> {
  return apiGet<PlatformOverview>('/api/v1/analytics/overview');
}

/**
 * Get tier distribution - GET /api/v1/analytics/tiers
 */
export async function getTierDistribution(): Promise<TierDistribution> {
  return apiGet<TierDistribution>('/api/v1/analytics/tiers');
}

/**
 * Get top pools - GET /api/v1/analytics/pools?limit=10
 */
export async function getTopPools(limit?: number): Promise<TopPoolsResponse> {
  const q = limit != null ? `?limit=${limit}` : '';
  return apiGet<TopPoolsResponse>(`/api/v1/analytics/pools${q}`);
}

/**
 * Get activity time series - GET /api/v1/analytics/activity?period=30d
 */
export async function getActivityTimeSeries(period?: string): Promise<ActivityData> {
  const q = period ? `?period=${encodeURIComponent(period)}` : '';
  return apiGet<ActivityData>(`/api/v1/analytics/activity${q}`);
}

/**
 * Get score distribution - GET /api/v1/analytics/scores
 */
export async function getScoreDistribution(): Promise<ScoreDistribution> {
  return apiGet<ScoreDistribution>('/api/v1/analytics/scores');
}
