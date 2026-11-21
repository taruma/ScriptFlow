import {
  AUDIT_LENS_PRESETS,
  getAuteurJsonSchemas,
  type AuteurLensPresetId,
} from '../../core/index.ts';
import type {
  AssistantMode,
  ComposedAgentContext,
  ResolvedAuteurSkill,
  ScriptToolName,
} from '../auteurKnowledge.ts';

type StaticScriptToolName = Exclude<ScriptToolName, 'load_auteur_skill'>;

export const MODE_TOOL_NAMES: Record<AssistantMode, readonly StaticScriptToolName[]> = {
  refine: ['get_script_overview', 'inspect_lens_slice', 'propose_script_patch'],
  check: ['get_script_overview', 'inspect_lens_slice', 'report_audit_review'],
  draft: ['get_script_overview', 'propose_script_draft'],
};

export interface GeminiFunctionToolDeclaration {
  type: 'function';
  name: ScriptToolName;
  description: string;
  parameters: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// JSON Schema Sanitizer & Mode-Scoped Tool Declarations
// ---------------------------------------------------------------------------

const UNSUPPORTED_TOOL_SCHEMA_KEYS = new Set([
  '$schema',
  'minLength',
  'maxLength',
  'minProperties',
  'maxProperties',
  'uniqueItems',
  'propertyNames',
  'contains',
  'minContains',
  'maxContains',
]);

function hasRefReference(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasRefReference);
  }
  if (!value || typeof value !== 'object') {
    return false;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key === '$ref' && typeof entry === 'string') {
      return true;
    }
    if (hasRefReference(entry)) {
      return true;
    }
  }
  return false;
}

export function sanitizeJsonSchemaForTool(value: unknown): unknown {
  const hoistedDefs: Record<string, unknown> = {};

  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      return node.map(walk);
    }
    if (!node || typeof node !== 'object') {
      return node;
    }

    const record = node as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    const hasConst = Object.prototype.hasOwnProperty.call(record, 'const');

    for (const [key, entry] of Object.entries(record)) {
      if (UNSUPPORTED_TOOL_SCHEMA_KEYS.has(key)) continue;
      if (key === 'const') continue;
      if (key === '$defs') {
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
          for (const [defKey, defValue] of Object.entries(entry as Record<string, unknown>)) {
            hoistedDefs[defKey] = walk(defValue);
          }
        }
        continue;
      }
      result[key] = walk(entry);
    }

    if (hasConst) {
      const constVal = record.const;
      result.type = constVal === null ? 'null' : typeof constVal;
      result.enum = [constVal];
    }

    return result;
  };

  const sanitized = walk(value);
  if (
    sanitized &&
    typeof sanitized === 'object' &&
    !Array.isArray(sanitized) &&
    Object.keys(hoistedDefs).length > 0 &&
    hasRefReference(sanitized)
  ) {
    (sanitized as Record<string, unknown>).$defs = hoistedDefs;
  }

  return sanitized;
}

function buildStaticToolDeclarationsMap(): Record<
  StaticScriptToolName,
  GeminiFunctionToolDeclaration
