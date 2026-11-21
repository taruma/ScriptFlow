import {
  projectAuteurPatchPreview,
  toAuteurEnvelope,
  type AuteurPatch,
  type AuteurPatchOp,
  type LintRuleOverrides,
} from '../../core/index.ts';
import {
  buildPatchSuggestion,
  type AuditReviewSuggestion,
  type PatchSuggestion,
} from './suggestions.ts';

// ---------------------------------------------------------------------------
// Audit Review Smart Sibling Rebase & Batch Fix Composition
// ---------------------------------------------------------------------------

interface PatchFootprint {
  touchedStagingIndices: Set<number>;
  touchedExecutionBeats: Set<number>;
  shiftsStagingIndices: boolean;
  shiftsExecutionIndices: boolean;
  touchesStaging: boolean;
  touchesExecution: boolean;
}

function computePatchFootprint(rawText: string, patch: AuteurPatch): PatchFootprint | null {
  const projection = projectAuteurPatchPreview(rawText, patch);
  if (!projection) return null;

  const touchedStagingIndices = new Set<number>();
  let shiftsStagingIndices = projection.stagingInsertions.length > 0;
  for (const change of projection.stagingChanges) {
    touchedStagingIndices.add(change.blockIndex);
    if (change.kind === 'delete') {
      shiftsStagingIndices = true;
    }
  }

  const touchedExecutionBeats = new Set<number>();
  let shiftsExecutionIndices = projection.executionInsertions.length > 0;
  for (const change of projection.executionChanges) {
    touchedExecutionBeats.add(change.beatIndex);
    if (change.kind === 'delete' || change.kind === 'reorder') {
      shiftsExecutionIndices = true;
    }
  }

  return {
    touchedStagingIndices,
    touchedExecutionBeats,
    shiftsStagingIndices,
    shiftsExecutionIndices,
    touchesStaging: touchedStagingIndices.size > 0 || shiftsStagingIndices,
    touchesExecution: touchedExecutionBeats.size > 0 || shiftsExecutionIndices,
  };
}

function setsIntersect(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  for (const value of a) {
    if (b.has(value)) return true;
  }
  return false;
}

function arePatchFootprintsDisjointForRebase(
  applied: PatchFootprint,
  sibling: PatchFootprint
): boolean {
  if (applied.shiftsStagingIndices && sibling.touchesStaging) return false;
  if (applied.shiftsExecutionIndices && sibling.touchesExecution) return false;
  if (setsIntersect(applied.touchedStagingIndices, sibling.touchedStagingIndices)) return false;
  if (setsIntersect(applied.touchedExecutionBeats, sibling.touchedExecutionBeats)) return false;
  return true;
}

function arePatchFootprintsDisjointForBatch(
  a: PatchFootprint,
  b: PatchFootprint
): boolean {
  if (setsIntersect(a.touchedStagingIndices, b.touchedStagingIndices)) return false;
  if (setsIntersect(a.touchedExecutionBeats, b.touchedExecutionBeats)) return false;
  return true;
}

/**
 * After one embedded Audit Review fix is applied cleanly, rebases any provably
 * non-conflicting unapplied sibling fixes onto `nextRawText` so users can apply
 * independent audit fixes one by one without re-running the audit.
 * Conflicting or lint-failing siblings retain their previous snapshot hash and
 * stay safely marked stale.
 */
