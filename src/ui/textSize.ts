export type TextSizePreset = 'sm' | 'md' | 'lg' | 'xl';

export interface TextSizeOption {
  id: TextSizePreset;
  shortLabel: string;
  label: string;
  scriptPx: number;
  sourcePx: number;
}

export const TEXT_SIZE_OPTIONS: readonly TextSizeOption[] = [
  {id: 'sm', shortLabel: 'S', label: 'Small', scriptPx: 13, sourcePx: 12},
  {id: 'md', shortLabel: 'M', label: 'Medium', scriptPx: 14, sourcePx: 13},
  {id: 'lg', shortLabel: 'L', label: 'Large', scriptPx: 15, sourcePx: 14},
  {id: 'xl', shortLabel: 'XL', label: 'Extra Large', scriptPx: 16, sourcePx: 15},
] as const;

export const DEFAULT_TEXT_SIZE: TextSizePreset = 'md';

const TEXT_SIZE_STORAGE_KEY = 'auteur-editor-text-size-v1';

export function getTextSizeOption(preset: TextSizePreset): TextSizeOption {
  return TEXT_SIZE_OPTIONS.find((opt) => opt.id === preset) ?? TEXT_SIZE_OPTIONS[1];
}

export function stepTextSize(current: TextSizePreset, delta: -1 | 1): TextSizePreset {
  const idx = TEXT_SIZE_OPTIONS.findIndex((opt) => opt.id === current);
  const safeIdx = idx === -1 ? 1 : idx;
  const nextIdx = Math.max(0, Math.min(TEXT_SIZE_OPTIONS.length - 1, safeIdx + delta));
  return TEXT_SIZE_OPTIONS[nextIdx].id;
}

export function loadStoredTextSize(): TextSizePreset {
  try {
    const saved = window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY);
    if (saved === 'sm' || saved === 'md' || saved === 'lg' || saved === 'xl') {
      return saved;
    }
  } catch {
    // Ignore storage access errors in restricted environments
  }
  return DEFAULT_TEXT_SIZE;
}

export function saveStoredTextSize(preset: TextSizePreset): void {
  try {
    window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, preset);
  } catch {
    // Ignore storage access errors
  }
}

export function applyTextSize(preset: TextSizePreset): void {
  const opt = getTextSizeOption(preset);
  const root = document.documentElement;
  root.style.setProperty('--script-font-size', `${opt.scriptPx}px`);
  root.style.setProperty('--source-font-size', `${opt.sourcePx}px`);
}
