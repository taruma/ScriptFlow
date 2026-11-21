import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import {
  AUTO_GROW_MAX_COMPOSER_HEIGHT,
  clampComposerHeight,
  MIN_COMPOSER_HEIGHT,
} from '../../../ui/aiAssistant.ts';

export const MIN_SIDEBAR_WIDTH = 340;
export const MAX_SIDEBAR_WIDTH = 580;
export const DEFAULT_SIDEBAR_WIDTH = 410;

export interface UseSidebarResizeOptions {
  isOpen: boolean;
  inputValue: string;
  sidebarRef: RefObject<HTMLElement | null>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
}

export interface SidebarResizeController {
  sidebarWidth: number;
  handleResizePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handleComposerResizePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  resetComposerHeight: () => void;
}

export function useSidebarResize({
  isOpen,
  inputValue,
  sidebarRef,
  composerRef,
}: UseSidebarResizeOptions): SidebarResizeController {
  const [sidebarWidth, setSidebarWidth] = useState<number>(DEFAULT_SIDEBAR_WIDTH);
  const [manualComposerHeight, setManualComposerHeight] = useState<number | null>(null);
  const activeDragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      activeDragCleanupRef.current?.();
      activeDragCleanupRef.current = null;
    };
  }, []);

  // Auto-grow composer textarea smoothly unless the user manually dragged its height
  useLayoutEffect(() => {
    if (!isOpen) return;
    const textarea = composerRef.current;
    if (!textarea) return;
    if (manualComposerHeight !== null) {
      textarea.style.height = `${manualComposerHeight}px`;
      return;
    }
    textarea.style.height = 'auto';
    const nextHeight = Math.max(
      MIN_COMPOSER_HEIGHT,
      Math.min(AUTO_GROW_MAX_COMPOSER_HEIGHT, textarea.scrollHeight)
    );
    textarea.style.height = `${nextHeight}px`;
  }, [isOpen, inputValue, manualComposerHeight, sidebarWidth, composerRef]);

  // Subtle desktop drag-to-resize left edge handler
  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      activeDragCleanupRef.current?.();
      const startX = event.clientX;
      const startWidth = sidebarWidth;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const delta = startX - moveEvent.clientX;
        const nextWidth = Math.max(
          MIN_SIDEBAR_WIDTH,
          Math.min(MAX_SIDEBAR_WIDTH, startWidth + delta)
        );
        setSidebarWidth(nextWidth);
      };

      const cleanup = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', cleanup);
        if (activeDragCleanupRef.current === cleanup) {
          activeDragCleanupRef.current = null;
        }
      };

      activeDragCleanupRef.current = cleanup;
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', cleanup);
    },
    [sidebarWidth]
  );

  // Vertical drag-to-resize top handle for the composer prompt box
  const handleComposerResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      activeDragCleanupRef.current?.();
      const startY = event.clientY;
      const startHeight =
        manualComposerHeight ?? composerRef.current?.offsetHeight ?? MIN_COMPOSER_HEIGHT;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const delta = startY - moveEvent.clientY;
        const nextHeight = clampComposerHeight(
          startHeight + delta,
          sidebarRef.current?.clientHeight
        );
        setManualComposerHeight(nextHeight);
      };

      const cleanup = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', cleanup);
        if (activeDragCleanupRef.current === cleanup) {
          activeDragCleanupRef.current = null;
        }
      };

      activeDragCleanupRef.current = cleanup;
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', cleanup);
    },
    [manualComposerHeight, composerRef, sidebarRef]
  );

  const resetComposerHeight = useCallback(() => {
    setManualComposerHeight(null);
  }, []);

  return {
    sidebarWidth,
    handleResizePointerDown,
    handleComposerResizePointerDown,
    resetComposerHeight,
  };
}