export function rebaseAuditReviewAfterFix(
  audit: AuditReviewSuggestion,
  appliedFix: PatchSuggestion,
  nextRawText: string,
  appliedIds: ReadonlySet<string>,
  ruleOverrides?: LintRuleOverrides
): AuditReviewSuggestion {
  const appliedFootprint = computePatchFootprint(appliedFix.beforeRawText, appliedFix.patch);
  if (!appliedFootprint) return audit;

  const nextEnvelope = toAuteurEnvelope(nextRawText, ruleOverrides);
  const nextSnapshotHash = nextEnvelope.snapshotHash;
  let changed = false;

  const nextIssues = audit.issues.map((issue) => {
    const sibling = issue.patchSuggestion;
    if (
      !sibling ||
      sibling.id === appliedFix.id ||
      appliedIds.has(sibling.id) ||
      sibling.baseSnapshotHash !== appliedFix.baseSnapshotHash
    ) {
      return issue;
    }

    const siblingFootprint = computePatchFootprint(appliedFix.beforeRawText, sibling.patch);
    if (
      !siblingFootprint ||
      !arePatchFootprintsDisjointForRebase(appliedFootprint, siblingFootprint)
    ) {
      return issue;
    }

    const rebased = buildPatchSuggestion(
      nextRawText,
      {
        ...sibling.patch,
        expectedSnapshotHash: nextSnapshotHash,
      },
      ruleOverrides,
      () => sibling.id
    );

    if (!rebased.ok) {
      return issue;
    }

    changed = true;
    return {
      ...issue,
      patchSuggestion: rebased.suggestion,
    };
  });

  return changed ? {...audit, issues: nextIssues} : audit;
}

export interface AuditFixesBatchPlan {
  /** Single transactional patch combining all compatible unapplied fixes, or null if < 2 compose. */
  combinedPatch: PatchSuggestion | null;
  /** IDs of the individual Audit issue fixes included in `combinedPatch`. */
  includedFixIds: string[];
  /** Total remaining unapplied, non-stale fixes in this Audit Review card. */
  eligibleCount: number;
  /** Remaining non-stale fixes skipped due to overlapping targets or lint conflicts. */
  skippedCount: number;
}

/**
 * Greedily composes all remaining unapplied, non-stale embedded Audit Review fixes
 * that target disjoint Macro-Blocks / Macro-States and pass deterministic linting
 * together into a single transactional `PatchSuggestion` (one Undo checkpoint).
 */
export function composeAuditFixesBatch(
  rawText: string,
  audit: AuditReviewSuggestion,
  appliedIds: readonly string[],
  currentSnapshotHash: string,
  ruleOverrides?: LintRuleOverrides
): AuditFixesBatchPlan {
  const appliedSet = new Set(appliedIds);
  const eligible: PatchSuggestion[] = [];

  for (const issue of audit.issues) {
    const patch = issue.patchSuggestion;
    if (
      patch &&
      !appliedSet.has(patch.id) &&
      patch.baseSnapshotHash === currentSnapshotHash
    ) {
      eligible.push(patch);
    }
  }

  const eligibleCount = eligible.length;
  if (eligibleCount < 2) {
    return {
      combinedPatch: null,
      includedFixIds: [],
      eligibleCount,
      skippedCount: 0,
    };
  }

  const includedOps: AuteurPatchOp[] = [];
  const includedFixIds: string[] = [];
  const includedFootprints: PatchFootprint[] = [];
  let lastValidSuggestion: PatchSuggestion | null = null;

  for (const candidate of eligible) {
    const footprint = computePatchFootprint(rawText, candidate.patch);
    if (!footprint) continue;
    if (includedFootprints.some((prev) => !arePatchFootprintsDisjointForBatch(prev, footprint))) {
      continue;
    }

    const nextOps = [...includedOps, ...candidate.patch.ops];
    const nextCount = includedFixIds.length + 1;
    const built = buildPatchSuggestion(
      rawText,
      {
        expectedSnapshotHash: currentSnapshotHash,
        summary: `Apply ${nextCount} audit fixes`,
        ops: nextOps,
      },
      ruleOverrides,
      () => `${audit.id}-batch`
    );

    if (!built.ok) {
      continue;
    }

    includedOps.push(...candidate.patch.ops);
    includedFixIds.push(candidate.id);
    includedFootprints.push(footprint);
    lastValidSuggestion = built.suggestion;
  }

  if (includedFixIds.length < 2 || !lastValidSuggestion) {
    return {
      combinedPatch: null,
      includedFixIds: [],
      eligibleCount,
      skippedCount: eligibleCount,
    };
  }

  return {
    combinedPatch: lastValidSuggestion,
    includedFixIds,
    eligibleCount,
    skippedCount: eligibleCount - includedFixIds.length,
  };
}
