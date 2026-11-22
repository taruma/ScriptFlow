import {useEffect, useState} from 'react';
import type {ViewMode} from '../components/TopSlateBar.tsx';

/**
 * Maximum viewport width (px) that activates ScriptFlow's narrow read-only mode.
 * Mirrors Tailwind's `sm` breakpoint (`640px`), so `< 640px` is narrow.
 */
export const NARROW_VIEWPORT_MAX_WIDTH = 639;
export const NARROW_VIEWPORT_MEDIA_QUERY = `(max-width: ${NARROW_VIEWPORT_MAX_WIDTH}px)`;

export function isNarrowViewportWidth(width: number): boolean {
  return Number.isFinite(width) && width <= NARROW_VIEWPORT_MAX_WIDTH;
}

export interface NarrowWorkspaceState {
  effectiveReadOnly: boolean;
  effectiveViewMode: ViewMode;
}

/**
 * Pure derivation locking narrow viewports (`< 640px`) into read-only Live Mode
 * while preserving the user's desktop `viewMode` preference when resizing back up.
 */
export function resolveNarrowWorkspaceState(
  isNarrow: boolean,
  isExampleReadOnly: boolean,
  desktopViewMode: ViewMode
): NarrowWorkspaceState {
  return {
    effectiveReadOnly: isExampleReadOnly || isNarrow,
    effectiveViewMode: isNarrow ? 'live' : desktopViewMode,
  };
}

export function matchesNarrowViewport(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(NARROW_VIEWPORT_MEDIA_QUERY).matches;
}

/**
 * Reactively tracks whether the viewport is in narrow read-only mode (`< 640px`).
 */
export function useNarrowViewport(): boolean {
  const [isNarrow, setIsNarrow] = useState<boolean>(matchesNarrowViewport);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia(NARROW_VIEWPORT_MEDIA_QUERY);
    setIsNarrow(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setIsNarrow(event.matches);
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  return isNarrow;
}
