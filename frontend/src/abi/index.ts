/**
 * Contract ABIs for DeFi DNA Platform
 * 
 * These ABIs are automatically extracted from compiled contracts.
 * Update them by running: forge build in the contracts directory,
 * then re-extract using: jq '.abi' contracts/out/{Contract}.sol/{Contract}.json > frontend/src/abi/{Contract}.json
 */

import DNASubscriberABI from './DNASubscriber.json';
import DNAReaderABI from './DNAReader.json';
import AdvancedPositionManagerABI from './AdvancedPositionManager.json';

export const DNASubscriber = DNASubscriberABI;
export const DNAReader = DNAReaderABI;
export const AdvancedPositionManager = AdvancedPositionManagerABI;

// Export all ABIs as a single object for convenience
export const ABIs = {
  DNASubscriber: DNASubscriberABI,
  DNAReader: DNAReaderABI,
  AdvancedPositionManager: AdvancedPositionManagerABI,
} as const;

// Type exports for TypeScript
export type DNASubscriberABI = typeof DNASubscriberABI;
export type DNAReaderABI = typeof DNAReaderABI;
export type AdvancedPositionManagerABI = typeof AdvancedPositionManagerABI;
