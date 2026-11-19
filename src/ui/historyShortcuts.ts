export type HistoryShortcutAction = 'undo' | 'redo' | null;

export interface HistoryKeyEventLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  isComposing?: boolean;
}

/**
 * Classifies standard cross-platform document Undo / Redo keyboard shortcuts:
 * - Undo: Cmd+Z / Ctrl+Z (without Shift or Alt)
 * - Redo: Cmd+Shift+Z / Ctrl+Shift+Z, or Ctrl+Y (without Meta, Shift, or Alt)
 */
export function matchHistoryShortcut(event: HistoryKeyEventLike): HistoryShortcutAction {
  if (event.isComposing || event.altKey) {
    return null;
  }

  const key = event.key.toLowerCase();
  const hasPrimaryMod = event.metaKey || event.ctrlKey;

  if (key === 'z' && hasPrimaryMod) {
    return event.shiftKey ? 'redo' : 'undo';
  }

  if (key === 'y' && event.ctrlKey && !event.metaKey && !event.shiftKey) {
    return 'redo';
  }

  return null;
}
