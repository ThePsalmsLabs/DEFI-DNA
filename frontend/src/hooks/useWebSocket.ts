'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface WebSocketMessage {
  type: string;
  address?: string;
  action?: any;
  achievement?: any;
  data?: any;
  message?: string;
}

interface UseWebSocketOptions {
  address?: string;
  onAction?: (action: any) => void;
  onAchievement?: (achievement: any) => void;
  onUpdate?: (data: any) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { address, onAction, onAchievement, onUpdate } = options;
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const queryClient = useQueryClient();

  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);

        // Subscribe to address if provided
        if (address) {
          ws.send(JSON.stringify({ type: 'subscribe', address }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          setLastMessage(message);

          switch (message.type) {
            case 'user:action':
              onAction?.(message.action);
              // Invalidate related queries to refetch data
              queryClient.invalidateQueries({ queryKey: ['profile', message.address] });
              queryClient.invalidateQueries({ queryKey: ['timeline', message.address] });
              queryClient.invalidateQueries({ queryKey: ['positions', message.address] });
              break;

            case 'user:achievement':
              onAchievement?.(message.achievement);
              queryClient.invalidateQueries({ queryKey: ['profile', message.address] });
              break;

            case 'user:update':
              onUpdate?.(message.data);
              queryClient.invalidateQueries({ queryKey: ['profile', message.address] });
              break;

            case 'leaderboard_update':
              console.log('[WebSocket] Leaderboard update received');
              queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
              onUpdate?.({ type: 'leaderboard_update', data: message.data });
              break;

            case 'ranking_changes':
              console.log('[WebSocket] Ranking changes received');
              queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
              onUpdate?.({ type: 'ranking_changes', data: message.data });
              break;

            case 'new_leader':
              console.log('[WebSocket] New leader announced');
              queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
              onUpdate?.({ type: 'new_leader', data: message.data });
              break;

            case 'connected':
              console.log('WebSocket:', message.message);
              break;

            case 'subscribed':
              console.log('Subscribed to:', message.address);
              break;

            case 'error':
              console.error('WebSocket error:', message.message);
              break;
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        wsRef.current = null;

        // Attempt to reconnect after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('Attempting to reconnect...');
          connect();
        }, 5000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
    }
  }, [wsUrl, address, onAction, onAchievement, onUpdate, queryClient]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const subscribe = useCallback((addr: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', address: addr }));
    }
  }, []);

  const unsubscribe = useCallback((addr: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'unsubscribe', address: addr }));
    }
  }, []);

  // Connect on mount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  // Subscribe when address changes
  useEffect(() => {
    if (address && isConnected) {
      subscribe(address);
    }
  }, [address, isConnected, subscribe]);

  return {
    isConnected,
    lastMessage,
    subscribe,
    unsubscribe,
    connect,
    disconnect,
  };
}

// Toast notification helper for achievements
export function useAchievementToast() {
  const [achievements, setAchievements] = useState<any[]>([]);

  const addAchievement = useCallback((achievement: any) => {
    setAchievements(prev => [...prev, { ...achievement, id: Date.now() }]);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      setAchievements(prev => prev.slice(1));
    }, 5000);
  }, []);

  const removeAchievement = useCallback((id: number) => {
    setAchievements(prev => prev.filter(a => a.id !== id));
  }, []);

  return { achievements, addAchievement, removeAchievement };
}

