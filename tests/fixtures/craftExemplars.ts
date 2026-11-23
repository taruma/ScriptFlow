import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const FIXTURES_DIR = dirname(fileURLToPath(import.meta.url));

function loadFixture(fileName: string): string {
  return readFileSync(resolve(FIXTURES_DIR, fileName), 'utf8')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n+$/, '');
}

export const TEST_CRAFT_EXEMPLARS = {
  'forest-pov-horror': {
    id: 'forest-pov-horror',
    title: 'POV Forest Horror',
    topology: 'POV Handheld Oner',
    content: loadFixture('forest-pov-horror.txt'),
  },
  'interrogation-coverage': {
    id: 'interrogation-coverage',
    title: 'Interrogation Room Coverage',
    topology: 'Multi-Cam Coverage',
    content: loadFixture('interrogation-coverage.txt'),
  },
  'heist-montage': {
    id: 'heist-montage',
    title: '1970s Heist Montage',
    topology: 'Discontinuous Montage',
    content: loadFixture('heist-montage.txt'),
  },
} as const;
