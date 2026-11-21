import {renderStagingBlockBody, renderSubState, toAuteurEnvelope} from '../ir.ts';
import {AuteurPatchSchema, type MacroStateIR, type StagingMacroBlockIR} from '../irSchemas.ts';
import {applySingleOp} from './applyOp.ts';
import {cloneIR} from './irHelpers.ts';

export interface StagingPatchPreviewChange {
  kind: 'modify' | 'delete';
  blockIndex: number;
  blockId: string;
  header: string;
  afterHeader?: string;
  beforeBody: string;
  afterBody?: string;
}

export interface StagingPatchPreviewInsertion {
  /** `-1` inserts before MB0; `k >= 0` inserts immediately after MB<k>. */
  afterBlockIndex: number;
  header: string;
  body: string;
}

export interface ExecutionPatchPreviewChange {
  kind: 'modify' | 'delete' | 'reorder';
  beatIndex: number;
  macroStateId: string;
  beforeText: string;
  afterText?: string;
  /** 1-based post-patch Macro-State position when explicitly reordered. */
  movedToBeatIndex?: number;
}

export interface ExecutionPatchPreviewInsertion {
  /** `0` inserts before S1; `k >= 1` inserts immediately after S<k>. */
  afterBeatIndex: number;
  /** 1-based post-patch Macro-State position. */
  insertedBeatIndex: number;
  text: string;
}

export interface PatchPreviewProjection {
  stagingChanges: StagingPatchPreviewChange[];
  stagingInsertions: StagingPatchPreviewInsertion[];
  executionChanges: ExecutionPatchPreviewChange[];
  executionInsertions: ExecutionPatchPreviewInsertion[];
}

export function renderMacroStateLine(ms: MacroStateIR): string {
  return ms.subStates
    .map((sub) => renderSubState(sub))
    .filter((segment) => segment.length > 0)
    .join(' -> ');
}

/**
 * Purely projects an AuteurPatch onto pre-patch Staging Macro-Block indices (`MB#`),
 * Execution Macro-State indices (`S#`), and insertion seams without mutating the script.
 * Returns `null` if the patch is invalid, stale (snapshot mismatch), or fails to apply.
 */
export function projectAuteurPatchPreview(
  rawText: string,
  rawPatch: unknown
): PatchPreviewProjection | null {
  const beforeEnvelope = toAuteurEnvelope(rawText);
  const parsed = AuteurPatchSchema.safeParse(rawPatch);
  if (!parsed.success) {
    return null;
  }

  const patch = parsed.data;
  if (patch.expectedSnapshotHash && patch.expectedSnapshotHash !== beforeEnvelope.snapshotHash) {
    return null;
  }

  const working = cloneIR(beforeEnvelope.document);
  let tempCounter = 0;
  const nextId = () => `__new_${tempCounter++}`;

  for (let i = 0; i < patch.ops.length; i++) {
    const err = applySingleOp(working, patch.ops[i], i, nextId);
    if (err) {
      return null;
    }
  }

  // 1. Project Staging Macro-Block changes & insertions
  const beforeBlocks = beforeEnvelope.document.stagingMacroBlocks;
  const beforeBlockIndexById = new Map<string, number>();
  beforeBlocks.forEach((block, idx) => {
    beforeBlockIndexById.set(block.id, idx);
  });

  const afterBlockById = new Map<string, StagingMacroBlockIR>();
  const stagingInsertions: StagingPatchPreviewInsertion[] = [];
  let lastSurvivingBlockIndex = -1;

  for (const block of working.stagingMacroBlocks) {
    const originIdx = beforeBlockIndexById.get(block.id);
    if (originIdx !== undefined) {
      lastSurvivingBlockIndex = originIdx;
      afterBlockById.set(block.id, block);
    } else {
      stagingInsertions.push({
        afterBlockIndex: lastSurvivingBlockIndex,
        header: block.header.trim().toUpperCase(),
        body: renderStagingBlockBody(block),
      });
    }
  }

  const stagingChanges: StagingPatchPreviewChange[] = [];
  beforeBlocks.forEach((beforeBlock, idx) => {
    const beforeHeader = beforeBlock.header.trim().toUpperCase();
    const beforeBody = renderStagingBlockBody(beforeBlock);
    const afterBlock = afterBlockById.get(beforeBlock.id);

    if (!afterBlock) {
      stagingChanges.push({
        kind: 'delete',
        blockIndex: idx,
        blockId: beforeBlock.id,
        header: beforeHeader,
        beforeBody,
      });
      return;
    }

    const afterHeader = afterBlock.header.trim().toUpperCase();
    const afterBody = renderStagingBlockBody(afterBlock);
    if (afterBody !== beforeBody || afterHeader !== beforeHeader) {
      stagingChanges.push({
        kind: 'modify',
        blockIndex: idx,
        blockId: beforeBlock.id,
        header: beforeHeader,
        afterHeader,
        beforeBody,
        afterBody,
      });
    }
  });

  // 2. Project Execution Macro-State changes & insertions
  const beforeStates = beforeEnvelope.document.executionMacroBlock?.macroStates ?? [];
  const beforeBeatIndexById = new Map<string, number>();
  beforeStates.forEach((ms, idx) => {
    beforeBeatIndexById.set(ms.id, idx + 1);
  });

  const reorderedIds = new Set<string>();
  for (const op of patch.ops) {
    if (op.op === 'reorder_macro_states') {
      reorderedIds.add(op.macroStateId);
    }
  }

  const afterStateById = new Map<string, {text: string; afterBeatIndex: number}>();
  const executionInsertions: ExecutionPatchPreviewInsertion[] = [];
  let lastSurvivingBeatIndex = 0;
  let afterBeatNumber = 0;

  for (const ms of working.executionMacroBlock?.macroStates ?? []) {
    const text = renderMacroStateLine(ms);
    if (text.length === 0) continue;
    afterBeatNumber += 1;

    const originBeatIndex = beforeBeatIndexById.get(ms.id);
    if (originBeatIndex !== undefined) {
      lastSurvivingBeatIndex = originBeatIndex;
      afterStateById.set(ms.id, {text, afterBeatIndex: afterBeatNumber});
    } else {
      executionInsertions.push({
        afterBeatIndex: lastSurvivingBeatIndex,
        insertedBeatIndex: afterBeatNumber,
        text,
      });
    }
  }

  const executionChanges: ExecutionPatchPreviewChange[] = [];
  beforeStates.forEach((beforeMs, idx) => {
    const beatIndex = idx + 1;
    const beforeText = renderMacroStateLine(beforeMs);
    const afterEntry = afterStateById.get(beforeMs.id);

    if (!afterEntry) {
      executionChanges.push({
        kind: 'delete',
        beatIndex,
        macroStateId: beforeMs.id,
        beforeText,
      });
      return;
    }

    const textChanged = afterEntry.text !== beforeText;
    const wasReordered = reorderedIds.has(beforeMs.id) && afterEntry.afterBeatIndex !== beatIndex;

    if (textChanged || wasReordered) {
      executionChanges.push({
        kind: textChanged ? 'modify' : 'reorder',
        beatIndex,
        macroStateId: beforeMs.id,
        beforeText,
        afterText: afterEntry.text,
        ...(wasReordered ? {movedToBeatIndex: afterEntry.afterBeatIndex} : {}),
      });
    }
  });

  return {
    stagingChanges,
    stagingInsertions,
    executionChanges,
    executionInsertions,
  };
}
