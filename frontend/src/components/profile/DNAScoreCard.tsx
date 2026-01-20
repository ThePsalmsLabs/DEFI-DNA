'use client';

import { motion } from 'framer-motion';
import { clsx } from 'clsx';

interface DNAScoreCardProps {
  score: number;
  tier: string;
  breakdown: {
    earlyAdopter: number;
    volume: number;
    lpEfficiency: number;
    diversity: number;
    consistency: number;
  };
}

export function DNAScoreCard({ score, tier, breakdown }: DNAScoreCardProps) {
  const tierConfig = getTierConfig(tier);
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className={clsx(
      'relative rounded-2xl p-8 overflow-hidden',
      'bg-gradient-to-br',
      tierConfig.gradient
    )}>
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0 bg-[url('/dna-pattern.svg')] bg-repeat" />
      </div>

      <div className="relative z-10">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h2 className="text-2xl font-display font-bold text-white">DeFi DNA</h2>
            <p className="text-white/60 text-sm">Your unique on-chain identity</p>
          </div>
          <span className={clsx(
            'px-3 py-1 rounded-full text-sm font-medium border',
            tierConfig.badge
          )}>
            {tierConfig.emoji} {tier}
          </span>
        </div>

        {/* Score Circle */}
        <div className="flex justify-center mb-8">
          <div className="relative w-40 h-40">
            {/* Background circle */}
            <svg className="w-full h-full -rotate-90">
              <circle
                cx="80"
                cy="80"
                r="45"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="8"
                fill="none"
              />
              {/* Progress circle */}
              <motion.circle
                cx="80"
                cy="80"
                r="45"
                stroke="white"
                strokeWidth="8"
                fill="none"
                strokeLinecap="round"
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset }}
                transition={{ duration: 1.5, ease: 'easeOut' }}
                strokeDasharray={circumference}
              />
            </svg>
            {/* Score text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <motion.span
                className="text-4xl font-bold text-white"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5, duration: 0.3 }}
              >
                {score}
              </motion.span>
              <span className="text-white/60 text-sm">/ 100</span>
            </div>
          </div>
        </div>

        {/* Score Breakdown */}
        <div className="space-y-3">
          <ScoreBar label="Early Adopter" value={breakdown.earlyAdopter} max={20} />
          <ScoreBar label="Volume" value={breakdown.volume} max={25} />
          <ScoreBar label="LP Efficiency" value={breakdown.lpEfficiency} max={25} />
          <ScoreBar label="Diversity" value={breakdown.diversity} max={15} />
          <ScoreBar label="Consistency" value={breakdown.consistency} max={15} />
        </div>
      </div>
    </div>
  );
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const percentage = (value / max) * 100;

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-white/70">{label}</span>
        <span className="text-white font-medium">{value}/{max}</span>
      </div>
      <div className="h-2 bg-white/20 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-white rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

function getTierConfig(tier: string) {
  switch (tier.toLowerCase()) {
    case 'whale':
      return {
        gradient: 'from-amber-500 to-orange-600',
        badge: 'bg-amber-500/20 text-amber-100 border-amber-400/30',
        emoji: '🐋',
      };
    case 'expert':
      return {
        gradient: 'from-purple-500 to-violet-600',
        badge: 'bg-purple-500/20 text-purple-100 border-purple-400/30',
        emoji: '⭐',
      };
    case 'intermediate':
      return {
        gradient: 'from-blue-500 to-cyan-600',
        badge: 'bg-blue-500/20 text-blue-100 border-blue-400/30',
        emoji: '🌳',
      };
    case 'beginner':
      return {
        gradient: 'from-emerald-500 to-green-600',
        badge: 'bg-emerald-500/20 text-emerald-100 border-emerald-400/30',
        emoji: '🌿',
      };
    default:
      return {
        gradient: 'from-gray-500 to-gray-600',
        badge: 'bg-gray-500/20 text-gray-100 border-gray-400/30',
        emoji: '🌱',
      };
  }
}

