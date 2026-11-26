import type {AiLoadedSkillItem, AiToolCallItem} from './types.ts';

export interface TurnActivitySummary {
  orderedSkills: AiLoadedSkillItem[];
  loadedSkillCount: number;
  pinnedSkillCount: number;
  totalSkillCount: number;
  toolCount: number;
  runningToolCount: number;
  errorToolCount: number;
  stoppedToolCount: number;
}

/**
 * Removes redundant completed `load_auteur_skill` tool calls when `loadedSkills`
 * already displays the resolved skill entry, while keeping in-flight, retrying,
 * or stopped skill loads visible.
 */
export function dedupeTurnToolCalls(
  toolCalls: readonly AiToolCallItem[],
  loadedSkills: readonly AiLoadedSkillItem[]
): AiToolCallItem[] {
  if (toolCalls.length === 0) return [];
  const loadedIds = new Set(loadedSkills.map((skill) => skill.id));
  const hasToolLoadedSkill = loadedSkills.some((skill) => skill.source === 'tool');

  return toolCalls.filter((tool) => {
    if (tool.name !== 'load_auteur_skill' || tool.status !== 'ok') {
      return true;
    }
    const args = tool.arguments ?? {};
    const rawSkillId =
      typeof args.skillId === 'string'
        ? args.skillId.trim()
        : typeof args.skill_id === 'string'
          ? args.skill_id.trim()
          : '';
    if (rawSkillId && loadedIds.has(rawSkillId)) {
      return false;
    }
    return !hasToolLoadedSkill;
  });
}

/**
 * Formats an assistant turn duration in milliseconds into a compact human label
 * (`<1s`, `4s`, `1m 12s`), or `null` when unavailable.
 */
export function formatTurnDuration(durationMs?: number): string | null {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }
  if (durationMs < 1000) {
    return '<1s';
  }
  if (durationMs < 60_000) {
    return `${Math.round(durationMs / 1000)}s`;
  }
  const totalSeconds = Math.round(durationMs / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
}

/**
 * Returns the most recent in-flight tool call for live header status, if any.
 */
export function getActiveStreamingTool(
  toolCalls: readonly AiToolCallItem[]
): AiToolCallItem | null {
  for (let i = toolCalls.length - 1; i >= 0; i--) {
    if (toolCalls[i].status === 'running') {
      return toolCalls[i];
    }
  }
  return null;
}

/**
 * Summarizes turn skills and visible tool calls, ordering turn-loaded and auto
 * skills ahead of always-pinned skills while preserving relative order.
 */
export function summarizeTurnActivity(
  loadedSkills: readonly AiLoadedSkillItem[],
  visibleToolCalls: readonly AiToolCallItem[]
): TurnActivitySummary {
  const turnSkills: AiLoadedSkillItem[] = [];
  const pinnedSkills: AiLoadedSkillItem[] = [];
  for (const skill of loadedSkills) {
    if (skill.source === 'pinned') {
      pinnedSkills.push(skill);
    } else {
      turnSkills.push(skill);
    }
  }

  let runningToolCount = 0;
  let errorToolCount = 0;
  let stoppedToolCount = 0;
  for (const tool of visibleToolCalls) {
    if (tool.status === 'running') runningToolCount++;
    else if (tool.status === 'error') errorToolCount++;
    else if (tool.status === 'stopped') stoppedToolCount++;
  }

  return {
    orderedSkills: [...turnSkills, ...pinnedSkills],
    loadedSkillCount: turnSkills.length,
    pinnedSkillCount: pinnedSkills.length,
    totalSkillCount: loadedSkills.length,
    toolCount: visibleToolCalls.length,
    runningToolCount,
    errorToolCount,
    stoppedToolCount,
  };
}
