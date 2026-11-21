import type {QuickScanTrace} from '../../../services/geminiDecisions.ts';
import type {AgentTurnTrace} from '../../../services/geminiInteractions.ts';

export type AiInspectableTrace = AgentTurnTrace | QuickScanTrace;

export interface FormattedUsageEntry {
  key: string;
  value: string;
}

export function isQuickScanTrace(trace: AiInspectableTrace): trace is QuickScanTrace {
  return 'kind' in trace && trace.kind === 'quick_scan';
}

export function formatJsonPretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function buildInteractionChain(trace: AgentTurnTrace): string[] {
  const chain: string[] = [];
  const pushUnique = (id: string | null | undefined) => {
    if (!id) return;
    if (chain[chain.length - 1] !== id) {
      chain.push(id);
    }
  };
  pushUnique(trace.initialPreviousInteractionId);
  for (const round of trace.rounds) {
    pushUnique(round.interactionId);
  }
  pushUnique(trace.finalInteractionId);
  return chain;
}

export function formatUsageEntries(
  usage: Record<string, unknown> | undefined
): FormattedUsageEntry[] {
  if (!usage) return [];
  const entries: FormattedUsageEntry[] = [];
  for (const [key, value] of Object.entries(usage)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      entries.push({key, value: value.toLocaleString()});
    } else if (typeof value === 'string' && value.length > 0) {
      entries.push({key, value});
    }
  }
  return entries;
}

export function getRoundStatusBadgeClass(status: string | null): string {
  if (status === 'error') {
    return 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300';
  }
  if (status === 'aborted') {
    return 'auteur-phase-slate';
  }
  if (status === 'requires_action' || status === 'in_progress') {
    return 'auteur-phase-logic';
  }
  if (status === 'completed') {
    return 'auteur-phase-aesthetic';
  }
  return 'border-border-main bg-surface text-text-muted';
}

export function getQuickScanAnswerBadgeClass(status: string): string {
  if (status === 'flagged') {
    return 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300';
  }
  if (status === 'borderline') {
    return 'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  }
  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
}
