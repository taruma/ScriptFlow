import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  BookOpen,
  Check,
  Code2,
  CopyPlus,
  Download,
  Eye,
  Folder,
  GitFork,
  Pencil,
  Pin,
  PinOff,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import type {BundledExample} from '../data/examples/index.ts';
import {APP_META, getMacroBlockMeta, UI_LABELS} from '../ui/labels.ts';
import type {ScriptRecord} from '../ui/scriptLibraryDb.ts';
import {
  extractLibraryScriptPreview,
  formatRelativeUpdatedTime,
  type LibraryRowItem,
} from '../ui/scriptLibraryView.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';

export interface LibraryPreviewPaneProps {
  row: LibraryRowItem | null;
  isActive: boolean;
  openedAt: number;
  existingFolders: readonly string[];
  onOpen: (row: LibraryRowItem) => void;
  onForkExample: (example: BundledExample) => void;
  onTogglePin: (record: ScriptRecord) => void;
  onRename: (record: ScriptRecord, nextTitle: string) => void;
  onUpdateMetadata: (
    record: ScriptRecord,
    patch: {folder?: string | null; tags?: string[]}
  ) => void;
  onDuplicate: (record: ScriptRecord) => void;
  onExportTxt: (record: ScriptRecord) => void;
  onRequestDelete: (record: ScriptRecord) => void;
}

type PreviewMode = 'structured' | 'source';

