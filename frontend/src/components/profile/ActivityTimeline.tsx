'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { 
  ArrowRightLeft, 
  Plus, 
  Minus, 
  DollarSign, 
  ExternalLink,
  Loader2,
  AlertCircle,
  ChevronDown
} from 'lucide-react';
import { clsx } from 'clsx';
import { useState } from 'react';

interface Activity {
  id: number;
  action_type: string;
  token0_symbol: string | null;
  token1_symbol: string | null;
  protocol_version: string;
  amount_usd: number | null;
  timestamp: string;
  tx_hash: string;
  pool_id: string;
  block_number: number;
}

interface TimelineResponse {
  address: string;
  events: Activity[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

interface ActivityTimelineProps {
  address: string;
}

async function fetchTimeline(address: string, offset: number = 0, limit: number = 20): Promise<TimelineResponse> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/v1/timeline/${address}?limit=${limit}&offset=${offset}`
  );
  if (!res.ok) throw new Error('Failed to fetch timeline');
  return res.json();
}

export function ActivityTimeline({ address }: ActivityTimelineProps) {
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['timeline', address, offset],
    queryFn: () => fetchTimeline(address, offset, limit),
    enabled: !!address,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
        <span className="ml-3 text-gray-400">Loading activity...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <AlertCircle className="w-6 h-6 mr-2 text-red-400" />
        <span>Failed to load activity. Please try again.</span>
      </div>
    );
  }

  const activities = data?.events || [];
  const pagination = data?.pagination;

  if (activities.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-gray-500" />
        </div>
        <p className="text-gray-400">No activity found</p>
        <p className="text-sm text-gray-500 mt-1">
          Your transaction history will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {activities.map((activity, index) => (
        <motion.div
          key={activity.id}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.03 }}
          className="flex gap-4"
        >
          {/* Timeline connector */}
          <div className="flex flex-col items-center">
            <div className={clsx(
              'w-10 h-10 rounded-full flex items-center justify-center',
              getActionConfig(activity.action_type).bg
            )}>
              {getActionConfig(activity.action_type).icon}
            </div>
            {index < activities.length - 1 && (
              <div className="w-0.5 h-full bg-gray-800 my-2" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 pb-6">
            <div className="glass rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-medium">
                    {getActionConfig(activity.action_type).label}
                  </h4>
                  <p className="text-sm text-gray-500 mt-1">
                    {activity.token0_symbol || 'Token0'}/{activity.token1_symbol || 'Token1'} • {activity.protocol_version.toUpperCase()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium">
                    {activity.amount_usd 
                      ? `$${Number(activity.amount_usd).toLocaleString(undefined, { maximumFractionDigits: 2 })}` 
                      : '-'
                    }
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatTimeAgo(activity.timestamp)}
                  </p>
                </div>
              </div>

              {/* Transaction link */}
              <a
                href={getExplorerTxUrl(activity.tx_hash, activity.protocol_version)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-3 text-xs text-gray-500 hover:text-primary-400"
              >
                View transaction <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </motion.div>
      ))}

      {/* Load More Button */}
      {pagination?.hasMore && (
        <div className="flex justify-center pt-4">
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={isFetching}
            className={clsx(
              'flex items-center gap-2 px-6 py-2 rounded-lg transition',
              'bg-gray-800 hover:bg-gray-700 text-gray-300',
              isFetching && 'opacity-50 cursor-not-allowed'
            )}
          >
            {isFetching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            Load More
          </button>
        </div>
      )}

      {/* Pagination Info */}
      {pagination && (
        <div className="text-center text-sm text-gray-500">
          Showing {Math.min(offset + limit, pagination.total)} of {pagination.total} activities
        </div>
      )}
    </div>
  );
}

function getActionConfig(actionType: string) {
  switch (actionType) {
    case 'swap':
      return {
        icon: <ArrowRightLeft className="w-5 h-5 text-blue-400" />,
        bg: 'bg-blue-500/20',
        label: 'Swap',
      };
    case 'add_liquidity':
      return {
        icon: <Plus className="w-5 h-5 text-green-400" />,
        bg: 'bg-green-500/20',
        label: 'Add Liquidity',
      };
    case 'remove_liquidity':
      return {
        icon: <Minus className="w-5 h-5 text-red-400" />,
        bg: 'bg-red-500/20',
        label: 'Remove Liquidity',
      };
    case 'collect_fees':
      return {
        icon: <DollarSign className="w-5 h-5 text-amber-400" />,
        bg: 'bg-amber-500/20',
        label: 'Collect Fees',
      };
    case 'modify_liquidity':
      return {
        icon: <ArrowRightLeft className="w-5 h-5 text-purple-400" />,
        bg: 'bg-purple-500/20',
        label: 'Modify Liquidity',
      };
    default:
      return {
        icon: <ArrowRightLeft className="w-5 h-5 text-gray-400" />,
        bg: 'bg-gray-500/20',
        label: actionType || 'Transaction',
      };
  }
}

function formatTimeAgo(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getExplorerTxUrl(txHash: string, protocolVersion: string): string {
  // Use Base Sepolia for V4, Etherscan for V2/V3
  const baseUrl = protocolVersion === 'v4'
    ? 'https://sepolia.basescan.org'
    : 'https://etherscan.io';
  
  return `${baseUrl}/tx/${txHash}`;
}
