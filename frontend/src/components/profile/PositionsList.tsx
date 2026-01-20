'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';

interface Position {
  id: number;
  token_id: string;
  pool_id: string;
  token0_address: string;
  token1_address: string;
  token0_symbol: string;
  token1_symbol: string;
  tick_lower: number;
  tick_upper: number;
  liquidity: string;
  initial_value_usd: number;
  current_value_usd: number;
  total_fees_earned_usd: number;
  is_active: boolean;
  protocol_version: string;
  hook_address: string | null;
  opened_at: string;
  closed_at: string | null;
}

interface PositionsResponse {
  address: string;
  positions: Position[];
  total: number;
}

interface PositionsListProps {
  address: string;
}

async function fetchPositions(address: string): Promise<PositionsResponse> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/v1/profile/${address}/positions?active=true`
  );
  if (!res.ok) throw new Error('Failed to fetch positions');
  return res.json();
}

export function PositionsList({ address }: PositionsListProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['positions', address],
    queryFn: () => fetchPositions(address),
    enabled: !!address,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
        <span className="ml-3 text-gray-400">Loading positions...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <AlertCircle className="w-6 h-6 mr-2 text-red-400" />
        <span>Failed to load positions. Please try again.</span>
      </div>
    );
  }

  const positions = data?.positions || [];

  if (positions.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-gray-500" />
        </div>
        <p className="text-gray-400">No active positions found</p>
        <p className="text-sm text-gray-500 mt-1">
          Positions will appear here once you provide liquidity
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {positions.map((position, index) => {
        const pnl = position.initial_value_usd > 0
          ? ((position.current_value_usd - position.initial_value_usd) / position.initial_value_usd) * 100
          : 0;

        return (
          <motion.div
            key={position.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="glass rounded-xl p-4 card-hover"
          >
            <div className="flex items-center justify-between">
              {/* Token Pair */}
              <div className="flex items-center gap-4">
                <div className="flex -space-x-2">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 border-2 border-gray-900 flex items-center justify-center text-xs font-bold">
                    {(position.token0_symbol || 'T0').slice(0, 2)}
                  </div>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 border-2 border-gray-900 flex items-center justify-center text-xs font-bold">
                    {(position.token1_symbol || 'T1').slice(0, 2)}
                  </div>
                </div>
                <div>
                  <h4 className="font-medium">
                    {position.token0_symbol || 'Token0'}/{position.token1_symbol || 'Token1'}
                  </h4>
                  <p className="text-sm text-gray-500">
                    {position.protocol_version.toUpperCase()} • Tick: {position.tick_lower} → {position.tick_upper}
                  </p>
                </div>
              </div>

              {/* Value & Status */}
              <div className="text-right">
                <p className="font-medium">${formatNumber(position.current_value_usd || 0)}</p>
                <div className="flex items-center gap-1 text-sm justify-end">
                  {pnl >= 0 ? (
                    <>
                      <ArrowUpRight className="w-4 h-4 text-green-400" />
                      <span className="text-green-400">+{pnl.toFixed(2)}%</span>
                    </>
                  ) : (
                    <>
                      <ArrowDownRight className="w-4 h-4 text-red-400" />
                      <span className="text-red-400">{pnl.toFixed(2)}%</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Details Row */}
            <div className="mt-4 pt-4 border-t border-gray-800 grid grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Liquidity</p>
                <p className="font-medium">{formatLiquidity(position.liquidity)}</p>
              </div>
              <div>
                <p className="text-gray-500">Fees Earned</p>
                <p className="font-medium text-green-400">
                  ${formatNumber(position.total_fees_earned_usd || 0)}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Status</p>
                <span className={clsx(
                  'inline-block px-2 py-0.5 rounded text-xs font-medium',
                  position.is_active
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-gray-500/20 text-gray-400'
                )}>
                  {position.is_active ? 'Active' : 'Closed'}
                </span>
              </div>
              <div className="text-right">
                <a
                  href={getExplorerUrl(position.token_id, position.protocol_version)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary-400 hover:text-primary-300"
                >
                  View <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* Hook badge for V4 */}
            {position.hook_address && position.hook_address !== '0x0000000000000000000000000000000000000000' && (
              <div className="mt-3 pt-3 border-t border-gray-800">
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-purple-500/20 text-purple-400 text-xs">
                  🎣 Hook: {position.hook_address.slice(0, 10)}...
                </span>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatLiquidity(liquidity: string): string {
  const num = BigInt(liquidity || '0');
  if (num >= BigInt(1e18)) return `${(Number(num) / 1e18).toFixed(2)}`;
  if (num >= BigInt(1e15)) return `${(Number(num) / 1e15).toFixed(2)}K`;
  return num.toString();
}

function getExplorerUrl(tokenId: string, protocolVersion: string): string {
  // Base Sepolia explorer for V4, Etherscan for V2/V3
  const baseUrl = protocolVersion === 'v4'
    ? 'https://sepolia.basescan.org'
    : 'https://app.uniswap.org';
  
  return protocolVersion === 'v4'
    ? `${baseUrl}/token/${tokenId}`
    : `${baseUrl}/pool/${tokenId}`;
}
