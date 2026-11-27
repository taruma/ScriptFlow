import {
  computeSnapshotHash,
  renderStagingBlockBody,
  renderSubState,
  toAuteurEnvelope,
  type AuteurEnvelope,
} from '../core/index.ts';
import {buildLineDiff} from './scriptTools.ts';
import {
  AUTEUR_KNOWLEDGE_VERSION,
  SCRIPT_TOOL_NAMES,
  assistantModeToFocus,
  type AskQuestionMode,
  type AssistantFocus,
  type AssistantMode,
  type AuteurSkillCategory,
  type AuteurSkillDefinition,
  type BriefContextDelivery,
  type ComposeAgentContextOptions,
  type ComposedAgentContext,
  type ComposedSystemSections,
  type ComposedTurnContext,
  type CustomAuteurSkill,
  type LensAuditChecklist,
  type LiveEditorDiagnosticItem,
  type LiveEditorStateSummary,
  type ResolvedAuteurSkill,
  type ResolvedScriptTool,
  type ScriptToolCategory,
  type ScriptToolDefinition,
  type ScriptToolName,
  type ScriptToolOverride,
  type SkillActivationReason,
  type SkillOverride,
  type SkillPinMode,
  type SkillResolutionStatus,
  type ToolActivationMode,
  type ToolActivationReason,
  type ToolResolutionStatus,
} from './knowledge/types.ts';
import {getLensAuditChecklist} from './knowledge/checklists.ts';
import {
  BUILTIN_AUTEUR_SKILLS,
  BUILTIN_SCRIPT_TOOLS,
  DEFAULT_FOUNDATIONAL_CRAFT,
  DEFAULT_TOOL_PROTOCOL_CORE,
  DRAFT_CRAFT_CORE_RULES,
  buildDraftCraftBody,
  buildToolProtocolBlock,
  buildToolProtocolRuntimeHeader,
  type ToolProtocolParams,
  type ToolProtocolRuntimeHeaderParams,
} from './knowledge/protocol.ts';

export {
  AUTEUR_KNOWLEDGE_VERSION,
  BUILTIN_AUTEUR_SKILLS,
  BUILTIN_SCRIPT_TOOLS,
  DEFAULT_FOUNDATIONAL_CRAFT,
  DEFAULT_TOOL_PROTOCOL_CORE,
  DRAFT_CRAFT_CORE_RULES,
  SCRIPT_TOOL_NAMES,
  assistantModeToFocus,
  buildDraftCraftBody,
  buildRecentEditSummary,
  buildToolProtocolBlock,
  buildToolProtocolRuntimeHeader,
  computeAllowedToolNames,
  computeDiagnosticsFingerprint,
  getLensAuditChecklist,
  resolveScriptTools,
};

export type {
  AskQuestionMode,
  AssistantFocus,
  AssistantMode,
  AuteurSkillCategory,
  AuteurSkillDefinition,
  BriefContextDelivery,
  ComposeAgentContextOptions,
  ComposedAgentContext,
  ComposedSystemSections,
  ComposedTurnContext,
  CustomAuteurSkill,
  LensAuditChecklist,
  LiveEditorDiagnosticItem,
  LiveEditorStateSummary,
  ResolvedAuteurSkill,
  ResolvedScriptTool,
  ScriptToolCategory,
  ScriptToolDefinition,
  ScriptToolName,
  ScriptToolOverride,
  SkillActivationReason,
  SkillOverride,
  SkillPinMode,
  SkillResolutionStatus,
  ToolActivationMode,
  ToolActivationReason,
  ToolProtocolParams,
  ToolProtocolRuntimeHeaderParams,
  ToolResolutionStatus,
};

// ---------------------------------------------------------------------------
// Live Editor State Summary & Single-State Skill Composer
// ---------------------------------------------------------------------------

const MAX_RECENT_DIFF_LINES = 12;
const MAX_DIFF_LINE_CHARS = 180;

function truncateDiffLine(text: string): string {
  if (text.length <= MAX_DIFF_LINE_CHARS) return text;
  return `${text.slice(0, MAX_DIFF_LINE_CHARS - 1)}…`;
}

