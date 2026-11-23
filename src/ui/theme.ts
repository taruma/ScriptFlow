export type ThemeMode = 'light' | 'warm' | 'dark' | 'oled';

export interface ThemeOption {
  id: ThemeMode;
  label: string;
  description: string;
  swatchBg: string;
  swatchBorder: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'light',
    label: 'Light',
    description: 'Clean Warm Stone',
    swatchBg: '#f5f5f4',
    swatchBorder: '#d6d3d1',
  },
  {
    id: 'warm',
    label: 'Warm',
    description: 'Drafting Paper',
    swatchBg: '#f3efe6',
    swatchBorder: '#cfc4af',
  },
  {
    id: 'dark',
    label: 'Dark',
    description: 'Warm Obsidian Studio',
    swatchBg: '#171514',
    swatchBorder: '#3c3632',
  },
  {
    id: 'oled',
    label: 'Pure Black',
    description: 'OLED Blueprint Void',
    swatchBg: '#000000',
    swatchBorder: '#333333',
  },
];

export const DEFAULT_THEME_MODE: ThemeMode = 'light';

const THEME_STORAGE_KEY = 'auteur-editor-theme-v1';

export function loadStoredTheme(): ThemeMode {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'warm' || saved === 'dark' || saved === 'oled') {
      return saved;
    }
  } catch {
    // Ignore storage access errors in restricted environments
  }
  return DEFAULT_THEME_MODE;
}

export function saveStoredTheme(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Ignore storage access errors
  }
}

/**
 * Applies one of the 4 shell themes to <html> with zero-stutter transition disabling
 * per docs/UI_PHILOSOPHY.md §4.
 */
export function applyThemeMode(mode: ThemeMode, disableTransitions = true): void {
  const root = document.documentElement;

  if (disableTransitions) {
    root.classList.add('disable-theme-transitions');
  }

  if (mode === 'oled') {
    root.setAttribute('data-theme-category', 'dark');
    root.setAttribute('data-pure-black-shell', 'true');
  } else {
    root.setAttribute('data-theme-category', mode);
    root.removeAttribute('data-pure-black-shell');
  }

  if (disableTransitions) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.remove('disable-theme-transitions');
      });
    });
  }
}
