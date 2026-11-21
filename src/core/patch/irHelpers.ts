import type {
  AuteurScriptIR,
  StagingMacroBlockDraft,
  StagingMacroBlockIR,
  SubStateDraft,
  SubStateIR,
} from '../irSchemas.ts';
import {classifyMacroBlock} from '../parser.ts';

export function cloneIR(ir: AuteurScriptIR): AuteurScriptIR {
  return {
    schemaVersion: ir.schemaVersion,
    preamble: [...ir.preamble],
    stagingMacroBlocks: ir.stagingMacroBlocks.map((block) =>
      block.format === 'key_value'
        ? {
            ...block,
            entries: block.entries.map((e) => ({...e})),
          }
        : {...block}
    ),
    executionMacroBlock: ir.executionMacroBlock
      ? {
          header: ir.executionMacroBlock.header,
          macroStates: ir.executionMacroBlock.macroStates.map((ms) => ({
            id: ms.id,
            subStates: ms.subStates.map((sub) => ({...sub})),
          })),
        }
      : null,
  };
}

export function materializeSubState(draft: SubStateDraft, tempId: string): SubStateIR {
  return {
    ...draft,
    id: draft.id ?? tempId,
  } as SubStateIR;
}

export function materializeStagingBlock(
  draft: StagingMacroBlockDraft,
  tempId: string,
  nextId: () => string
): StagingMacroBlockIR {
  const header = draft.header.trim().toUpperCase();
  if (draft.format === 'key_value') {
    return {
      id: draft.id ?? tempId,
      header,
      kind: 'AESTHETIC',
      format: 'key_value',
      entries: draft.entries.map((entry) => ({
        id: entry.id ?? nextId(),
        key: entry.key,
        value: entry.value,
      })),
    };
  }

  const inferredKind = classifyMacroBlock(header);
  return {
    id: draft.id ?? tempId,
    header,
    kind: draft.kind ?? (inferredKind === 'EXECUTION' ? 'CUSTOM' : inferredKind),
    format: 'prose',
    body: draft.body,
  };
}

export function findStagingBlockIndex(
  blocks: StagingMacroBlockIR[],
  macroBlockId?: string,
  header?: string
): number {
  if (macroBlockId) {
    return blocks.findIndex((b) => b.id === macroBlockId);
  }
  if (header) {
    const upper = header.trim().toUpperCase();
    return blocks.findIndex((b) => b.header.toUpperCase() === upper);
  }
  return -1;
}

export function ensureAestheticBlock(
  working: AuteurScriptIR,
  nextId: () => string
): Extract<StagingMacroBlockIR, {format: 'key_value'}> {
  const existing = working.stagingMacroBlocks.find(
    (b): b is Extract<StagingMacroBlockIR, {format: 'key_value'}> => b.format === 'key_value'
  );
  if (existing) return existing;

  const created: Extract<StagingMacroBlockIR, {format: 'key_value'}> = {
    id: nextId(),
    header: 'AESTHETIC',
    kind: 'AESTHETIC',
    format: 'key_value',
    entries: [],
  };
  working.stagingMacroBlocks.push(created);
  return created;
}

export function ensureExecutionMacroBlock(working: AuteurScriptIR) {
  if (!working.executionMacroBlock) {
    working.executionMacroBlock = {
      header: 'EXECUTION',
      macroStates: [],
    };
  }
  return working.executionMacroBlock;
}
