import {AI_LABELS} from './labels/ai.ts';
import {DEBUG_LABELS} from './labels/debug.ts';
import {EDITOR_LABELS} from './labels/editor.ts';
import {LIBRARY_LABELS} from './labels/library.ts';

export {
  APP_META,
  MACRO_BLOCK_META,
  getMacroBlockMeta,
  type MacroBlockMeta,
} from './labels/meta.ts';

/**
 * Single Source of Truth (SSOT) for all user-facing UI labels, captions,
 * placeholders, tooltips, and status copy across the editor interface.
 */
export const UI_LABELS = {
  ...EDITOR_LABELS,
  ...LIBRARY_LABELS,
  ...DEBUG_LABELS,
  ...AI_LABELS,
} as const;
