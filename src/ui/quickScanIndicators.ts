import type {QuickScanRuleLens, QuickScanRuleScope} from '../data/knowledge/index.ts';
import type {QuickScanResult} from '../services/geminiDecisions.ts';

export interface LiveBeatQuickScanIndicator {
  key: string;
  ruleId: string;
  ruleLabel: string;
  lens: QuickScanRuleLens;
  scope: QuickScanRuleScope;
  targetId: string;
  beatIndex: number;
  status: 'flagged' | 'borderline';
  probability: number;
  confidence: number;
  source: 'decision_api' | 'deterministic';
  instructions?: string;
  trueDescription?: string;
  deterministicMessage?: string;
}

/**
 * Projects the active Quick Scan result onto Live Mode Execution Macro-State (`S#`)
 * margin indicators. Returns an empty map whenever the scan is absent or stale
 * relative to `currentSnapshotHash`.
 */
export function buildLiveQuickScanIndicators(
  quickScan: QuickScanResult | null | undefined,
  currentSnapshotHash: string
): Map<number, LiveBeatQuickScanIndicator[]> {
  const map = new Map<number, LiveBeatQuickScanIndicator[]>();
  if (!quickScan || quickScan.snapshotHash !== currentSnapshotHash) {
    return map;
  }

  for (const suspect of quickScan.suspectBeats) {
    if (suspect.items.length === 0) continue;
    const indicators: LiveBeatQuickScanIndicator[] = suspect.items
      .filter((item) => item.status === 'flagged' || item.status === 'borderline')
      .map((item) => ({
        key: item.key,
        ruleId: item.ruleId,
        ruleLabel: item.ruleLabel,
        lens: item.lens,
        scope: item.scope,
        targetId: item.targetId,
        beatIndex: suspect.beatIndex,
        status: item.status === 'flagged' ? 'flagged' : 'borderline',
        probability: item.probability,
        confidence: item.confidence,
        source: item.source,
        ...(item.instructions ? {instructions: item.instructions} : {}),
        ...(item.trueDescription ? {trueDescription: item.trueDescription} : {}),
        ...(item.deterministicMessage ? {deterministicMessage: item.deterministicMessage} : {}),
      }));

    if (indicators.length > 0) {
      map.set(suspect.beatIndex, indicators);
    }
  }

  return map;
}
