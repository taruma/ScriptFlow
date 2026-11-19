/**
 * Pure index-based collapse state transitions shared by Phase 1 Staging
 * Macro-Blocks and Phase 2 Execution Macro-States.
 * Safe for duplicate headers and renumbered beats while following items cleanly
 * across drag-and-drop reorders, insertions, and deletions.
 */

export function areAllIndicesCollapsed(collapsed: ReadonlySet<number>, count: number): boolean {
  if (count <= 0) return false;
  for (let idx = 0; idx < count; idx++) {
    if (!collapsed.has(idx)) {
      return false;
    }
  }
  return true;
}

export function toggleAllCollapsedIndices(prev: ReadonlySet<number>, count: number): Set<number> {
  if (count <= 0 || areAllIndicesCollapsed(prev, count)) {
    return new Set();
  }
  return new Set(Array.from({length: count}, (_, idx) => idx));
}

export function toggleCollapsedIndex(prev: ReadonlySet<number>, index: number): Set<number> {
  const next = new Set(prev);
  if (next.has(index)) {
    next.delete(index);
  } else {
    next.add(index);
  }
  return next;
}

export function reorderCollapsedIndices(
  prev: ReadonlySet<number>,
  fromIndex: number,
  toIndex: number,
  count: number
): Set<number> {
  if (
    fromIndex < 0 ||
    fromIndex >= count ||
    toIndex < 0 ||
    toIndex >= count ||
    fromIndex === toIndex
  ) {
    return new Set(prev);
  }

  const flags = Array.from({length: count}, (_, idx) => prev.has(idx));
  const [moved] = flags.splice(fromIndex, 1);
  flags.splice(toIndex, 0, moved);

  const next = new Set<number>();
  flags.forEach((isCollapsed, idx) => {
    if (isCollapsed) {
      next.add(idx);
    }
  });
  return next;
}

export function insertCollapsedIndex(prev: ReadonlySet<number>, insertedIndex: number): Set<number> {
  const next = new Set<number>();
  for (const idx of prev) {
    next.add(idx >= insertedIndex ? idx + 1 : idx);
  }
  return next;
}

export function deleteCollapsedIndex(prev: ReadonlySet<number>, deletedIndex: number): Set<number> {
  const next = new Set<number>();
  for (const idx of prev) {
    if (idx < deletedIndex) {
      next.add(idx);
    } else if (idx > deletedIndex) {
      next.add(idx - 1);
    }
  }
  return next;
}

export function pruneCollapsedIndices(prev: ReadonlySet<number>, count: number): Set<number> {
  const next = new Set<number>();
  for (const idx of prev) {
    if (idx >= 0 && idx < count) {
      next.add(idx);
    }
  }
  return next;
}
