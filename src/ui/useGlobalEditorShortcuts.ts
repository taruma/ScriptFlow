import {useEffect} from 'react';
import {isMultiBlockAuteurScript} from '../core/index.ts';
import type {ViewMode} from '../components/TopSlateBar.tsx';
import {matchHistoryShortcut} from './historyShortcuts.ts';
import {UI_LABELS} from './labels.ts';
import type {UseScriptLibraryResult} from './useScriptLibrary.ts';

export function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return true;
  return (el as HTMLElement).isContentEditable === true;
}

export function isWritableEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') {
    const field = el as HTMLInputElement | HTMLTextAreaElement;
    return !field.readOnly && !field.disabled;
  }
  return (el as HTMLElement).isContentEditable === true;
}

export interface UseGlobalEditorShortcutsOptions {
  viewMode: ViewMode;
  isReadOnly: boolean;
  isNarrowReadOnly?: boolean;
  isModalOpen: boolean;
  commitRawText: UseScriptLibraryResult['commitRawText'];
  onSwitchToLive: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToast: (message: string) => void;
}

/**
 * Registers document-level clipboard and keyboard shortcuts for the editor shell:
 * - Paste-and-Hydrate (`paste`) with modal, AI sidebar, active-editor, and read-only guards
 * - Document Undo/Redo (`keydown`: Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Ctrl+Y) with modal, read-only,
 *   and `[data-native-undo="true"]` guards
 */
export function useGlobalEditorShortcuts({
  viewMode,
  isReadOnly,
  isNarrowReadOnly = false,
  isModalOpen,
  commitRawText,
  onSwitchToLive,
  onUndo,
  onRedo,
  onToast,
}: UseGlobalEditorShortcutsOptions): void {
  // Global Paste-and-Hydrate with Active-Editor & Read-Only Guards
  useEffect(() => {
    const handleGlobalPaste = (event: ClipboardEvent) => {
      if (isModalOpen) return;
      if (document.querySelector('[aria-modal="true"]')) return;

      const pasted = event.clipboardData?.getData('text/plain');
      if (!pasted || pasted.trim().length === 0) return;

      const targetEl = event.target instanceof Element ? event.target : null;
      const active = document.activeElement;
      if (
        (active instanceof Element && active.closest('[data-ai-sidebar="true"]')) ||
        (targetEl && targetEl.closest('[data-ai-sidebar="true"]'))
      ) {
        return;
      }
      const inEditable = isEditableElement(active);
      const inWritableEditable = isWritableEditableElement(active);
      const hasMultiBlockScript = isMultiBlockAuteurScript(pasted);

      if (isReadOnly) {
        if (inWritableEditable && !hasMultiBlockScript) {
          return;
        }
        event.preventDefault();
        onToast(
          isNarrowReadOnly
            ? UI_LABELS.toasts.narrowReadOnlyPasteBlocked
            : UI_LABELS.toasts.readOnlyPasteBlocked
        );
        return;
      }

      if (viewMode === 'source' && inEditable) {
        return;
      }

      if (inEditable && !hasMultiBlockScript) {
        return;
      }

      event.preventDefault();
      if (active instanceof HTMLElement) {
        active.blur();
      }
      commitRawText(pasted.replace(/\r\n?/g, '\n'), {mode: 'checkpoint'});
      onSwitchToLive();
      onToast(UI_LABELS.toasts.scriptHydrated);
    };

    document.addEventListener('paste', handleGlobalPaste);
    return () => document.removeEventListener('paste', handleGlobalPaste);
  }, [viewMode, isReadOnly, isNarrowReadOnly, isModalOpen, commitRawText, onSwitchToLive, onToast]);

  // Document-level Undo / Redo keyboard shortcuts (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Ctrl+Y)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const action = matchHistoryShortcut(event);
      if (!action) return;

      if (isReadOnly || isModalOpen) {
        return;
      }
      if (document.querySelector('[aria-modal="true"]')) return;

      const active = document.activeElement;
      if (active instanceof Element && active.closest('[data-native-undo="true"]')) {
        return;
      }

      event.preventDefault();
      if (action === 'undo') {
        onUndo();
      } else {
        onRedo();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isReadOnly, isModalOpen, onUndo, onRedo]);
}
