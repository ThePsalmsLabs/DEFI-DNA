'use client';

import { useAccount, useConnect, useDisconnect, useEnsName } from 'wagmi';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, ChevronDown, LogOut, Copy, ExternalLink, Check } from 'lucide-react';
import { clsx } from 'clsx';

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: ensName } = useEnsName({ address });
  
  const [showDropdown, setShowDropdown] = useState(false);
  const [showConnectors, setShowConnectors] = useState(false);
  const [copied, setCopied] = useState(false);

  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const copyAddress = async () => {
    if (address) {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isConnected) {
    return (
      <div className="relative w-full">
        <button
          onClick={() => setShowConnectors(!showConnectors)}
          disabled={isPending}
          className="w-full flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-primary-500 to-purple-500 text-white font-semibold rounded-xl hover:opacity-90 transition disabled:opacity-50 shadow-glow"
        >
          <Wallet className="w-5 h-5" />
          {isPending ? 'Connecting...' : 'Connect Wallet'}
        </button>

        <AnimatePresence>
          {showConnectors && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowConnectors(false)}
              />
              
              {/* Dropdown */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute right-0 mt-2 w-64 bg-gray-900 border border-gray-800 rounded-xl shadow-xl z-50 overflow-hidden"
              >
                <div className="p-3 border-b border-gray-800">
                  <p className="text-sm text-gray-400">Connect a wallet</p>
                </div>
                <div className="p-2">
                  {connectors.map((connector) => (
                    <button
                      key={connector.uid}
                      onClick={() => {
                        connect({ connector });
                        setShowConnectors(false);
                      }}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition text-left"
                    >
                      <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center">
                        <Wallet className="w-5 h-5 text-gray-400" />
                      </div>
                      <div>
                        <p className="font-medium">{connector.name}</p>
                        <p className="text-xs text-gray-500">
                          {connector.name === 'Injected' ? 'Browser Wallet' : 'Wallet Connect'}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-xl transition border border-gray-700"
      >
        <div className="w-6 h-6 rounded-full bg-gradient-to-r from-primary-500 to-purple-500" />
        <span className="font-mono text-sm">
          {ensName || truncateAddress(address!)}
        </span>
        <ChevronDown className={clsx('w-4 h-4 transition', showDropdown && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {showDropdown && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowDropdown(false)}
            />
            
            {/* Dropdown */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute right-0 mt-2 w-64 bg-gray-900 border border-gray-800 rounded-xl shadow-xl z-50 overflow-hidden"
            >
              <div className="p-4 border-b border-gray-800">
                <p className="text-sm text-gray-400">Connected</p>
                <p className="font-mono text-sm mt-1">{truncateAddress(address!)}</p>
                {ensName && (
                  <p className="text-primary-400 text-sm mt-1">{ensName}</p>
                )}
              </div>
              
              <div className="p-2">
                <button
                  onClick={copyAddress}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition text-left"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4 text-gray-400" />
                  )}
                  <span>{copied ? 'Copied!' : 'Copy Address'}</span>
                </button>
                
                <a
                  href={`https://etherscan.io/address/${address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition"
                >
                  <ExternalLink className="w-4 h-4 text-gray-400" />
                  <span>View on Etherscan</span>
                </a>
                
                <button
                  onClick={() => {
                    disconnect();
                    setShowDropdown(false);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 transition text-red-400"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Disconnect</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

