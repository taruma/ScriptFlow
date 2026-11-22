import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useUpdateNodeInternals,
  useViewport,
  type Edge,
  type Node,
  type OnNodesChange,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {Map as MapIcon, Minus, Plus} from 'lucide-react';
import type {AuteurDocument, ExtractedMetadata} from '../../core/types.ts';
import {
  buildCanvasLayout,
  buildGraphSceneModel,
  createDefaultGraphExpansionState,
  mergeLayoutIntoFlowNodes,
  type GraphDimension,
  type GraphDirection,
  type GraphIsolationMode,
  type NodeOffset,
  type ObjectCallSite,
} from '../../ui/canvas/index.ts';
import {UI_LABELS} from '../../ui/labels.ts';
import {AestheticItemNode} from './AestheticItemNode.tsx';
import {AuteurGraphEdge} from './AuteurGraphEdge.tsx';
import {GraphHud} from './GraphHud.tsx';
import {GraphInteractionProvider} from './graphContext.tsx';
import {InferredObjectNode} from './InferredObjectNode.tsx';
import {MacroStateNode} from './MacroStateNode.tsx';
import {ObjectInspectorPanel} from './ObjectInspectorPanel.tsx';
import {RawTextBranchNode} from './RawTextBranchNode.tsx';
import {ShotChamberNode} from './ShotChamberNode.tsx';
import {StagingBlockNode} from './StagingBlockNode.tsx';
import {SubStateIsolatorDock} from './SubStateIsolatorDock.tsx';
import {SubStateNode} from './SubStateNode.tsx';
import {ZoneHeaderNode} from './ZoneHeaderNode.tsx';

export interface AuteurGraphViewProps {
  doc: AuteurDocument;
  metadata: ExtractedMetadata;
  scriptSessionKey: string;
}

const NODE_TYPES: NodeTypes = {
  zoneHeader: ZoneHeaderNode,
  stagingBlock: StagingBlockNode,
  aestheticItem: AestheticItemNode,
  inferredObject: InferredObjectNode,
  shotChamber: ShotChamberNode,
  macroState: MacroStateNode,
  subState: SubStateNode,
  rawBranch: RawTextBranchNode,
};

const EDGE_TYPES: EdgeTypes = {
  auteurEdge: AuteurGraphEdge,
};

const EMPTY_NODE_OFFSETS: Readonly<Record<string, NodeOffset>> = Object.freeze({});

interface ZoomControlsBarProps {
  showMiniMap: boolean;
  onToggleMiniMap: () => void;
  onFitView: () => void;
}

