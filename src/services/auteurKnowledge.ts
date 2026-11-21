import {
  toAuteurEnvelope,
  type AuditLens,
  type AuteurLensPresetId,
  type LintRuleOverrides,
  type LintSeverity,
  type SceneTopology,
} from '../core/index.ts';
import {BUNDLED_EXAMPLES} from '../data/examples/index.ts';
import {BUNDLED_KNOWLEDGE_SKILLS, FOUNDATIONAL_CRAFT_MD} from '../data/knowledge/index.ts';

/**
 * Monotonic version tag for built-in Auteur craft defaults and skill bodies.
 * Future UI override persistence uses this to detect upstream knowledge updates.
 */
export const AUTEUR_KNOWLEDGE_VERSION = '0.4.0-k2';

export type AssistantMode = 'refine' | 'check' | 'draft';
export type AssistantFocus = 'auto' | 'draft' | 'refine' | 'audit';
export type AskQuestionMode = 'off' | 'ask_first' | 'followup';

export type ScriptToolName =
  | 'get_script_overview'
  | 'inspect_lens_slice'
  | 'propose_script_patch'
  | 'propose_script_draft'
  | 'report_audit_review'
  | 'load_auteur_skill'
  | 'ask_question';

export type AuteurSkillCategory = 'workflow' | 'module';
export type SkillPinMode = 'auto' | 'pinned' | 'muted';
export type SkillResolutionStatus = 'active' | 'available' | 'muted';

export type SkillActivationReason =
  | 'pinned'
  | 'muted'
  | 'passive_empty_or_draft'
  | 'passive_continuation'
  | 'passive_token_mapping'
  | 'passive_character_reference'
  | 'on_demand';

export interface AuteurSkillDefinition {
  id: string;
  name: string;
  category: AuteurSkillCategory;
  triggerHint: string;
  body: string;
  builtIn: true;
}

export interface CustomAuteurSkill {
  id: string;
  name: string;
  triggerHint: string;
  body: string;
}

export interface SkillOverride {
  pinMode?: SkillPinMode;
  bodyOverride?: string;
}

export interface ResolvedAuteurSkill {
  id: string;
  name: string;
  category: AuteurSkillCategory | 'custom';
  triggerHint: string;
  body: string;
  builtIn: boolean;
  pinMode: SkillPinMode;
  status: SkillResolutionStatus;
  reason: SkillActivationReason;
  isBodyOverridden: boolean;
}

export interface LensAuditChecklist {
  preset: AuteurLensPresetId;
  lens: AuditLens;
  topology: SceneTopology;
  topologyNote: string;
  suppressedChecks: string[];
  checks: string[];
}

export interface LiveEditorDiagnosticItem {
  id: string;
  ruleId: string;
  lens: AuditLens;
  severity: LintSeverity;
  targetId: string;
  message: string;
  repairHint: string;
}

export interface LiveEditorStateSummary {
  isEmpty: boolean;
  snapshotHash: string;
  changedSinceLastTurn: boolean;
  sceneTopology: SceneTopology;
  hasContinuationContext: boolean;
  stagingBlockCount: number;
  beatCount: number;
  referenceBindingCount: number;
  tokenMappingCount: number;
  diagnosticsSummary: {
    total: number;
    errors: number;
    warnings: number;
  };
  diagnostics: LiveEditorDiagnosticItem[];
}

export interface ComposedSystemSections {
  foundationalCraft: {
    text: string;
    isOverridden: boolean;
    editable: true;
  };
  liveEditorState: {
    text: string;
    editable: false;
  };
  sceneBrief: {
    text: string;
    isActive: boolean;
    editable: false;
  };
  activeSkills: {
    text: string;
    skillIds: string[];
    editable: false;
  };
  skillDirectory: {
    text: string;
    skillIds: string[];
    editable: false;
  };
  toolProtocol: {
    text: string;
    editable: false;
  };
}