interface RecentEditDelta {
  summary?: string;
  changedTargetIds: string[];
}

/**
 * Computes a compact, bounded summary of manual user edits between the previous turn's
 * script and the current script (affected MB# / S# IDs plus up to 12 changed lines), along
 * with the deduplicated ordered list of existing MB# / S# target IDs that changed or were added.
 */
function computeRecentEditDelta(
  previousRawText: string,
  currentRawText: string,
  currentEnvelope?: AuteurEnvelope
): RecentEditDelta {
  if (previousRawText === currentRawText) {
    return {summary: undefined, changedTargetIds: []};
  }

  const prevEnv = toAuteurEnvelope(previousRawText);
  const currEnv = currentEnvelope ?? toAuteurEnvelope(currentRawText);

  const modifiedIds: string[] = [];
  const addedIds: string[] = [];
  const removedIds: string[] = [];

  const prevBlocks = prevEnv.document.stagingMacroBlocks;
  const currBlocks = currEnv.document.stagingMacroBlocks;
  const maxBlocks = Math.max(prevBlocks.length, currBlocks.length);
  for (let i = 0; i < maxBlocks; i++) {
    const prevBlock = prevBlocks[i];
    const currBlock = currBlocks[i];
    if (prevBlock && currBlock) {
      const prevSig = `${prevBlock.header}\n${renderStagingBlockBody(prevBlock)}`;
      const currSig = `${currBlock.header}\n${renderStagingBlockBody(currBlock)}`;
      if (prevSig !== currSig) {
        modifiedIds.push(currBlock.id);
      }
    } else if (currBlock) {
      addedIds.push(currBlock.id);
    } else if (prevBlock) {
      removedIds.push(prevBlock.id);
    }
  }

  const prevStates = prevEnv.document.executionMacroBlock?.macroStates ?? [];
  const currStates = currEnv.document.executionMacroBlock?.macroStates ?? [];
  const maxStates = Math.max(prevStates.length, currStates.length);
  for (let i = 0; i < maxStates; i++) {
    const prevState = prevStates[i];
    const currState = currStates[i];
    if (prevState && currState) {
      const prevLine = prevState.subStates.map(renderSubState).join(' -> ');
      const currLine = currState.subStates.map(renderSubState).join(' -> ');
      if (prevLine !== currLine) {
        modifiedIds.push(currState.id);
      }
    } else if (currState) {
      addedIds.push(currState.id);
    } else if (prevState) {
      removedIds.push(prevState.id);
    }
  }

  const changedTargetIds: string[] = [];
  const seenTargets = new Set<string>();
  for (const id of [...modifiedIds, ...addedIds]) {
    if (!seenTargets.has(id)) {
      seenTargets.add(id);
      changedTargetIds.push(id);
    }
  }

  const diff = buildLineDiff(previousRawText, currentRawText);
  const changedLines = diff.lines.filter((line) => line.type !== 'context');

  if (
    modifiedIds.length === 0 &&
    addedIds.length === 0 &&
    removedIds.length === 0 &&
    changedLines.length === 0
  ) {
    return {summary: undefined, changedTargetIds: []};
  }

  const summaryParts: string[] = [];
  if (modifiedIds.length > 0) summaryParts.push(`Modified: ${modifiedIds.join(', ')}`);
  if (addedIds.length > 0) summaryParts.push(`Added: ${addedIds.join(', ')}`);
  if (removedIds.length > 0) summaryParts.push(`Removed: ${removedIds.join(', ')}`);

  const lines: string[] = [];
  if (summaryParts.length > 0) {
    lines.push(`  - Targets: ${summaryParts.join(' | ')}`);
  }

  const shownLines = changedLines.slice(0, MAX_RECENT_DIFF_LINES);
  for (const line of shownLines) {
    const prefix = line.type === 'added' ? '+' : '-';
    lines.push(`  - \`${prefix} ${truncateDiffLine(line.text)}\``);
  }
  const omittedCount = changedLines.length - shownLines.length;
  if (omittedCount > 0) {
    lines.push(`  - (+${omittedCount} more changed ${omittedCount === 1 ? 'line' : 'lines'})`);
  }

  return {summary: lines.join('\n'), changedTargetIds};
}

