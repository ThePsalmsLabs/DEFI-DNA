// Contract ABIs - loaded from JSON files in backend/abi directory
import * as path from 'path';
import * as fs from 'fs';

// In compiled code, __dirname is /app/dist/types/, so go up two levels to /app/, then into abi
const abiPath = path.join(__dirname, '../../abi');
export const DNASubscriberABI = JSON.parse(
  fs.readFileSync(path.join(abiPath, 'DNASubscriber.json'), 'utf-8')
);
export const DNAReaderABI = JSON.parse(
  fs.readFileSync(path.join(abiPath, 'DNAReader.json'), 'utf-8')
);