export interface ComposeAgentContextOptions {
  focus: AssistantFocus;
  rawText: string;
  ruleOverrides?: LintRuleOverrides;
  previousSnapshotHash?: string;
  foundationalCraftOverride?: string;
  skillOverrides?: Record<string, SkillOverride>;
  customSkills?: readonly CustomAuteurSkill[];
  referenceHandles?: readonly string[];
  briefContext?: string;
  askQuestionMode?: AskQuestionMode;
}

export interface ComposedAgentContext {
  knowledgeVersion: string;
  focus: AssistantFocus;
  editorState: LiveEditorStateSummary;
  resolvedSkills: ResolvedAuteurSkill[];
  activeSkills: ResolvedAuteurSkill[];
  availableSkills: ResolvedAuteurSkill[];
  mutedSkills: ResolvedAuteurSkill[];
  allowedToolNames: ScriptToolName[];
  sections: ComposedSystemSections;
  systemInstruction: string;
}

/**
 * Maps legacy 3-tab AssistantMode values onto the unified AssistantFocus enum.
 */
export function assistantModeToFocus(mode: AssistantMode): AssistantFocus {
  switch (mode) {
    case 'check':
      return 'audit';
    case 'refine':
      return 'refine';
    case 'draft':
      return 'draft';
  }
}

// ---------------------------------------------------------------------------
// Editable Craft Foundation (Loaded from Markdown)
// ---------------------------------------------------------------------------

export const DEFAULT_FOUNDATIONAL_CRAFT = FOUNDATIONAL_CRAFT_MD;

// ---------------------------------------------------------------------------
// Built-in Extension Skills Registry (Loaded from src/data/knowledge/skills/)
// ---------------------------------------------------------------------------

function formatCuratedExample(exampleId: string): string {
  const found = BUNDLED_EXAMPLES.find((ex) => ex.id === exampleId);
  if (!found) return '';
  return [`### Curated Example — ${found.title} (${found.topology})`, found.content].join('\n');
}

function buildDraftCraftBody(coreRules: string, includeMontageExample: boolean): string {
  const sections: string[] = [
    coreRules,
    formatCuratedExample('forest-pov-horror'),
    formatCuratedExample('interrogation-coverage'),
  ];

  if (includeMontageExample) {
    sections.push(formatCuratedExample('heist-montage'));
  }

  return sections.filter((section) => section.length > 0).join('\n\n');
}

const DRAFT_CRAFT_CORE_RULES =
  BUNDLED_KNOWLEDGE_SKILLS.find((skill) => skill.id === 'draft_craft')?.body ?? '';

export const BUILTIN_AUTEUR_SKILLS: readonly AuteurSkillDefinition[] =
  BUNDLED_KNOWLEDGE_SKILLS.map((skill) => ({
    id: skill.id,
    name: skill.name,
    category: skill.category,
    triggerHint: skill.triggerHint,
    body: skill.id === 'draft_craft' ? buildDraftCraftBody(skill.body, false) : skill.body,
    builtIn: true as const,
  }));

// ---------------------------------------------------------------------------
// Topology-Filtered 5-Lens Script Supervisor Audit Checklists
// ---------------------------------------------------------------------------