function ZoomControlsBar({showMiniMap, onToggleMiniMap, onFitView}: ZoomControlsBarProps) {
  const {zoomIn, zoomOut} = useReactFlow();
  const {zoom} = useViewport();

  return (
    <div className="pointer-events-auto absolute bottom-3 right-3 z-20 flex items-center gap-1 rounded-xl border border-border-main bg-surface/95 backdrop-blur px-2 py-1 shadow-xs text-xs">
      <button
        type="button"
        onClick={() => void zoomOut({duration: 180})}
        aria-label={UI_LABELS.graph.zoomOutAria}
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-body hover:bg-surface-hover hover:text-text-main transition-colors cursor-pointer"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>

      <span className="w-11 text-center font-mono text-[11px] tabular-nums text-text-muted select-none">
        {Math.round(zoom * 100)}%
      </span>

      <button
        type="button"
        onClick={() => void zoomIn({duration: 180})}
        aria-label={UI_LABELS.graph.zoomInAria}
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-body hover:bg-surface-hover hover:text-text-main transition-colors cursor-pointer"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>

      <span aria-hidden="true" className="mx-0.5 h-3.5 w-px bg-border-main" />

      <button
        type="button"
        onClick={onFitView}
        title={UI_LABELS.graph.zoomFitTitle}
        className="rounded-md px-2 py-0.5 text-xs font-medium text-text-body hover:bg-surface-hover hover:text-text-main transition-colors cursor-pointer whitespace-nowrap"
      >
        {UI_LABELS.graph.zoomFit}
      </button>

      <button
        type="button"
        onClick={onToggleMiniMap}
        title={UI_LABELS.graph.miniMapToggleTitle}
        aria-pressed={showMiniMap}
        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
          showMiniMap
            ? 'bg-surface-muted text-text-main'
            : 'text-text-muted hover:bg-surface-hover hover:text-text-main'
        }`}
      >
        <MapIcon className="h-3 w-3" aria-hidden="true" />
        <span>{UI_LABELS.graph.miniMapToggle}</span>
      </button>
    </div>
  );
}

function GraphCanvasInner({doc, metadata, scriptSessionKey}: AuteurGraphViewProps) {
  const reactFlow = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const model = useMemo(() => buildGraphSceneModel(doc, metadata), [doc, metadata]);

  const [direction, setDirection] = useState<GraphDirection>('LR');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => createDefaultGraphExpansionState(model, 'LR').expandedIds
  );
  const [expandedStagingIds, setExpandedStagingIds] = useState<Set<string>>(
    () => createDefaultGraphExpansionState(model, 'LR').expandedStagingIds
  );
  const [rawOpenIds, setRawOpenIds] = useState<Set<string>>(
    () => createDefaultGraphExpansionState(model, 'LR').rawOpenIds
  );
  const [isolatedDims, setIsolatedDims] = useState<Set<GraphDimension>>(() => new Set());
  const [isolationMode, setIsolationMode] = useState<GraphIsolationMode>('ghost');
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null);
  const [showAllLinks, setShowAllLinks] = useState<boolean>(false);
  const [showMiniMap, setShowMiniMap] = useState<boolean>(true);
  const [measuredHeights, setMeasuredHeights] = useState<Record<string, number>>({});

  const pendingFitRef = useRef<boolean>(true);
  const prevScriptKeyRef = useRef<string>(scriptSessionKey);
  const prevDirectionRef = useRef<GraphDirection>(direction);

  // Reset canvas posture cleanly when switching scripts
  useEffect(() => {
    if (prevScriptKeyRef.current === scriptSessionKey) return;
    prevScriptKeyRef.current = scriptSessionKey;
    const defaults = createDefaultGraphExpansionState(model, direction);
    setExpandedIds(defaults.expandedIds);
    setExpandedStagingIds(defaults.expandedStagingIds);
    setRawOpenIds(defaults.rawOpenIds);
    setIsolatedDims(new Set());
    setSelectedObjectId(null);
    setHoveredObjectId(null);
    setMeasuredHeights({});
    pendingFitRef.current = true;
  }, [scriptSessionKey, model, direction]);

  // Clear selection if selected object disappears after an AI/source update
  useEffect(() => {
    if (selectedObjectId && !model.objectById[selectedObjectId]) {
      setSelectedObjectId(null);
    }
  }, [model.objectById, selectedObjectId]);

  // Prune isolated dimensions that are no longer present in the current scene
  useEffect(() => {
    setIsolatedDims((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Set<GraphDimension>();
      for (const dim of prev) {
        if ((model.stats.dimensionCounts[dim] ?? 0) > 0) {
          next.add(dim);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [model.stats.dimensionCounts]);

  // Escape clears active inspection
  useEffect(() => {
    if (!selectedObjectId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedObjectId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedObjectId]);

  const activeObjectId = hoveredObjectId ?? selectedObjectId;

  const layout = useMemo(
    () =>
      buildCanvasLayout(model, {
        direction,
        expandedIds,
        expandedStagingIds,
        rawOpenIds,
        isolatedDims,
        isolationMode,
        activeObjectId,
        showAllLinks,
        nodeOffsets: EMPTY_NODE_OFFSETS,
        measuredHeights,
      }),
    [
      model,
      direction,
      expandedIds,
      expandedStagingIds,
      rawOpenIds,
      isolatedDims,
      isolationMode,
      activeObjectId,
      showAllLinks,
      measuredHeights,
    ]
  );

  // Keep controlled React Flow node state synced with pure layout while preserving
  // React Flow's internal `measured` dimensions so ResizeObserver does not re-measure
  // every node on hover, selection, or layout updates.
  const [flowNodes, setFlowNodes] = useState<Node[]>(
    () => mergeLayoutIntoFlowNodes<Node>([], layout.nodes, EMPTY_NODE_OFFSETS).nodes
  );

  useEffect(() => {
    setFlowNodes(
      (prev) => mergeLayoutIntoFlowNodes(prev, layout.nodes, EMPTY_NODE_OFFSETS).nodes
    );
  }, [layout.nodes]);

  // Refresh React Flow's internal handle-bounds cache whenever layout orientation flips (LR <-> TB)
  // so edges immediately re-anchor to rotated Top/Bottom vs Left/Right ports.
  useEffect(() => {
    if (prevDirectionRef.current === direction) return;
    prevDirectionRef.current = direction;
    const nodeIds = layout.nodes.map((spec) => spec.id);
    if (nodeIds.length === 0) return;
    const raf = requestAnimationFrame(() => {
      updateNodeInternals(nodeIds);
    });
    return () => cancelAnimationFrame(raf);
  }, [direction, layout.nodes, updateNodeInternals]);

  const flowEdges = useMemo<Edge[]>(
    () =>
      layout.edges.map((e): Edge => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        type: 'auteurEdge',
        // Strictly above ShotChamber backdrop (0) and strictly behind all cards (10)
        zIndex: e.isHot ? 3 : e.kind === 'recall' || e.kind === 'isolationThread' ? 2 : 1,
        data: {
          kind: e.kind,
          dimension: e.dimension,
          objectKind: e.objectKind,
          isHot: e.isHot,
          isDimmed: e.isDimmed,
          isSecondary: e.isSecondary,
          isAnimated: e.isAnimated,
          isCascade: e.isCascade,
          isIntraState: e.isIntraState,
          isMacroEntryHandoff: e.isMacroEntryHandoff,
          laneIndex: e.laneIndex,
          label: e.label,
          direction: e.direction,
        },
      })),
    [layout.edges]
  );

  // Smooth fitView on initial mount, script switch, orientation change, or layout reset
  const triggerFitView = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void reactFlow.fitView({padding: 0.14, duration: 240, maxZoom: 0.95});
      });
    });
  }, [reactFlow]);

  useEffect(() => {
    if (!pendingFitRef.current || flowNodes.length === 0) return;
    pendingFitRef.current = false;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        void reactFlow.fitView({padding: 0.14, duration: 240, maxZoom: 0.95});
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [flowNodes.length, reactFlow, direction, scriptSessionKey]);

  // Apply React Flow v13 changes (dimensions) to controlled node state and capture real DOM
  // heights (for Source/Staging/MacroState/SubState overlap immunity).
  const handleNodesChange: OnNodesChange = useCallback((changes) => {
    setFlowNodes((prev) => changes.applyTo(prev));

    const heightUpdates: Array<{id: string; height: number}> = [];

    for (const change of changes) {
      if (
        change.type === 'dimensions' &&
        change.dimensions &&
        Number.isFinite(change.dimensions.height) &&
        change.dimensions.height > 0 &&
        !change.id.startsWith('chamber-') &&
        !change.id.startsWith('zone-')
      ) {
        heightUpdates.push({id: change.id, height: Math.ceil(change.dimensions.height)});
      }
    }

    if (heightUpdates.length > 0) {
      setMeasuredHeights((prev) => {
        let changed = false;
        let next: Record<string, number> | null = null;
        for (const {id, height} of heightUpdates) {
          const existing = prev[id];
          if (existing === undefined || Math.abs(existing - height) >= 2) {
            if (!next) next = {...prev};
            next[id] = height;
            changed = true;
          }
        }
        return changed && next ? next : prev;
      });
    }
  }, []);

  const handleSelectObject = useCallback((objectId: string) => {
    setSelectedObjectId((prev) => (prev === objectId ? null : objectId));
  }, []);

  const handleToggleExpand = useCallback((macroStateId: string) => {
    setMeasuredHeights((prev) => {
      const nodeKey = `node-${macroStateId}`;
      if (!(nodeKey in prev)) return prev;
      const next = {...prev};
      delete next[nodeKey];
      return next;
    });
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(macroStateId)) next.delete(macroStateId);
      else next.add(macroStateId);
      return next;
    });
  }, []);

  const handleToggleStagingExpand = useCallback((mbId: string) => {
    setMeasuredHeights((prev) => {
      const nodeKey = `node-${mbId}`;
      const aesPrefix = `aes-${mbId}-`;
      let changed = false;
      const next = {...prev};
      if (nodeKey in next) {
        delete next[nodeKey];
        changed = true;
      }
      for (const k of Object.keys(next)) {
        if (k.startsWith(aesPrefix)) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setExpandedStagingIds((prev) => {
      const next = new Set(prev);
      if (next.has(mbId)) next.delete(mbId);
      else next.add(mbId);
      return next;
    });
  }, []);

  const handleToggleRaw = useCallback((id: string) => {
    if (id.includes('.')) {
      setMeasuredHeights((prev) => {
        const subKey = `subnode-${id}`;
        if (!(subKey in prev)) return prev;
        const next = {...prev};
        delete next[subKey];
        return next;
      });
    }
    setRawOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDirectionChange = useCallback(
    (nextDir: GraphDirection) => {
      const defaults = createDefaultGraphExpansionState(model, nextDir);
      setDirection(nextDir);
      setExpandedIds(defaults.expandedIds);
      setExpandedStagingIds(defaults.expandedStagingIds);
      setRawOpenIds(defaults.rawOpenIds);
      setMeasuredHeights({});
      pendingFitRef.current = true;
    },
    [model]
  );

  const allExpanded =
    model.macroStates.length > 0 &&
    model.macroStates.every((ms) => expandedIds.has(ms.id));

  const handleToggleExpandAll = useCallback(() => {
    setMeasuredHeights({});
    setExpandedIds((prev) => {
      const currentlyAll =
        model.macroStates.length > 0 && model.macroStates.every((ms) => prev.has(ms.id));
      if (currentlyAll) return new Set();
      return new Set(model.macroStates.map((ms) => ms.id));
    });
  }, [model.macroStates]);

  const allRawOpen =
    model.macroStates.length > 0 &&
    model.macroStates.every((ms) => rawOpenIds.has(ms.id));

  const handleToggleRawAll = useCallback(() => {
    setRawOpenIds((prev) => {
      const currentlyAll =
        model.macroStates.length > 0 && model.macroStates.every((ms) => prev.has(ms.id));
      const next = new Set(prev);
      if (currentlyAll) {
        for (const ms of model.macroStates) next.delete(ms.id);
      } else {
        for (const ms of model.macroStates) next.add(ms.id);
      }
      return next;
    });
  }, [model.macroStates]);

  const handleToggleAllLinks = useCallback(() => {
    setShowAllLinks((prev) => !prev);
  }, []);

  const handleResetLayout = useCallback(() => {
    const defaults = createDefaultGraphExpansionState(model, direction);
    setMeasuredHeights({});
    setExpandedIds(defaults.expandedIds);
    setExpandedStagingIds(defaults.expandedStagingIds);
    setRawOpenIds(defaults.rawOpenIds);
    pendingFitRef.current = true;
    triggerFitView();
  }, [model, direction, triggerFitView]);

  const handleClearIsolation = useCallback(() => {
    setMeasuredHeights({});
    setIsolatedDims(new Set());
  }, []);

  const handleToggleDimension = useCallback((dim: GraphDimension) => {
    setMeasuredHeights({});
    setIsolatedDims((prev) => {
      const next = new Set(prev);
      if (next.has(dim)) next.delete(dim);
      else next.add(dim);
      return next;
    });
  }, []);

  const handleIsolationModeChange = useCallback((mode: GraphIsolationMode) => {
    setMeasuredHeights({});
    setIsolationMode(mode);
  }, []);

  const handleFocusCallSite = useCallback(
    (site: ObjectCallSite) => {
      // Focus directly on the Sub-State node if decoupled & visible, else fall back to parent Macro-State
      const targetExists = flowNodes.some((n) => n.id === site.targetNodeId);
      const focusNodeId = targetExists
        ? site.targetNodeId
        : (site.parentNodeId ?? site.targetNodeId);
      void reactFlow.fitView({
        nodes: [{id: focusNodeId}],
        padding: 0.55,
        duration: 320,
        maxZoom: 1.15,
      });
    },
    [flowNodes, reactFlow]
  );

  const interactionCtx = useMemo(
    () => ({
      inlineEntities: model.inlineEntities,
      objectById: model.objectById,
      activeObjectId,
      selectedObjectId,
      onSelectObject: handleSelectObject,
      onHoverObject: setHoveredObjectId,
      onToggleExpand: handleToggleExpand,
      onToggleStagingExpand: handleToggleStagingExpand,
      onToggleRaw: handleToggleRaw,
    }),
    [
      model.inlineEntities,
      model.objectById,
      activeObjectId,
      selectedObjectId,
      handleSelectObject,
      handleToggleExpand,
      handleToggleStagingExpand,
      handleToggleRaw,
    ]
  );

  const isEmpty = model.stagingBlocks.length === 0 && model.macroStates.length === 0;
  const selectedObject = selectedObjectId ? model.objectById[selectedObjectId] ?? null : null;
  const defaultExpansion = useMemo(
    () => createDefaultGraphExpansionState(model, direction),
    [model, direction]
  );
  const macroExpansionDiffers =
    expandedIds.size !== defaultExpansion.expandedIds.size ||
    [...defaultExpansion.expandedIds].some((id) => !expandedIds.has(id));
  const stagingExpansionDiffers =
    expandedStagingIds.size !== defaultExpansion.expandedStagingIds.size ||
    [...defaultExpansion.expandedStagingIds].some((id) => !expandedStagingIds.has(id));
  const hasCustomOffsets =
    macroExpansionDiffers || stagingExpansionDiffers || rawOpenIds.size > 0;

  return (
    <div
      aria-label={UI_LABELS.graph.canvasAria}
      className="auteur-graph-canvas relative isolate z-0 h-full w-full overflow-hidden bg-app select-none"
    >
      {isEmpty ? (
        <div className="flex h-full w-full items-center justify-center p-8">
          <div className="max-w-sm rounded-2xl border border-border-main bg-surface p-6 text-center shadow-xs">
            <h2 className="text-sm font-semibold text-text-main">
              {UI_LABELS.graph.emptyTitle}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-text-muted">
              {UI_LABELS.graph.emptyDescription}
            </p>
          </div>
        </div>
      ) : (
        <GraphInteractionProvider value={interactionCtx}>
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onNodesChange={handleNodesChange}
            onPaneClick={() => setSelectedObjectId(null)}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            elevateEdgesOnSelect={false}
            zIndexMode="manual"
            selectionOnDrag={false}
            panOnDrag={true}
            minZoom={0.18}
            maxZoom={2.0}
            proOptions={{hideAttribution: true}}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1.25}
              bgColor="var(--app-bg)"
              color="var(--graph-dot)"
            />

            {showMiniMap && (
              <MiniMap
                position="bottom-right"
                style={{marginBottom: 46, marginRight: 12, width: 156, height: 102}}
                maskColor="color-mix(in srgb, var(--app-bg) 72%, transparent)"
                nodeColor={(node) => {
                  if (node.type === 'shotChamber') return 'var(--graph-chamber-border)';
                  if (node.type === 'aestheticItem') return 'var(--phase-aesthetic-text)';
                  if (node.type === 'inferredObject') return 'var(--tok-continuity)';
                  if (node.type === 'rawBranch') return 'var(--text-faint)';
                  if (node.type === 'macroState') return 'var(--phase-execution-text)';
                  if (node.type === 'subState') return 'var(--graph-dim-action)';
                  return 'var(--border-main)';
                }}
                pannable
                zoomable
              />
            )}
          </ReactFlow>

          {/* Top Floating HUD */}
          <GraphHud
            topology={model.topology}
            stats={model.stats}
            direction={direction}
            allExpanded={allExpanded}
            allRawOpen={allRawOpen}
            showAllLinks={showAllLinks}
            hasCustomOffsets={hasCustomOffsets}
            hasExecution={model.macroStates.length > 0}
            onDirectionChange={handleDirectionChange}
            onToggleExpandAll={handleToggleExpandAll}
            onToggleRawAll={handleToggleRawAll}
            onToggleAllLinks={handleToggleAllLinks}
            onResetLayout={handleResetLayout}
          />

          {/* Top-Right Floating Read-Only Object Inspector */}
          <ObjectInspectorPanel
            object={selectedObject}
            onClose={() => setSelectedObjectId(null)}
            onFocusCallSite={handleFocusCallSite}
          />

          {/* Bottom-Center Sub-State Type Isolation Dock */}
          {model.macroStates.length > 0 && (
            <SubStateIsolatorDock
              isolatedDims={isolatedDims}
              isolationMode={isolationMode}
              dimensionCounts={model.stats.dimensionCounts}
              onClearIsolation={handleClearIsolation}
              onToggleDimension={handleToggleDimension}
              onIsolationModeChange={handleIsolationModeChange}
            />
          )}

          {/* Bottom-Right Zoom & MiniMap Controls */}
          <ZoomControlsBar
            showMiniMap={showMiniMap}
            onToggleMiniMap={() => setShowMiniMap((prev) => !prev)}
            onFitView={triggerFitView}
          />

          {/* Bottom-Left Quiet Interaction Hint */}
          <div className="hidden xl:flex pointer-events-none absolute bottom-3 left-3 z-10 items-center gap-1.5 rounded-xl border border-border-subtle bg-surface/85 backdrop-blur px-2.5 py-1.5 text-[11px] text-text-muted">
            <span>
              {UI_LABELS.graph.hintLead}{' '}
              <strong className="font-mono font-semibold text-text-main">
                {UI_LABELS.graph.hintRawCode}
              </strong>{' '}
              {UI_LABELS.graph.hintMiddle}{' '}
              <strong className="font-semibold text-text-main">
                {UI_LABELS.graph.hintLabelEmphasis}
              </strong>{' '}
              {UI_LABELS.graph.hintTail}
            </span>
          </div>
        </GraphInteractionProvider>
      )}
    </div>
  );
}

export function AuteurGraphView(props: AuteurGraphViewProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
