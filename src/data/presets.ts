import {BUNDLED_EXAMPLES, type BundledExample} from './examples/index.ts';

export type ScriptPreset = BundledExample;

export const SCRIPT_PRESETS: ScriptPreset[] = [...BUNDLED_EXAMPLES];

export const BLANK_SCRIPT_TEMPLATE = '';

export const DEFAULT_PRESET = SCRIPT_PRESETS[0];