/**
 * Computes a compact, bounded summary of manual user edits between the previous turn's
 * script and the current script (affected MB# / S# IDs plus up to 12 changed lines).
 */
function buildRecentEditSummary(
  previousRawText: string,
  currentRawText: string,
  currentEnvelope?: AuteurEnvelope
): string | undefined {
  return computeRecentEditDelta(previousRawText, currentRawText, currentEnvelope).summary;
}

function computeDiagnosticsFingerprint(
  diagnostics: readonly LiveEditorDiagnosticItem[]
): string {
  if (diagnostics.length === 0) return 'clean';
  const summary = diagnostics
    .map((diag) => `${diag.severity}|${diag.ruleId}|${diag.targetId}|${diag.message}`)
    .join('\n');
  return computeSnapshotHash(summary);
}

function buildLiveEditorStateText(
  state: LiveEditorStateSummary,
  mode: 'full' | 'unchanged'
): string {
  if (mode === 'unchanged') {
    return [
      '<live_editor_state>',
      `Unchanged since last turn. Current snapshotHash / expectedSnapshotHash: \`${state.snapshotHash}\`.`,
      '</live_editor_state>',
    ].join('\n');
  }

  const hashStatusNote = state.appliedAssistantSuggestion
    ? 'applied from your previous staged suggestion — no manual edits; safe to edit directly without re-reading'
    : state.changedSinceLastTurn
      ? 'CHANGED since last turn — call get_script_source before editing; do not rely on prior turn memory for IDs or lines'
      : 'current';

  const lines: string[] = [
    '<live_editor_state>',
    '## Live Editor State (Authoritative Current Snapshot)',
    ...(state.sceneTitle ? [`- Scene title: "${state.sceneTitle}"`] : []),
    `- Empty document: ${state.isEmpty ? 'yes' : 'no'}`,
    `- Snapshot hash / expectedSnapshotHash: \`${state.snapshotHash}\` (${hashStatusNote})`,
    ...(state.recentEditSummary
      ? [`- Recent user edits since last turn:\n${state.recentEditSummary}`]
      : []),
    `- Scene topology: \`${state.sceneTopology}\` | Continuation context: ${state.hasContinuationContext ? 'yes' : 'no'}`,
    `- Structure: ${state.stagingBlockCount} Staging Macro-Block(s), ${state.beatCount} Execution Macro-State(s), ${state.referenceBindingCount} Reference Binding(s), ${state.tokenMappingCount} Token Mapping(s)`,
    ...(state.stagingIndexSummary ? [`- Staging blocks: ${state.stagingIndexSummary}`] : []),
    ...(state.cameraSlotsSummary ? [`- Camera slots: ${state.cameraSlotsSummary}`] : []),
    `- Deterministic Script Supervisor lint: ${state.diagnosticsSummary.errors} error(s), ${state.diagnosticsSummary.warnings} warning(s)`,
  ];

  if (state.diagnostics.length > 0) {
    lines.push(
      '- Active deterministic diagnostics (already detected — prioritize fixing these alongside semantic continuity):'
    );
    for (const diag of state.diagnostics) {
      lines.push(
        `  - [${diag.severity.toUpperCase()} · ${diag.ruleId} · ${diag.targetId}] ${diag.message} (Hint: ${diag.repairHint})`
      );
    }
  }

  lines.push('</live_editor_state>');
  return lines.join('\n');
}

