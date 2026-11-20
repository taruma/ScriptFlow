import {memo, useCallback, useEffect, useRef, useState, type KeyboardEvent} from 'react';
import {ChevronDown, ChevronRight, GripVertical, Trash2} from 'lucide-react';
import type {
  AestheticToken,
  CharacterBinding,
  LintDiagnostic,
  StagingBlock,
} from '../core/types.ts';
import {getMacroBlockMeta, UI_LABELS} from '../ui/labels.ts';
import {DiagnosticDot} from './DiagnosticDot.tsx';
import {LiveHighlightedEditor} from './LiveHighlightedEditor.tsx';
import type {SortableItemBinding} from './SortableList.tsx';
import {
  formatStagingCollapsedMeta,
  getStagingBlockPlugin,
  type StagingBlockCommitOptions,
} from './stagingBlockRegistry.ts';

interface StagingBlockCardProps {
  block: StagingBlock;
  blockIndex: number;
  historyRevision: number;
  readOnly?: boolean;
  collapsed: boolean;
  onToggleCollapse: (blockIndex: number) => void;
  onCommit: (blockIndex: number, nextBody: string, options?: StagingBlockCommitOptions) => void;
  onDelete: (blockIndex: number) => void;
  autoFocusEdit?: boolean;
  onClearAutoFocus?: () => void;
  diagnostics: LintDiagnostic[];
  characters: CharacterBinding[];
  aestheticTokens: AestheticToken[];
  drag?: SortableItemBinding;
}

