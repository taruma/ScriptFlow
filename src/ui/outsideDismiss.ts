/**
 * Pure predicate returning true when an interaction target lies outside `container`
 * (treating `null` or non-Node targets defensively as non-dismissing).
 */
export function isOutsideDismissTarget(
  container: {contains: (node: Node | null) => boolean} | null,
  target: EventTarget | null
): boolean {
  if (!container || !target) return false;
  return !container.contains(target as Node);
}

export interface CaptureDismissHost {
  addEventListener: (
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions
  ) => void;
  removeEventListener: (
    type: string,
    listener: EventListener,
    options?: boolean | EventListenerOptions
  ) => void;
}

/**
 * Attaches capture-phase `pointerdown` / `mousedown` outside-click and `Escape` key listeners.
 * Running in the capture phase ensures canvas pan/zoom libraries (such as `@xyflow/react`) that
 * call `stopPropagation()` on target/bubble pointer events never prevent top-bar menus from closing.
 */
export function attachCaptureOutsideDismiss(
  doc: CaptureDismissHost,
  getContainer: () => {contains: (node: Node | null) => boolean} | null,
  onDismiss: () => void
): () => void {
  const handlePointer = (event: Event) => {
    if (isOutsideDismissTarget(getContainer(), event.target)) {
      onDismiss();
    }
  };
  const handleKeyDown = (event: Event) => {
    if ((event as KeyboardEvent).key === 'Escape') {
      onDismiss();
    }
  };

  doc.addEventListener('pointerdown', handlePointer, {capture: true});
  doc.addEventListener('mousedown', handlePointer, {capture: true});
  doc.addEventListener('keydown', handleKeyDown);

  return () => {
    doc.removeEventListener('pointerdown', handlePointer, {capture: true});
    doc.removeEventListener('mousedown', handlePointer, {capture: true});
    doc.removeEventListener('keydown', handleKeyDown);
  };
}