function resolveBriefContextDelta(
  currentBriefRaw: string | undefined,
  previousBriefRaw: string | undefined,
  hasPreviousInteraction: boolean
): {delivery: BriefContextDelivery; text: string; isActive: boolean} {
  const current = currentBriefRaw?.trim() ?? '';
  const prev = previousBriefRaw?.trim() ?? '';

  if (!hasPreviousInteraction) {
    if (current.length === 0) {
      return {delivery: 'none', text: '', isActive: false};
    }
    return {
      delivery: 'full',
      isActive: true,
      text: [
        '<scene_brief>',
        '## Scene Brief & References (Active Reference Context)',
        'Treat these cast/media references, format specs, and additional directorial notes as active reference context across drafting, refinement, and Script Supervisor audits unless the user explicitly overrides them in chat.',
        '',
        current,
        '</scene_brief>',
      ].join('\n'),
    };
  }

  if (current === prev) {
    return {
      delivery: current.length > 0 ? 'unchanged' : 'none',
      text: '',
      isActive: current.length > 0,
    };
  }

  if (current.length > 0 && prev.length === 0) {
    return {
      delivery: 'full',
      isActive: true,
      text: [
        '<scene_brief>',
        '## Scene Brief & References (Active Reference Context)',
        'Treat these cast/media references, format specs, and additional directorial notes as active reference context across drafting, refinement, and Script Supervisor audits unless the user explicitly overrides them in chat.',
        '',
        current,
        '</scene_brief>',
      ].join('\n'),
    };
  }

  if (current.length > 0 && prev.length > 0) {
    return {
      delivery: 'updated',
      isActive: true,
      text: [
        '<scene_brief status="updated">',
        '## Scene Brief & References (UPDATED — Supersedes Prior Scene Brief)',
        'The user updated the Scene Brief since the previous turn. Follow these updated cast/media references, format specs, and directorial notes going forward.',
        '',
        current,
        '</scene_brief>',
      ].join('\n'),
    };
  }

  return {
    delivery: 'cleared',
    isActive: false,
    text: '<scene_brief status="cleared">Scene Brief paused or cleared by the user since the previous turn — disregard prior Scene Brief constraints unless reaffirmed in chat.</scene_brief>',
  };
}

function buildAskDirectiveText(
  focus: AssistantFocus,
  allowedToolNames: readonly ScriptToolName[],
  askQuestionMode: AskQuestionMode
): string {
  if (focus === 'audit' || !allowedToolNames.includes('ask_question')) {
    return '';
  }

  if (askQuestionMode === 'ask_first') {
    return '<turn_directive>[Ask First: ON] The user explicitly requested clarifying questions before drafting or editing. If drafting an open scene, load `draft_interview` first (when available), then call `ask_question` with 1–4 concise, high-leverage directorial questions (2–5 short options each; omit `multiSelect` or set `false` for single-select picks, set `multiSelect: true` when choices combine, and never include an "Other" option since every question already provides an inline additive note field). Do not stage a draft or patch in this same turn—calling `ask_question` pauses the turn immediately until the user answers or skips.</turn_directive>';
  }

  if (askQuestionMode === 'followup') {
    return '<turn_directive>[Clarifying follow-up] The user just responded to your clarifying questions (answers, additive notes, or Skip & Proceed). If you have enough direction—or if the user skipped with "Your call"—proceed directly to drafting or staging your patch. Only call `ask_question` again if a critical blocker remains.</turn_directive>';
  }

  return '';
}

function buildActiveSkillsSectionText(activeSkills: readonly ResolvedAuteurSkill[]): string {
  if (activeSkills.length === 0) return '';

  const blocks = activeSkills.map((skill) =>
    [`### Pinned Skill: ${skill.name} (\`${skill.id}\`)`, skill.body].join('\n')
  );

  return ['## Pinned Auteur Craft Skills', ...blocks].join('\n\n');
}

function buildSkillDirectorySectionText(availableSkills: readonly ResolvedAuteurSkill[]): string {
  if (availableSkills.length === 0) return '';

  const entries = availableSkills.map((skill) => `- \`${skill.id}\`: ${skill.triggerHint}`);
  return [
    '## Available Skill Directory (Load via `load_auteur_skill` if needed)',
    ...entries,
  ].join('\n');
}

