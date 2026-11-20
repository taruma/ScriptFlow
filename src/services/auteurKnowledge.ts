import {
  toAuteurEnvelope,
  type AuditLens,
  type AuteurLensPresetId,
  type LintRuleOverrides,
  type LintSeverity,
  type SceneTopology,
} from '../core/index.ts';
import {BUNDLED_EXAMPLES} from '../data/examples/index.ts';

/**
 * Monotonic version tag for built-in Auteur craft defaults and skill bodies.
 * Future UI override persistence uses this to detect upstream knowledge updates.
 */
export const AUTEUR_KNOWLEDGE_VERSION = '0.4.0-k1';

export type AssistantMode = 'refine' | 'check' | 'draft';
export type AssistantFocus = 'auto' | 'draft' | 'refine' | 'audit';

export type ScriptToolName =
  | 'get_script_overview'
  | 'inspect_lens_slice'
  | 'propose_script_patch'
  | 'propose_script_draft'
  | 'report_audit_review'
  | 'load_auteur_skill';

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
// Editable Craft Foundation & Draft Wrapper Template (100% Platform-Agnostic)
// ---------------------------------------------------------------------------

export const DEFAULT_FOUNDATIONAL_CRAFT = [
  'You are an expert Pure Auteur Script (v0.4.0) director and Script Supervisor.',
  'Keep every script 100% platform- and model-agnostic: never mention video vendors, engines, or model names.',
  '',
  'Directorial Principles:',
  '- Boundaries, not handcuffs: supply clear spatial, optical, and physical state coordinates without rigid timestamp handcuffs so natural weight and momentum flow cleanly.',
  '- Static once, volatile always: lock world, lens stock, palette, wardrobe, and ambience once in Phase 1 STAGING; never repeat static lookbook traits inside Phase 2 EXECUTION (zero lookbook bleed).',
  '- State inheritance (S_n = f(S_{n-1} | STAGING)): in continuous scenes, each Macro-State inherits camera framing, posture, hand grips, and wear from the prior beat until explicitly mutated.',
  '- Literal over literary: direct concrete observable optics, posture, grips, eyelines, and physical motion—never vague literary metaphors or invisible inner thoughts.',
  '- Acting is reacting: chain observable physical reactions and counter-beats rather than isolated poses.',
  '- Sustained compound action (anti-twitch): group purposeful continuous movement into grounded compound gestures instead of fragmented micro-twitches.',
  '- Repetition mandate: restate continuity-critical volatile conditions (exact left/right/both hand grips, core posture, accumulated wear like sweat/blood/mud, and key placement) in [ACT] on every visible beat.',
  '',
  'Canonical v0.4.0 Structure & Inline Syntax:',
  '- Phase 1 STAGING ([INTENT], [LOGIC], [AESTHETIC], [OPENING], plus optional [CHARACTERS], [REFERENCES], [CONTINUITY PROTOCOL]) establishes static pre-roll setup (S_0).',
  '- Phase 2 EXECUTION ([EXECUTION]) runs one Macro-State beat (S1, S2, ...) per line, chaining single-dimension Sub-States with `->` (Single-Dimension Law: never mix camera motion and actor choreography inside one tag).',
  '- Frozen [OPENING]: write strictly 2-4 sentences of motionless plain prose locking t=0 (optical canvas, viewport placement, pre-loaded hand grips, eyelines). Zero `[TAG]` tokens, zero motion verbs, zero audio cues.',
  '- Viewport coordinates: use `frame-left`, `frame-center`, `frame-right` (or `screen-left`/`screen-right`) + depth (`FG`, `MG`, `BG`) separated from yaw (`facing screen-left/right`, `in profile-left/right`, `back to camera`). Never use `stage-left` or `stage-right`.',
  '- Core inline dimensions: spoken dialogue uses curly braces `Speaker says (delivery) {line}` (optional `in Language`, `(O.S.)`, `(V.O.)`—never quotation marks or legacy `[DIAL]`/`[AUDIO]`); selective diegetic foley uses `<sound>`; opt-in score uses `(score)`; opt-in on-screen text uses `【text】`.',
  '- Macro-State resolution: never end a beat on spoken `{dialogue}`—always chain an immediate physical `[ACT]` follow-through or `<foley>` trigger.',
  '- Camera continuity: in continuous oners and coverage, establish numbered slots (`[CAM 01]`, `[CAM 02]`), hold or recall via bare `[CAM 01] ->`, or move via operator verbs (`PAN`, `TRACKING`, `CRANING`, `PUSHING`, `TILTING`, `ARCING`)—never re-declare static shot scales on an established slot. In discontinuous montage, use plain unnumbered `[CAM]`.',
  '- Multimodal reference isolation: declare `@image`/`@audio`/`@video` bindings only in `[INTENT]`, `[CHARACTERS]`, `[REFERENCES]`, or `[CONTINUITY PROTOCOL]`; use canonical character names downstream in `[EXECUTION]`.',
].join('\n');

