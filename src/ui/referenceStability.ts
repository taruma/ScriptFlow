import type {
  AestheticToken,
  BeatCameraLink,
  CharacterBinding,
  ExecutionBeat,
  LintDiagnostic,
  StagingBlock,
} from '../core/types.ts';

/** Shared empty arrays to prevent fresh `[]` allocations from defeating React.memo. */
export const EMPTY_DIAGNOSTICS: LintDiagnostic[] = [];
export const EMPTY_AESTHETIC_TOKENS: AestheticToken[] = [];
export const EMPTY_BEATS: ExecutionBeat[] = [];

function stabilizeArray<T>(
  prev: T[],
  next: T[],
  isEqual: (a: T, b: T) => boolean
): T[] {
  if (prev === next) return prev;
  if (prev.length === 0 && next.length === 0) return prev;

  let allSame = prev.length === next.length;
  const result = new Array<T>(next.length);

  for (let i = 0; i < next.length; i++) {
    const nextItem = next[i];
    const prevItem = i < prev.length ? prev[i] : undefined;
    if (prevItem !== undefined && isEqual(prevItem, nextItem)) {
      result[i] = prevItem;
    } else {
      result[i] = nextItem;
      allSame = false;
    }
  }

  return allSame ? prev : result;
}

function isAestheticTokenEqual(a: AestheticToken, b: AestheticToken): boolean {
  return a.token === b.token && a.description === b.description && a.category === b.category;
}

function isCharacterBindingEqual(a: CharacterBinding, b: CharacterBinding): boolean {
  return (
    a.ref === b.ref &&
    a.name === b.name &&
    a.voiceRef === b.voiceRef &&
    a.sourceBlock === b.sourceBlock
  );
}

function isStagingBlockEqual(a: StagingBlock, b: StagingBlock): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.kind === b.kind &&
    a.rawBody === b.rawBody &&
    a.lines.length === b.lines.length
  );
}

function isExecutionBeatEqual(a: ExecutionBeat, b: ExecutionBeat): boolean {
  return (
    a.id === b.id &&
    a.index === b.index &&
    a.raw === b.raw &&
    a.subStates.length === b.subStates.length
  );
}

function isBeatCameraLinkEqual(a: BeatCameraLink, b: BeatCameraLink): boolean {
  return (
    a.beatIndex === b.beatIndex &&
    a.slot === b.slot &&
    a.descriptor === b.descriptor &&
    a.transition === b.transition &&
    a.connectsFromPrevious === b.connectsFromPrevious &&
    a.isCutFromPrevious === b.isCutFromPrevious
  );
}

function isDiagnosticEqual(a: LintDiagnostic, b: LintDiagnostic): boolean {
  return (
    a.id === b.id &&
    a.ruleId === b.ruleId &&
    a.ruleName === b.ruleName &&
    a.lens === b.lens &&
    a.severity === b.severity &&
    a.message === b.message &&
    a.repairHint === b.repairHint &&
    a.excerpt === b.excerpt
  );
}

/**
 * Reuses previous AestheticToken array & element references whenever token values
 * have not changed (ignoring line-index shifts caused by edits elsewhere in the script).
 */
export function stabilizeAestheticTokens(
  prev: AestheticToken[],
  next: AestheticToken[]
): AestheticToken[] {
  return stabilizeArray(prev, next, isAestheticTokenEqual);
}

/**
 * Reuses previous CharacterBinding array & element references whenever bindings
 * have not changed.
 */
export function stabilizeCharacters(
  prev: CharacterBinding[],
  next: CharacterBinding[]
): CharacterBinding[] {
  return stabilizeArray(prev, next, isCharacterBindingEqual);
}

/**
 * Reuses unchanged StagingBlock references by index so editing one Staging block
 * or any Execution beat does not invalidate unaffected StagingBlockCard instances.
 */
export function stabilizeStagingBlocks(
  prev: StagingBlock[],
  next: StagingBlock[]
): StagingBlock[] {
  return stabilizeArray(prev, next, isStagingBlockEqual);
}

/**
 * Reuses unchanged ExecutionBeat references by index so typing inside a single beat
 * preserves strict referential equality on every unaffected beat in the timeline.
 */
export function stabilizeExecutionBeats(
  prev: ExecutionBeat[],
  next: ExecutionBeat[]
): ExecutionBeat[] {
  return stabilizeArray(prev, next, isExecutionBeatEqual);
}

/**
 * Reuses unchanged BeatCameraLink references by index so non-camera edits
 * preserve strict referential equality on camera continuity links.
 */
export function stabilizeBeatLinks(
  prev: BeatCameraLink[],
  next: BeatCameraLink[]
): BeatCameraLink[] {
  return stabilizeArray(prev, next, isBeatCameraLinkEqual);
}

/**
 * Reuses unchanged string array references (e.g. SortableContext IDs and block name lists).
 */
export function stabilizeStringArray(prev: string[], next: string[]): string[] {
  return stabilizeArray(prev, next, (a, b) => a === b);
}

/**
 * Reuses unchanged per-index LintDiagnostic[] arrays and returns the previous Map
 * reference outright when no bucket's diagnostics changed.
 */
export function stabilizeDiagnosticsMap(
  prev: Map<number, LintDiagnostic[]>,
  next: Map<number, LintDiagnostic[]>
): Map<number, LintDiagnostic[]> {
  if (prev === next) return prev;
  if (prev.size === 0 && next.size === 0) return prev;

  let allSame = prev.size === next.size;
  const reconciled = new Map<number, LintDiagnostic[]>();

  for (const [key, nextList] of next.entries()) {
    const prevList = prev.get(key);
    if (prevList) {
      const stableList = stabilizeArray(prevList, nextList, isDiagnosticEqual);
      reconciled.set(key, stableList);
      if (stableList !== prevList) {
        allSame = false;
      }
    } else {
      reconciled.set(key, nextList);
      allSame = false;
    }
  }

  return allSame ? prev : reconciled;
}
