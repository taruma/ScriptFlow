import {memo} from 'react';
import {Handle, Position, type NodeProps} from '@xyflow/react';
import {Code2, Layers, Minimize2} from 'lucide-react';
import type {
  GraphDimension,
  GraphDirection,
  GraphIsolationMode,
  GraphMacroStateItem,
} from '../../ui/canvas/index.ts';
import {UI_LABELS} from '../../ui/labels.ts';
import {getDimensionColorVar, getObjectColorVar, useGraphInteraction} from './graphContext.tsx';
import {SculptedSubStateBody} from './SculptedSubStateBody.tsx';

export interface MacroStateNodeData extends Record<string, unknown> {
  macroState: GraphMacroStateItem;
  direction: GraphDirection;
  isPill: boolean;
  isExpanded: boolean;
  isRawOpen: boolean;
  hasIsolation: boolean;
  isolatedDims: GraphDimension[];
  isolationMode: GraphIsolationMode;
  isTraced: boolean;
  isSecondaryTraced?: boolean;
  isDimmed: boolean;
}

export const MacroStateNode = memo(function MacroStateNode({data}: NodeProps) {
  const {
    macroState,
    direction,
    isPill,
    isExpanded,
    isRawOpen,
    hasIsolation,
    isolatedDims,
    isolationMode,
    isTraced,
    isSecondaryTraced = false,
    isDimmed,
  } = data as MacroStateNodeData;

  const {
    objectById,
    activeObjectId,
    onSelectObject,
    onHoverObject,
    onToggleExpand,
    onToggleRaw,
  } = useGraphInteraction();

  const isLR = direction === 'LR';
  const isolatedSet = new Set<GraphDimension>(isolatedDims);
  const threadSideStyle = isLR ? {top: '82%'} : {left: '82%'};

  // Collapsed Milestone Pill when active Sub-State isolation matches 0 Sub-States in this Macro-State
  if (isPill) {
    return (
      <div
        className={`relative flex items-center justify-center rounded-full border border-dashed border-border-main bg-surface/60 px-4 py-2 font-mono text-xs font-semibold tabular-nums text-text-muted opacity-55 transition-opacity ${
          isDimmed ? 'auteur-graph-dimmed' : ''
        }`}
      >
        <Handle type="target" id="spine-in" position={isLR ? Position.Left : Position.Top} />
        <Handle type="source" id="spine-out" position={isLR ? Position.Right : Position.Bottom} />
        <Handle type="source" id="recall-out" position={isLR ? Position.Top : Position.Left} />
        <Handle type="target" id="recall-in" position={isLR ? Position.Top : Position.Left} />
        <Handle type="target" id="thread-entry" position={isLR ? Position.Top : Position.Left} />
        <Handle
          type="target"
          id="thread-in"
          position={isLR ? Position.Left : Position.Top}
          style={threadSideStyle}
        />
        <Handle
          type="source"
          id="thread-out"
          position={isLR ? Position.Right : Position.Bottom}
          style={threadSideStyle}
        />
        <span>{macroState.id}</span>
      </div>
    );
  }

  // Non-camera matched entities for footer bar
  const footerObjects = macroState.matchedObjectIds
    .map((id) => objectById[id])
    .filter((obj) => Boolean(obj) && obj.kind !== 'camera_slot');

  return (
    <div
      style={
        isSecondaryTraced
          ? {borderColor: 'color-mix(in srgb, var(--tok-continuity) 42%, var(--border-main))'}
          : undefined
      }
      className={`relative rounded-xl border bg-surface shadow-2xs overflow-hidden transition-[opacity,box-shadow,border-color] duration-150 ${
        isTraced
          ? 'auteur-graph-traced border-[var(--tok-continuity)]'
          : isSecondaryTraced
            ? 'auteur-graph-secondary-traced border-border-main'
            : 'border-border-main'
      } ${isDimmed ? 'auteur-graph-dimmed' : ''}`}
    >
      {/* Directional connection ports */}
      <Handle type="target" id="spine-in" position={isLR ? Position.Left : Position.Top} />
      <Handle type="source" id="spine-out" position={isLR ? Position.Right : Position.Bottom} />
      <Handle
        type="source"
        id="sub-out"
        position={isLR ? Position.Bottom : Position.Right}
        style={isLR ? undefined : {top: '34px'}}
      />
      <Handle type="target" id="raw-in" position={isLR ? Position.Top : Position.Left} />
      <Handle type="source" id="recall-out" position={isLR ? Position.Top : Position.Left} />
      <Handle type="target" id="recall-in" position={isLR ? Position.Top : Position.Left} />
      <Handle type="target" id="thread-entry" position={isLR ? Position.Top : Position.Left} />
      <Handle
        type="target"
        id="thread-in"
        position={isLR ? Position.Left : Position.Top}
        style={threadSideStyle}
      />
      <Handle
        type="source"
        id="thread-out"
        position={isLR ? Position.Right : Position.Bottom}
        style={threadSideStyle}
      />
      <Handle
        type="source"
        id="sub-thread-out"
        position={isLR ? Position.Left : Position.Top}
        style={threadSideStyle}
      />

      {/* Scene DNA Bar along top edge */}
      <div className="flex w-full h-1.5 gap-0.5 bg-app" aria-hidden="true">
        {macroState.subStates.map((ss) => {
          const matches = !hasIsolation || isolatedSet.has(ss.dimension);
          return (
            <div
              key={ss.id}
              className="flex-1 transition-opacity duration-150"
              style={{
                backgroundColor: getDimensionColorVar(ss.dimension),
                opacity: matches ? 0.92 : 0.16,
              }}
            />
          );
        })}
      </div>

      {/* Card Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border-subtle bg-surface-subtle">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-xs font-bold tabular-nums text-text-main">
            {macroState.id}
          </span>
          <span className="font-mono text-[10px] tabular-nums text-text-muted truncate">
            {UI_LABELS.graph.subStatesCount(macroState.subStates.length)}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleRaw(macroState.id);
            }}
            title={UI_LABELS.graph.rawToggleTitle(macroState.id)}
            aria-label={UI_LABELS.graph.rawToggleTitle(macroState.id)}
            aria-pressed={isRawOpen}
            style={
              isRawOpen
                ? {
                    borderColor: 'var(--tok-continuity)',
                    color: 'var(--tok-continuity)',
                    backgroundColor: 'color-mix(in srgb, var(--tok-continuity) 12%, transparent)',
                  }
                : undefined
            }
            className={`nodrag nopan inline-flex items-center justify-center rounded-md border px-1.5 py-1 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              isRawOpen
                ? ''
                : 'border-border-main bg-surface text-text-muted hover:text-text-main hover:bg-surface-hover'
            }`}
          >
            <Code2 className="h-3 w-3" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(macroState.id);
            }}
            title={
              isExpanded
                ? UI_LABELS.graph.coupleCardTitle(macroState.id)
                : UI_LABELS.graph.decoupleCardTitle(macroState.id)
            }
            aria-expanded={isExpanded}
            className="nodrag nopan inline-flex items-center gap-1 rounded-md border border-border-main bg-surface px-1.5 py-0.5 text-[11px] font-medium text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {isExpanded ? (
              <Minimize2 className="h-3 w-3" aria-hidden="true" />
            ) : (
              <Layers className="h-3 w-3" aria-hidden="true" />
            )}
            <span>{isExpanded ? UI_LABELS.graph.coupleCard : UI_LABELS.graph.decoupleCard}</span>
          </button>
        </div>
      </div>

      {/* Body: Sculpted Sub-State rows when coupled, compact summary when decoupled */}
      {!isExpanded ? (
        <div className="p-2.5 space-y-1.5">
          {macroState.subStates.map((ss) => {
            const matchesIso = !hasIsolation || isolatedSet.has(ss.dimension);
            if (!matchesIso && isolationMode === 'compact') {
              return null;
            }
            const dimColor = getDimensionColorVar(ss.dimension);
            const isSubHit = Boolean(activeObjectId && ss.matchedObjectIds.includes(activeObjectId));

            return (
              <div
                key={ss.id}
                style={{
                  backgroundColor: isSubHit
                    ? 'color-mix(in srgb, var(--tok-continuity) 8%, var(--surface))'
                    : ss.dimension === 'dialogue'
                      ? 'color-mix(in srgb, var(--graph-dim-dialogue) 6%, var(--surface))'
                      : 'var(--surface-subtle)',
                  borderColor: isSubHit
                    ? 'var(--tok-continuity)'
                    : ss.dimension === 'dialogue'
                      ? 'color-mix(in srgb, var(--graph-dim-dialogue) 24%, transparent)'
                      : 'var(--border-subtle)',
                }}
                className={`flex items-stretch gap-2.5 rounded-lg border p-2 transition-opacity duration-150 ${
                  !matchesIso ? 'auteur-graph-ghost' : ''
                }`}
              >
                <div
                  className="w-1 rounded-full shrink-0"
                  style={{backgroundColor: dimColor}}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <SculptedSubStateBody subState={ss} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-3 py-2 text-[11.5px] text-text-muted flex items-center justify-between">
          <span>
            {UI_LABELS.graph.decoupledSummary(macroState.subStates.length, isLR ? '↓' : '→')}
          </span>
        </div>
      )}

      {/* Matched Entity Footer */}
      {footerObjects.length > 0 && (
        <div className="px-3 py-1.5 border-t border-border-subtle bg-surface-subtle/60 flex flex-wrap items-center gap-1">
          {footerObjects.map((obj) => {
            const colorVar = getObjectColorVar(obj.kind);
            const isActive = activeObjectId === obj.id;
            const useMono = obj.kind !== 'character';

            return (
              <button
                key={obj.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectObject(obj.id);
                }}
                onMouseEnter={() => onHoverObject(obj.id)}
                onMouseLeave={() => onHoverObject(null)}
                style={{
                  color: colorVar,
                  backgroundColor: `color-mix(in srgb, ${colorVar} 12%, transparent)`,
                  boxShadow: isActive ? `0 0 0 1.5px ${colorVar}` : undefined,
                }}
                className={`nodrag nopan rounded px-1.5 py-0.5 text-[10px] font-semibold cursor-pointer transition-shadow whitespace-nowrap ${
                  useMono ? 'font-mono' : ''
                }`}
              >
                {obj.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