export const DEFAULT_DRAFT_WRAPPER_TEMPLATE = [
  'Draft a complete Pure Auteur Script (v0.4.0) from this director brief:',
  '',
  'Scene Idea: {{idea}}',
  'Cast & References: {{cast}}',
  'Format & Specs: {{specs}}',
  'Subtext & Tone: {{subtext}}',
].join('\n');

// ---------------------------------------------------------------------------
// Built-in Extension Skills Registry
// ---------------------------------------------------------------------------

function formatCuratedExample(exampleId: string): string {
  const found = BUNDLED_EXAMPLES.find((ex) => ex.id === exampleId);
  if (!found) return '';
  return [`### Curated Example — ${found.title} (${found.topology})`, found.content].join('\n');
}

const DRAFT_CRAFT_CORE_RULES = [
  'Block-by-Block Drafting Craft (Pure Auteur Script v0.4.0):',
  '- [INTENT]: one flowing directorial sentence starting with "Create ..." covering format/genre, setting container, primary subjects, dramatic stakes, and any `@ref as Name (voice: @audio)` bindings. Never write a beat-by-beat shot list here.',
  '- [LOGIC]: 1-3 dense affirmative prose sentences (zero bullet lists) locking the 180-degree axis, screen direction, hand-prop permanence, physical surface/momentum laws, or montage independence. End with `No subtitles appear on screen.` whenever spoken dialogue exists and on-screen captions are unwanted.',
  '- [AESTHETIC]: tactile `Category: Value` rows (`Medium`, `Palette`, `Lighting`, `Location`, `Wardrobe`, `Audio`) describing physical lens stock, light falloff, materials, and continuous room tone. Zero kinetic action or camera moves.',
  '- [OPENING]: 2-4 motionless plain-prose sentences locking the 4 essential t=0 coordinates—(1) optical canvas/framing, (2) viewport placement (`frame-left/center/right`, `FG/MG/BG`), (3) pre-loaded hand grips (`left`/`right`/`both`), and (4) eyeline heading (`facing screen-*`). Strictly zero `[TAG]` tokens, motion verbs, or audio cues.',
  '- [EXECUTION]: one Macro-State line per beat (`S1`, `S2`, ...). Line 1 (`S1`) must match `[OPENING]` exactly. Chain single-dimension Sub-States with `->`, restate volatile grips/posture/wear on visible beats, and never end a line on `{dialogue}`.',
  '- Silent Pre-Flight Ledger (verify mentally before compiling JSON draft): confirm (a) every held prop has an explicit hand with zero collisions, (b) `S1` inherits `S_0` cleanly, (c) zero `stage-left`/`stage-right` or `@ref` tokens in `[EXECUTION]`, (d) zero `[TAG]` tokens in `[OPENING]`, and (e) beat count fits the target tempo.',
].join('\n');

function buildDraftCraftBody(includeMontageExample: boolean): string {
  const sections: string[] = [
    DRAFT_CRAFT_CORE_RULES,
    formatCuratedExample('forest-pov-horror'),
    formatCuratedExample('interrogation-coverage'),
  ];

  if (includeMontageExample) {
    sections.push(formatCuratedExample('heist-montage'));
  }

  return sections.filter((section) => section.length > 0).join('\n\n');
}