> {
  const schemas = getAuteurJsonSchemas();
  const patchSchema = sanitizeJsonSchemaForTool(schemas.patch) as Record<string, unknown>;
  const reviewSchema = sanitizeJsonSchemaForTool(schemas.review) as Record<string, unknown>;
  const lensPresetIds = Object.keys(AUDIT_LENS_PRESETS) as AuteurLensPresetId[];

  return {
    get_script_overview: {
      type: 'function',
      name: 'get_script_overview',
      description:
        'Returns a compact read-only overview of the current Auteur Script: snapshotHash, sceneTopology, staging Macro-Blocks (MB#), Macro-State count, camera slots, reference/token counts, and active Script Supervisor diagnostics.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
    inspect_lens_slice: {
      type: 'function',
      name: 'inspect_lens_slice',
      description:
        'Extracts a focused read-only JSON slice of the current script using one of the 5 built-in Script Supervisor audit presets or a custom composable LensSliceSpec with resolved camera framing.',
      parameters: {
        type: 'object',
        properties: {
          preset: {
            type: 'string',
            enum: lensPresetIds,
            description:
              'Built-in audit lens preset (lens1_spatial_optics, lens2_temporal_pacing_wear, lens3_props_inventory, lens4_acoustics_voice, lens5_blocks_grammar).',
          },
          spec: {
            type: 'object',
            description:
              'Optional custom LensSliceSpec (macroBlocks, aestheticKeys, dimensions, subStateTags, includeAllSubStates, includeResolvedCamera, includeTokenMappings, includeReferenceBindings, includeSceneTopology, includeTrailingResolution, diagnosticLenses, includeAllDiagnostics).',
            properties: {
              preset: {type: 'string', enum: lensPresetIds},
              macroBlocks: {type: 'array', items: {type: 'string'}},
              aestheticKeys: {type: 'array', items: {type: 'string'}},
              dimensions: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: [
                    'camera',
                    'action',
                    'block',
                    'light',
                    'state_boundary',
                    'tier2',
                    'dialogue',
                    'foley',
                    'score',
                    'onscreen_text',
                    'plain',
                  ],
                },
              },
              subStateTags: {type: 'array', items: {type: 'string'}},
              includeAllSubStates: {type: 'boolean'},
              includeResolvedCamera: {type: 'boolean'},
              includeTokenMappings: {
                anyOf: [{type: 'boolean'}, {type: 'string', enum: ['all', 'referenced']}],
              },
              includeReferenceBindings: {type: 'boolean'},
              includeSceneTopology: {type: 'boolean'},
              includeTrailingResolution: {type: 'boolean'},
              includeAllDiagnostics: {type: 'boolean'},
            },
          },
        },
      },
    },
    propose_script_patch: {
      type: 'function',
      name: 'propose_script_patch',
      description:
        'Dry-runs a transactional, ID-addressed AuteurPatch against the current script with rejectOnNewErrors=true. If valid and lint-clean, stages a reviewable PatchSuggestion without mutating the editor; if invalid or lint-rejected, returns structured errors and repairHint for self-repair.',
      parameters: patchSchema,
    },
    propose_script_draft: {
      type: 'function',
      name: 'propose_script_draft',
      description:
        'Validates and compiles a full AuteurScriptDraft JSON into canonical v0.4.0 plain text and stages a reviewable DraftSuggestion without overwriting the editor.',
      parameters: sanitizeJsonSchemaForTool({
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Optional short scene title for the drafted script.',
          },
          summary: {
            type: 'string',
            description: 'One-sentence summary of the drafted scene and topology.',
          },
          draft: schemas.draft,
        },
        required: ['draft'],
      }) as Record<string, unknown>,
    },
    report_audit_review: {
      type: 'function',
      name: 'report_audit_review',
      description:
        'Validates a structured Script Supervisor AuteurReview (including dry-running any embedded suggestedPatch payloads against active lint rules) and stages clickable AuditReviewSuggestion items.',
      parameters: reviewSchema,
    },
    ask_question: {
      type: 'function',
      name: 'ask_question',
      description:
        'Presents 1 to 4 concise clarifying questions to the user as an interactive multi-select card (every question lets the user pick multiple options and add an optional custom comment). Stop after calling and wait for the user to answer.',
      parameters: sanitizeJsonSchemaForTool({
        type: 'object',
        properties: {
          intro: {
            type: 'string',
            description: 'Optional brief one-line context sentence shown above the questions.',
          },
          questions: {
            type: 'array',
            description:
              '1 to 4 concise clarifying questions. All questions are multi-select and include an inline comment field automatically.',
            items: {
              type: 'object',
              properties: {
                question: {
                  type: 'string',
                  description:
                    'Clear, concise question text (unnumbered, without "select all that apply").',
                },
                options: {
                  type: 'array',
                  description:
                    '2 to 5 short, distinct options (unnumbered, without an "Other" choice—the UI provides a comment field automatically).',
                  items: {type: 'string'},
                },
              },
              required: ['question', 'options'],
            },
          },
        },
        required: ['questions'],
      }) as Record<string, unknown>,
    },
  };
}

let cachedStaticToolDeclarations: Record<
  StaticScriptToolName,
  GeminiFunctionToolDeclaration
> | null = null;

function getStaticToolDeclarations(): Record<StaticScriptToolName, GeminiFunctionToolDeclaration> {
  if (!cachedStaticToolDeclarations) {
    cachedStaticToolDeclarations = buildStaticToolDeclarationsMap();
  }
  return cachedStaticToolDeclarations;
}

export function buildLoadAuteurSkillDeclaration(
  availableSkills: readonly ResolvedAuteurSkill[]
): GeminiFunctionToolDeclaration {
  const skillIds = availableSkills.map((skill) => skill.id);
  return {
    type: 'function',
    name: 'load_auteur_skill',
    description:
      'Loads a specialized Pure Auteur Script craft skill from the Available Skill Directory on demand for this turn. Never call for skills already injected as active.',
    parameters: sanitizeJsonSchemaForTool({
      type: 'object',
      properties: {
        skillId: {
          type: 'string',
          enum: skillIds,
          description:
            'Exact skill ID from the Available Skill Directory to load into this turn.',
        },
      },
      required: ['skillId'],
    }) as Record<string, unknown>,
  };
}

/**
 * Builds function tool declarations for a composed turn context.
 * Heavy Zod-derived schemas stay cached; `load_auteur_skill` is generated dynamically
 * per turn from `context.availableSkills` (including custom user skills).
 */
