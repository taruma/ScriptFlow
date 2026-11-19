import {BUNDLED_EXAMPLES, type BundledExample} from './examples/index.ts';

export type ScriptPreset = BundledExample;

export const SCRIPT_PRESETS: ScriptPreset[] = [...BUNDLED_EXAMPLES];

export const BLANK_SCRIPT_TEMPLATE = `[INTENT]
Create a cinematic scene set in a concrete hallway, featuring two characters confronting a hidden truth.

[LOGIC]
Maintain a stable 180-degree axis across all coverage and track held props explicitly between hands. No subtitles appear on screen.

[AESTHETIC]
Medium: 35mm film, naturalistic grain
Palette: cool slate, tungsten amber
Lighting: overhead practical key, soft shadow falloff
Location: narrow poured-concrete corridor, painted steel doorframe
Wardrobe: Character A in a charcoal coat; Character B in a dark wool sweater
Audio: faint electrical hum, distant street rumble

[OPENING]
MS at eye level down the corridor. Frame-left, Character A stands facing screen-right with a folded envelope in their right hand. Frame-right, Character B stands opposite facing screen-left.

[EXECUTION]
[CAM 01] MS, eye level -> [ACT] Character A lifts the folded envelope in their right hand and holds it between them -> <crisp paper crease>`;

export const DEFAULT_PRESET = SCRIPT_PRESETS[0];
