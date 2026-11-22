import {
  inferSceneTopologyFromDocument,
  parseDialogueModifiers,
} from '../../core/index.ts';
import type {
  AuteurDocument,
  ExtractedMetadata,
  SubStateKind,
  SubStateNode,
} from '../../core/types.ts';
import {
  GRAPH_DIMENSIONS,
  type GraphDimension,
  type GraphMacroStateItem,
  type GraphSceneModel,
  type GraphStagingBlockItem,
  type GraphSubStateItem,
  type InferredGraphObject,
  type InferredObjectKind,
  type InlineEntityMatchRule,
  type ShotChamber,
} from './types.ts';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function mapSubStateKindToGraphDimension(
  kind: SubStateKind,
  tag?: string
): GraphDimension {
  switch (kind) {
    case 'camera':
      return 'camera';
    case 'block':
      return 'block';
    case 'dialogue':
      return 'dialogue';
    case 'foley':
      return 'foley';
    case 'score':
      return 'score';
    case 'light':
      return 'light_vfx';
    case 'tier2':
      return tag?.trim().toUpperCase() === 'VFX' ? 'light_vfx' : 'other';
    case 'onscreen_text':
      return 'onscreen_text';
    case 'action':
    case 'state_boundary':
      return 'action';
    case 'plain':
    default:
      return 'other';
  }
}

function classifyAestheticTokenKind(category?: string): InferredObjectKind {
  const lower = (category ?? '').toLowerCase();
  if (
    lower.includes('location') ||
    lower.includes('setting') ||
    lower.includes('set') ||
    lower.includes('place') ||
    lower.includes('env') ||
    lower.includes('backdrop') ||
    lower.includes('venue') ||
    lower.includes('interior') ||
    lower.includes('exterior') ||
    lower.includes('room') ||
    lower.includes('architecture')
  ) {
    return 'location';
  }
  if (
    lower.includes('prop') ||
    lower.includes('item') ||
    lower.includes('object') ||
    lower.includes('vehicle') ||
    lower.includes('weapon') ||
    lower.includes('tool') ||
    lower.includes('device') ||
    lower.includes('artifact') ||
    lower.includes('gear') ||
    lower.includes('accessory') ||
    lower.includes('furniture') ||
    lower.includes('document') ||
    lower.includes('dossier') ||
    lower.includes('evidence')
  ) {
    return 'prop';
  }
  return 'wardrobe';
}

function resolveSubStateTag(sub: SubStateNode): string {
  if (sub.kind === 'camera') {
    return sub.camera?.slot ?? 'CAM';
  }
  if (sub.kind === 'dialogue') return 'DIALOGUE';
  if (sub.kind === 'foley') return 'FOLEY';
  if (sub.kind === 'score') return 'SCORE';
  if (sub.kind === 'onscreen_text') return 'TITLE';
  if (sub.tag) return sub.tag.toUpperCase();
  return sub.kind === 'plain' ? 'OTHER' : 'ACT';
}

function resolveSubStateCleanBody(sub: SubStateNode): string {
  if (sub.kind === 'camera') {
    return sub.camera?.descriptor ?? sub.body;
  }
  if (sub.kind === 'dialogue') {
    return sub.dialogue?.line ?? sub.body;
  }
  return sub.body;
}

/**
 * Pure domain-to-graph model builder (zero React/DOM imports).
 * Extracts Staging Macro-Blocks, Inferred Objects (Characters, Aesthetic Tokens + optional @refs,
 * Staging-only Visual Refs, and numbered Camera Slots), Execution Macro-States, Sculpted Sub-States,
 * Shot Chambers, and RECALL origins directly from `(doc, metadata)`.
 */
