import {AUDIT_LENS_PRESETS, type AuteurLensPresetId} from '../../core/index.ts';
import {
  BUILTIN_SCRIPT_TOOLS,
  type AssistantMode,
  type ComposedAgentContext,
  type ResolvedAuteurSkill,
  type ScriptToolName,
} from '../auteurKnowledge.ts';
import {buildSlimPatchJsonSchema} from './aiPatchCompiler.ts';

type StaticScriptToolName = Exclude<ScriptToolName, 'load_auteur_skill'>;

export const MODE_TOOL_NAMES: Record<AssistantMode, readonly StaticScriptToolName[]> = {
  refine: ['get_script_source', 'inspect_lens_slice', 'propose_script_patch'],
  check: ['get_script_source', 'inspect_lens_slice', 'report_audit_review'],
  draft: ['get_script_source', 'inspect_lens_slice', 'propose_script_draft'],
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
  const lensPresetIds = Object.keys(AUDIT_LENS_PRESETS) as AuteurLensPresetId[];
  const patchSchema = sanitizeJsonSchemaForTool(
    buildSlimPatchJsonSchema({includeTitle: true, opsOptional: true})
  ) as Record<string, unknown>;
  const auditSuggestedPatchSchema = sanitizeJsonSchemaForTool(
    buildSlimPatchJsonSchema({includeTitle: false, opsOptional: false})
  ) as Record<string, unknown>;

  return {
    get_script_source: {
      type: 'function',
      name: 'get_script_source',
      description: getDefaultToolDescription('get_script_source'),
      parameters: {
        type: 'object',
        properties: {
          targetIds: {
            type: 'array',
            items: {type: 'string'},
            description:
              'Optional Macro-Block IDs ("MB0", "MB2"), headers ("AESTHETIC", "EXECUTION"), or Macro-State IDs ("S1", "S3"). Omit for full script.',
          },
          annotateIds: {
            type: 'boolean',
            description:
              'Defaults to true. Prefixes each Macro-Block and Macro-State with its MB# / S# ID.',
          },
        },
      },
    },
    inspect_lens_slice: {
      type: 'function',
      name: 'inspect_lens_slice',
      description: getDefaultToolDescription('inspect_lens_slice'),
      parameters: {
        type: 'object',
        properties: {
          preset: {
            type: 'string',
            enum: lensPresetIds,
            description: 'Single Script Supervisor audit lens preset.',
          },
          presets: {
            type: 'array',
            items: {type: 'string', enum: lensPresetIds},
            description:
              '1 to 5 audit lens presets to inspect in one deduplicated slice (preferred for multi-lens audits).',
          },
          includeStaging: {
            type: 'boolean',
            description: 'Set false to omit Phase 1 Staging Macro-Blocks.',
          },
          macroStateIds: {
            type: 'array',
            items: {type: 'string'},
            description:
              'Optional Execution Macro-State IDs (e.g. ["S3", "S4"]) while preserving inherited camera framing.',
          },
        },
      },
    },
    propose_script_patch: {
      type: 'function',
      name: 'propose_script_patch',
      description: getDefaultToolDescription('propose_script_patch'),
      parameters: patchSchema,
    },
    propose_script_draft: {
      type: 'function',
      name: 'propose_script_draft',
      description: getDefaultToolDescription('propose_script_draft'),
      parameters: {
        type: 'object',
        properties: {
          scriptText: {
            type: 'string',
            description:
              'Complete canonical v0.4.0 Auteur Script plain text ([INTENT], [LOGIC], [AESTHETIC], [OPENING], [EXECUTION]) without Markdown fences or # MB# / S#: prefixes.',
          },
          title: {
            type: 'string',
            description: 'Optional short scene title (<= 120 chars).',
          },
          summary: {
            type: 'string',
            description: 'Optional one-sentence summary of the drafted scene and topology.',
          },
        },
        required: ['scriptText'],
      },
    },
    report_audit_review: {
      type: 'function',
      name: 'report_audit_review',
      description: getDefaultToolDescription('report_audit_review'),
      parameters: {
        type: 'object',
        properties: {
          overallSummary: {
            type: 'string',
            description: 'Concise overall Script Supervisor summary.',
          },
          issues: {
            type: 'array',
            description: 'Ordered list of continuity or grammar findings (empty array when clean).',
            items: {
              type: 'object',
              properties: {
                id: {type: 'string'},
                lens: {
                  type: 'string',
                  enum: [
                    'Lens 1: Spatial & Optics',
                    'Lens 2: Temporal, Pacing & Wear',
                    'Lens 3: Props & Inventory',
                    'Lens 4: Acoustics & Voice',
                    'Lens 5: Blocks & Grammar',
                  ],
                },
                severity: {type: 'string', enum: ['error', 'warning']},
                targetLevel: {
                  type: 'string',
                  enum: ['document', 'macro_block', 'aesthetic_entry', 'macro_state', 'sub_state'],
                },
                targetId: {type: 'string', description: 'Exact ID ("MB0", "S2", "S2.3").'},
                message: {type: 'string'},
                rationale: {type: 'string'},
                repairHint: {type: 'string'},
                suggestedPatch: auditSuggestedPatchSchema,
              },
              required: ['lens', 'severity', 'targetLevel', 'targetId', 'message', 'rationale', 'repairHint'],
            },
          },
        },
        required: ['issues'],
      },
    },
    ask_question: {
      type: 'function',
      name: 'ask_question',
      description: getDefaultToolDescription('ask_question'),
      parameters: {
        type: 'object',
        properties: {
          intro: {
            type: 'string',
            description: 'Optional brief one-line context sentence shown above the questions.',
          },
          questions: {
            type: 'array',
            description:
              '1 to 4 concise clarifying questions (single-select by default; set multiSelect: true when choices combine; additive note field included automatically).',
            items: {
              type: 'object',
              properties: {
                question: {
                  type: 'string',
                  description: 'Clear, concise question text (unnumbered).',
                },
                options: {
                  type: 'array',
                  description: '2 to 5 short, distinct options (no "Other" option).',
                  items: {type: 'string'},
                },
                multiSelect: {
                  type: 'boolean',
                  description: 'Set true only when multiple options can be combined.',
                },
              },
              required: ['question', 'options'],
            },
          },
        },
        required: ['questions'],
      },
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

let cachedDefaultToolDescriptions: Map<ScriptToolName, string> | null = null;

function getDefaultToolDescription(name: ScriptToolName): string {
  if (!cachedDefaultToolDescriptions) {
    cachedDefaultToolDescriptions = new Map<ScriptToolName, string>(
      BUILTIN_SCRIPT_TOOLS.map((tool) => [tool.name, tool.defaultDescription])
    );
  }
  return cachedDefaultToolDescriptions.get(name) ?? '';
}

export function buildLoadAuteurSkillDeclaration(
  availableSkills: readonly ResolvedAuteurSkill[]
): GeminiFunctionToolDeclaration {
  const skillIds = availableSkills.map((skill) => skill.id);
  return {
    type: 'function',
    name: 'load_auteur_skill',
    description: getDefaultToolDescription('load_auteur_skill'),
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
 * Returns the exact sanitized JSON Schema `parameters` object sent to the API
 * for a given function tool (for read-only inspection in the Function Tools tab).
 */
export function getToolParametersSchema(
  toolName: ScriptToolName,
  availableSkills: readonly ResolvedAuteurSkill[] = []
): Record<string, unknown> {
  if (toolName === 'load_auteur_skill') {
    return buildLoadAuteurSkillDeclaration(availableSkills).parameters;
  }
  return getStaticToolDeclarations()[toolName].parameters;
}

/**
 * Builds function tool declarations for a composed turn context.
 * Heavy Zod-derived schemas stay cached; `load_auteur_skill` is generated dynamically
 * per turn from `context.availableSkills` (including custom user skills), and any
 * user `descriptionOverride` from `context.resolvedTools` is applied cleanly.
 */
export function buildToolDeclarationsForContext(
  context: ComposedAgentContext
): GeminiFunctionToolDeclaration[] {
  const staticDecls = getStaticToolDeclarations();
  const descriptionOverrideByName = new Map<ScriptToolName, string>();
  for (const resolved of context.resolvedTools ?? []) {
    if (resolved.isDescriptionOverridden) {
      descriptionOverrideByName.set(resolved.name, resolved.description);
    }
  }

  const result: GeminiFunctionToolDeclaration[] = [];

  for (const name of context.allowedToolNames) {
    let baseDecl: GeminiFunctionToolDeclaration | null = null;
    if (name === 'load_auteur_skill') {
      if (context.availableSkills.length > 0) {
        baseDecl = buildLoadAuteurSkillDeclaration(context.availableSkills);
      }
    } else {
      baseDecl = staticDecls[name];
    }

    if (!baseDecl) continue;

    const customDescription = descriptionOverrideByName.get(name);
    result.push(
      customDescription
        ? {
            ...baseDecl,
            description: customDescription,
          }
        : baseDecl
    );
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
// Concise Mode-Scoped System Instructions (Auteur Script v0.4.0)
// ---------------------------------------------------------------------------

const CORE_AUTEUR_RULES_BLOCK = [
  'You are an expert Auteur Script (v0.4.0) directorial assistant. Keep scripts 100% platform- and model-agnostic (never mention generative video vendors or model names in script text).',
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
    '- Call `get_script_source` (using `targetIds` when localized) before editing whenever needed to verify exact IDs (`MB#`, `S#`) and wording.',
    '- Propose edits via `propose_script_patch` with `expectedSnapshotHash`, concise `summary`, and text-first `ops` (and/or optional `title`).',
    '- If `propose_script_patch` returns validation or lint errors, read `errors` and `repairHint`, repair the patch, and retry before answering.',
    '- After staging a clean patch, summarize the change briefly in plain English.',
  ].join('\n'),
  check: [
    CORE_AUTEUR_RULES_BLOCK,
    '',
    'Mode: CHECK (Script Supervisor Audit).',
    '- Call `inspect_lens_slice` (batching multiple lenses via `presets: ["lens1_spatial_optics", ...]`) or `get_script_source` before judging.',
    '- Respect the script `sceneTopology` (continuous oner vs. multi-camera coverage vs. discontinuous montage).',
    '- Report structured findings via `report_audit_review` referencing exact `targetId` (`MB#`, `S#`, `S#.#`) and, when helpful, an executable `suggestedPatch` with `expectedSnapshotHash`.',
    '- If any embedded `suggestedPatch` is rejected by validation or lint rules, repair and re-report so every suggested fix is clean.',
  ].join('\n'),
  draft: [
    CORE_AUTEUR_RULES_BLOCK,
    '',
    'Mode: DRAFT (New Scene Generation).',
    '- Call `get_script_source` if you need context about a non-empty open script before drafting.',
    '- Build a complete, well-structured canonical `v0.4.0` `scriptText` ([INTENT], [LOGIC], [AESTHETIC], [OPENING], and [EXECUTION]) and stage it via `propose_script_draft`.',
    '- If `propose_script_draft` returns validation errors or lint errors, repair them and call `propose_script_draft` again so the staged draft is clean.',
    '- Keep your response concise once the draft is staged.',
  ].join('\n'),
};

export function getSystemInstructionForMode(mode: AssistantMode): string {
  return MODE_INSTRUCTIONS[mode];
}
