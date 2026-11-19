import {useEffect, useRef, useState, type KeyboardEvent} from 'react';
import {ChevronDown, ChevronRight} from 'lucide-react';
import type {
  AestheticToken,
  CharacterBinding,
  LintDiagnostic,
  StagingBlock,
} from '../core/types.ts';
import {getMacroBlockMeta, UI_LABELS} from '../ui/labels.ts';
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

function getCollapsedSummary(
  block: StagingBlock,
  characters: CharacterBinding[],
  aestheticTokens: AestheticToken[]
): string {
  const firstNonEmpty = block.lines.find((line) => line.trim().length > 0)?.trim() ?? '';

  if (block.kind === 'INTENT' && characters.length > 0) {
    const bindingSummary = characters
      .slice(0, 3)
      .map((c) => `${c.ref} → ${c.name}`)
      .join(' · ');
    return `${bindingSummary}${firstNonEmpty ? ` — ${firstNonEmpty}` : ''}`;
  }

  if (block.kind === 'AESTHETIC') {
    const lineCount = block.lines.filter((l) => l.trim().length > 0).length;
    const tokenNote =
      aestheticTokens.length > 0
        ? `${UI_LABELS.staging.mappedTokens(aestheticTokens.length)} · `
        : '';
    return `${tokenNote}${UI_LABELS.staging.lookbookLines(lineCount)}${firstNonEmpty ? ` · ${firstNonEmpty}` : ''}`;
  }

  return firstNonEmpty || UI_LABELS.staging.emptySummary;
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

  const summary = getCollapsedSummary(block, characters, aestheticTokens);

  return (
    <section
      id={`staging-block-${blockIndex}`}
      className="group/staging relative grid min-w-0 grid-cols-[minmax(0,1fr)_28px] items-start gap-2"
    >
      <div
        className={`min-w-0 rounded-xl border transition-colors ${
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
          className="flex items-center justify-between gap-3 px-4 py-2.5 cursor-pointer select-none"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="text-text-faint shrink-0">
              {collapsed ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </span>

            <span
              className={`${phase.badgeClass} inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold tracking-tight shrink-0`}
            >
              [{block.name}]
            </span>

            {collapsed ? (
              <span className="truncate font-mono text-xs text-text-muted">{summary}</span>
            ) : (
              <span className="text-xs text-text-faint truncate">{phase.caption}</span>
            )}
          </div>
        </div>

        {/* Always-Live Syntax-Highlighted Body */}
        {!collapsed && (
          <div
            onClick={() => editorRef.current?.focus()}
            className="border-t border-border-subtle px-4 py-3 cursor-text"
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
      <div className="flex w-7 justify-center pt-1.5">
        <DiagnosticDot diagnostics={diagnostics} />
      </div>
    </section>
  );
}