function getCollapsedPreviewText(block: StagingBlock): string {
  return block.lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

export const StagingBlockCard = memo(function StagingBlockCard({
  block,
  blockIndex,
  historyRevision,
  readOnly = false,
  collapsed,
  onToggleCollapse,
  onCommit,
  onDelete,
  autoFocusEdit = false,
  onClearAutoFocus,
  diagnostics,
  characters,
  aestheticTokens,
  drag,
}: StagingBlockCardProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [localValue, setLocalValue] = useState(block.rawBody);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const lastHistoryRevisionRef = useRef(historyRevision);

  const phase = getMacroBlockMeta(block.kind);
  const plugin = getStagingBlockPlugin(block.kind);
  const CustomEditor = plugin?.Editor;

  useEffect(() => {
    const isHistoryJump = lastHistoryRevisionRef.current !== historyRevision;
    lastHistoryRevisionRef.current = historyRevision;
    if (!isFocused || isHistoryJump) {
      setLocalValue(block.rawBody);
    }
  }, [block.rawBody, isFocused, historyRevision]);

  useEffect(() => {
    if (!autoFocusEdit || collapsed || CustomEditor) return;
    editorRef.current?.focus();
    onClearAutoFocus?.();
  }, [autoFocusEdit, collapsed, CustomEditor, onClearAutoFocus]);

  const handleToggleCollapse = useCallback(() => {
    onToggleCollapse(blockIndex);
  }, [onToggleCollapse, blockIndex]);

  const handleChange = useCallback(
    (nextValue: string) => {
      if (readOnly) return;
      setLocalValue(nextValue);
      onCommit(blockIndex, nextValue, {mode: 'coalesce'});
    },
    [readOnly, onCommit, blockIndex]
  );

  const handleCustomCommit = useCallback(
    (nextBody: string, options?: StagingBlockCommitOptions) => {
      if (readOnly) return;
      onCommit(blockIndex, nextBody, options);
    },
    [readOnly, onCommit, blockIndex]
  );

  const handleEditorFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    if (readOnly) return;
    const cleaned = localValue.replace(/\n+$/, '');
    if (cleaned !== block.rawBody) {
      onCommit(blockIndex, cleaned, {mode: 'coalesce'});
    }
    setLocalValue(cleaned);
  }, [readOnly, localValue, block.rawBody, onCommit, blockIndex]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      editorRef.current?.blur();
    }
  }, []);

  const isDragging = Boolean(drag?.isDragging);
  const handleProps = !readOnly && drag ? drag.getHandleProps(isFocused) : null;

  const collapsedMeta = collapsed
    ? formatStagingCollapsedMeta(block, characters, aestheticTokens)
    : '';
  const previewText = collapsed ? getCollapsedPreviewText(block) : '';

  return (
    <section
      id={`staging-block-${blockIndex}`}
      className={`group/staging relative grid min-w-0 grid-cols-[minmax(0,1fr)_24px] items-start gap-1.5 transition-opacity ${
        isDragging ? 'opacity-30' : 'opacity-100'
      }`}
    >
      <div
        className={`min-w-0 rounded-lg border transition-colors ${
          isDragging
            ? 'border-dashed border-text-muted/60 bg-surface-subtle/60'
            : isFocused
              ? 'border-text-muted/60 bg-surface shadow-xs'
              : 'border-border-main bg-surface hover:border-text-faint/50'
        }`}
      >
        {/* Header Bar */}
        <div
          onClick={handleToggleCollapse}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleToggleCollapse();
            }
          }}
          className="flex items-center justify-between gap-2.5 px-2.5 py-1.5 cursor-pointer select-none"
        >
          <div className="flex min-w-0 items-center gap-1.5">
            {handleProps && (
              <div
                {...handleProps}
                onClick={(e) => {
                  e.stopPropagation();
                  handleProps.onClick?.(e);
                }}
                title={UI_LABELS.staging.dragReorderTitle}
                aria-label={UI_LABELS.staging.dragReorderTitle}
                className="flex h-4 w-3.5 shrink-0 items-center justify-center rounded text-text-faint opacity-0 group-hover/staging:opacity-100 focus-visible:opacity-100 hover:bg-surface-muted hover:text-text-main cursor-grab active:cursor-grabbing transition-opacity"
              >
                <GripVertical className="h-3 w-3" />
              </div>
            )}

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

          <div className="flex items-center gap-1.5 shrink-0">
            {collapsed && collapsedMeta && (
              <span className="font-mono text-[10.5px] text-text-faint tabular-nums whitespace-nowrap">
                {collapsedMeta}
              </span>
            )}

            {!readOnly && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(blockIndex);
                }}
                title={UI_LABELS.staging.deleteBlockTitle(block.name)}
                aria-label={UI_LABELS.staging.deleteBlockTitle(block.name)}
                className="rounded-md p-1 text-text-faint opacity-0 group-hover/staging:opacity-100 focus-visible:opacity-100 hover:bg-surface-muted hover:text-red-500 transition-opacity cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Collapsed 2-Line Muted Plain-Text Preview vs. Live Syntax-Highlighted Editor */}
        {collapsed ? (
          <div
            onClick={handleToggleCollapse}
            role="button"
            tabIndex={0}
            title={UI_LABELS.staging.expandPreviewTitle(block.name)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleToggleCollapse();
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
        ) : CustomEditor ? (
          <div className="border-t border-border-subtle px-3 py-2">
            <CustomEditor
              rawBody={block.rawBody}
              aestheticTokens={aestheticTokens}
              historyRevision={historyRevision}
              readOnly={readOnly}
              autoFocus={autoFocusEdit && !readOnly}
              onClearAutoFocus={onClearAutoFocus}
              onCommit={handleCustomCommit}
              onFocusChange={setIsFocused}
            />
          </div>
        ) : (
          <div
            onClick={() => {
              if (!readOnly) editorRef.current?.focus();
            }}
            className={`border-t border-border-subtle px-3 py-2 ${readOnly ? '' : 'cursor-text'}`}
          >
            <LiveHighlightedEditor
              ref={editorRef}
              value={localValue}
              readOnly={readOnly}
              onChange={handleChange}
              mode="staging"
              stagingKind={block.kind}
              aestheticTokens={aestheticTokens}
              ariaLabel={UI_LABELS.staging.editAria(block.name)}
              placeholder={UI_LABELS.staging.editPlaceholder(block.name)}
              onFocus={handleEditorFocus}
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
});
