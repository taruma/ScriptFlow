import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {Check, ChevronDown, Folder, FolderPlus, X} from 'lucide-react';
import {UI_LABELS} from '../../ui/labels.ts';
import {
  buildFolderPickerOptions,
  type FolderPickerOption,
} from '../../ui/scriptLibraryView.ts';

export interface LibraryFolderComboboxProps {
  rowKey: string;
  currentFolder: string;
  existingFolders: readonly string[];
  onCommitFolder: (nextFolder: string | null) => void;
}

/**
 * Theme-aware custom folder combobox for LibraryPreviewPane.
 * Replaces the unstylable native browser <datalist> popup with a quiet,
 * keyboard-navigable dropdown matching the editor's 4-theme surface tokens.
 */
export function LibraryFolderCombobox({
  rowKey,
  currentFolder,
  existingFolders,
  onCommitFolder,
}: LibraryFolderComboboxProps) {
  const [draft, setDraft] = useState<string>(currentFolder);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [filterByDraft, setFilterByDraft] = useState<boolean>(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useId();

  useEffect(() => {
    setDraft(currentFolder);
  }, [rowKey, currentFolder]);

  useEffect(() => {
    setIsOpen(false);
    setFilterByDraft(false);
    setHighlightedIndex(-1);
  }, [rowKey]);

  const options = useMemo(
    () => buildFolderPickerOptions(existingFolders, draft, currentFolder, filterByDraft),
    [existingFolders, draft, currentFolder, filterByDraft]
  );

  // Close menu on outside pointer down
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setFilterByDraft(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  // Keep highlightedIndex within bounds as filtered items change
  useEffect(() => {
    if (options.items.length === 0) {
      setHighlightedIndex(-1);
    } else if (highlightedIndex >= options.items.length) {
      setHighlightedIndex(options.items.length - 1);
    }
  }, [options.items.length, highlightedIndex]);

  const commitDraftValue = (rawValue: string) => {
    const cleaned = rawValue.trim().replace(/\s+/g, ' ');
    setDraft(cleaned);
    if (cleaned !== currentFolder) {
      onCommitFolder(cleaned || null);
    }
  };

  const applyOption = (option: FolderPickerOption) => {
    setIsOpen(false);
    setFilterByDraft(false);
    setHighlightedIndex(-1);
    if (option.kind === 'clear') {
      setDraft('');
      if (currentFolder !== '') {
        onCommitFolder(null);
      }
    } else {
      setDraft(option.folder);
      if (option.folder !== currentFolder) {
        onCommitFolder(option.folder);
      }
    }
    inputRef.current?.blur();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      if (options.items.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(0);
      } else {
        setHighlightedIndex((prev) =>
          prev < 0 || prev >= options.items.length - 1 ? 0 : prev + 1
        );
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      if (options.items.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(options.items.length - 1);
      } else {
        setHighlightedIndex((prev) =>
          prev <= 0 ? options.items.length - 1 : prev - 1
        );
      }
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      if (isOpen && highlightedIndex >= 0 && options.items[highlightedIndex]) {
        applyOption(options.items[highlightedIndex]);
      } else {
        setIsOpen(false);
        setFilterByDraft(false);
        setHighlightedIndex(-1);
        commitDraftValue(draft);
        event.currentTarget.blur();
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (isOpen) {
        setIsOpen(false);
        setFilterByDraft(false);
        setHighlightedIndex(-1);
      } else {
        setDraft(currentFolder);
        event.currentTarget.blur();
      }
    }
  };

  const showToggleButton = existingFolders.length > 0 || currentFolder.length > 0;
  const showMenu = isOpen && options.items.length > 0;
  const hasExistingBeforeClear = options.hasExistingMatches;

  return (
    <div
      ref={containerRef}
      className="relative inline-flex items-center gap-1.5 min-w-[150px] max-w-[220px]"
    >
      <Folder className="h-3 w-3 text-text-faint shrink-0" />
      <div
        className={`relative flex flex-1 min-w-0 items-center rounded-md transition-colors ${
          isOpen
            ? 'bg-surface-subtle ring-1 ring-border-main'
            : 'hover:bg-surface-subtle focus-within:bg-surface-subtle focus-within:ring-1 focus-within:ring-border-main'
        }`}
      >
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showMenu}
          aria-controls={showMenu ? listboxId : undefined}
          aria-label={UI_LABELS.library.folderInputAria}
          data-native-undo="true"
          value={draft}
          onFocus={() => {
            setFilterByDraft(false);
            setHighlightedIndex(-1);
            if (existingFolders.length > 0 || currentFolder.length > 0) {
              setIsOpen(true);
            }
          }}
          onChange={(e) => {
            const next = e.target.value;
            setDraft(next);
            setFilterByDraft(true);
            setHighlightedIndex(-1);
            setIsOpen(existingFolders.length > 0 || next.trim().length > 0);
          }}
          onBlur={(e) => {
            if (containerRef.current?.contains(e.relatedTarget as Node)) return;
            setIsOpen(false);
            setFilterByDraft(false);
            setHighlightedIndex(-1);
            commitDraftValue(draft);
          }}
          onKeyDown={handleKeyDown}
          placeholder={UI_LABELS.library.folderPlaceholder}
          className="min-w-0 flex-1 bg-transparent px-1.5 py-0.5 text-[11.5px] text-text-body placeholder:text-text-faint/80 focus:outline-none"
        />

        {showToggleButton && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={UI_LABELS.library.folderToggleAria}
            aria-expanded={showMenu}
            onMouseDown={(e) => {
              e.preventDefault();
              if (isOpen) {
                setIsOpen(false);
                setFilterByDraft(false);
                setHighlightedIndex(-1);
              } else {
                setFilterByDraft(false);
                setHighlightedIndex(-1);
                setIsOpen(true);
                inputRef.current?.focus();
              }
            }}
            className="mr-0.5 inline-flex items-center justify-center rounded p-0.5 text-text-faint hover:text-text-main transition-colors cursor-pointer shrink-0"
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform duration-150 ${
                showMenu ? 'rotate-180 text-text-main' : ''
              }`}
            />
          </button>
        )}
      </div>

      {showMenu && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={UI_LABELS.library.folderListAria}
          className="absolute top-full left-0 mt-1.5 w-56 max-h-56 overflow-y-auto auteur-pane-scroll bg-surface rounded-xl shadow-xl border border-border-main z-50 text-text-main py-1"
        >
          {hasExistingBeforeClear && (
            <div className="px-3 py-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-text-faint">
              {UI_LABELS.library.folderExistingHeader}
            </div>
          )}

          {options.items.map((option, idx) => {
            const isHighlighted = idx === highlightedIndex;

            if (option.kind === 'existing') {
              return (
                <button
                  key={`existing:${option.folder}`}
                  type="button"
                  role="option"
                  aria-selected={option.isCurrent}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyOption(option);
                  }}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`w-full text-left px-3 py-1.5 text-[11.5px] flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                    isHighlighted
                      ? 'bg-surface-muted text-text-main'
                      : option.isCurrent
                        ? 'bg-surface-subtle font-semibold text-text-main'
                        : 'font-medium text-text-body hover:bg-surface-subtle hover:text-text-main'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <Folder className="h-3 w-3 text-text-faint shrink-0" />
                    <span className="truncate">{option.folder}</span>
                  </span>
                  {option.isCurrent && <Check className="h-3 w-3 text-text-main shrink-0" />}
                </button>
              );
            }

            if (option.kind === 'create') {
              return (
                <button
                  key={`create:${option.folder}`}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyOption(option);
                  }}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`w-full text-left px-3 py-1.5 text-[11.5px] flex items-center gap-1.5 transition-colors cursor-pointer ${
                    hasExistingBeforeClear ? 'mt-0.5 border-t border-border-subtle pt-1.5' : ''
                  } ${
                    isHighlighted
                      ? 'bg-surface-muted text-text-main font-medium'
                      : 'text-text-body hover:bg-surface-subtle hover:text-text-main'
                  }`}
                >
                  <FolderPlus className="h-3 w-3 text-text-muted shrink-0" />
                  <span className="truncate">
                    {UI_LABELS.library.folderCreateAction(option.folder)}
                  </span>
                </button>
              );
            }

            return (
              <button
                key="clear-folder"
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyOption(option);
                }}
                onMouseEnter={() => setHighlightedIndex(idx)}
                className={`w-full text-left px-3 py-1.5 text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer mt-0.5 border-t border-border-subtle pt-1.5 ${
                  isHighlighted
                    ? 'bg-surface-muted text-text-main'
                    : 'text-text-muted hover:bg-surface-subtle hover:text-text-main'
                }`}
              >
                <X className="h-3 w-3 shrink-0" />
                <span>{UI_LABELS.library.folderClearAction}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
