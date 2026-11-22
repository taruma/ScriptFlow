import {describe, expect, it} from 'vitest';
import {extractMetadata, parseAuteurScript} from '../../src/core/index.ts';
import {SCRIPT_PRESETS} from '../../src/data/presets.ts';
import {
  buildCanvasLayout,
  buildGraphSceneModel,
  createDefaultGraphExpansionState,
  GRAPH_Z_CARD,
  GRAPH_Z_CHAMBER,
  mergeLayoutIntoFlowNodes,
  tokenizeAnnotatedText,
  type FlowNodeLike,
  type GraphDimension,
  type GraphLayoutOptions,
} from '../../src/ui/canvas/index.ts';

function buildModelFromRaw(raw: string) {
  const doc = parseAuteurScript(raw);
  const meta = extractMetadata(doc);
  return buildGraphSceneModel(doc, meta);
}

function makeLayoutOptions(overrides: Partial<GraphLayoutOptions> = {}): GraphLayoutOptions {
  return {
    direction: 'LR',
    expandedIds: new Set<string>(),
    rawOpenIds: new Set<string>(),
    isolatedDims: new Set<GraphDimension>(),
    isolationMode: 'ghost',
    activeObjectId: null,
    showAllLinks: false,
    nodeOffsets: {},
    ...overrides,
  };
}

