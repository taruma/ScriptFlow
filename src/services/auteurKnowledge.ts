import {
  renderStagingBlockBody,
  renderSubState,
  toAuteurEnvelope,
  type AuteurEnvelope,
} from '../core/index.ts';
import {buildLineDiff} from './scriptTools.ts';
import {
  AUTEUR_KNOWLEDGE_VERSION,
  assistantModeToFocus,
  type AskQuestionMode,
  type AssistantFocus,
  type AssistantMode,
  type AuteurSkillCategory,
  type AuteurSkillDefinition,
  type ComposeAgentContextOptions,
  type ComposedAgentContext,
  type ComposedSystemSections,
  type CustomAuteurSkill,
  type LensAuditChecklist,
  type LiveEditorDiagnosticItem,
  type LiveEditorStateSummary,
  type ResolvedAuteurSkill,
  type ScriptToolName,
  type SkillActivationReason,
  type SkillOverride,
  type SkillPinMode,
  type SkillResolutionStatus,
} from './knowledge/types.ts';
import {getLensAuditChecklist} from './knowledge/checklists.ts';
import {
  BUILTIN_AUTEUR_SKILLS,
  DEFAULT_FOUNDATIONAL_CRAFT,
  DRAFT_CRAFT_CORE_RULES,
  buildDraftCraftBody,
  buildToolProtocolBlock,
  type ToolProtocolParams,
} from './knowledge/protocol.ts';

export {
  AUTEUR_KNOWLEDGE_VERSION,
  BUILTIN_AUTEUR_SKILLS,
  DEFAULT_FOUNDATIONAL_CRAFT,
  assistantModeToFocus,
  buildRecentEditSummary,
  buildToolProtocolBlock,
  computeAllowedToolNames,
  getLensAuditChecklist,
};

