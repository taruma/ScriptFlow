import {useEffect, useMemo, useRef} from 'react';

/**
 * Preserves referential identity across renders for freshly derived pure values
 * (parsed AST arrays, extracted metadata, per-index diagnostic maps) by reconciling
 * against the last committed value. Safe under React StrictMode and concurrent rendering.
 */
export function useStableValue<T>(nextValue: T, reconcile: (prev: T, next: T) => T): T {
  const prevRef = useRef<T>(nextValue);
  const stable = useMemo(() => reconcile(prevRef.current, nextValue), [nextValue, reconcile]);

  useEffect(() => {
    prevRef.current = stable;
  }, [stable]);

  return stable;
}