export function getLensAuditChecklist(
  preset: AuteurLensPresetId,
  topology: SceneTopology
): LensAuditChecklist {
  const isMontage = topology === 'discontinuous_montage';
  const isOner = topology === 'continuous_oner';

  switch (preset) {
    case 'lens1_spatial_optics': {
      if (isMontage) {
        return {
          preset,
          lens: 'Lens 1: Spatial & Optics',
          topology,
          topologyNote:
            'Discontinuous montage topology: cross-cut inheritance is severed; evaluate each Macro-State as a self-contained visual shot.',
          suppressedChecks: [
            'Cross-cut 180-degree eyeline parity between consecutive montage Macro-States',
            'S0 -> S1 posture/prop carryover across independent montage cuts',
            'Numbered camera slot recall/hold continuity ([CAM 01] ->)',
          ],
          checks: [
            'Viewport coordinate purity: zero banned `stage-left`/`stage-right` terms; separate screen placement (`frame-left/center/right` + `FG/MG/BG`) from yaw (`facing screen-*`) within each shot.',
            'Plain unnumbered `[CAM]` tags: montage cuts use unnumbered `[CAM]` descriptors rather than persistent numbered camera slots.',
            'Self-contained shot anchoring: every Macro-State line explicitly establishes its subject, setting (or declared `LOC##` token), and light cue via its Sub-States.',
            'Within-shot action visibility & direction: every `[ACT]` Sub-State is physically visible from that Macro-State line’s `[CAM]` Sub-State framing with coherent internal screen direction.',
          ],
        };
      }

      const checks = [
        'Viewport coordinate purity: zero banned `stage-left`/`stage-right` terms; separate position (`frame-left/center/right` + `FG/MG/BG`) from anatomical yaw (`facing screen-left/right`, `in profile-left/right`, `back to camera`).',
        '180-degree axis & eyeline parity: if Subject A is `frame-left` facing `screen-right`, reverse coverage places Subject B `frame-right` facing `screen-left` unless crossed via a neutral frontal/POV shot or arcing camera move.',
        'Action visibility vs. active `resolvedCamera.effectiveFraming`: confirm every `[ACT]` detail (eye glance, palm press, hand gesture) is physically visible from the active camera angle.',
        'Clean S0 -> S1 handoff: Macro-State S1 opens with the exact camera framing, viewport layout, posture, and hand grips locked in `[OPENING]`.',
        isOner
          ? 'Continuous oner camera discipline: maintain a single numbered `[CAM 01]` slot throughout; lines 2+ must hold (`[CAM 01] ->`) or use operator motion verbs (`PAN`, `TRACKING`, `CRANING`, `PUSHING`), never static shot-scale re-declarations.'
          : 'Camera numbering & oner continuity: established numbered camera slots (`[CAM 01]`, `[CAM 02]`) hold/recall via bare `[CAM 01] ->` or move via operator verbs, never re-declaring static shot scales.',
        'Spatial fence for 3+ subjects: complex multi-character frames or mark swaps use an explicit inline `[BLOCK]` Sub-State to lock viewport coordinates.',
      ];

      return {
        preset,
        lens: 'Lens 1: Spatial & Optics',
        topology,
        topologyNote: isOner
          ? 'Continuous oner topology: strict unbroken S0 -> S1 -> ... -> Sn spatial inheritance on a single numbered camera slot.'
          : 'Continuous scene topology: enforce 180-degree axis, eyeline parity, S0 -> S1 handoff, and numbered camera slot persistence.',
        suppressedChecks: [],
        checks,
      };
    }

    case 'lens2_temporal_pacing_wear': {
      if (isMontage) {
        return {
          preset,
          lens: 'Lens 2: Temporal, Pacing & Wear',
          topology,
          topologyNote:
            'Discontinuous montage topology: Macro-States represent independent moments with no cross-state wear or kinetic carryover.',
          suppressedChecks: [
            'Cross-state physical wear persistence (sweat/blood/mud repetition across unrelated shots)',
            'Continuous S_{n-1} -> S_n posture/kinetic carryover between cuts',
          ],
          checks: [
            'Cut-latency floor: total montage cuts must not exceed `Duration(s) / 2.0` (each cut needs ~1.5s-2.5s to visually stabilize and read).',
            'Self-contained shot readability: each montage Macro-State line packs a single clear visual moment without cramming multiple incompatible time jumps into its Sub-States.',
            'Within-shot kinetic plausibility: motion across the `[ACT]` Sub-States of a single Macro-State line is physically continuous and achievable within its brief shot window.',
          ],
        };
      }

      return {
        preset,
        lens: 'Lens 2: Temporal, Pacing & Wear',
        topology,
        topologyNote:
          'Continuous scene topology: check Macro-State-to-duration tempo calibration, kinetic continuity, and physical wear repetition.',
        suppressedChecks: [],
        checks: [
          'Cut-latency floor: editorial cut count must not exceed `Duration(s) / 2.0` (~1.5s-2.5s per cut to stabilize).',
          'Anti-float Macro-State-to-duration calibration: combat/chase oners target 0.8s-1.2s per Macro-State; tactical standoffs 1.5s-2.0s; dramatic dialogue 2.5s-4.0s; slow horror/noir 4.0s-6.0s+.',
          'Physical wear persistence (Repetition Mandate): accumulated baggage (sweat, blood, mud, bruises, soaked fabric, fatigue) is restated in an `[ACT]` Sub-State on every visible Macro-State line until cleaned or resolved.',
          'Plausible kinetic transitions: posture and location changes (`seated -> standing`, `crouching -> lunging`) follow physically connected momentum with zero teleporting between consecutive Macro-State lines.',
        ],
      };
    }

    case 'lens3_props_inventory': {
      if (isMontage) {
        return {
          preset,
          lens: 'Lens 3: Props & Inventory',
          topology,
          topologyNote:
            'Discontinuous montage topology: props do not persist across independent shots; verify within-shot hand clarity only.',
          suppressedChecks: [
            'Cross-state prop persistence and carryover across montage cuts',
            'Cross-cut prop repetition on camera recalls',
          ],
          checks: [
            'Within-shot explicit hand allocation: any prop held or manipulated in an `[ACT]` or `[PROP]` Sub-State of a montage Macro-State line names the exact hand (`left hand`, `right hand`, `both hands`).',
            'Zero within-shot hand collisions: a subject cannot grip two conflicting props in the same hand across the Sub-States of a single Macro-State line.',
            'Self-contained prop & wardrobe anchoring: each independent montage shot clearly states the hero prop or wardrobe cue visible in that moment.',
          ],
        };
      }

      return {
        preset,
        lens: 'Lens 3: Props & Inventory',
        topology,
        topologyNote:
          'Continuous scene topology: enforce strict hand allocation, unbroken prop lifecycles, and restatement across cuts.',
        suppressedChecks: [],
        checks: [
          'Explicit hand allocation: every held prop names the exact hand (`in his right hand`, `under her left palm`, `in both hands`) consistent with `[LOGIC]` and `[OPENING]`.',
          'Unbroken prop lifecycle: props follow `Stored -> Picked Up -> Held -> Used -> Released/Put Down` with zero ghost props appearing or vanishing.',
          'Zero hand collisions: a character cannot grab a second prop with an occupied hand unless they explicitly release or transfer the first item.',
          'Repetition across cuts & recalls: when returning to a subject after a cut or bare recall (`[CAM 01] ->`), key held props are restated concisely in `[ACT]`.',
        ],
      };
    }

    case 'lens4_acoustics_voice': {
      return {
        preset,
        lens: 'Lens 4: Acoustics & Voice',
        topology,
        topologyNote: isMontage
          ? 'Discontinuous montage topology: keep each `<foley>` Sub-State punchy and self-contained while isolating continuous ambience in `[AESTHETIC]`.'
          : 'Verify curly-brace dialogue Sub-State syntax, Macro-State resolution, selective `<foley>` Sub-States, and room tone isolation.',
        suppressedChecks: [],
        checks: [
          'Macro-State resolution rule: no `[EXECUTION]` Macro-State line has spoken `{dialogue}` as its final Sub-State—always chain an `[ACT]` or `<foley>` Sub-State after it.',
          'Curly-brace dialogue lock: spoken dialogue Sub-States strictly use `Speaker says (delivery) {line}` (optional `in Language`, `(O.S.)`, `(V.O.)`), never quotation marks or legacy `[DIAL]`/`[AUDIO]`.',
          'Room tone isolation: continuous background ambience (rain, ballast hum, wind, traffic) stays in `[AESTHETIC]` (`Audio:`) and is not spammed as a `<foley>` Sub-State on every Macro-State line.',
          'Selective diegetic `<foley>`: use `<sound>` only for distinct physical friction, impacts, or off-screen triggers (restate persistent discrete sounds explicitly).',
          'Subtitle guard: when spoken dialogue exists and captions are unwanted, `[LOGIC]` ends with `No subtitles appear on screen.`',
          'Opt-in score & on-screen text: `(score)` and `【text】` appear only when explicitly intended.',
        ],
      };
    }

    case 'lens5_blocks_grammar': {
      const checks = [
        'Multimodal reference isolation: keep `@image`/`@audio`/`@video` bindings in `[INTENT]`, `[CHARACTERS]`, `[REFERENCES]`, or `[CONTINUITY PROTOCOL]`, never inside `[EXECUTION]`.',
        'Frozen `[OPENING]` purity: zero `[TAG]` tokens, zero motion verbs, and zero audio cues—strictly 2-4 sentences of motionless $t=0$ plain prose.',
        'Flowing `[INTENT]`: one concise directorial sentence starting with `"Create ..."`, never a play-by-play shot list.',
        'Zero lookbook bleed: `[EXECUTION]` does not restate static wardrobe, lens stock, color palette, or room architecture already locked in `[AESTHETIC]` (use declared shorthand tokens like `LOC01` when referencing settings).',
        'Single-Dimension Law: each `->`-separated Sub-State directs strictly one optical, spatial, physical, or acoustic dimension.',
      ];

      if (isMontage) {
        checks.push(
          'Montage contract alignment: confirm `[LOGIC]` states independent-shot montage behavior and each `[EXECUTION]` Macro-State line uses a plain unnumbered `[CAM]` Sub-State with self-contained subject/light/location cues.'
        );
      }

      return {
        preset,
        lens: 'Lens 5: Blocks & Grammar',
        topology,
        topologyNote: isMontage
          ? 'Discontinuous montage topology: allow concise per-state subject/light/location anchoring (or `LOC##` tokens) while preventing static lookbook bleed.'
          : 'Verify Phase Partition Law, Block Orthogonality, Single-Dimension Law, and canonical v0.4.0 syntax purity.',
        suppressedChecks: [],
        checks,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Code-Owned Tool & Safety Protocol (Read-Only, Never Overridden by Craft Edits)
// ---------------------------------------------------------------------------

export interface ToolProtocolParams {
  focus: AssistantFocus;
  allowedToolNames: readonly ScriptToolName[];
  snapshotHash: string;
  isEmpty: boolean;
  availableSkillCount: number;
  askQuestionMode?: AskQuestionMode;
}

export function buildToolProtocolBlock(params: ToolProtocolParams): string {
  const {
    focus,
    allowedToolNames,
    snapshotHash,
    isEmpty,
    availableSkillCount,
    askQuestionMode = 'off',
  } = params;
  const hasTool = (name: ScriptToolName) => allowedToolNames.includes(name);

  const lines: string[] = [
    '## Tool & Safety Protocol (Code-Owned)',
    `- Active focus: \`${focus}\` | Allowed tools this turn: ${allowedToolNames.map((t) => `\`${t}\``).join(', ')}.`,
    '- Staging-first safety: never assume editor text has changed until the user applies a staged suggestion. Every edit, draft, or audit review must be staged through its dedicated tool.',
    '- Self-repair on tool errors: whenever a tool returns `is_error: true` (`ok: false`), inspect `errors`, `introducedErrors`, `diagnostics`, and `repairHint`, fix the issue, and retry before giving your final reply.',
  ];

  if (hasTool('propose_script_patch') || hasTool('report_audit_review')) {
    lines.push(
      `- Optimistic concurrency: always pass \`expectedSnapshotHash: "${snapshotHash}"\` on \`propose_script_patch\` and any embedded \`suggestedPatch\` inside \`report_audit_review\`.`
    );
  }

  if (hasTool('get_script_overview') && hasTool('inspect_lens_slice')) {
    lines.push(
      '- Inspect before judging or patching: use `get_script_overview` for exact IDs (`MB#`, `MB#.#`, `S#`, `S#.#`) and `inspect_lens_slice` for focused slices with resolved camera framing and topology-filtered checklists. When auditing multiple lenses, invoke independent `inspect_lens_slice` calls in parallel in the same round.'
    );
  } else if (hasTool('get_script_overview') && !isEmpty) {
    lines.push(
      '- Call `get_script_overview` first if you need to inspect existing Macro-Blocks before staging a new draft.'
    );
  }

  if (hasTool('propose_script_draft')) {
    lines.push(
      '- Drafting workflow: stage a complete, lint-clean `AuteurScriptDraft` ([INTENT], [LOGIC], [AESTHETIC] as `key_value`, [OPENING], and [EXECUTION]) via `propose_script_draft`.'
    );
  }

  if (focus === 'auto' && !isEmpty) {
    lines.push(
      '- Auto routing on an existing script: use `propose_script_patch` for targeted refinements/rewrites, `report_audit_review` for Script Supervisor audits, or answer directly if the user only asks a question.'
    );
  }

  if (hasTool('load_auteur_skill') && availableSkillCount > 0) {
    lines.push(
      '- On-demand skills: call `load_auteur_skill` only when the current task genuinely requires one of the skills listed in the Available Skill Directory below. Never call it for skills already injected as Active.'
    );
  }

  if (hasTool('ask_question')) {
    if (askQuestionMode === 'ask_first') {
      lines.push(
        '- Clarifying interview requested (Ask First): the user explicitly asked to be interviewed before drafting or editing. Call `ask_question` with 1–4 concise, high-leverage directorial questions (each with 2–5 short multi-select options; the UI automatically lets the user select multiple options and add a custom comment per question—never include an "Other" option). Do not stage a draft or patch in this same turn; once `ask_question` succeeds, stop calling tools and wait for the user to reply without repeating the questions in prose.'
      );
    } else if (askQuestionMode === 'followup') {
      lines.push(
        '- Clarifying follow-up: the user just submitted answers to your clarifying questions. If you now have enough direction, proceed directly to drafting or staging your patch. Only call `ask_question` for a concise follow-up round if a critical ambiguity still blocks a strong result (and stop after calling it so the user can respond).'
      );
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Live Editor State Summary & Single-State Skill Composer
// ---------------------------------------------------------------------------

function buildLiveEditorStateText(state: LiveEditorStateSummary): string {
  const lines: string[] = [
    '## Live Editor State (Authoritative Current Snapshot)',
    `- Empty document: ${state.isEmpty ? 'yes' : 'no'}`,
    `- Snapshot hash: \`${state.snapshotHash}\` (${state.changedSinceLastTurn ? 'CHANGED since last turn — do not rely on prior turn memory for IDs or lines' : 'current'})`,
    `- Scene topology: \`${state.sceneTopology}\` | Continuation context: ${state.hasContinuationContext ? 'yes' : 'no'}`,
    `- Structure: ${state.stagingBlockCount} Staging Macro-Block(s), ${state.beatCount} Execution Macro-State(s), ${state.referenceBindingCount} Reference Binding(s), ${state.tokenMappingCount} Token Mapping(s)`,
    `- Deterministic Script Supervisor lint: ${state.diagnosticsSummary.errors} error(s), ${state.diagnosticsSummary.warnings} warning(s)`,
  ];

  if (state.diagnostics.length > 0) {
    lines.push('- Active deterministic diagnostics (already detected — prioritize fixing these alongside semantic continuity):');
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
      tools.push('get_script_overview');
    }
    tools.push('propose_script_draft');
  } else if (focus === 'auto') {
    tools.push(
      'get_script_overview',
      'inspect_lens_slice',
      'propose_script_patch',
      'report_audit_review'
    );
  } else if (focus === 'refine') {
    tools.push('get_script_overview', 'inspect_lens_slice', 'propose_script_patch');
  } else {
    // focus === 'audit'
    tools.push('get_script_overview', 'inspect_lens_slice', 'report_audit_review');
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
  const changedSinceLastTurn = Boolean(prevHash && prevHash !== envelope.snapshotHash);

  const editorState: LiveEditorStateSummary = {
    isEmpty,
    snapshotHash: envelope.snapshotHash,
    changedSinceLastTurn,
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
