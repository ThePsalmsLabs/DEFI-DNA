'use client';

import { motion } from 'framer-motion';
import { Trophy, Star, Award, Medal, Crown } from 'lucide-react';
import { clsx } from 'clsx';

interface Achievement {
  achievement_type: string;
  achievement_name: string;
  achievement_tier: string;
  earned_at: string;
  points: number;
}

interface AchievementGridProps {
  achievements: Achievement[];
}

export function AchievementGrid({ achievements }: AchievementGridProps) {
  if (achievements.length === 0) {
    return (
      <div className="glass rounded-xl p-8 text-center">
        <Trophy className="w-12 h-12 text-gray-600 mx-auto mb-4" />
        <p className="text-gray-400">No achievements yet</p>
        <p className="text-sm text-gray-500 mt-2">
          Start trading and providing liquidity to earn achievements!
        </p>
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {achievements.map((achievement, index) => (
        <AchievementCard key={achievement.achievement_type} achievement={achievement} index={index} />
      ))}
    </div>
  );
}

function AchievementCard({ achievement, index }: { achievement: Achievement; index: number }) {
  const tierConfig = getTierConfig(achievement.achievement_tier);
  const date = new Date(achievement.earned_at);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.1 }}
      className={clsx(
        'relative rounded-xl p-6 border overflow-hidden',
        tierConfig.bg,
        tierConfig.border
      )}
    >
      {/* Glow effect */}
      <div className={clsx('absolute inset-0 opacity-20', tierConfig.glow)} />

      <div className="relative z-10">
        {/* Icon */}
        <div className={clsx('w-12 h-12 rounded-xl flex items-center justify-center mb-4', tierConfig.iconBg)}>
          <tierConfig.icon className={clsx('w-6 h-6', tierConfig.iconColor)} />
        </div>

        {/* Name */}
        <h3 className="font-display font-semibold text-lg mb-1">
          {achievement.achievement_name}
        </h3>

        {/* Tier badge */}
        <span className={clsx(
          'inline-block px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wider mb-3',
          tierConfig.badge
        )}>
          {achievement.achievement_tier}
        </span>

        {/* Points & Date */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">
            {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <span className={clsx('font-medium', tierConfig.pointsColor)}>
            +{achievement.points} pts
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function getTierConfig(tier: string) {
  switch (tier.toLowerCase()) {
    case 'platinum':
      return {
        icon: Crown,
        bg: 'bg-gradient-to-br from-slate-800 to-slate-900',
        border: 'border-slate-500/50',
        glow: 'bg-gradient-to-br from-slate-400 to-slate-600',
        iconBg: 'bg-slate-700',
        iconColor: 'text-slate-300',
        badge: 'bg-slate-600 text-slate-200',
        pointsColor: 'text-slate-300',
      };
    case 'gold':
      return {
        icon: Trophy,
        bg: 'bg-gradient-to-br from-amber-900/40 to-amber-950/40',
        border: 'border-amber-500/30',
        glow: 'bg-gradient-to-br from-amber-400 to-amber-600',
        iconBg: 'bg-amber-900/50',
        iconColor: 'text-amber-400',
        badge: 'bg-amber-600/30 text-amber-300',
        pointsColor: 'text-amber-400',
      };
    case 'silver':
      return {
        icon: Star,
        bg: 'bg-gradient-to-br from-gray-700/40 to-gray-800/40',
        border: 'border-gray-400/30',
        glow: 'bg-gradient-to-br from-gray-300 to-gray-500',
        iconBg: 'bg-gray-700/50',
        iconColor: 'text-gray-300',
        badge: 'bg-gray-600/30 text-gray-300',
        pointsColor: 'text-gray-300',
      };
    default: // bronze
      return {
        icon: Medal,
        bg: 'bg-gradient-to-br from-orange-900/30 to-orange-950/30',
        border: 'border-orange-600/30',
        glow: 'bg-gradient-to-br from-orange-400 to-orange-600',
        iconBg: 'bg-orange-900/50',
        iconColor: 'text-orange-400',
        badge: 'bg-orange-600/30 text-orange-300',
        pointsColor: 'text-orange-400',
      };
  }
}

