import {useEffect, useRef, useState, type KeyboardEvent} from 'react';
import {ChevronDown, ChevronRight} from 'lucide-react';
import type {
  AestheticToken,
  CharacterBinding,
  LintDiagnostic,
  StagingBlock,
} from '../core/types.ts';
import {getMacroBlockMeta, UI_LABELS} from '../ui/labels.ts';
import {AestheticBlockEditor} from './AestheticBlockEditor.tsx';
import {DiagnosticDot} from './DiagnosticDot.tsx';
import {LiveHighlightedEditor} from './LiveHighlightedEditor.tsx';

interface StagingBlockCardProps {
  block: StagingBlock;
  blockIndex: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onCommit: (blockIndex: number, nextBody: string) => void;
  diagnostics: LintDiagnostic[];
  characters: CharacterBinding[];
  aestheticTokens: AestheticToken[];
}

const AESTHETIC_KEY_REGEX = /^\s*[A-Za-z0-9 _/-]+:/;

function countAestheticKeys(block: StagingBlock): number {
  let count = 0;
  for (const line of block.lines) {
    if (AESTHETIC_KEY_REGEX.test(line)) {
      count += 1;
    }
  }
  return count;
}

function getCollapsedMeta(
  block: StagingBlock,
  characters: CharacterBinding[],
  aestheticTokens: AestheticToken[]
): string {
  const nonEmptyCount = block.lines.filter((line) => line.trim().length > 0).length;
  if (nonEmptyCount === 0) return '';

  const parts: string[] = [];
  if (block.kind === 'INTENT' && characters.length > 0) {
    parts.push(UI_LABELS.staging.castBindings(characters.length));
  }
  if (block.kind === 'AESTHETIC') {
    if (aestheticTokens.length > 0) {
      parts.push(UI_LABELS.staging.mappedTokens(aestheticTokens.length));
    }
    const keyCount = countAestheticKeys(block);
    parts.push(
      keyCount > 0
        ? UI_LABELS.staging.keysCount(keyCount)
        : UI_LABELS.staging.linesCount(nonEmptyCount)
    );
    return parts.join(' · ');
  }

  parts.push(UI_LABELS.staging.linesCount(nonEmptyCount));
  return parts.join(' · ');
}

function getCollapsedPreviewText(block: StagingBlock): string {
  return block.lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

export function StagingBlockCard({
  block,
  blockIndex,
  collapsed,
  onToggleCollapse,
  onCommit,
  diagnostics,
  characters,
  aestheticTokens,
}: StagingBlockCardProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [localValue, setLocalValue] = useState(block.rawBody);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  const phase = getMacroBlockMeta(block.kind);

  useEffect(() => {
    if (!isFocused) {
      setLocalValue(block.rawBody);
    }
  }, [block.rawBody, isFocused]);

  const handleChange = (nextValue: string) => {
    setLocalValue(nextValue);
    onCommit(blockIndex, nextValue);
  };

  const handleBlur = () => {
    setIsFocused(false);
    const cleaned = localValue.replace(/\n+$/, '');
    if (cleaned !== block.rawBody) {
      onCommit(blockIndex, cleaned);
    }
    setLocalValue(cleaned);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      editorRef.current?.blur();
    }
  };

  const collapsedMeta = getCollapsedMeta(block, characters, aestheticTokens);
  const previewText = getCollapsedPreviewText(block);

  return (
    <section
      id={`staging-block-${blockIndex}`}
      className="group/staging relative grid min-w-0 grid-cols-[minmax(0,1fr)_24px] items-start gap-1.5"
    >
      <div
        className={`min-w-0 rounded-lg border transition-colors ${
          isFocused
            ? 'border-text-muted/60 bg-surface shadow-xs'
            : 'border-border-main bg-surface hover:border-text-faint/50'
        }`}
      >
        {/* Header Bar */}
        <div
          onClick={onToggleCollapse}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggleCollapse();
            }
          }}
          className="flex items-center justify-between gap-2.5 px-3 py-1.5 cursor-pointer select-none"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-text-faint shrink-0">
              {collapsed ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </span>

            <span
              className={`${phase.badgeClass} inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10.5px] font-semibold tracking-tight shrink-0`}
            >
              [{block.name}]
            </span>

            <span className="text-[11.5px] text-text-faint truncate">{phase.caption}</span>
          </div>

          {collapsed && collapsedMeta && (
            <span className="font-mono text-[10.5px] text-text-faint tabular-nums whitespace-nowrap shrink-0">
              {collapsedMeta}
            </span>
          )}
        </div>

        {/* Collapsed 2-Line Muted Plain-Text Preview vs. Live Syntax-Highlighted Editor */}
        {collapsed ? (
          <div
            onClick={onToggleCollapse}
            role="button"
            tabIndex={0}
            title={UI_LABELS.staging.expandPreviewTitle(block.name)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggleCollapse();
              }
            }}
            className="border-t border-border-subtle px-3 py-1.5 cursor-pointer hover:bg-surface-subtle/50 transition-colors rounded-b-lg"
          >
            {previewText ? (
              <p className="font-script auteur-script-size leading-[1.44] text-text-muted whitespace-pre-line break-words line-clamp-2">
                {previewText}
              </p>
            ) : (
              <p className="font-script auteur-script-size leading-[1.44] text-text-faint italic">
                {UI_LABELS.staging.emptySummary}
              </p>
            )}
          </div>
        ) : block.kind === 'AESTHETIC' ? (
          <div className="border-t border-border-subtle px-3 py-2">
            <AestheticBlockEditor
              rawBody={block.rawBody}
              aestheticTokens={aestheticTokens}
              onCommit={(nextBody) => onCommit(blockIndex, nextBody)}
              onFocusChange={setIsFocused}
            />
          </div>
        ) : (
          <div
            onClick={() => editorRef.current?.focus()}
            className="border-t border-border-subtle px-3 py-2 cursor-text"
          >
            <LiveHighlightedEditor
              ref={editorRef}
              value={localValue}
              onChange={handleChange}
              mode="staging"
              stagingKind={block.kind}
              aestheticTokens={aestheticTokens}
              ariaLabel={UI_LABELS.staging.editAria(block.name)}
              placeholder={UI_LABELS.staging.editPlaceholder(block.name)}
              onFocus={() => setIsFocused(true)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
            />
          </div>
        )}
      </div>

      {/* Right Margin Diagnostics (zero layout shift) */}
      <div className="flex w-6 justify-center pt-1">
        <DiagnosticDot diagnostics={diagnostics} />
      </div>
    </section>
  );
}
