// Contract ABIs - loaded from JSON files in backend/abi directory
import * as path from 'path';
import * as fs from 'fs';

// In compiled code, __dirname is /app/dist/types/, so go up two levels to /app/, then into abi
const abiPath = path.join(__dirname, '../../abi');

// Load ABI files with error handling for Railway deployment
let DNASubscriberABI: any;
let DNAReaderABI: any;

try {
  const subscriberPath = path.join(abiPath, 'DNASubscriber.json');
  const readerPath = path.join(abiPath, 'DNAReader.json');
  
  if (!fs.existsSync(subscriberPath)) {
    throw new Error(`DNASubscriber.json not found at ${subscriberPath}`);
  }
  if (!fs.existsSync(readerPath)) {
    throw new Error(`DNAReader.json not found at ${readerPath}`);
  }

  DNASubscriberABI = JSON.parse(
    fs.readFileSync(subscriberPath, 'utf-8')
  );
  DNAReaderABI = JSON.parse(
    fs.readFileSync(readerPath, 'utf-8')
  );
} catch (error: any) {
  console.error('❌ Failed to load ABI files:', error.message);
  console.error('ABI path:', abiPath);
  // Use empty arrays as fallback to prevent crash
  DNASubscriberABI = [];
  DNAReaderABI = [];
  throw new Error(`Critical: Failed to load contract ABIs. Check that ABI files exist in ${abiPath}`);
}

export { DNASubscriberABI, DNAReaderABI };