export const BUILTIN_AUTEUR_SKILLS: readonly AuteurSkillDefinition[] = [
  {
    id: 'draft_craft',
    name: 'Draft Craft & Curated Examples',
    category: 'workflow',
    triggerHint:
      'Block-by-block v0.4.0 drafting rules ([INTENT]/[LOGIC]/[AESTHETIC]/[OPENING]/[EXECUTION]), silent pre-flight ledger, and curated canonical examples.',
    body: buildDraftCraftBody(false),
    builtIn: true,
  },
  {
    id: 'video_continuation',
    name: 'Video Continuation & Terminal-Frame Handoff',
    category: 'module',
    triggerHint:
      'Extending an existing clip (@video1) with [CONTINUITY PROTOCOL], reduced delta-only [AESTHETIC], and exact terminal-frame [OPENING] handoff.',
    body: [
      'Video Continuation Craft:',
      '- Bind the source clip reference (`@video1`) in `[INTENT]` or `[CONTINUITY PROTOCOL]`—never inside `[EXECUTION]`.',
      '- Place `[CONTINUITY PROTOCOL]` before `[OPENING]` to lock inherited lighting, wardrobe, camera motion energy, and carry-over physical baggage from the final frame of `@video1`.',
      '- Keep `[AESTHETIC]` reduced to newly introduced lookbook deltas (new location zone, shifting light practical, new wardrobe damage) rather than redundantly re-specifying locked baseline styling.',
      '- Write `[OPENING]` as an exact motionless snapshot of the terminal frame of `@video1` (identical framing, viewport placement, hand allocation, eyeline, and physical wear) so `S1` resumes momentum without a jump cut.',
      '- On `S1` of a continuation script, re-declaring the active `[CAM 01]` optical setup is permitted on its first appearance; subsequent lines follow standard hold (`[CAM 01] ->`) or operator transition rules.',
    ].join('\n'),
    builtIn: true,
  },
  {
    id: 'token_mapping',
    name: 'Aesthetic Shorthand Token Mapping',
    category: 'module',
    triggerHint:
      'Declaring `Description -> TOKEN` dictionaries (`LOC01`, `EV01`, `PROP01`) in [AESTHETIC] and reusing shorthand tokens cleanly in [EXECUTION].',
    body: [
      'Shorthand Token Mapping Craft:',
      '- Use `Description -> TOKEN` mappings inside `[AESTHETIC]` `Category: Value` entries whenever a script crosses multiple locations, recurring environments, or complex hero props (e.g., `Location: wet tiled subway platform -> LOC01`, `Lighting: flickering amber sodium beacon -> EV01`, `Prop: scratched brass briefcase -> PROP01`).',
      '- Keep tokens short, uppercase alphanumeric identifiers (`LOC01`, `LOC02`, `EV01`, `PROP01`).',
      '- Reference declared tokens concisely in `[OPENING]` and `[EXECUTION]` instead of repeating verbose lookbook descriptions—preventing lookbook bleed while preserving exact world anchoring across parallel cross-cuts and montages.',
      '- Never invent undeclared shorthand tokens in `[EXECUTION]`; register every token in `[AESTHETIC]` first.',
    ].join('\n'),
    builtIn: true,
  },
  {
    id: 'character_reference',
    name: 'Multimodal Character & Voice References',
    category: 'module',
    triggerHint:
      'Isolating @image/@audio/@actor bindings in Phase 1 Staging, separating facial identity from fresh wardrobe, and using canonical names downstream.',
    body: [
      'Multimodal Character & Voice Reference Craft:',
      '- Declare all multimodal bindings strictly inside Phase 1 Staging (`[INTENT]`, `[CHARACTERS]`, or `[REFERENCES]`) using `@image1 as Name` or `@image1 as Name (voice: @audio1)` (and `@actor1` when applicable).',
      '- Separate locked facial/vocal identity from scene-specific styling: let `@image1` carry identity while specifying fresh scene wardrobe, hair wear, or grime cleanly in `[AESTHETIC]` under `Wardrobe:` using canonical names (never `@image1` in `[AESTHETIC]` `Wardrobe:`).',
      '- Downstream in `[OPENING]` and `[EXECUTION]`, refer exclusively to canonical character names—never leak `@image`, `@audio`, or `@actor` tokens into `[EXECUTION]` beats.',
      '- When multiple speakers share a scene with bound voice references, preserve unambiguous speaker attribution (`Name says (delivery) {line}`).',
    ].join('\n'),
    builtIn: true,
  },
  {
    id: 'temporal_calibration',
    name: 'Temporal Calibration & Tempo Table',
    category: 'module',
    triggerHint:
      'Calibrating beat count, target seconds per Macro-State, anti-float spacing, and cut-latency floors across combat, tactical, dialogue, and horror tempos.',
    body: [
      'Temporal Calibration & Pacing Ledger:',
      '- Match Macro-State density to target clip duration so beats neither float in low-gravity slack nor overcrowd cuts:',
      '  1. Close-Quarters Combat / Chase (Continuous Oner): 0.8s-1.2s per Macro-State (~4-5 lines per 5s; ~8-10 lines per 10s); max 1 cut per 2.0s-2.5s. Violating this causes Temporal Slack (floaty low-gravity motion).',
      '  2. Tactical Gunplay / Standoff (Hybrid Coverage): 1.5s-2.0s per Macro-State; max 1 cut per 2.5s-3.0s. Violating this causes mannequin freeze behind cover.',
      '  3. Dramatic Dialogue / Interrogation (Multi-Cam Coverage): 2.5s-4.0s per Macro-State; max 1 cut per 3.0s-5.0s. Violating this causes accelerated robotic lip-sync.',
      '  4. Horror / Mystery / Noir (Slow Creep Oner): 4.0s-6.0s+ per Macro-State; max 1 cut per 5.0s-8.0s. Violating this rushes tension and clips acoustic decay.',
      '- Cut-Latency Floor: in cut-based coverage or montage, total cuts must not exceed `Duration(s) / 2.0` (each cut needs ~1.5s-2.5s to optically stabilize).',
      '- Anti-Float Rule: pack high-velocity combat/chase oners with continuous kinetic cause-and-effect rather than sparse beats stretched over long durations.',
    ].join('\n'),
    builtIn: true,
  },
  {
    id: 'spatial_fences',
    name: 'Spatial Fences & Tier-2 Precision Tags',
    category: 'module',
    triggerHint:
      'Using inline [BLOCK] for 3+ subjects or mark swaps, [STATE IN]/[STATE OUT] boundary clamps, [LIGHT] cues, and Tier-2 tags ([FOCUS], [SPEED], [PROP], [ENV], [CROWD], [VFX], [TRANS]).',
    body: [
      'Spatial Fences & Tier-2 Precision Tags:',
      '- `[BLOCK]` (inline Sub-State, not a Macro-Block): deploy whenever 3+ subjects share the frame or characters cross/swap marks. Lock 2D viewport coordinates + depth + yaw cleanly: `[BLOCK] Miller frame-left FG facing screen-right; Park frame-left BG facing screen-right; Ray frame-right MG facing screen-left`.',
      '- `[STATE IN]` / `[STATE OUT]`: clamp difficult posture, hand-off, or kinetic transitions explicitly at beat entry or exit when state inheritance alone is ambiguous.',
      '- `[LIGHT]`: direct dynamic in-shot illumination changes (patrol strobes, muzzle flash, opening shutter, power cut) without repeating static `[AESTHETIC]` lighting.',
      '- Tier-2 single-dimension tags (opt-in only when a beat genuinely needs precision control):',
      '  - `[FOCUS]`: rack focus or depth-of-field pull between foreground and background planes.',
      '  - `[SPEED]`: deliberate speed ramp (e.g., momentary slow-motion impact or return to real-time).',
      '  - `[PROP]`: isolated hero object state or mechanical reaction.',
      '  - `[ENV]`: dynamic environmental shift (gust, door slam, debris fall, rising fog).',
      '  - `[CROWD]`: background group choreography or directional flow.',
      '  - `[VFX]`: physicalized visual effects integrated into scene lighting.',
      '  - `[TRANS]`: intentional optical or match-cut transition bridge between beats.',
      '- Honor the Single-Dimension Law: keep each tag focused on one dimension separated by `->`.',
    ].join('\n'),
    builtIn: true,
  },
];

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
            'Cross-cut 180-degree eyeline parity between consecutive montage beats',
            'S0 -> S1 posture/prop carryover across independent montage cuts',
            'Numbered camera slot recall/hold continuity ([CAM 01] ->)',
          ],
          checks: [
            'Viewport coordinate purity: zero banned `stage-left`/`stage-right` terms; separate screen placement (`frame-left/center/right` + `FG/MG/BG`) from yaw (`facing screen-*`) within each shot.',
            'Plain unnumbered `[CAM]` tags: montage cuts use unnumbered `[CAM]` descriptors rather than persistent numbered camera slots.',
            'Self-contained shot anchoring: every Macro-State explicitly establishes its subject, setting (or declared `LOC##` token), and light cue.',
            'Within-shot action visibility & direction: every `[ACT]` gesture is physically visible from that beat’s active `[CAM]` framing with coherent internal screen direction.',
          ],
        };
      }

      const checks = [
        'Viewport coordinate purity: zero banned `stage-left`/`stage-right` terms; separate position (`frame-left/center/right` + `FG/MG/BG`) from anatomical yaw (`facing screen-left/right`, `in profile-left/right`, `back to camera`).',
        '180-degree axis & eyeline parity: if Subject A is `frame-left` facing `screen-right`, reverse coverage places Subject B `frame-right` facing `screen-left` unless crossed via a neutral frontal/POV shot or arcing camera move.',
        'Action visibility vs. active `resolvedCamera.effectiveFraming`: confirm every `[ACT]` detail (eye glance, palm press, hand gesture) is physically visible from the active camera angle.',
        'Clean S0 -> S1 handoff: Beat S1 opens with the exact camera framing, viewport layout, posture, and hand grips locked in `[OPENING]`.',
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
            'Discontinuous montage topology: beats represent independent moments with no cross-beat wear or kinetic carryover.',
          suppressedChecks: [
            'Cross-beat physical wear persistence (sweat/blood/mud repetition across unrelated shots)',
            'Continuous S_{n-1} -> S_n posture/kinetic carryover between cuts',
          ],
          checks: [
            'Cut-latency floor: total montage cuts must not exceed `Duration(s) / 2.0` (each cut needs ~1.5s-2.5s to visually stabilize and read).',
            'Self-contained shot readability: each montage Macro-State packs a single clear visual beat without cramming multiple incompatible time jumps into one line.',
            'Within-shot kinetic plausibility: motion described inside a single beat is physically continuous and achievable within its brief shot window.',
          ],
        };
      }

      return {
        preset,
        lens: 'Lens 2: Temporal, Pacing & Wear',
        topology,
        topologyNote:
          'Continuous scene topology: check beat-to-duration tempo calibration, kinetic continuity, and physical wear repetition.',
        suppressedChecks: [],
        checks: [
          'Cut-latency floor: editorial cut count must not exceed `Duration(s) / 2.0` (~1.5s-2.5s per cut to stabilize).',
          'Anti-float beat-to-duration calibration: combat/chase oners target 0.8s-1.2s per beat; tactical standoffs 1.5s-2.0s; dramatic dialogue 2.5s-4.0s; slow horror/noir 4.0s-6.0s+.',
          'Physical wear persistence (Repetition Mandate): accumulated baggage (sweat, blood, mud, bruises, soaked fabric, fatigue) is restated in `[ACT]` on visible beats until cleaned or resolved.',
          'Plausible kinetic transitions: posture and location changes (`seated -> standing`, `crouching -> lunging`) follow physically connected momentum with zero teleporting between beats.',
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
            'Cross-beat prop persistence and carryover across montage cuts',
            'Cross-cut prop repetition on camera recalls',
          ],
          checks: [
            'Within-shot explicit hand allocation: any prop held or manipulated in a montage beat names the exact hand (`left hand`, `right hand`, `both hands`).',
            'Zero within-shot hand collisions: a subject cannot grip two conflicting props in the same hand within a single beat.',
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
          ? 'Discontinuous montage topology: keep each beat’s selective `<foley>` punchy and self-contained while isolating continuous ambience in `[AESTHETIC]`.'
          : 'Verify curly-brace dialogue syntax, beat resolution, selective `<foley>`, and room tone isolation.',
        suppressedChecks: [],
        checks: [
          'Macro-State resolution rule: no `[EXECUTION]` line terminates on spoken `{dialogue}`—always chain a physical `[ACT]` follow-through or `<foley>` trigger.',
          'Curly-brace dialogue lock: spoken lines strictly use `Speaker says (delivery) {line}` (optional `in Language`, `(O.S.)`, `(V.O.)`), never quotation marks or legacy `[DIAL]`/`[AUDIO]`.',
          'Room tone isolation: continuous background ambience (rain, ballast hum, wind, traffic) stays in `[AESTHETIC]` (`Audio:`) and is not spammed as `<foley>` on every beat.',
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
          'Montage contract alignment: confirm `[LOGIC]` states independent-shot montage behavior and `[EXECUTION]` beats use plain unnumbered `[CAM]` tags with self-contained subject/light/location cues.'
        );
      }

      return {
        preset,
        lens: 'Lens 5: Blocks & Grammar',
        topology,
        topologyNote: isMontage
          ? 'Discontinuous montage topology: allow concise per-beat subject/light/location anchoring (or `LOC##` tokens) while preventing static lookbook bleed.'
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
}

export function buildToolProtocolBlock(params: ToolProtocolParams): string {
  const {focus, allowedToolNames, snapshotHash, isEmpty, availableSkillCount} = params;
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
      '- Call `get_script_overview` first if you need to inspect existing blocks before staging a new draft.'
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
    `- Structure: ${state.stagingBlockCount} Staging Macro-Block(s), ${state.beatCount} Execution Beat(s), ${state.referenceBindingCount} Reference Binding(s), ${state.tokenMappingCount} Token Mapping(s)`,
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
  hasAvailableSkills: boolean
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
    } else if (entry.builtIn && id === 'video_continuation' && derived.hasContinuationContext) {
      status = 'active';
      reason = 'passive_continuation';
    } else if (entry.builtIn && id === 'token_mapping' && derived.tokenMappings.length > 0) {
      status = 'active';
      reason = 'passive_token_mapping';
    } else if (
      entry.builtIn &&
      id === 'character_reference' &&
      derived.referenceBindings.length > 0
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
        ? buildDraftCraftBody(true)
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

  const allowedToolNames = computeAllowedToolNames(
    options.focus,
    isEmpty,
    availableSkills.length > 0
  );

  const trimmedCraftOverride = options.foundationalCraftOverride?.trim();
  const isCraftOverridden = Boolean(trimmedCraftOverride && trimmedCraftOverride.length > 0);
  const foundationalCraftText = isCraftOverridden
    ? trimmedCraftOverride!
    : DEFAULT_FOUNDATIONAL_CRAFT;

  const liveEditorStateText = buildLiveEditorStateText(editorState);
  const activeSkillsText = buildActiveSkillsSectionText(activeSkills);
  const skillDirectoryText = buildSkillDirectorySectionText(availableSkills);
  const toolProtocolText = buildToolProtocolBlock({
    focus: options.focus,
    allowedToolNames,
    snapshotHash: editorState.snapshotHash,
    isEmpty,
    availableSkillCount: availableSkills.length,
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