export function buildToolDeclarationsForContext(
  context: ComposedAgentContext
): GeminiFunctionToolDeclaration[] {
  const staticDecls = getStaticToolDeclarations();
  const result: GeminiFunctionToolDeclaration[] = [];

  for (const name of context.allowedToolNames) {
    if (name === 'load_auteur_skill') {
      if (context.availableSkills.length > 0) {
        result.push(buildLoadAuteurSkillDeclaration(context.availableSkills));
      }
    } else {
      result.push(staticDecls[name]);
    }
  }

  return result;
}

/**
 * Returns the function tool declarations allowed for a legacy AssistantMode.
 */
export function getToolDeclarationsForMode(mode: AssistantMode): GeminiFunctionToolDeclaration[] {
  const all = getStaticToolDeclarations();
  return MODE_TOOL_NAMES[mode].map((name) => all[name]);
}

// ---------------------------------------------------------------------------
// Concise Mode-Scoped System Instructions (Pure Auteur Script v0.4.0)
// ---------------------------------------------------------------------------

const CORE_AUTEUR_RULES_BLOCK = [
  'You are an expert Pure Auteur Script (v0.4.0) directorial assistant. Keep scripts 100% platform- and model-agnostic (never mention generative video vendors or model names in script text).',
  'Core v0.4.0 syntax invariants:',
  '- Phase 1 STAGING ([INTENT], [LOGIC], [AESTHETIC], [OPENING], etc.) is static pre-roll setup; Phase 2 EXECUTION ([EXECUTION]) is one Macro-State (S1, S2, ...) per line chained with `->`.',
  '- [OPENING] is frozen t=0 plain prose with zero `[TAG]` tokens, zero motion verbs, and zero audio cues.',
  '- Keep `@ref` bindings (`@image1 as Name`) inside [INTENT]/[CHARACTERS]/[REFERENCES]/[CONTINUITY PROTOCOL]; never put `@ref` in [EXECUTION].',
  '- Use camera viewport coordinates (`frame-left`, `frame-right`, `screen-left`, `screen-right`, `facing screen-*`); never use `stage-left` or `stage-right`.',
  '- Dialogue uses curly braces `Speaker says (delivery) {line}` (never quotes), foley uses `<sound>`, opt-in score uses `(score)`, opt-in on-screen text uses `【text】`. Never end a Macro-State on dialogue—chain a physical `[ACT]` follow-through or `<foley>` trigger.',
  '- In continuous oners/coverage, hold established numbered cameras via `[CAM 01] ->` or operator motion verbs (`PAN`, `TRACKING`, `CRANING`), not repeated static shot scales.',
].join('\n');

const MODE_INSTRUCTIONS: Record<AssistantMode, string> = {
  refine: [
    CORE_AUTEUR_RULES_BLOCK,
    '',
    'Mode: REFINE (Targeted Editing).',
    '- Call `get_script_overview` and `inspect_lens_slice` first to inspect current IDs (`MB#`, `MB#.#`, `S#`, `S#.#`) and `snapshotHash`.',
    '- Propose concrete edits exclusively via `propose_script_patch` with `expectedSnapshotHash` and concise `summary`.',
    '- If `propose_script_patch` returns validation or lint errors, read `errors` and `repairHint`, repair the patch, and retry before answering.',
    '- After staging a clean patch, summarize the change briefly in plain English.',
  ].join('\n'),
  check: [
    CORE_AUTEUR_RULES_BLOCK,
    '',
    'Mode: CHECK (Script Supervisor Audit).',
    '- Call `get_script_overview` and relevant `inspect_lens_slice` presets (`lens1_spatial_optics` through `lens5_blocks_grammar`) before judging.',
    '- Respect the script `sceneTopology` (continuous oner vs. multi-camera coverage vs. discontinuous montage).',
    '- Report structured findings via `report_audit_review` referencing exact `targetId` (`MB#`, `S#`, `S#.#`) and, when helpful, an executable `suggestedPatch` with `expectedSnapshotHash`.',
    '- If any embedded `suggestedPatch` is rejected by validation or lint rules, repair and re-report so every suggested fix is clean.',
  ].join('\n'),
  draft: [
    CORE_AUTEUR_RULES_BLOCK,
    '',
    'Mode: DRAFT (New Scene Generation).',
    '- Call `get_script_overview` if you need context about the current open script before drafting.',
    '- Build a complete, well-structured `AuteurScriptDraft` ([INTENT], [LOGIC], [AESTHETIC] as key_value, [OPENING], and [EXECUTION] Macro-States) and stage it via `propose_script_draft`.',
    '- If `propose_script_draft` returns schema validation errors or lint errors, repair them and call `propose_script_draft` again so the staged draft is clean.',
    '- Keep your response concise once the draft is staged.',
  ].join('\n'),
};

export function getSystemInstructionForMode(mode: AssistantMode): string {
  return MODE_INSTRUCTIONS[mode];
}