export type {
  AskQuestionMode,
  AssistantFocus,
  AssistantMode,
  AuteurSkillCategory,
  AuteurSkillDefinition,
  ComposeAgentContextOptions,
  ComposedAgentContext,
  ComposedSystemSections,
  CustomAuteurSkill,
  LensAuditChecklist,
  LiveEditorDiagnosticItem,
  LiveEditorStateSummary,
  ResolvedAuteurSkill,
  ScriptToolName,
  SkillActivationReason,
  SkillOverride,
  SkillPinMode,
  SkillResolutionStatus,
  ToolProtocolParams,
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

/**
 * Computes a compact, bounded summary of manual user edits between the previous turn's
 * script and the current script (affected MB# / S# IDs plus up to 12 changed lines).
 */
function buildRecentEditSummary(
  previousRawText: string,
  currentRawText: string,
  currentEnvelope?: AuteurEnvelope
): string | undefined {
  if (previousRawText === currentRawText) return undefined;

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

  const diff = buildLineDiff(previousRawText, currentRawText);
  const changedLines = diff.lines.filter((line) => line.type !== 'context');

  if (
    modifiedIds.length === 0 &&
    addedIds.length === 0 &&
    removedIds.length === 0 &&
    changedLines.length === 0
  ) {
    return undefined;
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

  return lines.join('\n');
}

function buildLiveEditorStateText(state: LiveEditorStateSummary): string {
  const lines: string[] = [
    '## Live Editor State (Authoritative Current Snapshot)',
    ...(state.sceneTitle ? [`- Scene title: "${state.sceneTitle}"`] : []),
    `- Empty document: ${state.isEmpty ? 'yes' : 'no'}`,
    `- Snapshot hash: \`${state.snapshotHash}\` (${state.changedSinceLastTurn ? 'CHANGED since last turn — do not rely on prior turn memory for IDs or lines' : 'current'})`,
    ...(state.recentEditSummary
      ? [`- Recent user edits since last turn:\n${state.recentEditSummary}`]
      : []),
    `- Scene topology: \`${state.sceneTopology}\` | Continuation context: ${state.hasContinuationContext ? 'yes' : 'no'}`,
    `- Structure: ${state.stagingBlockCount} Staging Macro-Block(s), ${state.beatCount} Execution Macro-State(s), ${state.referenceBindingCount} Reference Binding(s), ${state.tokenMappingCount} Token Mapping(s)`,
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

  return lines.join('\n');
}

function buildSceneBriefSectionText(briefContext?: string): string {
  const trimmed = briefContext?.trim() ?? '';
  if (trimmed.length === 0) return '';

  return [
    '## Scene Brief & References (Active Reference Context)',
    'Treat these cast/media references, format specs, and additional directorial notes as active reference context across drafting, refinement, and Script Supervisor audits unless the user explicitly overrides them in chat.',
    '',
    trimmed,
  ].join('\n');
}

function buildActiveSkillsSectionText(activeSkills: readonly ResolvedAuteurSkill[]): string {
  if (activeSkills.length === 0) return '';

  const blocks = activeSkills.map((skill) =>
    [`### Active Skill: ${skill.name} (\`${skill.id}\`)`, skill.body].join('\n')
  );

  return ['## Active Auteur Craft Skills', ...blocks].join('\n\n');
}

function buildSkillDirectorySectionText(availableSkills: readonly ResolvedAuteurSkill[]): string {
  if (availableSkills.length === 0) return '';

  const entries = availableSkills.map((skill) => `- \`${skill.id}\`: ${skill.triggerHint}`);
  return [
    '## Available Skill Directory (Load via `load_auteur_skill` if needed)',
    ...entries,
  ].join('\n');
}

function computeAllowedToolNames(
  focus: AssistantFocus,
  isEmpty: boolean,
  hasAvailableSkills: boolean,
  askQuestionMode: AskQuestionMode = 'off'
): ScriptToolName[] {
  const tools: ScriptToolName[] = [];

  if (focus === 'draft' || (focus === 'auto' && isEmpty)) {
    if (!isEmpty) {
      tools.push('get_script_overview', 'get_script_source', 'inspect_lens_slice');
    }
    tools.push('propose_script_draft', 'propose_script_title');
  } else if (focus === 'auto') {
    tools.push(
      'get_script_overview',
      'get_script_source',
      'inspect_lens_slice',
      'propose_script_patch',
      'propose_text_replace',
      'propose_script_title',
      'report_audit_review'
    );
  } else if (focus === 'refine') {
    tools.push(
      'get_script_overview',
      'get_script_source',
      'inspect_lens_slice',
      'propose_script_patch',
      'propose_text_replace',
      'propose_script_title'
    );
  } else {
    // focus === 'audit'
    tools.push('get_script_overview', 'get_script_source', 'inspect_lens_slice', 'report_audit_review');
  }

  if (askQuestionMode !== 'off' && focus !== 'audit') {
    tools.push('ask_question');
  }

  if (hasAvailableSkills) {
    tools.push('load_auteur_skill');
  }

  return tools;
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

  const prevHash = options.previousSnapshotHash?.trim();
  const changedSinceLastTurn = Boolean(
    (prevHash && prevHash !== envelope.snapshotHash) ||
      (options.previousRawText !== undefined && options.previousRawText !== options.rawText)
  );
  const trimmedTitle = options.sceneTitle?.trim();
  const recentEditSummary =
    changedSinceLastTurn && options.previousRawText !== undefined
      ? buildRecentEditSummary(options.previousRawText, options.rawText, envelope)
      : undefined;

  const editorState: LiveEditorStateSummary = {
    isEmpty,
    ...(trimmedTitle ? {sceneTitle: trimmedTitle} : {}),
    snapshotHash: envelope.snapshotHash,
    changedSinceLastTurn,
    ...(recentEditSummary ? {recentEditSummary} : {}),
    sceneTopology: derived.sceneTopology,
    hasContinuationContext: derived.hasContinuationContext,
    stagingBlockCount,
    beatCount,
    referenceBindingCount: derived.referenceBindings.length,
    tokenMappingCount: derived.tokenMappings.length,
    diagnosticsSummary: {
      total: diagnostics.length,
      errors: errorCount,
      warnings: warningCount,
    },
    diagnostics,
  };

  // Resolve all built-in + custom skills into strictly one mutually exclusive state
  const seenSkillIds = new Set<string>();
  const resolvedSkills: ResolvedAuteurSkill[] = [];
  const includeMontageExample = derived.sceneTopology === 'discontinuous_montage';
  const normalizedRefHandles = (options.referenceHandles ?? [])
    .map((handle) => handle.trim())
    .filter((handle) => handle.length > 0);
  const hasVideoReferenceHandle = normalizedRefHandles.some((handle) => /^@?video/i.test(handle));
  const hasCharacterReferenceHandle = normalizedRefHandles.some((handle) =>
    /^@?(image|actor|audio)/i.test(handle)
  );

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
    } else if (entry.builtIn && id === 'draft_craft' && (isEmpty || options.focus === 'draft')) {
      status = 'active';
      reason = 'passive_empty_or_draft';
    } else if (
      entry.builtIn &&
      id === 'video_continuation' &&
      (derived.hasContinuationContext || hasVideoReferenceHandle)
    ) {
      status = 'active';
      reason = 'passive_continuation';
    } else if (entry.builtIn && id === 'token_mapping' && derived.tokenMappings.length > 0) {
      status = 'active';
      reason = 'passive_token_mapping';
    } else if (
      entry.builtIn &&
      id === 'character_reference' &&
      (derived.referenceBindings.length > 0 || hasCharacterReferenceHandle)
    ) {
      status = 'active';
      reason = 'passive_character_reference';
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
    const defaultBody =
      builtInSkill.id === 'draft_craft' && includeMontageExample
        ? buildDraftCraftBody(DRAFT_CRAFT_CORE_RULES, true)
        : builtInSkill.body;

    resolveSkillEntry({
      id: builtInSkill.id,
      name: builtInSkill.name,
      category: builtInSkill.category,
      triggerHint: builtInSkill.triggerHint,
      defaultBody,
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

  const allowedToolNames = computeAllowedToolNames(
    options.focus,
    isEmpty,
    availableSkills.length > 0,
    effectiveAskQuestionMode
  );

  const trimmedCraftOverride = options.foundationalCraftOverride?.trim();
  const isCraftOverridden = Boolean(trimmedCraftOverride && trimmedCraftOverride.length > 0);
  const foundationalCraftText = isCraftOverridden
    ? trimmedCraftOverride!
    : DEFAULT_FOUNDATIONAL_CRAFT;

  const liveEditorStateText = buildLiveEditorStateText(editorState);
  const sceneBriefText = buildSceneBriefSectionText(options.briefContext);
  const activeSkillsText = buildActiveSkillsSectionText(activeSkills);
  const skillDirectoryText = buildSkillDirectorySectionText(availableSkills);
  const toolProtocolText = buildToolProtocolBlock({
    focus: options.focus,
    allowedToolNames,
    snapshotHash: editorState.snapshotHash,
    isEmpty,
    availableSkillCount: availableSkills.length,
    askQuestionMode: effectiveAskQuestionMode,
  });

  const sections: ComposedSystemSections = {
    foundationalCraft: {
      text: foundationalCraftText,
      isOverridden: isCraftOverridden,
      editable: true,
    },
    liveEditorState: {
      text: liveEditorStateText,
      editable: false,
    },
    sceneBrief: {
      text: sceneBriefText,
      isActive: sceneBriefText.length > 0,
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
      editable: false,
    },
  };

  const systemInstruction = [
    sections.foundationalCraft.text,
    sections.liveEditorState.text,
    sections.sceneBrief.text,
    sections.activeSkills.text,
    sections.skillDirectory.text,
    sections.toolProtocol.text,
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
    allowedToolNames,
    sections,
    systemInstruction,
  };
}
