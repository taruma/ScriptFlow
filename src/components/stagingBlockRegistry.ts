import type {ComponentType} from 'react';
import {countAestheticKeys} from '../core/aesthetic.ts';
import type {HistoryCommitMode} from '../core/history.ts';
import type {
  AestheticToken,
  CharacterBinding,
  MacroBlockKind,
  StagingBlock,
} from '../core/types.ts';
import {UI_LABELS} from '../ui/labels.ts';
import {AestheticBlockEditor} from './AestheticBlockEditor.tsx';

export interface StagingBlockCommitOptions {
  mode?: HistoryCommitMode;
  groupKey?: string;
}

/**
 * Standard props contract for any specialized Staging Macro-Block editor plugin.
 * Every plugin must commit canonical plain-text body updates via `onCommit`
 * so Plain-Text-as-Truth remains unbroken.
 */
export interface StagingBlockEditorProps {
  rawBody: string;
  aestheticTokens: AestheticToken[];
  historyRevision?: number;
  autoFocus?: boolean;
  onClearAutoFocus?: () => void;
  onCommit: (nextBody: string, options?: StagingBlockCommitOptions) => void;
  onFocusChange: (focused: boolean) => void;
}

export interface StagingBlockMetaContext {
  block: StagingBlock;
  characters: CharacterBinding[];
  aestheticTokens: AestheticToken[];
  nonEmptyLineCount: number;
}

export interface StagingBlockPlugin {
  /** Optional custom structured editor replacing the default live-highlighted plain-text editor */
  Editor?: ComponentType<StagingBlockEditorProps>;
  /** Optional custom collapsed header metadata chips (joined with ` · `) */
  summarizeMeta?: (ctx: StagingBlockMetaContext) => string[];
}

/**
 * Pluggable registry mapping canonical Staging `MacroBlockKind`s to specialized
 * editors and collapsed summary formatters. Unregistered kinds automatically fall
 * back to `LiveHighlightedEditor` and a standard line count.
 */
const STAGING_BLOCK_REGISTRY: Partial<Record<MacroBlockKind, StagingBlockPlugin>> = {
  INTENT: {
    summarizeMeta: ({characters, nonEmptyLineCount}) => {
      const parts: string[] = [];
      if (characters.length > 0) {
        parts.push(UI_LABELS.staging.castBindings(characters.length));
      }
      parts.push(UI_LABELS.staging.linesCount(nonEmptyLineCount));
      return parts;
    },
  },
  AESTHETIC: {
    Editor: AestheticBlockEditor,
    summarizeMeta: ({block, aestheticTokens, nonEmptyLineCount}) => {
      const parts: string[] = [];
      if (aestheticTokens.length > 0) {
        parts.push(UI_LABELS.staging.mappedTokens(aestheticTokens.length));
      }
      const keyCount = countAestheticKeys(block.lines);
      parts.push(
        keyCount > 0
          ? UI_LABELS.staging.keysCount(keyCount)
          : UI_LABELS.staging.linesCount(nonEmptyLineCount)
      );
      return parts;
    },
  },
};

export function getStagingBlockPlugin(kind: MacroBlockKind): StagingBlockPlugin | undefined {
  return STAGING_BLOCK_REGISTRY[kind];
}

export function formatStagingCollapsedMeta(
  block: StagingBlock,
  characters: CharacterBinding[],
  aestheticTokens: AestheticToken[]
): string {
  const nonEmptyLineCount = block.lines.filter((line) => line.trim().length > 0).length;
  if (nonEmptyLineCount === 0) return '';

  const plugin = getStagingBlockPlugin(block.kind);
  const parts = plugin?.summarizeMeta
    ? plugin.summarizeMeta({block, characters, aestheticTokens, nonEmptyLineCount})
    : [UI_LABELS.staging.linesCount(nonEmptyLineCount)];

  return parts.join(' · ');
}