export function buildGraphSceneModel(
  doc: AuteurDocument,
  metadata: ExtractedMetadata
): GraphSceneModel {
  const topology = inferSceneTopologyFromDocument(doc, metadata);

  // Map Staging block uppercase name -> MB# id
  const mbIdByBlockName = new Map<string, string>();
  const stagingBlocks: GraphStagingBlockItem[] = doc.stagingBlocks.map((block, idx) => {
    const mbId = `MB${idx}`;
    const upper = block.name.trim().toUpperCase();
    if (!mbIdByBlockName.has(upper)) {
      mbIdByBlockName.set(upper, mbId);
    }
    return {
      id: `node-${mbId}`,
      mbId,
      name: block.name,
      kind: block.kind,
      rawBody: block.rawBody,
      lines: block.lines,
      extractedObjectIds: [],
      matchedObjectIds: [],
    };
  });

  const stagingByMbId = new Map<string, GraphStagingBlockItem>();
  for (const sb of stagingBlocks) {
    stagingByMbId.set(sb.mbId, sb);
  }

  const railObjects: InferredGraphObject[] = [];
  const objectById: Record<string, InferredGraphObject> = {};
  const seenLabels = new Set<string>();

  const registerRailObject = (obj: InferredGraphObject) => {
    railObjects.push(obj);
    objectById[obj.id] = obj;
    const sourceBlock = stagingByMbId.get(obj.sourceBlockId);
    if (sourceBlock && !sourceBlock.extractedObjectIds.includes(obj.id)) {
      sourceBlock.extractedObjectIds.push(obj.id);
    }
  };

  // 1. Characters (@ref as Label [(voice: @audio)])
  for (const char of metadata.characters) {
    const normalized = char.name.toLowerCase();
    if (seenLabels.has(`char:${normalized}`)) continue;
    seenLabels.add(`char:${normalized}`);

    const sourceBlockId = mbIdByBlockName.get(char.sourceBlock.trim().toUpperCase()) ?? 'MB0';
    const id = `obj-char-${char.name}`;
    const bindingPhrase = char.voiceRef
      ? `${char.ref} as ${char.name} (voice: ${char.voiceRef})`
      : `${char.ref} as ${char.name}`;

    registerRailObject({
      id,
      matchToken: char.name,
      label: char.name,
      kind: 'character',
      category: 'Character',
      ref: char.ref,
      ...(char.voiceRef ? {voiceRef: char.voiceRef} : {}),
      detail: `Bound via "${bindingPhrase}" in [${char.sourceBlock}].`,
      sourceBlockId,
      sourceBlockName: char.sourceBlock,
      isStagingOnly: false,
      callSites: [],
    });
  }

  // 2. Aesthetic Tokens (detail -> TOKEN [(reference: @ref)])
  const aestheticBlock = stagingBlocks.find((b) => b.kind === 'AESTHETIC');
  const aestheticMbId = aestheticBlock?.mbId ?? 'MB0';
  const aestheticName = aestheticBlock?.name ?? 'AESTHETIC';

  for (const tok of metadata.aestheticTokens) {
    const normalized = tok.token.toLowerCase();
    if (seenLabels.has(`tok:${normalized}`)) continue;
    seenLabels.add(`tok:${normalized}`);

    const kind = classifyAestheticTokenKind(tok.category);
    const id = `obj-tok-${tok.token}`;

    registerRailObject({
      id,
      matchToken: tok.token,
      label: tok.token,
      kind,
      category: tok.category ?? (kind === 'location' ? 'Location' : kind === 'prop' ? 'Prop' : 'Wardrobe'),
      ...(tok.reference ? {ref: tok.reference} : {}),
      detail: tok.description || tok.token,
      sourceBlockId: aestheticMbId,
      sourceBlockName: aestheticName,
      isStagingOnly: false,
      callSites: [],
    });
  }

  // 3. Staging-Only Visual Refs (standalone (reference: @ref) in [AESTHETIC])
  const boundRefs = new Set<string>();
  for (const obj of railObjects) {
    if (obj.ref) boundRefs.add(obj.ref.toLowerCase());
    if (obj.voiceRef) boundRefs.add(obj.voiceRef.toLowerCase());
  }

  for (const sRef of metadata.stagingReferences) {
    if (boundRefs.has(sRef.ref.toLowerCase())) continue;
    boundRefs.add(sRef.ref.toLowerCase());

    const sourceBlockId = mbIdByBlockName.get(sRef.sourceBlock.trim().toUpperCase()) ?? aestheticMbId;
    const id = `obj-sref-${sRef.ref}`;
    registerRailObject({
      id,
      matchToken: sRef.ref,
      label: sRef.ref,
      kind: 'staging_ref',
      category: sRef.category ? `${sRef.category} · Staging Ref` : 'Staging Visual Ref',
      ref: sRef.ref,
      detail: sRef.description || `Staging-only visual reference ${sRef.ref}.`,
      sourceBlockId,
      sourceBlockName: sRef.sourceBlock,
      isStagingOnly: true,
      callSites: [],
    });
  }

  // 4. Numbered Camera Setups (CAM 01, CAM 02...)
  const cameraSlotObjects: InferredGraphObject[] = [];
  const cameraObjBySlot = new Map<string, InferredGraphObject>();
  const sortedSlots = Object.values(metadata.cameraSlots).sort(
    (a, b) => a.firstBeatIndex - b.firstBeatIndex
  );

  for (const slotDef of sortedSlots) {
    const slotKey = slotDef.slot.toUpperCase();
    const id = `obj-cam-${slotKey.replace(/\s+/g, '-')}`;
    const obj: InferredGraphObject = {
      id,
      matchToken: slotKey,
      label: slotKey,
      kind: 'camera_slot',
      category: 'Camera Setup',
      detail: slotDef.firstDescriptor || `Established at S${slotDef.firstBeatIndex}.`,
      sourceBlockId: `S${slotDef.firstBeatIndex}`,
      sourceBlockName: doc.execution?.headerName ?? 'EXECUTION',
      isStagingOnly: false,
      callSites: [],
    };
    cameraSlotObjects.push(obj);
    cameraObjBySlot.set(slotKey, obj);
    objectById[obj.id] = obj;
  }

  // Build entity matchers (longest match first to avoid partial collisions)
  const matchableRailObjects = railObjects
    .filter((o) => !o.isStagingOnly)
    .sort((a, b) => b.matchToken.length - a.matchToken.length);

  const matchRegexEntries = matchableRailObjects.map((obj) => ({
    obj,
    regex: new RegExp(`(?<![A-Za-z0-9_-])${escapeRegExp(obj.matchToken)}(?![A-Za-z0-9_-])`),
  }));

  const findMatchedObjectIds = (text: string): string[] => {
    const hits: string[] = [];
    for (const {obj, regex} of matchRegexEntries) {
      if (regex.test(text)) {
        hits.push(obj.id);
      }
    }
    return hits;
  };

  // Match downstream references inside [OPENING], [LOGIC], and other non-definition Staging blocks
  // (excluding each object's own declaring block so we never emit self-loop call sites).
  for (const sb of stagingBlocks) {
    const hits = findMatchedObjectIds(sb.rawBody).filter((objId) => {
      const obj = objectById[objId];
      return Boolean(obj && obj.sourceBlockId !== sb.mbId);
    });
    if (hits.length > 0) {
      sb.matchedObjectIds = hits;
      for (const objId of hits) {
        objectById[objId]?.callSites.push({
          targetNodeId: sb.id,
          display: `[${sb.name}]`,
          kind: 'staging',
        });
      }
    }
  }

  // Case-insensitive character lookup so uppercase dialogue cues (e.g. "ROSA says {…}")
  // still link back to `@image1 as Rosa` cleanly.
  const characterIdByLowerName = new Map<string, string>();
  for (const obj of railObjects) {
    if (obj.kind === 'character') {
      characterIdByLowerName.set(obj.matchToken.toLowerCase(), obj.id);
    }
  }

  // 5. Execution Macro-States & Sculpted Sub-States
  const dimensionCounts: Record<GraphDimension, number> = {
    camera: 0,
    block: 0,
    action: 0,
    dialogue: 0,
    foley: 0,
    score: 0,
    light_vfx: 0,
    onscreen_text: 0,
    other: 0,
  };

  const beats = doc.execution?.beats ?? [];
  let totalSubStates = 0;
  const macroStates: GraphMacroStateItem[] = [];

  beats.forEach((beat, idx) => {
    const msId = `S${beat.index}`;
    const link = metadata.beatLinks[idx];
    const msHits = new Set<string>();

    const subStates: GraphSubStateItem[] = beat.subStates.map((sub, subIdx) => {
      totalSubStates += 1;
      const ssId = `${msId}.${subIdx + 1}`;
      const dimension = mapSubStateKindToGraphDimension(sub.kind, sub.tag);
      dimensionCounts[dimension] += 1;

      const matched = findMatchedObjectIds(sub.raw);
      if (sub.kind === 'dialogue' && sub.dialogue?.speaker) {
        const speakerObjId = characterIdByLowerName.get(sub.dialogue.speaker.trim().toLowerCase());
        if (speakerObjId && !matched.includes(speakerObjId)) {
          matched.push(speakerObjId);
        }
      }
      for (const oid of matched) {
        msHits.add(oid);
        objectById[oid]?.callSites.push({
          targetNodeId: `subnode-${ssId}`,
          parentNodeId: `node-${msId}`,
          display: ssId,
          kind: 'sub_state',
        });
      }

      // Link camera slot object if this Sub-State declares a numbered camera slot
      const cameraSlot = sub.kind === 'camera' ? (sub.camera?.slot?.toUpperCase() ?? null) : null;
      if (cameraSlot) {
        const camObj = cameraObjBySlot.get(cameraSlot);
        if (camObj) {
          if (!matched.includes(camObj.id)) matched.push(camObj.id);
          msHits.add(camObj.id);
        }
      }

      let dialogue: GraphSubStateItem['dialogue'];
      if (sub.kind === 'dialogue' && sub.dialogue) {
        const {extensions, delivery} = parseDialogueModifiers(sub.dialogue.modifiers);
        dialogue = {
          speaker: sub.dialogue.speaker,
          ...(sub.dialogue.language ? {language: sub.dialogue.language} : {}),
          extensions,
          delivery,
          line: sub.dialogue.line,
        };
      }

      return {
        id: ssId,
        macroStateId: msId,
        index: subIdx,
        kind: sub.kind,
        dimension,
        tag: resolveSubStateTag(sub),
        raw: sub.raw,
        cleanBody: resolveSubStateCleanBody(sub),
        cameraSlot,
        ...(dialogue ? {dialogue} : {}),
        matchedObjectIds: matched,
      };
    });

    const activeSlot = link?.slot ? link.slot.toUpperCase() : null;
    const transition = link?.transition ?? 'NONE';
    let recallSourceMacroStateId: string | null = null;

    if (activeSlot) {
      const slotDef = metadata.cameraSlots[activeSlot] ?? metadata.cameraSlots[link?.slot ?? ''];
      if (transition === 'RECALL' && slotDef && slotDef.firstBeatIndex !== beat.index) {
        recallSourceMacroStateId = `S${slotDef.firstBeatIndex}`;
      }
      const camObj = cameraObjBySlot.get(activeSlot);
      if (camObj) {
        msHits.add(camObj.id);
        camObj.callSites.push({
          targetNodeId: `node-${msId}`,
          display: msId,
          kind: 'macro_state',
          transition,
        });
      }
    }

    macroStates.push({
      id: msId,
      index: beat.index,
      raw: beat.raw,
      subStates,
      matchedObjectIds: [...msHits],
      cameraSlot: activeSlot,
      cameraTransition: transition,
      recallSourceMacroStateId,
      shotChamberId: null,
    });
  });

  // 6. Compute Shot Chambers for consecutive ESTABLISH/CUT/RECALL -> HOLD runs (length >= 2)
  const shotChambers: ShotChamber[] = [];
  let runStart = 0;

  while (runStart < macroStates.length) {
    const startMs = macroStates[runStart];
    if (!startMs.cameraSlot || startMs.cameraTransition === 'MONTAGE') {
      runStart += 1;
      continue;
    }

    let runEnd = runStart;
    while (runEnd + 1 < macroStates.length) {
      const nextMs = macroStates[runEnd + 1];
      if (
        nextMs.cameraSlot === startMs.cameraSlot &&
        (nextMs.cameraTransition === 'HOLD' || nextMs.cameraTransition === 'NONE')
      ) {
        runEnd += 1;
      } else {
        break;
      }
    }

    if (runEnd > runStart) {
      const chamberId = `chamber-${shotChambers.length}`;
      const memberIds: string[] = [];
      for (let i = runStart; i <= runEnd; i++) {
        macroStates[i].shotChamberId = chamberId;
        memberIds.push(macroStates[i].id);
      }
      shotChambers.push({
        id: chamberId,
        slot: startMs.cameraSlot,
        macroStateIds: memberIds,
      });
    }

    runStart = runEnd + 1;
  }

  // 7. Build inline entity highlight rules (sorted longest-first)
  const inlineEntities: InlineEntityMatchRule[] = [];
  const seenInline = new Set<string>();

  const pushInline = (rule: InlineEntityMatchRule) => {
    const key = rule.matchText.toLowerCase();
    if (seenInline.has(key)) return;
    seenInline.add(key);
    inlineEntities.push(rule);
  };

  for (const obj of railObjects) {
    if (!obj.isStagingOnly) {
      pushInline({
        matchText: obj.matchToken,
        objectId: obj.id,
        kind: obj.kind,
        isRefToken: false,
      });
    }
    if (obj.ref) {
      pushInline({
        matchText: obj.ref,
        objectId: obj.id,
        kind: obj.kind,
        isRefToken: true,
      });
    }
    if (obj.voiceRef) {
      pushInline({
        matchText: obj.voiceRef,
        objectId: obj.id,
        kind: obj.kind,
        isRefToken: true,
      });
    }
  }

  inlineEntities.sort((a, b) => b.matchText.length - a.matchText.length);

  return {
    stagingBlocks,
    railObjects,
    cameraSlotObjects,
    objectById,
    inlineEntities,
    macroStates,
    shotChambers,
    topology,
    stats: {
      stagingCount: stagingBlocks.length,
      inferredObjectCount: railObjects.length > 0 ? railObjects.length : cameraSlotObjects.length,
      macroStateCount: macroStates.length,
      subStateCount: totalSubStates,
      dimensionCounts,
    },
  };
}