function computeDefaultAutoTools(
  focus: AssistantFocus,
  isEmpty: boolean,
  hasAvailableSkills: boolean,
  _askQuestionMode: AskQuestionMode = 'off'
): Set<ScriptToolName> {
  const tools = new Set<ScriptToolName>();

  if (focus === 'auto') {
    tools.add('get_script_source');
    tools.add('inspect_lens_slice');
    tools.add('propose_script_patch');
    tools.add('propose_script_draft');
    tools.add('report_audit_review');
    tools.add('ask_question');
  } else if (focus === 'draft') {
    if (!isEmpty) {
      tools.add('get_script_source');
      tools.add('inspect_lens_slice');
    }
    tools.add('propose_script_draft');
    tools.add('ask_question');
  } else if (focus === 'refine') {
    tools.add('get_script_source');
    tools.add('inspect_lens_slice');
    tools.add('propose_script_patch');
    tools.add('ask_question');
  } else {
    // focus === 'audit'
    tools.add('get_script_source');
    tools.add('inspect_lens_slice');
    tools.add('report_audit_review');
  }

  if (hasAvailableSkills) {
    tools.add('load_auteur_skill');
  }

  return tools;
}

function resolveScriptTools(params: {
  focus: AssistantFocus;
  isEmpty: boolean;
  hasAvailableSkills: boolean;
  askQuestionMode?: AskQuestionMode;
  toolOverrides?: Partial<Record<ScriptToolName, ScriptToolOverride>>;
}): ResolvedScriptTool[] {
  const {
    focus,
    isEmpty,
    hasAvailableSkills,
    askQuestionMode = 'off',
    toolOverrides,
  } = params;

  const defaultAutoSet = computeDefaultAutoTools(
    focus,
    isEmpty,
    hasAvailableSkills,
    askQuestionMode
  );

  return BUILTIN_SCRIPT_TOOLS.map((def) => {
    const override = toolOverrides?.[def.name];
    const activationMode: ToolActivationMode = override?.activationMode ?? 'auto';

    const trimmedDescOverride = override?.descriptionOverride?.trim();
    const isDescriptionOverridden = Boolean(
      trimmedDescOverride &&
        trimmedDescOverride.length > 0 &&
        trimmedDescOverride !== def.defaultDescription.trim()
    );
    const description = isDescriptionOverridden ? trimmedDescOverride! : def.defaultDescription;

    const trimmedGuidanceOverride = override?.protocolGuidanceOverride?.trim();
    const isProtocolGuidanceOverridden = Boolean(
      trimmedGuidanceOverride &&
        trimmedGuidanceOverride.length > 0 &&
        trimmedGuidanceOverride !== def.defaultProtocolGuidance.trim()
    );
    const protocolGuidance = isProtocolGuidanceOverridden
      ? trimmedGuidanceOverride!
      : def.defaultProtocolGuidance;

    let status: ToolResolutionStatus;
    let reason: ToolActivationReason;

    if (activationMode === 'disabled') {
      status = 'disabled';
      reason = 'disabled_by_user';
    } else if (activationMode === 'enabled') {
      // Schema guard: load_auteur_skill requires >= 1 available skill for a valid enum
      if (def.name === 'load_auteur_skill' && !hasAvailableSkills) {
        status = 'inactive';
        reason = 'inactive_no_available_skills';
      } else {
        status = 'active';
        reason = 'forced_on';
      }
    } else if (defaultAutoSet.has(def.name)) {
      status = 'active';
      if (def.name === 'load_auteur_skill') {
        reason = 'auto_available_skills';
      } else {
        reason = 'auto_focus';
      }
    } else {
      status = 'inactive';
      reason =
        def.name === 'load_auteur_skill' && !hasAvailableSkills
          ? 'inactive_no_available_skills'
          : 'inactive_focus';
    }

    return {
      name: def.name,
      label: def.label,
      category: def.category,
      activationMode,
      status,
      reason,
      description,
      defaultDescription: def.defaultDescription,
      isDescriptionOverridden,
      protocolGuidance,
      defaultProtocolGuidance: def.defaultProtocolGuidance,
      isProtocolGuidanceOverridden,
    };
  });
}

