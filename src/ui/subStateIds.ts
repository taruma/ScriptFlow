export const DEFAULT_SUBSTATE_IDS = true;

const SUBSTATE_IDS_STORAGE_KEY = 'auteur-editor-substate-ids-v1';

export function loadStoredSubStateIds(): boolean {
  try {
    const saved = window.localStorage.getItem(SUBSTATE_IDS_STORAGE_KEY);
    if (saved === 'true') return true;
    if (saved === 'false') return false;
  } catch {
    // Ignore storage access errors in restricted environments
  }
  return DEFAULT_SUBSTATE_IDS;
}

export function saveStoredSubStateIds(enabled: boolean): void {
  try {
    window.localStorage.setItem(SUBSTATE_IDS_STORAGE_KEY, String(enabled));
  } catch {
    // Ignore storage access errors
  }
}

export function applySubStateIds(enabled: boolean): void {
  const root = document.documentElement;
  root.setAttribute('data-substate-ids', enabled ? 'true' : 'false');
}
