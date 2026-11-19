export const SCRIPT_STORAGE_KEY = 'auteur-editor-raw-script-v1';
export const TITLE_STORAGE_KEY = 'auteur-editor-scene-title-v1';

export function readSavedScript(): string | null {
  try {
    const saved = window.localStorage.getItem(SCRIPT_STORAGE_KEY);
    return saved && saved.trim().length > 0 ? saved : null;
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