function computeAllowedToolNames(
  focus: AssistantFocus,
  isEmpty: boolean,
  hasAvailableSkills: boolean,
  askQuestionMode: AskQuestionMode = 'off',
  toolOverrides?: Partial<Record<ScriptToolName, ScriptToolOverride>>
): ScriptToolName[] {
  const resolved = resolveScriptTools({
    focus,
    isEmpty,
    hasAvailableSkills,
    askQuestionMode,
    toolOverrides,
  });
  return resolved.filter((tool) => tool.status === 'active').map((tool) => tool.name);
}

/**
 * Pure, deterministic context composer for the Unified Transparent Auteur Agent.
 * Computes Live Editor State, resolves every built-in and custom skill into strictly one
 * mutually exclusive state (`active | available | muted`), prunes tools by focus and editor
 * emptiness, and assembles structured system-instruction sections.
 */
export function composeAgentContext(options: ComposeAgentContextOptions): ComposedAgentContext {
  const envelope = toAuteurEnvelope(options.rawText, options.ruleOverrides);
  const {document, derived} = envelope;

  const stagingBlockCount = document.stagingMacroBlocks.length;
  const beatCount = document.executionMacroBlock?.macroStates.length ?? 0;
  const isEmpty =
    options.rawText.trim().length === 0 || (stagingBlockCount === 0 && beatCount === 0);

  let errorCount = 0;
  let warningCount = 0;
  const diagnostics: LiveEditorDiagnosticItem[] = derived.diagnostics.map((d) => {
    if (d.severity === 'error') errorCount++;
    else warningCount++;
    return {
      id: d.id,
      ruleId: d.ruleId,
      lens: d.lens,
      severity: d.severity,
      targetId: d.targetId,
      message: d.message,
      repairHint: d.repairHint,
    };
  });

  const diagnosticsFingerprint = computeDiagnosticsFingerprint(diagnostics);

  const prevHash = options.previousSnapshotHash?.trim();
  const appliedHash = options.appliedAssistantHash?.trim();
  const appliedAssistantSuggestion = Boolean(
    appliedHash && appliedHash === envelope.snapshotHash
  );
  const changedSinceLastTurn = appliedAssistantSuggestion
    ? false
    : Boolean(
        (prevHash && prevHash !== envelope.snapshotHash) ||
          (options.previousRawText !== undefined && options.previousRawText !== options.rawText)
      );
  const trimmedTitle = options.sceneTitle?.trim();
  const recentEditDelta =
    changedSinceLastTurn && options.previousRawText !== undefined
      ? computeRecentEditDelta(options.previousRawText, options.rawText, envelope)
      : undefined;
  const recentEditSummary = recentEditDelta?.summary;
  const changedTargetIds =
    changedSinceLastTurn && options.previousRawText !== undefined
      ? (recentEditDelta?.changedTargetIds ?? [])
      : undefined;

  const stagingIndexSummary =
    document.stagingMacroBlocks.length > 0
      ? document.stagingMacroBlocks.map((b) => `${b.id} [${b.header}]`).join(', ')
      : undefined;
  const cameraSlotEntries = Object.entries(derived.cameraSlots);
  const cameraSlotsSummary =
    cameraSlotEntries.length > 0
      ? cameraSlotEntries
          .map(([id, slot]) => `CAM ${id} (${slot.establishedAt})`)
          .join(', ')
      : undefined;

  const editorState: LiveEditorStateSummary = {
    isEmpty,
    ...(trimmedTitle ? {sceneTitle: trimmedTitle} : {}),
    snapshotHash: envelope.snapshotHash,
    changedSinceLastTurn,
    ...(appliedAssistantSuggestion ? {appliedAssistantSuggestion: true} : {}),
    ...(changedTargetIds !== undefined ? {changedTargetIds} : {}),
    ...(recentEditSummary ? {recentEditSummary} : {}),
    sceneTopology: derived.sceneTopology,
    hasContinuationContext: derived.hasContinuationContext,
    stagingBlockCount,
    beatCount,
    ...(stagingIndexSummary ? {stagingIndexSummary} : {}),
    ...(cameraSlotsSummary ? {cameraSlotsSummary} : {}),
    referenceBindingCount: derived.referenceBindings.length,
    tokenMappingCount: derived.tokenMappings.length,
    diagnosticsFingerprint,
    diagnosticsSummary: {
      total: diagnostics.length,
      errors: errorCount,
      warnings: warningCount,
    },
    diagnostics,
  };

  // Resolve all built-in + custom skills into strictly one mutually exclusive state
  // (Zero passive auto-injection: skills stay On-Demand in the directory unless explicitly Pinned or Muted)
  const seenSkillIds = new Set<string>();
  const resolvedSkills: ResolvedAuteurSkill[] = [];

  const resolveSkillEntry = (entry: {
    id: string;
    name: string;
    category: AuteurSkillCategory | 'custom';
    triggerHint: string;
    defaultBody: string;
    builtIn: boolean;
  }) => {
    const id = entry.id.trim();
    if (!id || seenSkillIds.has(id)) return;
    seenSkillIds.add(id);

    const override = options.skillOverrides?.[id];
    const pinMode: SkillPinMode = override?.pinMode ?? 'auto';
    const trimmedBodyOverride = override?.bodyOverride?.trim();
    const isBodyOverridden = Boolean(trimmedBodyOverride && trimmedBodyOverride.length > 0);
    const body = isBodyOverridden ? trimmedBodyOverride! : entry.defaultBody;

    let status: SkillResolutionStatus;
    let reason: SkillActivationReason;

    if (pinMode === 'muted') {
      status = 'muted';
      reason = 'muted';
    } else if (pinMode === 'pinned') {
      status = 'active';
      reason = 'pinned';
    } else {
      status = 'available';
      reason = 'on_demand';
    }

    resolvedSkills.push({
      id,
      name: entry.name.trim() || id,
      category: entry.category,
      triggerHint: entry.triggerHint.trim(),
      body,
      builtIn: entry.builtIn,
      pinMode,
      status,
      reason,
      isBodyOverridden,
    });
  };

  for (const builtInSkill of BUILTIN_AUTEUR_SKILLS) {
    resolveSkillEntry({
      id: builtInSkill.id,
      name: builtInSkill.name,
      category: builtInSkill.category,
      triggerHint: builtInSkill.triggerHint,
      defaultBody: builtInSkill.body,
      builtIn: true,
    });
  }

  for (const customSkill of options.customSkills ?? []) {
    resolveSkillEntry({
      id: customSkill.id,
      name: customSkill.name,
      category: 'custom',
      triggerHint: customSkill.triggerHint,
      defaultBody: customSkill.body,
      builtIn: false,
    });
  }

  const activeSkills = resolvedSkills.filter((skill) => skill.status === 'active');
  const availableSkills = resolvedSkills.filter((skill) => skill.status === 'available');
  const mutedSkills = resolvedSkills.filter((skill) => skill.status === 'muted');

  const effectiveAskQuestionMode: AskQuestionMode =
    options.focus === 'audit' ? 'off' : (options.askQuestionMode ?? 'off');

  const enforceToolLinterGate = options.enforceToolLinterGate ?? true;
  const resolvedTools = resolveScriptTools({
    focus: options.focus,
    isEmpty,
    hasAvailableSkills: availableSkills.length > 0,
    askQuestionMode: effectiveAskQuestionMode,
    toolOverrides: options.toolOverrides,
  });
  const allowedToolNames = resolvedTools
    .filter((tool) => tool.status === 'active')
    .map((tool) => tool.name);

  const trimmedCraftOverride = options.foundationalCraftOverride?.trim();
  const isCraftOverridden = Boolean(trimmedCraftOverride && trimmedCraftOverride.length > 0);
  const foundationalCraftText = isCraftOverridden
    ? trimmedCraftOverride!
    : DEFAULT_FOUNDATIONAL_CRAFT;

  const trimmedToolProtocolOverride = options.toolProtocolOverride?.trim();
  const isCoreProtocolOverridden = Boolean(
    trimmedToolProtocolOverride &&
      trimmedToolProtocolOverride.length > 0 &&
      trimmedToolProtocolOverride !== DEFAULT_TOOL_PROTOCOL_CORE.trim()
  );

  const hasPreviousInteraction = Boolean(options.hasPreviousInteraction);
  const sceneTitleChanged =
    options.previousSceneTitle !== undefined &&
    options.previousSceneTitle.trim() !== (trimmedTitle ?? '');
  const diagnosticsChanged =
    options.previousDiagnosticsFingerprint !== undefined &&
    options.previousDiagnosticsFingerprint !== diagnosticsFingerprint;
  const liveEditorStateMode: 'full' | 'unchanged' =
    !hasPreviousInteraction ||
    changedSinceLastTurn ||
    appliedAssistantSuggestion ||
    sceneTitleChanged ||
    diagnosticsChanged
      ? 'full'
      : 'unchanged';

  const liveEditorStateText = buildLiveEditorStateText(editorState, liveEditorStateMode);
  const briefDelta = resolveBriefContextDelta(
    options.briefContext,
    options.previousBriefContext,
    hasPreviousInteraction
  );
  const askDirectiveText = buildAskDirectiveText(
    options.focus,
    allowedToolNames,
    effectiveAskQuestionMode
  );
  const activeSkillsText = buildActiveSkillsSectionText(activeSkills);
  const skillDirectoryText = buildSkillDirectorySectionText(availableSkills);
  const toolProtocolText = buildToolProtocolBlock({
    focus: options.focus,
    allowedToolNames,
    isEmpty,
    availableSkillCount: availableSkills.length,
    askQuestionMode: effectiveAskQuestionMode,
    enforceToolLinterGate,
    coreProtocolOverride: isCoreProtocolOverridden ? trimmedToolProtocolOverride : undefined,
    resolvedTools,
  });

  const isToolProtocolOverridden =
    isCoreProtocolOverridden ||
    !enforceToolLinterGate ||
    resolvedTools.some(
      (tool) => tool.activationMode !== 'auto' || tool.isProtocolGuidanceOverridden
    );

  const sections: ComposedSystemSections = {
    foundationalCraft: {
      text: foundationalCraftText,
      isOverridden: isCraftOverridden,
      editable: true,
    },
    liveEditorState: {
      text: liveEditorStateText,
      mode: liveEditorStateMode,
      editable: false,
    },
    sceneBrief: {
      text: briefDelta.text,
      isActive: briefDelta.isActive,
      delivery: briefDelta.delivery,
      editable: false,
    },
    activeSkills: {
      text: activeSkillsText,
      skillIds: activeSkills.map((s) => s.id),
      editable: false,
    },
    skillDirectory: {
      text: skillDirectoryText,
      skillIds: availableSkills.map((s) => s.id),
      editable: false,
    },
    toolProtocol: {
      text: toolProtocolText,
      isOverridden: isToolProtocolOverridden,
      editable: true,
    },
  };

  const turnContextText = [liveEditorStateText, briefDelta.text, askDirectiveText]
    .filter((block) => block.trim().length > 0)
    .join('\n\n');

  const turnContext: ComposedTurnContext = {
    liveEditorStateMode,
    liveEditorStateText,
    briefDelivery: briefDelta.delivery,
    sceneBriefText: briefDelta.text,
    askDirectiveText,
    text: turnContextText,
  };

  // Zone 1 Frozen Prefix: strictly cache-stable sections only (no volatile script hash,
  // no per-turn Brief deltas, and no Ask First rewrites) so system_instruction stays
  // byte-for-byte identical across turns and sessions.
  const systemInstruction = [
    sections.foundationalCraft.text,
    sections.activeSkills.text,
    sections.toolProtocol.text,
    sections.skillDirectory.text,
  ]
    .filter((block) => block.trim().length > 0)
    .join('\n\n');

  return {
    knowledgeVersion: AUTEUR_KNOWLEDGE_VERSION,
    focus: options.focus,
    editorState,
    resolvedSkills,
    activeSkills,
    availableSkills,
    mutedSkills,
    resolvedTools,
    allowedToolNames,
    enforceToolLinterGate,
    sections,
    turnContext,
    systemInstruction,
  };
}
