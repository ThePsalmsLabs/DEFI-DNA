'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { mainnet, sepolia } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';
import { useState } from 'react';

// Wagmi config
const config = createConfig({
  chains: [mainnet, sepolia],
  connectors: [
    injected(),
    walletConnect({
      projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || 'demo',
    }),
  ],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}

