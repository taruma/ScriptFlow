export const DEFAULT_CLAUSE_GUIDES = false;

const CLAUSE_GUIDES_STORAGE_KEY = 'auteur-editor-clause-guides-v1';

export function loadStoredClauseGuides(): boolean {
  try {
    const saved = window.localStorage.getItem(CLAUSE_GUIDES_STORAGE_KEY);
    if (saved === 'true') return true;
    if (saved === 'false') return false;
  } catch {
    // Ignore storage access errors in restricted environments
  }
  return DEFAULT_CLAUSE_GUIDES;
}

export function saveStoredClauseGuides(enabled: boolean): void {
  try {
    window.localStorage.setItem(CLAUSE_GUIDES_STORAGE_KEY, String(enabled));
  } catch {
    // Ignore storage access errors
  }
}

export function applyClauseGuides(enabled: boolean): void {
  const root = document.documentElement;
  if (enabled) {
    root.setAttribute('data-clause-guides', 'true');
  } else {
    root.removeAttribute('data-clause-guides');
  }
}
