import type {MacroBlockKind} from '../../core/types.ts';

/**
 * Single Source of Truth (SSOT) for all user-facing UI labels, captions,
 * placeholders, tooltips, and status copy across the editor interface.
 */

export const APP_META = {
  name: 'ScriptFlow',
  descriptor: 'Auteur Script Editor & Scene Blueprint',
  tagline: 'Draft the World. Direct Every Beat.',
  version: '1.0.0',
  specVersion: '0.4.0',
  shortMark: 'S',
  untitledScene: 'Untitled Scene',
  authorName: 'Taruma Sakti',
  authorUrl: 'https://github.com/taruma',
  githubUrl: 'https://github.com/taruma/ScriptFlow',
  sceneflowUrl: 'https://github.com/taruma/screenplay-sync',
  stageflowUrl: 'https://github.com/taruma/stageflow',
} as const;

export interface MacroBlockMeta {
  caption: string;
  badgeClass: string;
}

export const MACRO_BLOCK_META: Record<MacroBlockKind, MacroBlockMeta> = {
  INTENT: {
    caption: 'Directorial Intent',
    badgeClass: 'auteur-phase-intent',
  },
  LOGIC: {
    caption: 'Coordinate Fence',
    badgeClass: 'auteur-phase-logic',
  },
  AESTHETIC: {
    caption: 'World Lookbook',
    badgeClass: 'auteur-phase-aesthetic',
  },
  OPENING: {
    caption: 'First-Frame Anchor · S0',
    badgeClass: 'auteur-phase-opening',
  },
  'CONTINUITY PROTOCOL': {
    caption: 'Continuity Inheritance',
    badgeClass: 'auteur-phase-continuity',
  },
  CHARACTERS: {
    caption: 'Cast Ledger',
    badgeClass: 'auteur-phase-slate',
  },
  REFERENCES: {
    caption: 'Reference Assets',
    badgeClass: 'auteur-phase-slate',
  },
  STAGE: {
    caption: 'Spatial Stage',
    badgeClass: 'auteur-phase-slate',
  },
  EXECUTION: {
    caption: 'Active Timeline',
    badgeClass: 'auteur-phase-execution',
  },
  CUSTOM: {
    caption: 'Staging Macro-Block',
    badgeClass: 'auteur-phase-slate',
  },
};

export function getMacroBlockMeta(kind: MacroBlockKind): MacroBlockMeta {
  return MACRO_BLOCK_META[kind] ?? MACRO_BLOCK_META.CUSTOM;
}