describe('Graph View Pure Scene Model & Deterministic Layout', () => {
  it('derives clean models across all 4 bundled presets with Shot Chambers and RECALL links', () => {
    // 0: Interrogation Room Coverage (CAM 01 -> CAM 02 -> CAM 01 RECALL)
    const coverage = buildModelFromRaw(SCRIPT_PRESETS[0].content);
    expect(coverage.topology).toBe('multi_camera_coverage');
    expect(coverage.stagingBlocks.map((b) => b.name)).toEqual([
      'INTENT',
      'LOGIC',
      'AESTHETIC',
      'OPENING',
    ]);
    expect(coverage.macroStates).toHaveLength(3);
    expect(coverage.macroStates[2].cameraTransition).toBe('RECALL');
    expect(coverage.macroStates[2].recallSourceMacroStateId).toBe('S1');
    expect(coverage.cameraSlotObjects.map((o) => o.matchToken)).toEqual(['CAM 01', 'CAM 02']);

    // 1: Subway Train Fight Oner (CAM 01 held across all 5 states -> single Shot Chamber)
    const oner = buildModelFromRaw(SCRIPT_PRESETS[1].content);
    expect(oner.topology).toBe('continuous_oner');
    expect(oner.macroStates).toHaveLength(5);
    expect(oner.shotChambers).toHaveLength(1);
    expect(oner.shotChambers[0]).toMatchObject({
      slot: 'CAM 01',
      macroStateIds: ['S1', 'S2', 'S3', 'S4', 'S5'],
    });
    expect(oner.macroStates.every((ms) => ms.shotChamberId === oner.shotChambers[0].id)).toBe(true);

    // 2: Forest POV Horror (CAM 01 continuous oner)
    const pov = buildModelFromRaw(SCRIPT_PRESETS[2].content);
    expect(pov.topology).toBe('continuous_oner');
    expect(pov.stats.macroStateCount).toBe(pov.macroStates.length);

    // 3: 1970s Heist Montage (unnumbered [CAM] -> no Shot Chambers)
    const montage = buildModelFromRaw(SCRIPT_PRESETS[3].content);
    expect(montage.topology).toBe('discontinuous_montage');
    expect(montage.shotChambers).toHaveLength(0);
  });

  it('handles montage tokens with @ref, standalone Staging-only refs, sculpted dialogue, and title cards', () => {
    const raw = `[INTENT]
Create a dry-humored 15-second montage featuring @character1 as Evan (voice: @voice1) and @character2 as Maya.

[AESTHETIC]
Location: Sunlit mid-century living room (reference: @house)
Location Mapping: Dim neon alley -> LOC01; Rainy wooden dock -> LOC03 (reference: @location)
Wardrobe Mapping: Evan in mustard track jacket -> EV01

[OPENING]
Evan stands in LOC01 wearing EV01 as rain taps the awning.

[EXECUTION]
[CAM] Static wide in LOC03 -> [ACT] Evan in EV01 drops his suitcase -> Evan says (V.O., deadpan) {I packed for a different life.} -> <wet gravel crunch> -> (dry upright bass) -> 【CHAPTER ONE】
[CAM] Tight CU on Maya -> [ACT] Maya glances sideways -> <distant foghorn>`;

    const model = buildModelFromRaw(raw);
    expect(model.topology).toBe('discontinuous_montage');

    const evan = model.railObjects.find((o) => o.matchToken === 'Evan');
    expect(evan).toMatchObject({
      kind: 'character',
      ref: '@character1',
      voiceRef: '@voice1',
      isStagingOnly: false,
    });
    expect(evan!.callSites.some((cs) => cs.display === '[OPENING]')).toBe(true);
    expect(evan!.callSites.some((cs) => cs.display === 'S1.2')).toBe(true);

    const loc03 = model.railObjects.find((o) => o.matchToken === 'LOC03');
    expect(loc03).toMatchObject({
      kind: 'location',
      ref: '@location',
      isStagingOnly: false,
    });
    expect(loc03!.callSites.some((cs) => cs.display === 'S1.1')).toBe(true);

    const house = model.railObjects.find((o) => o.matchToken === '@house');
    expect(house).toMatchObject({
      kind: 'staging_ref',
      ref: '@house',
      isStagingOnly: true,
    });

    const dialogueSubState = model.macroStates[0].subStates[2];
    expect(dialogueSubState.dimension).toBe('dialogue');
    expect(dialogueSubState.dialogue).toEqual({
      speaker: 'Evan',
      extensions: ['V.O.'],
      delivery: ['deadpan'],
      line: 'I packed for a different life.',
    });

    const titleSubState = model.macroStates[0].subStates[5];
    expect(titleSubState.dimension).toBe('onscreen_text');
    expect(titleSubState.cleanBody).toBe('CHAPTER ONE');

    expect(model.stats.dimensionCounts.foley).toBe(2);
    expect(model.stats.dimensionCounts.score).toBe(1);
    expect(model.stats.dimensionCounts.onscreen_text).toBe(1);
  });

  it('gracefully models an empty script with zero nodes/errors', () => {
    const model = buildModelFromRaw('');
    expect(model.stagingBlocks).toHaveLength(0);
    expect(model.macroStates).toHaveLength(0);
    expect(model.railObjects).toHaveLength(0);

    const defaults = createDefaultGraphExpansionState(model);
    expect(defaults.expandedIds.size).toBe(0);
    expect(defaults.rawOpenIds.size).toBe(0);

    const layout = buildCanvasLayout(model, makeLayoutOptions());
    expect(layout.nodes).toHaveLength(0);
    expect(layout.edges).toHaveLength(0);
  });

  it('defaults to S1 decoupled with S1 Raw branch open while leaving S2..SN coupled', () => {
    const coverage = buildModelFromRaw(SCRIPT_PRESETS[0].content);
    const defaults = createDefaultGraphExpansionState(coverage);

    expect(defaults.expandedIds.has('S1')).toBe(true);
    expect(defaults.expandedIds.has('S2')).toBe(false);
    expect(defaults.rawOpenIds.has('S1')).toBe(true);
    expect(defaults.rawOpenIds.has('S2')).toBe(false);
  });

  it('tokenizes inline entity mentions longest-first without partial-word collisions', () => {
    const raw = `[INTENT]
Featuring @img1 as Detective Miller and @img2 as Miller.

[AESTHETIC]
Location: Rainy alley -> LOC01

[EXECUTION]
[CAM 01] MS in LOC01 -> [ACT] Detective Miller checks LOC010 and speaks to Miller.`;

    const model = buildModelFromRaw(raw);
    const parts = tokenizeAnnotatedText(
      'Detective Miller checks LOC010 in LOC01 with Miller.',
      model.inlineEntities
    );

    const entities = parts.filter((p) => Boolean(p.entity));
    expect(entities.map((e) => e.text)).toEqual(['Detective Miller', 'LOC01', 'Miller']);
  });

  it('builds deterministic LR and TB layouts with Shot Chamber parentId grouping and RECALL arcs', () => {
    const oner = buildModelFromRaw(SCRIPT_PRESETS[1].content);
    const defaults = createDefaultGraphExpansionState(oner);

    const lrLayout = buildCanvasLayout(
      oner,
      makeLayoutOptions({
        direction: 'LR',
        expandedIds: defaults.expandedIds,
        rawOpenIds: defaults.rawOpenIds,
      })
    );

    const chamberNode = lrLayout.nodes.find((n) => n.type === 'shotChamber');
    expect(chamberNode).toBeDefined();

    const s1Node = lrLayout.nodes.find((n) => n.id === 'node-S1');
    const s2Node = lrLayout.nodes.find((n) => n.id === 'node-S2');
    expect(s1Node?.parentId).toBe(chamberNode!.id);
    expect(s2Node?.parentId).toBe(chamberNode!.id);

    // S1 is decoupled -> Sub-States + subStateChain edges present; S2 is coupled -> no S2 subnodes
    const s1SubNodes = lrLayout.nodes.filter((n) => n.id.startsWith('subnode-S1.'));
    const s2SubNodes = lrLayout.nodes.filter((n) => n.id.startsWith('subnode-S2.'));
    expect(s1SubNodes.length).toBe(oner.macroStates[0].subStates.length);
    expect(s2SubNodes.length).toBe(0);
    expect(lrLayout.edges.some((e) => e.kind === 'subStateChain')).toBe(true);

    // S1 Raw branch sits on the opposite perpendicular side (ABOVE in LR) and feeds into node-S1
    const rawS1 = lrLayout.nodes.find((n) => n.id === 'raw-S1');
    expect(rawS1).toBeDefined();
    expect(rawS1!.position.y).toBeLessThan(s1SubNodes[0].position.y);
    expect(
      lrLayout.edges.some(
        (e) => e.kind === 'rawBranch' && e.source === 'raw-S1' && e.target === 'node-S1'
      )
    ).toBe(true);

    // TB direction rotates the spine vertically (S2 sits below S1, Raw S1 sits left of Sub-States)
    const tbLayout = buildCanvasLayout(
      oner,
      makeLayoutOptions({
        direction: 'TB',
        expandedIds: defaults.expandedIds,
        rawOpenIds: defaults.rawOpenIds,
      })
    );
    const tbS1 = tbLayout.nodes.find((n) => n.id === 'node-S1')!;
    const tbS2 = tbLayout.nodes.find((n) => n.id === 'node-S2')!;
    const tbRawS1 = tbLayout.nodes.find((n) => n.id === 'raw-S1')!;
    const tbS1Sub = tbLayout.nodes.find((n) => n.id === 'subnode-S1.1')!;
    expect(tbS2.position.y).toBeGreaterThan(tbS1.position.y);
    expect(tbRawS1.position.x).toBeLessThan(tbS1Sub.position.x);

    // Interrogation Coverage produces a RECALL arc edge from establishing S1 -> recalled S3
    const coverage = buildModelFromRaw(SCRIPT_PRESETS[0].content);
    const coverageLayout = buildCanvasLayout(coverage, makeLayoutOptions());
    expect(
      coverageLayout.edges.some(
        (e) => e.kind === 'recall' && e.source === 'node-S1' && e.target === 'node-S3'
      )
    ).toBe(true);
  });

  it('routes label-match wires directly to decoupled Sub-States and falls back to Macro-State when coupled', () => {
    const oner = buildModelFromRaw(SCRIPT_PRESETS[1].content);
    const firstChar = oner.railObjects.find(
      (o) => o.kind === 'character' && o.callSites.some((cs) => cs.parentNodeId === 'node-S1')
    );
    expect(firstChar).toBeDefined();

    // When S1 is decoupled, labelMatch edge targets subnode-S1.#
    const expandedLayout = buildCanvasLayout(
      oner,
      makeLayoutOptions({
        expandedIds: new Set(['S1']),
        activeObjectId: firstChar!.id,
      })
    );
    const expandedEdges = expandedLayout.edges.filter(
      (e) => e.kind === 'labelMatch' && e.source === firstChar!.id
    );
    expect(expandedEdges.some((e) => e.target.startsWith('subnode-S1.'))).toBe(true);

    // When S1 is coupled, labelMatch edge routes to node-S1
    const coupledLayout = buildCanvasLayout(
      oner,
      makeLayoutOptions({
        expandedIds: new Set(),
        activeObjectId: firstChar!.id,
      })
    );
    const coupledEdges = coupledLayout.edges.filter(
      (e) => e.kind === 'labelMatch' && e.source === firstChar!.id
    );
    expect(coupledEdges.some((e) => e.target === 'node-S1')).toBe(true);
    expect(coupledEdges.some((e) => e.target.startsWith('subnode-S1.'))).toBe(false);
  });

  it('supports Sub-State isolation Ghost vs Compact modes, Milestone Pills, Dimension Threads, and ephemeral drag offsets', () => {
    const raw = `[INTENT]
Minimal scene.

[EXECUTION]
[CAM 01] MS -> [ACT] Alice enters -> Alice says {Hello.}
[CAM 02] CU -> [ACT] Bob nods -> <wood creak>
[CAM 01] -> [ACT] Alice turns -> Alice says {Wait.}`;

    const model = buildModelFromRaw(raw);

    // Compact mode isolating dialogue turns non-matching S2 into a Milestone Pill, threads S1 -> S3,
    // and hides non-matching Sub-States inside decoupled S1
    const compactLayout = buildCanvasLayout(
      model,
      makeLayoutOptions({
        expandedIds: new Set(['S1']),
        isolatedDims: new Set<GraphDimension>(['dialogue']),
        isolationMode: 'compact',
      })
    );

    const s2Data = compactLayout.nodes.find((n) => n.id === 'node-S2')?.data as {
      isPill?: boolean;
    };
    expect(s2Data.isPill).toBe(true);
    expect(
      compactLayout.edges.some(
        (e) => e.kind === 'isolationThread' && e.source === 'node-S1' && e.target === 'node-S3'
      )
    ).toBe(true);
    const compactS1Subs = compactLayout.nodes.filter((n) => n.id.startsWith('subnode-S1.'));
    expect(compactS1Subs.map((n) => n.id)).toEqual(['subnode-S1.3']);

    // Ghost mode keeps non-matching Sub-States inside decoupled S1 visible with isGhost: true
    const ghostLayout = buildCanvasLayout(
      model,
      makeLayoutOptions({
        expandedIds: new Set(['S1']),
        isolatedDims: new Set<GraphDimension>(['dialogue']),
        isolationMode: 'ghost',
      })
    );
    const ghostS1Subs = ghostLayout.nodes.filter((n) => n.id.startsWith('subnode-S1.'));
    expect(ghostS1Subs).toHaveLength(3);
    expect((ghostS1Subs[0].data as {isGhost?: boolean}).isGhost).toBe(true);
    expect((ghostS1Subs[2].data as {isGhost?: boolean}).isGhost).toBe(false);

    // Ephemeral drag offset shifts the target node cleanly
    const baseS1 = ghostLayout.nodes.find((n) => n.id === 'node-S1')!;
    const offsetLayout = buildCanvasLayout(
      model,
      makeLayoutOptions({
        expandedIds: new Set(['S1']),
        isolatedDims: new Set<GraphDimension>(['dialogue']),
        isolationMode: 'ghost',
        nodeOffsets: {'node-S1': {dx: 42, dy: -18}},
      })
    );
    const shiftedS1 = offsetLayout.nodes.find((n) => n.id === 'node-S1')!;
    expect(shiftedS1.position).toEqual({
      x: baseS1.position.x + 42,
      y: baseS1.position.y - 18,
    });
  });

  it('preserves React Flow measured dimensions, selection, style identity, and active drag positions across layout merges', () => {
    const coverage = buildModelFromRaw(SCRIPT_PRESETS[0].content);
    const layout1 = buildCanvasLayout(coverage, makeLayoutOptions());
    const initial = mergeLayoutIntoFlowNodes<FlowNodeLike>([], layout1.nodes, {});

    // Simulate React Flow ResizeObserver measuring nodes & user selecting / dragging one node
    const prevWithMeasured: FlowNodeLike[] = initial.nodes.map((node) =>
      node.id === 'node-S1'
        ? {
            ...node,
            measured: {width: 320, height: 214},
            selected: true,
            dragging: true,
            position: {x: 999, y: 888},
          }
        : {
            ...node,
            measured: {width: 240, height: 120},
          }
    );

    const prevS1Style = prevWithMeasured.find((n) => n.id === 'node-S1')!.style;

    // Trigger a hover/selection layout recomputation with activeObjectId set
    const firstObj = coverage.cameraSlotObjects[0];
    const layout2 = buildCanvasLayout(
      coverage,
      makeLayoutOptions({activeObjectId: firstObj.id})
    );
    const merged = mergeLayoutIntoFlowNodes(prevWithMeasured, layout2.nodes, {});

    const mergedS1 = merged.nodes.find((n) => n.id === 'node-S1')!;
    expect(mergedS1.measured).toEqual({width: 320, height: 214});
    expect(mergedS1.selected).toBe(true);
    expect(mergedS1.dragging).toBe(true);
    // Active drag position is preserved instead of snapping back mid-drag
    expect(mergedS1.position).toEqual({x: 999, y: 888});
    // Style object reference stays stable when width/height are unchanged
    expect(mergedS1.style).toBe(prevS1Style);
  });

  it('matches downstream references in [LOGIC] without self-linking declaring blocks and links uppercase dialogue speakers case-insensitively', () => {
    const raw = `[INTENT]
Featuring @image1 as Rosa.

[LOGIC]
Keep Rosa facing screen-right while holding EV01.

[AESTHETIC]
Prop: Stamped dossier -> EV01

[OPENING]
Rosa holds EV01.

[EXECUTION]
[CAM 01] MS -> ROSA says (V.O., dry) {Check the dates.} -> <paper rustle>`;

    const model = buildModelFromRaw(raw);
    const rosa = model.railObjects.find((o) => o.matchToken === 'Rosa')!;
    const ev01 = model.railObjects.find((o) => o.matchToken === 'EV01')!;

    // [LOGIC] and [OPENING] are matched downstream; declaring blocks [INTENT] and [AESTHETIC] do not self-link
    expect(rosa.callSites.map((cs) => cs.display)).toEqual(['[LOGIC]', '[OPENING]', 'S1.2']);
    expect(ev01.callSites.map((cs) => cs.display)).toEqual(['[LOGIC]', '[OPENING]']);
  });

  it('layers all content cards above edges and above ShotChamber backdrops', () => {
    const oner = buildModelFromRaw(SCRIPT_PRESETS[1].content);
    const defaults = createDefaultGraphExpansionState(oner);
    const layout = buildCanvasLayout(
      oner,
      makeLayoutOptions({
        expandedIds: defaults.expandedIds,
        rawOpenIds: defaults.rawOpenIds,
      })
    );

    const chambers = layout.nodes.filter((n) => n.type === 'shotChamber');
    const cards = layout.nodes.filter((n) => n.type !== 'shotChamber');

    expect(chambers.length).toBeGreaterThan(0);
    expect(cards.length).toBeGreaterThan(0);
    expect(chambers.every((n) => n.zIndex === GRAPH_Z_CHAMBER)).toBe(true);
    expect(cards.every((n) => n.zIndex === GRAPH_Z_CARD)).toBe(true);
    expect(GRAPH_Z_CARD).toBeGreaterThan(GRAPH_Z_CHAMBER);
  });
});
