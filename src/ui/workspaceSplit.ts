export const DEFAULT_LIVE_SPLIT_PERCENT = 40;
export const MIN_LIVE_SPLIT_PERCENT = 25;
export const MAX_LIVE_SPLIT_PERCENT = 60;
export const LIVE_SPLIT_KEYBOARD_STEP = 2;
export const LIVE_SPLIT_KEYBOARD_LARGE_STEP = 5;

const LIVE_SPLIT_STORAGE_KEY = 'auteur-live-split-percent-v1';

export function clampLiveSplitPercent(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_LIVE_SPLIT_PERCENT;
  const clamped = Math.max(MIN_LIVE_SPLIT_PERCENT, Math.min(MAX_LIVE_SPLIT_PERCENT, value));
  return Math.round(clamped * 10) / 10;
}

export function isDefaultLiveSplit(percent: number): boolean {
  return Math.abs(clampLiveSplitPercent(percent) - DEFAULT_LIVE_SPLIT_PERCENT) < 0.05;
}

export function computeLiveSplitFromPointer(
  clientX: number,
  containerLeft: number,
  containerWidth: number
): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return DEFAULT_LIVE_SPLIT_PERCENT;
  }
  const rawPercent = ((clientX - containerLeft) / containerWidth) * 100;
  return clampLiveSplitPercent(rawPercent);
}

export function loadStoredLiveSplit(): number {
  try {
    const saved = window.localStorage.getItem(LIVE_SPLIT_STORAGE_KEY);
    if (saved !== null) {
      const parsed = Number.parseFloat(saved);
      if (Number.isFinite(parsed)) {
        return clampLiveSplitPercent(parsed);
      }
    }
  } catch {
    // Ignore storage access errors in restricted environments
  }
  return DEFAULT_LIVE_SPLIT_PERCENT;
}

export function saveStoredLiveSplit(percent: number): void {
  try {
    const normalized = clampLiveSplitPercent(percent);
    if (isDefaultLiveSplit(normalized)) {
      window.localStorage.removeItem(LIVE_SPLIT_STORAGE_KEY);
    } else {
      window.localStorage.setItem(LIVE_SPLIT_STORAGE_KEY, String(normalized));
    }
  } catch {
    // Ignore storage access errors
  }
}

export function applyLiveSplit(percent: number): void {
  if (typeof document === 'undefined') return;
  const normalized = clampLiveSplitPercent(percent);
  document.documentElement.style.setProperty('--live-staging-split', `${normalized}%`);
}
