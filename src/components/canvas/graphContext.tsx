import {createContext, useContext} from 'react';
import type {
  GraphDimension,
  InferredGraphObject,
  InferredObjectKind,
  InlineEntityMatchRule,
} from '../../ui/canvas/index.ts';

export interface GraphInteractionContextValue {
  inlineEntities: readonly InlineEntityMatchRule[];
  objectById: Readonly<Record<string, InferredGraphObject>>;
  activeObjectId: string | null;
  selectedObjectId: string | null;
  onSelectObject: (objectId: string) => void;
  onHoverObject: (objectId: string | null) => void;
  onToggleExpand: (macroStateId: string) => void;
  onToggleStagingExpand: (mbId: string) => void;
  onToggleRaw: (id: string) => void;
}

const GraphInteractionContext = createContext<GraphInteractionContextValue | null>(null);

export const GraphInteractionProvider = GraphInteractionContext.Provider;

export function useGraphInteraction(): GraphInteractionContextValue {
  const ctx = useContext(GraphInteractionContext);
  if (!ctx) {
    throw new Error('useGraphInteraction must be used within GraphInteractionProvider');
  }
  return ctx;
}

export function getDimensionColorVar(dimension: GraphDimension): string {
  return `var(--graph-dim-${dimension})`;
}

export function getObjectColorVar(kind: InferredObjectKind): string {
  return `var(--graph-obj-${kind})`;
}