export const LibraryPreviewPane = memo(function LibraryPreviewPane({
  row,
  isActive,
  openedAt,
  existingFolders,
  onOpen,
  onForkExample,
  onTogglePin,
  onRename,
  onUpdateMetadata,
  onDuplicate,
  onExportTxt,
  onRequestDelete,
}: LibraryPreviewPaneProps) {
  const [previewMode, setPreviewMode] = useState<PreviewMode>('structured');
  const [isRenaming, setIsRenaming] = useState<boolean>(false);
  const [renameDraft, setRenameDraft] = useState<string>('');
  const [folderDraft, setFolderDraft] = useState<string>('');
  const [tagDraft, setTagDraft] = useState<string>('');

  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const rowKey = row ? `${row.kind}:${row.id}` : null;
  const rowFolder = row?.kind === 'custom' ? (row.folder ?? '') : '';

  // Reset transient drafts whenever the selected script changes
  useEffect(() => {
    setIsRenaming(false);
    setTagDraft('');
  }, [rowKey]);

  useEffect(() => {
    setFolderDraft(rowFolder);
  }, [rowKey, rowFolder]);

  useEffect(() => {
    if (!isRenaming) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [isRenaming]);

  const preview = useMemo(
    () => (row ? extractLibraryScriptPreview(row.rawText, 6) : null),
    [row]
  );

  if (!row || !preview) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 py-12 text-center bg-app/40">
        <BookOpen className="h-6 w-6 text-text-faint/60 mb-3" />
        <p className="font-serif text-sm font-bold text-text-main">
          {UI_LABELS.library.previewEmptyTitle}
        </p>
        <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-text-faint">
          {UI_LABELS.library.previewEmptyDesc}
        </p>
      </div>
    );
  }

  const isCustom = row.kind === 'custom';
  const currentTags = isCustom ? (row.tags ?? []) : [];

  const commitRename = () => {
    if (!isCustom) return;
    const cleaned = renameDraft.trim();
    setIsRenaming(false);
    if (cleaned.length > 0 && cleaned !== row.title) {
      onRename(row.record, cleaned);
    }
  };

  const handleRenameKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      commitRename();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setIsRenaming(false);
    }
  };

  const commitFolder = () => {
    if (!isCustom) return;
    const cleaned = folderDraft.trim().replace(/\s+/g, ' ');
    const current = row.folder ?? '';
    if (cleaned !== current) {
      onUpdateMetadata(row.record, {folder: cleaned || null});
    }
  };

  const handleFolderKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      commitFolder();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setFolderDraft(rowFolder);
      event.currentTarget.blur();
    }
  };

  const commitTag = () => {
    if (!isCustom) return;
    const cleaned = tagDraft.trim().replace(/^#+/, '').replace(/\s+/g, ' ').toLowerCase();
    setTagDraft('');
    if (!cleaned || currentTags.includes(cleaned)) return;
    onUpdateMetadata(row.record, {tags: [...currentTags, cleaned]});
  };

  const handleTagKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      event.stopPropagation();
      commitTag();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setTagDraft('');
      event.currentTarget.blur();
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    if (!isCustom) return;
    onUpdateMetadata(row.record, {
      tags: currentTags.filter((t) => t !== tagToRemove),
    });
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-app/35">
      {/* Editorial Header */}
      <div className="px-5 py-4 border-b border-border-subtle bg-surface shrink-0 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {isCustom && isRenaming ? (
              <div className="flex items-center gap-1.5">
                <input
                  ref={renameInputRef}
                  type="text"
                  data-native-undo="true"
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={handleRenameKeyDown}
                  onBlur={commitRename}
                  aria-label={UI_LABELS.library.renameInputAria}
                  placeholder={APP_META.untitledScene}
                  className="min-w-0 flex-1 rounded-lg border border-border-main bg-surface-subtle px-2.5 py-1 font-serif text-base font-bold text-text-main focus:bg-surface focus:outline-none focus:ring-1 focus:ring-text-muted"
                />
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commitRename();
                  }}
                  aria-label={UI_LABELS.library.saveRenameAria}
                  className={UI_TOKENS.button.iconGhost}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setIsRenaming(false);
                  }}
                  aria-label={UI_LABELS.library.cancelRenameAria}
                  className={UI_TOKENS.button.iconGhost}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="truncate font-serif text-base font-bold tracking-tight text-text-main">
                  {row.title}
                </h3>
                {isCustom && (
                  <button
                    type="button"
                    onClick={() => {
                      setRenameDraft(row.title);
                      setIsRenaming(true);
                    }}
                    title={UI_LABELS.library.renameAction}
                    aria-label={UI_LABELS.library.renameAria(row.title)}
                    className="rounded-md p-1 text-text-faint hover:bg-surface-muted hover:text-text-main transition-colors cursor-pointer shrink-0"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}

            <div className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[10.5px] text-text-faint tabular-nums">
              {row.kind === 'example' ? (
                <>
                  <span className="auteur-phase-logic inline-flex items-center rounded border px-1.5 py-px text-[9.5px] font-semibold">
                    {UI_LABELS.library.exampleBadge}
                  </span>
                  <span>{row.topology}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {preview.beatCount} {UI_LABELS.topBar.beatUnit(preview.beatCount)}
                  </span>
                </>
              ) : (
                <>
                  {isActive && (
                    <span className="inline-flex items-center rounded border border-border-main bg-surface-muted px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-text-muted">
                      {UI_LABELS.library.activeBadge}
                    </span>
                  )}
                  <span>
                    {preview.beatCount} {UI_LABELS.topBar.beatUnit(preview.beatCount)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{formatRelativeUpdatedTime(row.updatedAt, openedAt)}</span>
                </>
              )}
            </div>
          </div>

          {/* Primary Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {isCustom && (
              <button
                type="button"
                onClick={() => onTogglePin(row.record)}
                title={row.pinned ? UI_LABELS.library.unpinAction : UI_LABELS.library.pinAction}
                aria-label={
                  row.pinned
                    ? UI_LABELS.library.unpinAria(row.title)
                    : UI_LABELS.library.pinAria(row.title)
                }
                className={
                  row.pinned
                    ? 'inline-flex items-center justify-center p-1.5 rounded-lg border border-border-main bg-surface-muted text-text-main hover:bg-surface-hover transition-colors cursor-pointer shrink-0'
                    : UI_TOKENS.button.iconGhost
                }
              >
                {row.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
              </button>
            )}

            {row.kind === 'example' ? (
              <>
                <button
                  type="button"
                  onClick={() => onOpen(row)}
                  className={UI_TOKENS.button.actionPill}
                >
                  <span>
                    {isActive ? UI_LABELS.library.alreadyOpenAction : UI_LABELS.library.openAction}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onForkExample(row.example)}
                  className={UI_TOKENS.button.primary}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <GitFork className="h-3.5 w-3.5" />
                    <span>{UI_LABELS.library.forkAction}</span>
                  </span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onOpen(row)}
                className={isActive ? UI_TOKENS.button.secondary : UI_TOKENS.button.primary}
              >
                {isActive ? UI_LABELS.library.alreadyOpenAction : UI_LABELS.library.openAction}
              </button>
            )}
          </div>
        </div>

        {/* Quiet Folder & Tags Organizer (Custom Scripts Only) */}
        {isCustom ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-2 border-t border-border-subtle/80 text-xs">
            <div className="inline-flex items-center gap-1.5 min-w-[140px] max-w-[200px]">
              <Folder className="h-3 w-3 text-text-faint shrink-0" />
              <input
                type="text"
                list="library-existing-folders"
                data-native-undo="true"
                value={folderDraft}
                onChange={(e) => setFolderDraft(e.target.value)}
                onBlur={commitFolder}
                onKeyDown={handleFolderKeyDown}
                placeholder={UI_LABELS.library.folderPlaceholder}
                aria-label={UI_LABELS.library.folderInputAria}
                className="min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-0.5 text-[11.5px] text-text-body placeholder-text-placeholder hover:bg-surface-subtle focus:bg-surface-subtle focus:outline-none focus:ring-1 focus:ring-border-main"
              />
              <datalist id="library-existing-folders">
                {existingFolders.map((folder) => (
                  <option key={folder} value={folder} />
                ))}
              </datalist>
            </div>

            <span aria-hidden="true" className="h-3.5 w-px bg-border-main/80 hidden sm:inline-block" />

            <div className="flex flex-1 flex-wrap items-center gap-1.5 min-w-[160px]">
              <Tag className="h-3 w-3 text-text-faint shrink-0" />
              {currentTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-md border border-border-main bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-muted"
                >
                  <span>#{tag}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    aria-label={UI_LABELS.library.removeTagAria(tag)}
                    className="text-text-faint hover:text-text-main cursor-pointer"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                data-native-undo="true"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={commitTag}
                placeholder={UI_LABELS.library.tagPlaceholder}
                aria-label={UI_LABELS.library.tagInputAria}
                className="w-20 min-w-[72px] rounded-md bg-transparent px-1.5 py-0.5 font-mono text-[10.5px] text-text-body placeholder-text-placeholder hover:bg-surface-subtle focus:bg-surface-subtle focus:w-28 focus:outline-none focus:ring-1 focus:ring-border-main transition-all"
              />
            </div>
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-text-muted pt-1 border-t border-border-subtle/80">
            {row.summary}
          </p>
        )}
      </div>

      {/* Preview Mode Switcher Strip */}
      <div className="flex items-center justify-between gap-2 px-5 py-2 border-b border-border-subtle bg-surface-subtle/70 shrink-0">
        <div className="inline-flex items-center bg-surface-muted p-0.5 rounded-lg border border-border-main">
          <button
            type="button"
            onClick={() => setPreviewMode('structured')}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
              previewMode === 'structured'
                ? 'bg-surface text-text-main shadow-2xs'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            <Eye className="h-3 w-3" />
            <span>{UI_LABELS.library.previewModeStructured}</span>
          </button>
          <button
            type="button"
            onClick={() => setPreviewMode('source')}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
              previewMode === 'source'
                ? 'bg-surface text-text-main shadow-2xs'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            <Code2 className="h-3 w-3" />
            <span>{UI_LABELS.library.previewModeSource}</span>
          </button>
        </div>

        {!isCustom && (
          <span className="text-[10.5px] text-text-faint truncate">
            {UI_LABELS.library.previewReadOnlyNote}
          </span>
        )}
      </div>

      {/* Scrollable Preview Content */}
      <div className="auteur-pane-scroll flex-1 min-h-0 overflow-y-auto px-5 py-4">
        {previewMode === 'source' ? (
          <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-text-body bg-surface rounded-xl border border-border-subtle p-4">
            {row.rawText}
          </pre>
        ) : (
          <div className="space-y-5">
            {/* Phase 1 — Staging Overview */}
            <section className="space-y-2">
              <h4 className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-faint">
                {UI_LABELS.library.previewStagingHeading}
              </h4>
              {preview.stagingBlocks.length === 0 ? (
                <p className="text-xs italic text-text-faint">
                  {UI_LABELS.library.previewNoStaging}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {preview.stagingBlocks.map((block, idx) => {
                    const meta = getMacroBlockMeta(block.kind);
                    return (
                      <div
                        key={`${block.name}-${idx}`}
                        className="rounded-xl border border-border-subtle bg-surface px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`${meta.badgeClass} inline-flex items-center rounded border px-1.5 py-px font-mono text-[9.5px] font-semibold uppercase tracking-wide`}
                          >
                            [{block.name}]
                          </span>
                          <span className="font-mono text-[10px] text-text-faint tabular-nums">
                            {UI_LABELS.source.linesCount(block.lineCount)}
                          </span>
                        </div>
                        {block.excerpt && (
                          <p className="mt-1.5 font-script text-[12.5px] leading-relaxed text-text-body line-clamp-2">
                            {block.excerpt}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Phase 2 — Execution Beats */}
            <section className="space-y-2">
              <h4 className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-faint">
                {UI_LABELS.library.previewExecutionHeading}
              </h4>
              {preview.previewBeats.length === 0 ? (
                <p className="text-xs italic text-text-faint">
                  {UI_LABELS.library.previewNoBeats}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {preview.previewBeats.map((beat) => (
                    <div
                      key={beat.index}
                      className="flex items-baseline gap-2.5 rounded-xl border border-border-subtle bg-surface px-3 py-2"
                    >
                      <span className="font-mono text-[10.5px] font-semibold text-text-faint tabular-nums shrink-0">
                        S{beat.index}
                      </span>
                      <p className="min-w-0 flex-1 font-script text-[12.5px] leading-relaxed text-text-body line-clamp-2">
                        {beat.raw}
                      </p>
                    </div>
                  ))}
                  {preview.remainingBeatCount > 0 && (
                    <p className="pt-1 text-center font-mono text-[10.5px] text-text-faint">
                      {UI_LABELS.library.previewMoreBeats(preview.remainingBeatCount)}
                    </p>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {/* Quiet Footer Utility Bar (Custom Scripts Only) */}
      {isCustom && (
        <div className="flex items-center justify-between gap-2 px-5 py-2.5 border-t border-border-subtle bg-surface shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onDuplicate(row.record)}
              className={UI_TOKENS.button.actionPill}
            >
              <CopyPlus className="h-3.5 w-3.5 text-text-muted" />
              <span>{UI_LABELS.library.duplicateAction}</span>
            </button>
            <button
              type="button"
              onClick={() => onExportTxt(row.record)}
              className={UI_TOKENS.button.actionPill}
            >
              <Download className="h-3.5 w-3.5 text-text-muted" />
              <span>{UI_LABELS.library.exportTxtAction}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => onRequestDelete(row.record)}
            aria-label={UI_LABELS.library.deleteAria(row.title)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-muted hover:bg-red-500/10 hover:text-red-500 transition-colors cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>{UI_LABELS.library.deleteAction}</span>
          </button>
        </div>
      )}
    </div>
  );
});
