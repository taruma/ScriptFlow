export const SCRIPT_STORAGE_KEY = 'auteur-editor-raw-script-v1';
export const TITLE_STORAGE_KEY = 'auteur-editor-scene-title-v1';
export const ACTIVE_SCRIPT_ID_STORAGE_KEY = 'auteur-editor-active-script-id-v1';
export const LIBRARY_MIGRATED_STORAGE_KEY = 'auteur-editor-library-migrated-v1';
export const LIBRARY_FALLBACK_STORAGE_KEY = 'auteur-editor-library-fallback-v1';

export function readSavedScript(): string | null {
  try {
    const saved = window.localStorage.getItem(SCRIPT_STORAGE_KEY);
    return saved && saved.trim().length > 0 ? saved : null;
  } catch {
    return null;
  }
}

export function readSavedScriptRaw(): string | null {
  try {
    return window.localStorage.getItem(SCRIPT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeSavedScript(rawText: string): void {
  try {
    window.localStorage.setItem(SCRIPT_STORAGE_KEY, rawText);
  } catch {
    // Ignore storage quota or restricted environment errors
  }
}

export function readSavedTitle(): string | null {
  try {
    const saved = window.localStorage.getItem(TITLE_STORAGE_KEY);
    return saved && saved.trim().length > 0 ? saved : null;
  } catch {
    return null;
  }
}

export function writeSavedTitle(title: string): void {
  try {
    window.localStorage.setItem(TITLE_STORAGE_KEY, title);
  } catch {
    // Ignore storage quota or restricted environment errors
  }
}

export function readActiveScriptId(): string | null {
  try {
    const saved = window.localStorage.getItem(ACTIVE_SCRIPT_ID_STORAGE_KEY);
    return saved && saved.trim().length > 0 ? saved.trim() : null;
  } catch {
    return null;
  }
}

export function writeActiveScriptId(id: string | null): void {
  try {
    if (id && id.trim().length > 0) {
      window.localStorage.setItem(ACTIVE_SCRIPT_ID_STORAGE_KEY, id.trim());
    } else {
      window.localStorage.removeItem(ACTIVE_SCRIPT_ID_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota or restricted environment errors
  }
}

export function readLibraryMigratedFlag(): boolean {
  try {
    return window.localStorage.getItem(LIBRARY_MIGRATED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeLibraryMigratedFlag(migrated: boolean): void {
  try {
    if (migrated) {
      window.localStorage.setItem(LIBRARY_MIGRATED_STORAGE_KEY, '1');
    } else {
      window.localStorage.removeItem(LIBRARY_MIGRATED_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota or restricted environment errors
  }
}

/**
 * Mirrors the active script pointer and raw text to localStorage so
 * top-level ErrorBoundary crash recovery ("Copy Saved Script") always stays intact.
 */
export function mirrorActiveScriptToLocalStorage(
  activeScriptId: string | null,
  rawText: string,
  title?: string
): void {
  writeActiveScriptId(activeScriptId);
  writeSavedScript(rawText);
  if (typeof title === 'string') {
    writeSavedTitle(title);
  }
}
