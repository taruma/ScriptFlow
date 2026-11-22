import {describe, expect, it} from 'vitest';
import {extractMetadata, parseAuteurScript} from '../../src/core/index.ts';
import {SCRIPT_PRESETS} from '../../src/data/presets.ts';
import {
  buildCanvasLayout,
  buildGraphSceneModel,
  createDefaultGraphExpansionState,
  estimateRawBranchHeight,
  estimateWrappedLines,
  GRAPH_Z_CARD,
  GRAPH_Z_CHAMBER,
  isGraphViewModified,
  mergeLayoutIntoFlowNodes,
  RAW_GAP,
  RAW_W_LR,
  RECALL_LANE_BASE,
  RECALL_LANE_STEP,
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

  it('defaults to all Macro-States coupled with Raw Input branches collapsed', () => {
    const coverage = buildModelFromRaw(SCRIPT_PRESETS[0].content);
    const defaults = createDefaultGraphExpansionState(coverage);

    expect(defaults.expandedIds.size).toBe(0);
    expect(defaults.rawOpenIds.size).toBe(0);
  });

  it('classifies undetected/plain and unrecognized [TAG] Sub-States into Other while keeping [LIGHT] and [VFX] in Light/VFX', () => {
    const raw = `[INTENT]
Minimal scene.

[EXECUTION]
[CAM] Static wide -> Slow fog drifts across the harbor -> [BABABABABABA] Robbie ducks -> [LIGHT] Amber glow -> [VFX] Dust motes -> <distant bell>`;

    const model = buildModelFromRaw(raw);
    expect(model.macroStates[0].subStates[1].dimension).toBe('other');
    expect(model.macroStates[0].subStates[1].tag).toBe('OTHER');
    expect(model.macroStates[0].subStates[2].dimension).toBe('other');
    expect(model.macroStates[0].subStates[2].tag).toBe('BABABABABABA');
    expect(model.macroStates[0].subStates[3].dimension).toBe('light_vfx');
    expect(model.macroStates[0].subStates[4].dimension).toBe('light_vfx');
    expect(model.stats.dimensionCounts.camera).toBe(1);
    expect(model.stats.dimensionCounts.other).toBe(2);
    expect(model.stats.dimensionCounts.light_vfx).toBe(2);
    expect(model.stats.dimensionCounts.foley).toBe(1);
    expect(model.stats.dimensionCounts.dialogue).toBe(0);
    expect(model.stats.dimensionCounts.action).toBe(0);
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
    const expandedS1 = new Set(['S1']);
    const rawS1Open = new Set(['S1']);

    const lrLayout = buildCanvasLayout(
      oner,
      makeLayoutOptions({
        direction: 'LR',
        expandedIds: expandedS1,
        rawOpenIds: rawS1Open,
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
        expandedIds: expandedS1,
        rawOpenIds: rawS1Open,
      })
    );
    const tbS1 = tbLayout.nodes.find((n) => n.id === 'node-S1')!;
    const tbS2 = tbLayout.nodes.find((n) => n.id === 'node-S2')!;
    const tbRawS1 = tbLayout.nodes.find((n) => n.id === 'raw-S1')!;
    const tbS1Sub = tbLayout.nodes.find((n) => n.id === 'subnode-S1.1')!;
    expect(tbS2.position.y).toBeGreaterThan(tbS1.position.y);
    expect(tbRawS1.position.x).toBeLessThan(tbS1Sub.position.x);

    // Interrogation Coverage: at rest, RECALL shows cleanly on the spine (`RECALL CAM 01`) with zero lane clutter;
    // focusing CAM 01, isolating CAM, or toggling Show Threads reveals the stepped RECALL lane (`S1 -> S3`)
    const coverage = buildModelFromRaw(SCRIPT_PRESETS[0].content);
    const restingCoverage = buildCanvasLayout(coverage, makeLayoutOptions());
    expect(restingCoverage.edges.some((e) => e.kind === 'recall')).toBe(false);
    expect(
      restingCoverage.edges.some(
        (e) => e.kind === 'spineCut' && e.target === 'node-S3' && e.label === 'RECALL CAM 01'
      )
    ).toBe(true);

    const focusedCamCoverage = buildCanvasLayout(
      coverage,
      makeLayoutOptions({activeObjectId: 'obj-cam-CAM-01'})
    );
    expect(
      focusedCamCoverage.edges.some(
        (e) =>
          e.kind === 'recall' &&
          e.source === 'node-S1' &&
          e.target === 'node-S3' &&
          e.isHot === true &&
          e.isAnimated === true
      )
    ).toBe(true);
  });

  it('enters through the first active Macro-State before handing off to split Sub-States and falls back cleanly when folded', () => {
    const oner = buildModelFromRaw(SCRIPT_PRESETS[1].content);
    const firstChar = oner.railObjects.find(
      (o) => o.kind === 'character' && o.callSites.some((cs) => cs.parentNodeId === 'node-S1')
    );
    expect(firstChar).toBeDefined();

    // When S1 is split, Tier 2 drops into node-S1 first (first active Macro-State), then hands off to subnode-S1.#
    const expandedLayout = buildCanvasLayout(
      oner,
      makeLayoutOptions({
        expandedIds: new Set(['S1']),
        activeObjectId: firstChar!.id,
      })
    );
    const expandedDropIns = expandedLayout.edges.filter(
      (e) => e.kind === 'labelMatch' && e.source === firstChar!.id && !e.target.startsWith('node-MB')
    );
    expect(expandedDropIns.some((e) => e.target === 'node-S1')).toBe(true);
    expect(
      expandedLayout.edges.some(
        (e) =>
          e.kind === 'labelMatch' &&
          e.source === 'node-S1' &&
          e.target.startsWith('subnode-S1.') &&
          e.isMacroEntryHandoff === true
      )
    ).toBe(true);

    // When S1 is folded, labelMatch edge routes directly to node-S1 with zero subnode handoffs
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
    expect(
      coupledLayout.edges.some((e) => e.kind === 'labelMatch' && e.target.startsWith('subnode-S1.'))
    ).toBe(false);
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
    const layout = buildCanvasLayout(
      oner,
      makeLayoutOptions({
        expandedIds: new Set(['S1']),
        rawOpenIds: new Set(['S1']),
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

  it('accounts for word-wrap and DOM measuredHeights so tall Raw Input branches never overlap Macro-States', () => {
    // Word-boundary wrapping produces at least as many lines as naive char division
    const sample =
      '[CAM 01] MS, two-shot, eye-level -> [BLOCK] Robbie frame-left MG facing screen-right; Arthur frame-right MG facing screen-left -> [ACT] Robbie stands hunched with tears streaking his flushed face, his right hand pressed hard against his sternum';
    expect(estimateWrappedLines(sample, 36)).toBeGreaterThanOrEqual(Math.ceil(sample.length / 36));
    expect(estimateRawBranchHeight(sample, RAW_W_LR)).toBeGreaterThan(150);

    const oner = buildModelFromRaw(SCRIPT_PRESETS[1].content);
    const simulatedRawHeight = 460;
    const simulatedMsHeight = 420;
    const layout = buildCanvasLayout(
      oner,
      makeLayoutOptions({
        direction: 'LR',
        rawOpenIds: new Set(['S1']),
        measuredHeights: {
          'raw-S1': simulatedRawHeight,
          'node-S1': simulatedMsHeight,
        },
      })
    );

    const rawS1 = layout.nodes.find((n) => n.id === 'raw-S1')!;
    const nodeS1 = layout.nodes.find((n) => n.id === 'node-S1')!;
    const chamber = layout.nodes.find((n) => n.type === 'shotChamber')!;

    // Raw card bottom edge must clear the Shot Chamber top margin & Macro-State top edge cleanly
    const rawBottomWorld = rawS1.position.y + simulatedRawHeight;
    const nodeS1TopWorld = chamber.position.y + nodeS1.position.y;
    expect(rawBottomWorld).toBeLessThanOrEqual(nodeS1TopWorld - RAW_GAP);
    expect(chamber.height).toBeGreaterThan(simulatedMsHeight);
  });

  it('arranges LR into 3 horizontal stratified tiers (Staging -> Objects -> Execution) and transposes cleanly to 3 vertical columns in TB', () => {
    const raw = `[INTENT]
Featuring @img1 as Robbie and @img2 as Arthur.

[AESTHETIC]
Setting: Dim concrete pier -> LOC01
Gear: Brass compass -> PR01
Costume: Rain-soaked trenchcoat -> WR01

[OPENING]
Robbie checks PR01 in LOC01 wearing WR01.

[EXECUTION]
[CAM 01] MS in LOC01 -> [ACT] Robbie steps forward -> Arthur says {Stay put.}
[CAM 02] CU -> [ACT] Robbie lifts PR01`;

    const model = buildModelFromRaw(raw);

    // Verify enhanced [AESTHETIC] key inference for location / prop / wardrobe + total object count (5 staging + 2 cameras)
    expect(model.railObjects.find((o) => o.matchToken === 'LOC01')?.kind).toBe('location');
    expect(model.railObjects.find((o) => o.matchToken === 'PR01')?.kind).toBe('prop');
    expect(model.railObjects.find((o) => o.matchToken === 'WR01')?.kind).toBe('wardrobe');
    expect(model.stats.inferredObjectCount).toBe(7);

    // LR: 3 horizontal bands stacked top-to-bottom (Tier 1 Staging -> Tier 2 Objects + Camera sub-row -> Tier 3 Execution)
    const lr = buildCanvasLayout(model, makeLayoutOptions({direction: 'LR'}));
    const lrStaging = lr.nodes.filter((n) => n.type === 'stagingBlock');
    const lrObjects = lr.nodes.filter((n) => n.type === 'inferredObject');
    const lrStagingObjects = lrObjects.filter((n) => !n.id.startsWith('obj-cam-'));
    const lrCameraObjects = lrObjects.filter((n) => n.id.startsWith('obj-cam-'));
    const lrExec = lr.nodes.filter((n) => n.type === 'macroState');

    // Tier 1 blocks flow L -> R on the same Y row
    expect(lrStaging[1].position.x).toBeGreaterThan(lrStaging[0].position.x);
    expect(lrStaging[1].position.y).toBe(lrStaging[0].position.y);
    // Tier 2 Staging objects sit strictly below Tier 1 and flow L -> R on one shared Y baseline
    expect(lrStagingObjects).toHaveLength(5);
    expect(lrStagingObjects[0].position.y).toBeGreaterThan(lrStaging[0].position.y);
    expect(lrStagingObjects.every((o) => o.position.y === lrStagingObjects[0].position.y)).toBe(true);
    expect(lrStagingObjects[1].position.x).toBeGreaterThan(lrStagingObjects[0].position.x);
    // Tier 2 Camera Setup objects sit on a distinct row below the Staging objects row
    expect(lrCameraObjects.map((n) => n.id)).toEqual(['obj-cam-CAM-01', 'obj-cam-CAM-02']);
    expect(lrCameraObjects[0].position.y).toBeGreaterThan(lrStagingObjects[0].position.y);
    expect(lrCameraObjects[0].position.x).toBe(lrStagingObjects[0].position.x);
    expect(lrCameraObjects[1].position.y).toBe(lrCameraObjects[0].position.y);
    expect(lrCameraObjects[1].position.x).toBeGreaterThan(lrCameraObjects[0].position.x);
    // Tier 3 Execution sits strictly below the Tier 2 Camera Setups row and flows L -> R
    expect(lrExec[0].position.y).toBeGreaterThan(lrCameraObjects[0].position.y);
    expect(lrExec[1].position.x).toBeGreaterThan(lrExec[0].position.x);

    // TB: 90-degree transpose into 3 parallel vertical columns (Staging | Objects + Camera Setups below | Execution)
    const tb = buildCanvasLayout(model, makeLayoutOptions({direction: 'TB'}));
    const tbStaging = tb.nodes.filter((n) => n.type === 'stagingBlock');
    const tbObjects = tb.nodes.filter((n) => n.type === 'inferredObject');
    const tbStagingObjects = tbObjects.filter((n) => !n.id.startsWith('obj-cam-'));
    const tbCameraObjects = tbObjects.filter((n) => n.id.startsWith('obj-cam-'));
    const tbExec = tb.nodes.filter((n) => n.type === 'macroState');

    expect(tbStaging[1].position.x).toBe(tbStaging[0].position.x);
    expect(tbStaging[1].position.y).toBeGreaterThan(tbStaging[0].position.y);
    expect(tbObjects[0].position.x).toBeGreaterThan(tbStaging[0].position.x);
    expect(tbObjects[1].position.y).toBeGreaterThan(tbObjects[0].position.y);
    expect(
      tbCameraObjects[0].position.y
    ).toBeGreaterThan(tbStagingObjects[tbStagingObjects.length - 1].position.y);
    expect(tbCameraObjects[0].position.x).toBe(tbStagingObjects[0].position.x);
    expect(tbExec[0].position.x).toBeGreaterThan(tbObjects[0].position.x);
    expect(tbExec[1].position.y).toBeGreaterThan(tbExec[0].position.y);
  });

  it('cascades entity threads chronologically (declaring block -> object -> 1st call -> prev -> next) with zero Tier 1 -> Tier 3 bypasses', () => {
    const raw = `[INTENT]
Featuring @img1 as Robbie and @img2 as Arthur.

[LOGIC]
Keep Robbie screen-left facing Arthur.

[OPENING]
Robbie waits beside the door.

[EXECUTION]
[CAM 01] MS -> [BLOCK] Robbie stands left -> [ACT] Robbie exhales -> Robbie says {Ready.}
[CAM 02] CU -> [ACT] Arthur nods silently
[CAM 01] -> [ACT] Robbie steps through -> [ACT] Arthur follows`;

    const model = buildModelFromRaw(raw);
    const robbie = model.railObjects.find((o) => o.matchToken === 'Robbie')!;

    // 1. Folded Macro-States: single drop-in from Robbie -> node-S1, then cascade node-S1 -> node-S3
    const folded = buildCanvasLayout(
      model,
      makeLayoutOptions({activeObjectId: robbie.id})
    );

    // Zero direct Tier 1 (node-MB*) -> Tier 3 (node-S* / subnode-S*) edges
    expect(
      folded.edges.some(
        (e) =>
          e.source.startsWith('node-MB') &&
          (e.target.startsWith('node-S') || e.target.startsWith('subnode-S'))
      )
    ).toBe(false);

    // Tier 1 -> Tier 2 extraction & Tier 2 -> Tier 1 downstream Staging refs
    expect(
      folded.edges.some(
        (e) => e.kind === 'extraction' && e.source === 'node-MB0' && e.target === robbie.id
      )
    ).toBe(true);
    const stagingRefs = folded.edges.filter(
      (e) => e.kind === 'labelMatch' && e.source === robbie.id && e.target.startsWith('node-MB')
    );
    expect(stagingRefs.map((e) => e.target)).toEqual(['node-MB1', 'node-MB2']);

    // Exactly ONE Tier 2 -> Tier 3 drop-in (Robbie -> node-S1), plus chronological cascade (node-S1 -> node-S3)
    const execDropIns = folded.edges.filter(
      (e) => e.kind === 'labelMatch' && e.source === robbie.id && !e.target.startsWith('node-MB')
    );
    expect(execDropIns).toHaveLength(1);
    expect(execDropIns[0]).toMatchObject({
      source: robbie.id,
      target: 'node-S1',
      targetHandle: 'thread-entry',
      isCascade: false,
      isHot: true,
      isAnimated: true,
    });

    const foldedCascades = folded.edges.filter((e) => e.kind === 'labelMatch' && e.isCascade);
    expect(foldedCascades).toHaveLength(1);
    expect(foldedCascades[0]).toMatchObject({
      source: 'node-S1',
      target: 'node-S3',
      sourceHandle: 'thread-out',
      targetHandle: 'thread-in',
      isIntraState: false,
      isHot: true,
      isAnimated: true,
    });

    // 2. Split S1 + folded S3: enters through first active Macro-State (Robbie -> node-S1 -> subnode-S1.2)
    //    then cascades directly subnode-S1.2 -> subnode-S1.3 -> subnode-S1.4 -> node-S3
    const splitS1 = buildCanvasLayout(
      model,
      makeLayoutOptions({
        expandedIds: new Set(['S1']),
        activeObjectId: robbie.id,
      })
    );
    const splitDropIns = splitS1.edges.filter(
      (e) => e.kind === 'labelMatch' && e.source === robbie.id && !e.target.startsWith('node-MB')
    );
    expect(splitDropIns).toHaveLength(1);
    expect(splitDropIns[0]).toMatchObject({
      target: 'node-S1',
      targetHandle: 'thread-entry',
    });

    const splitCascades = splitS1.edges.filter((e) => e.kind === 'labelMatch' && e.isCascade);
    expect(
      splitCascades.map((e) => ({
        source: e.source,
        target: e.target,
        isMacroEntryHandoff: Boolean(e.isMacroEntryHandoff),
        isIntraState: Boolean(e.isIntraState),
      }))
    ).toEqual([
      {source: 'node-S1', target: 'subnode-S1.2', isMacroEntryHandoff: true, isIntraState: false},
      {source: 'subnode-S1.2', target: 'subnode-S1.3', isMacroEntryHandoff: false, isIntraState: true},
      {source: 'subnode-S1.3', target: 'subnode-S1.4', isMacroEntryHandoff: false, isIntraState: true},
      {source: 'subnode-S1.4', target: 'node-S3', isMacroEntryHandoff: false, isIntraState: false},
    ]);
  });

  it('animates isolated Dimension Threads and single-object traces while keeping unfiltered Show Threads static', () => {
    const raw = `[INTENT]
Featuring @img1 as Robbie and @img2 as Arthur.

[EXECUTION]
[CAM 01] MS -> [ACT] Robbie steps in -> Robbie says {Hello.}
[CAM 02] CU -> [ACT] Arthur watches
[CAM 01] -> [ACT] Robbie turns -> Robbie says {Bye.}`;

    const model = buildModelFromRaw(raw);

    // 1. Unfiltered Show Threads: all entity cascades are static (zero animation load) with distinct lanes
    const allThreads = buildCanvasLayout(
      model,
      makeLayoutOptions({showAllLinks: true})
    );
    const allMatchEdges = allThreads.edges.filter((e) => e.kind === 'labelMatch');
    expect(allMatchEdges.length).toBeGreaterThan(0);
    expect(allMatchEdges.every((e) => !e.isAnimated && !e.isDimmed)).toBe(true);
    const lanes = new Set(allMatchEdges.map((e) => e.laneIndex));
    expect(lanes.size).toBe(2);

    // 2. Tag isolated + Show Threads ON: isolationThread animates L -> R, while background entity threads stay static & dimmed
    const isolated = buildCanvasLayout(
      model,
      makeLayoutOptions({
        showAllLinks: true,
        isolatedDims: new Set<GraphDimension>(['dialogue']),
      })
    );
    const isoEdges = isolated.edges.filter((e) => e.kind === 'isolationThread');
    expect(isoEdges).toHaveLength(1);
    expect(isoEdges[0]).toMatchObject({
      source: 'node-S1',
      target: 'node-S3',
      isHot: true,
      isAnimated: true,
    });
    const bgMatchEdges = isolated.edges.filter((e) => e.kind === 'labelMatch');
    expect(bgMatchEdges.length).toBeGreaterThan(0);
    expect(bgMatchEdges.every((e) => !e.isAnimated && e.isDimmed === true)).toBe(true);
  });

  it('expands [AESTHETIC] into Key-Value Lookbook cards by default, routes extraction from exact keys, and prevents overlaps across LR & TB with Show Source open', () => {
    const raw = `[INTENT]
Featuring @img1 as Rosa.

[AESTHETIC]
Camera & Lens: 35mm anamorphic vintage glass
Location Mapping: Rainy cobblestone alley -> LOC01; Lantern courtyard -> LOC02
Wardrobe Mapping: Rosa in olive wool cape -> RS01

[OPENING]
Rosa stands in LOC01 wearing RS01.

[EXECUTION]
[CAM 01] MS in LOC01 -> [ACT] Rosa checks her watch`;

    const model = buildModelFromRaw(raw);
    const lrDefaults = createDefaultGraphExpansionState(model, 'LR');
    const tbDefaults = createDefaultGraphExpansionState(model, 'TB');
    const aesBlock = model.stagingBlocks.find((b) => b.kind === 'AESTHETIC')!;

    // Orientation-aware defaults: LR starts fully folded (Macro-States + [AESTHETIC] + Source closed),
    // while TB starts unfolded (all Macro-States + [AESTHETIC] expanded, Source closed)
    expect(lrDefaults.expandedIds.size).toBe(0);
    expect(lrDefaults.expandedStagingIds.size).toBe(0);
    expect(lrDefaults.rawOpenIds.size).toBe(0);
    expect(tbDefaults.expandedIds.has('S1')).toBe(true);
    expect(tbDefaults.expandedStagingIds.has(aesBlock.mbId)).toBe(true);
    expect(tbDefaults.rawOpenIds.size).toBe(0);
    expect(aesBlock.aestheticItems).toHaveLength(3);

    // 1. LR mode with [AESTHETIC] open + [AESTHETIC] Source open + tall measured heights
    const lrOpen = buildCanvasLayout(
      model,
      makeLayoutOptions({
        direction: 'LR',
        expandedStagingIds: tbDefaults.expandedStagingIds,
        rawOpenIds: new Set([aesBlock.mbId]),
        activeObjectId: model.railObjects.find((o) => o.matchToken === 'LOC01')!.id,
        measuredHeights: {
          [`raw-${aesBlock.mbId}`]: 210,
          'aes-MB1-1': 160,
        },
      })
    );

    const aesNodesLR = lrOpen.nodes.filter((n) => n.type === 'aestheticItem');
    expect(aesNodesLR).toHaveLength(3);

    // Extraction wire for LOC01 originates from its exact Lookbook Key card (`aes-MB1-1`), not node-MB1
    expect(
      lrOpen.edges.some(
        (e) =>
          e.kind === 'extraction' &&
          e.source === 'aes-MB1-1' &&
          e.sourceHandle === 'aes-out' &&
          e.target === 'obj-tok-LOC01'
      )
    ).toBe(true);

    // Zero overlap in LR: Source card sits above [AESTHETIC], [OPENING] clears the rightmost Lookbook card,
    // and Tier 2 Objects sit strictly below the tallest Lookbook card
    const lrRawAes = lrOpen.nodes.find((n) => n.id === `raw-${aesBlock.mbId}`)!;
    const lrAesHeader = lrOpen.nodes.find((n) => n.id === aesBlock.id)!;
    const lrOpening = lrOpen.nodes.find((n) => n.id === 'node-MB2')!;
    const lrZoneObjects = lrOpen.nodes.find((n) => n.id === 'zone-objects')!;
    const rightmostAes = aesNodesLR[aesNodesLR.length - 1];

    expect(lrRawAes.position.y + 210).toBeLessThanOrEqual(lrAesHeader.position.y - RAW_GAP);
    expect(rightmostAes.position.x + (rightmostAes.width ?? 0)).toBeLessThan(lrOpening.position.x);
    expect(lrZoneObjects.position.y).toBeGreaterThan(aesNodesLR[1].position.y + 160);

    // 2. TB mode with [AESTHETIC] open + tall Source card open -> zero overlap with [OPENING] or Tier 2
    const tbOpen = buildCanvasLayout(
      model,
      makeLayoutOptions({
        direction: 'TB',
        expandedStagingIds: tbDefaults.expandedStagingIds,
        rawOpenIds: new Set([aesBlock.mbId]),
        measuredHeights: {
          [`raw-${aesBlock.mbId}`]: 480,
        },
      })
    );
    const tbRawAes = tbOpen.nodes.find((n) => n.id === `raw-${aesBlock.mbId}`)!;
    const tbAesHeader = tbOpen.nodes.find((n) => n.id === aesBlock.id)!;
    const tbOpening = tbOpen.nodes.find((n) => n.id === 'node-MB2')!;
    const tbZoneObjects = tbOpen.nodes.find((n) => n.id === 'zone-objects')!;

    expect(tbRawAes.position.x + (tbRawAes.width ?? 0)).toBeLessThanOrEqual(
      tbAesHeader.position.x - RAW_GAP
    );
    expect(tbRawAes.position.y + 480).toBeLessThan(tbOpening.position.y);
    expect(tbZoneObjects.position.x).toBeGreaterThan(
      tbAesHeader.position.x + (tbAesHeader.width ?? 0)
    );

    // 3. When [AESTHETIC] is folded, extraction falls back cleanly to node-MB1
    const lrFolded = buildCanvasLayout(
      model,
      makeLayoutOptions({
        direction: 'LR',
        expandedStagingIds: new Set(),
      })
    );
    expect(lrFolded.nodes.filter((n) => n.type === 'aestheticItem')).toHaveLength(0);
    expect(
      lrFolded.edges.some(
        (e) =>
          e.kind === 'extraction' &&
          e.source === aesBlock.id &&
          e.sourceHandle === 'staging-out' &&
          e.target === 'obj-tok-LOC01'
      )
    ).toBe(true);
  });

  it('marks off-thread split Macro-State headers as secondary-traced while keeping their subStateChain connection visible', () => {
    const raw = `[INTENT]
Featuring @img1 as Evan.

[EXECUTION]
[CAM 01] MS -> [ACT] Evan enters
[CAM 02] CU -> [ACT] Crowd turns -> Evan says {Hold on.}`;

    const model = buildModelFromRaw(raw);
    const evan = model.railObjects.find((o) => o.matchToken === 'Evan')!;

    // Both S1 and S2 are split: thread runs Evan -> node-S1 -> subnode-S1.2 -> subnode-S2.3
    // So node-S1 IS directly on the thread (`isTraced: true`), while node-S2 header is off-thread (`isSecondaryTraced: true`)
    const layout = buildCanvasLayout(
      model,
      makeLayoutOptions({
        direction: 'TB',
        expandedIds: new Set(['S1', 'S2']),
        activeObjectId: evan.id,
      })
    );

    const s1Data = layout.nodes.find((n) => n.id === 'node-S1')!.data as {
      isTraced?: boolean;
      isSecondaryTraced?: boolean;
      isDimmed?: boolean;
    };
    const s2Data = layout.nodes.find((n) => n.id === 'node-S2')!.data as {
      isTraced?: boolean;
      isSecondaryTraced?: boolean;
      isDimmed?: boolean;
    };

    expect(s1Data.isTraced).toBe(true);
    expect(s1Data.isSecondaryTraced).toBeFalsy();
    expect(s2Data.isTraced).toBe(false);
    expect(s2Data.isSecondaryTraced).toBe(true);
    expect(s2Data.isDimmed).toBe(false);

    // Structural chain edges from node-S2 down to subnode-S2.3 remain visible (not fully dimmed)
    const s2ChainToFirst = layout.edges.find(
      (e) => e.kind === 'subStateChain' && e.source === 'node-S2' && e.target === 'subnode-S2.1'
    )!;
    const s2ChainToMatch = layout.edges.find(
      (e) => e.kind === 'subStateChain' && e.target === 'subnode-S2.3'
    )!;
    expect(s2ChainToFirst.isDimmed).toBe(false);
    expect(s2ChainToFirst.isSecondary).toBe(true);
    expect(s2ChainToMatch.isDimmed).toBe(false);
  });

  it('cascades RECALL lanes chronologically per camera slot on stepped lanes (on-demand for CAM focus, CAM isolation, or Show Threads)', () => {
    const raw = `[INTENT]
Multi-camera dialogue.

[EXECUTION]
[CAM 01] MS two-shot -> [ACT] Beat one
[CAM 02] CU left -> [ACT] Beat two
[CAM 01] -> [ACT] Recall cam 1 first time
[CAM 02] -> [ACT] Recall cam 2
[CAM 01] -> [ACT] Recall cam 1 second time`;

    const model = buildModelFromRaw(raw);

    // 1. Resting state: zero recall lane wires (only clean spine labels)
    const rest = buildCanvasLayout(model, makeLayoutOptions());
    expect(rest.edges.filter((e) => e.kind === 'recall')).toHaveLength(0);

    // 2. Show Threads ON: all camera recalls cascade prev -> next on distinct stepped lanes (static)
    const threads = buildCanvasLayout(model, makeLayoutOptions({showAllLinks: true}));
    const threadRecalls = threads.edges.filter((e) => e.kind === 'recall');
    expect(
      threadRecalls.map((e) => ({
        source: e.source,
        target: e.target,
        label: e.label,
        laneIndex: e.laneIndex,
        isAnimated: e.isAnimated,
      }))
    ).toEqual([
      {source: 'node-S1', target: 'node-S3', label: 'RECALL CAM 01', laneIndex: 0, isAnimated: false},
      {source: 'node-S2', target: 'node-S4', label: 'RECALL CAM 02', laneIndex: 1, isAnimated: false},
      {source: 'node-S3', target: 'node-S5', label: 'RECALL CAM 01', laneIndex: 0, isAnimated: false},
    ]);

    // 3. CAM isolated: all camera recall lanes animate with pulse dots
    const camIso = buildCanvasLayout(
      model,
      makeLayoutOptions({isolatedDims: new Set<GraphDimension>(['camera'])})
    );
    const isoRecalls = camIso.edges.filter((e) => e.kind === 'recall');
    expect(isoRecalls).toHaveLength(3);
    expect(isoRecalls.every((e) => e.isHot && e.isAnimated)).toBe(true);

    // 4. Focusing CAM 01 shows only CAM 01's animated cascading recall lane (S1 -> S3 -> S5)
    const focusCam1 = buildCanvasLayout(
      model,
      makeLayoutOptions({activeObjectId: 'obj-cam-CAM-01'})
    );
    const cam1Recalls = focusCam1.edges.filter((e) => e.kind === 'recall');
    expect(cam1Recalls.map((e) => `${e.source}->${e.target}`)).toEqual([
      'node-S1->node-S3',
      'node-S3->node-S5',
    ]);
    expect(cam1Recalls.every((e) => e.isHot && e.isAnimated)).toBe(true);
  });

  it('scales cleanly beyond 3 recalled cameras with compact lane indices and dynamic LR/TB recall gutter clearance', () => {
    const raw = `[INTENT]
Featuring @img1 as Detective.

[EXECUTION]
[CAM 01] Master wide -> [ACT] Beat 1
[CAM 02] OTS left -> [ACT] Beat 2
[CAM 03] OTS right -> [ACT] Beat 3
[CAM 04] High overhead -> [ACT] Beat 4
[CAM 05] Insert floor -> [ACT] Beat 5
[CAM 02] -> [ACT] Recall cam 2
[CAM 03] -> [ACT] Recall cam 3
[CAM 04] -> [ACT] Recall cam 4
[CAM 05] -> [ACT] Recall cam 5`;

    const model = buildModelFromRaw(raw);
    const isolatedDims = new Set<GraphDimension>(['camera']);

    // CAM 01 is never recalled, so the 4 actually recalled cameras (02..05) pack tightly onto lanes 0..3
    const tb = buildCanvasLayout(model, makeLayoutOptions({direction: 'TB', isolatedDims}));
    const tbRecalls = tb.edges.filter((e) => e.kind === 'recall');
    expect(
      tbRecalls.map((e) => ({label: e.label, laneIndex: e.laneIndex}))
    ).toEqual([
      {label: 'RECALL CAM 02', laneIndex: 0},
      {label: 'RECALL CAM 03', laneIndex: 1},
      {label: 'RECALL CAM 04', laneIndex: 2},
      {label: 'RECALL CAM 05', laneIndex: 3},
    ]);

    const outerDepth = RECALL_LANE_BASE + 3 * RECALL_LANE_STEP;
    const tbS1 = tb.nodes.find((n) => n.id === 'node-S1')!;
    const tbZoneExec = tb.nodes.find((n) => n.id === 'zone-execution')!;
    const tbDetObj = tb.nodes.find((n) => n.id === 'obj-char-Detective')!;

    // Outermost recall track & pill clear Tier 2 Objects cleanly in TB
    expect(tbS1.position.x - outerDepth).toBeGreaterThan(
      tbDetObj.position.x + (tbDetObj.width ?? 0)
    );
    expect(tbS1.position.x - outerDepth).toBeGreaterThan(tbZoneExec.position.x);

    // Outermost recall track & pill clear Tier 2 Objects and PHASE 2 · EXECUTION zone header in LR
    const lr = buildCanvasLayout(model, makeLayoutOptions({direction: 'LR', isolatedDims}));
    const lrS1 = lr.nodes.find((n) => n.id === 'node-S1')!;
    const lrZoneExec = lr.nodes.find((n) => n.id === 'zone-execution')!;
    expect(lrS1.position.y - outerDepth).toBeGreaterThan(lrZoneExec.position.y + 34);
  });

  it('detects modified Graph View state cleanly via isGraphViewModified across LR and TB defaults', () => {
    const coverage = buildModelFromRaw(SCRIPT_PRESETS[0].content);
    const aesBlock = coverage.stagingBlocks.find((b) => b.kind === 'AESTHETIC')!;

    // Resting defaults in LR and TB are unmodified
    const lrDefaults = createDefaultGraphExpansionState(coverage, 'LR');
    expect(
      isGraphViewModified({
        model: coverage,
        direction: 'LR',
        expandedIds: lrDefaults.expandedIds,
        expandedStagingIds: lrDefaults.expandedStagingIds,
        rawOpenIds: lrDefaults.rawOpenIds,
        isolatedDims: new Set(),
        showAllLinks: false,
      })
    ).toBe(false);

    const tbDefaults = createDefaultGraphExpansionState(coverage, 'TB');
    expect(
      isGraphViewModified({
        model: coverage,
        direction: 'TB',
        expandedIds: tbDefaults.expandedIds,
        expandedStagingIds: tbDefaults.expandedStagingIds,
        rawOpenIds: tbDefaults.rawOpenIds,
        isolatedDims: new Set(),
        showAllLinks: false,
      })
    ).toBe(false);

    // Expanding a Macro-State in LR marks view as modified
    expect(
      isGraphViewModified({
        model: coverage,
        direction: 'LR',
        expandedIds: new Set(['S1']),
        expandedStagingIds: lrDefaults.expandedStagingIds,
        rawOpenIds: lrDefaults.rawOpenIds,
        isolatedDims: new Set(),
        showAllLinks: false,
      })
    ).toBe(true);

    // Folding a Macro-State away from TB's unfolded default marks view as modified
    const tbFoldedS1 = new Set(tbDefaults.expandedIds);
    tbFoldedS1.delete('S1');
    expect(
      isGraphViewModified({
        model: coverage,
        direction: 'TB',
        expandedIds: tbFoldedS1,
        expandedStagingIds: tbDefaults.expandedStagingIds,
        rawOpenIds: tbDefaults.rawOpenIds,
        isolatedDims: new Set(),
        showAllLinks: false,
      })
    ).toBe(true);

    // Toggling [AESTHETIC] Lookbook expansion away from orientation default marks view as modified
    expect(
      isGraphViewModified({
        model: coverage,
        direction: 'LR',
        expandedIds: lrDefaults.expandedIds,
        expandedStagingIds: new Set([aesBlock.mbId]),
        rawOpenIds: lrDefaults.rawOpenIds,
        isolatedDims: new Set(),
        showAllLinks: false,
      })
    ).toBe(true);

    expect(
      isGraphViewModified({
        model: coverage,
        direction: 'TB',
        expandedIds: tbDefaults.expandedIds,
        expandedStagingIds: new Set(),
        rawOpenIds: tbDefaults.rawOpenIds,
        isolatedDims: new Set(),
        showAllLinks: false,
      })
    ).toBe(true);

    // Opening any Source branch marks view as modified
    expect(
      isGraphViewModified({
        model: coverage,
        direction: 'LR',
        expandedIds: lrDefaults.expandedIds,
        expandedStagingIds: lrDefaults.expandedStagingIds,
        rawOpenIds: new Set(['S1']),
        isolatedDims: new Set(),
        showAllLinks: false,
      })
    ).toBe(true);

    // Isolating any Sub-State dimension marks view as modified
    expect(
      isGraphViewModified({
        model: coverage,
        direction: 'LR',
        expandedIds: lrDefaults.expandedIds,
        expandedStagingIds: lrDefaults.expandedStagingIds,
        rawOpenIds: lrDefaults.rawOpenIds,
        isolatedDims: new Set<GraphDimension>(['camera']),
        showAllLinks: false,
      })
    ).toBe(true);

    // Enabling Threads (showAllLinks) marks view as modified
    expect(
      isGraphViewModified({
        model: coverage,
        direction: 'LR',
        expandedIds: lrDefaults.expandedIds,
        expandedStagingIds: lrDefaults.expandedStagingIds,
        rawOpenIds: lrDefaults.rawOpenIds,
        isolatedDims: new Set(),
        showAllLinks: true,
      })
    ).toBe(true);
  });

  it('defaults all merged flow nodes to non-draggable and non-selectable so cards stay locked for pan-anywhere navigation', () => {
    const oner = buildModelFromRaw(SCRIPT_PRESETS[1].content);
    const layout = buildCanvasLayout(
      oner,
      makeLayoutOptions({
        direction: 'LR',
        expandedIds: new Set(['S1']),
        rawOpenIds: new Set(['S1']),
      })
    );
    const merged = mergeLayoutIntoFlowNodes<FlowNodeLike>([], layout.nodes, {});

    expect(merged.nodes.length).toBeGreaterThan(0);
    expect(merged.nodes.every((n) => n.draggable === false)).toBe(true);
    expect(merged.nodes.every((n) => n.selectable === false)).toBe(true);
  });
});

