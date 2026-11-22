export const SCRIPT_STORAGE_KEY = 'auteur-editor-raw-script-v1';
export const TITLE_STORAGE_KEY = 'auteur-editor-scene-title-v1';
export const ACTIVE_SCRIPT_ID_STORAGE_KEY = 'auteur-editor-active-script-id-v1';
export const MIRROR_UPDATED_AT_STORAGE_KEY = 'auteur-editor-mirror-updated-at-v1';
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

export function readMirrorUpdatedAt(): number | null {
  try {
    const saved = window.localStorage.getItem(MIRROR_UPDATED_AT_STORAGE_KEY);
    if (!saved) return null;
    const parsed = Number(saved);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function writeMirrorUpdatedAt(timestamp: number | null): void {
  try {
    if (typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp > 0) {
      window.localStorage.setItem(MIRROR_UPDATED_AT_STORAGE_KEY, String(Math.floor(timestamp)));
    } else {
      window.localStorage.removeItem(MIRROR_UPDATED_AT_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota or restricted environment errors
  }
}

/**
 * Mirrors the active script pointer, raw text, title, and timestamp to localStorage so
 * top-level ErrorBoundary crash recovery ("Copy Saved Script") and reload reconciliation
 * stay intact even if an async IndexedDB write is interrupted.
 */
export function mirrorActiveScriptToLocalStorage(
  activeScriptId: string | null,
  rawText: string,
  title?: string,
  updatedAt?: number | null
): void {
  writeActiveScriptId(activeScriptId);
  writeSavedScript(rawText);
  if (typeof title === 'string') {
    writeSavedTitle(title);
  }
  const effectiveUpdatedAt =
    updatedAt === undefined ? (activeScriptId ? Date.now() : null) : updatedAt;
  writeMirrorUpdatedAt(effectiveUpdatedAt);
}