/**
 * Splits raw prose into literal text and matched inline entity tokens for clean React rendering.
 */
export interface AnnotatedTextSegment {
  text: string;
  entity?: InlineEntityMatchRule;
}

export function tokenizeAnnotatedText(
  text: string,
  rules: readonly InlineEntityMatchRule[]
): AnnotatedTextSegment[] {
  if (!text || rules.length === 0) {
    return text ? [{text}] : [];
  }

  const ruleMap = new Map<string, InlineEntityMatchRule>();
  const refPatterns: string[] = [];
  const wordPatterns: string[] = [];

  for (const rule of rules) {
    ruleMap.set(rule.matchText.toLowerCase(), rule);
    const escaped = escapeRegExp(rule.matchText);
    if (rule.isRefToken) {
      refPatterns.push(escaped);
    } else {
      wordPatterns.push(`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`);
    }
  }

  const allPatterns = [...refPatterns, ...wordPatterns];
  if (allPatterns.length === 0) {
    return [{text}];
  }

  const regex = new RegExp(`(${allPatterns.join('|')})`, 'g');
  const segments: AnnotatedTextSegment[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    const matched = match[0];
    if (start > cursor) {
      segments.push({text: text.slice(cursor, start)});
    }
    const rule = ruleMap.get(matched.toLowerCase());
    segments.push(rule ? {text: matched, entity: rule} : {text: matched});
    cursor = start + matched.length;
  }

  if (cursor < text.length) {
    segments.push({text: text.slice(cursor)});
  }

  return segments;
}

/**
 * Returns default Graph View sets when loading or resetting a script:
 * all Macro-States start compact (coupled) with Raw Input branches collapsed.
 */
export function createDefaultGraphExpansionState(_model?: GraphSceneModel): {
  expandedIds: Set<string>;
  rawOpenIds: Set<string>;
} {
  return {
    expandedIds: new Set(),
    rawOpenIds: new Set(),
  };
}
