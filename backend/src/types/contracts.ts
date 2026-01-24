// Contract ABIs - imported from frontend or loaded from JSON
import * as path from 'path';
import * as fs from 'fs';

const abiPath = path.join(__dirname, '../../../frontend/src/abi');
export const DNASubscriberABI = JSON.parse(
  fs.readFileSync(path.join(abiPath, 'DNASubscriber.json'), 'utf-8')
);
export const DNAReaderABI = JSON.parse(
  fs.readFileSync(path.join(abiPath, 'DNAReader.json'), 'utf-8')
);
