import {
  AUDIT_LENS_PRESETS,
  getAuteurJsonSchemas,
  type AuteurLensPresetId,
} from '../../core/index.ts';
import {
  BUILTIN_SCRIPT_TOOLS,
  type AssistantMode,
  type ComposedAgentContext,
  type ResolvedAuteurSkill,
  type ScriptToolName,
} from '../auteurKnowledge.ts';

type StaticScriptToolName = Exclude<ScriptToolName, 'load_auteur_skill'>;

export const MODE_TOOL_NAMES: Record<AssistantMode, readonly StaticScriptToolName[]> = {
  refine: [
    'get_script_overview',
    'get_script_source',
    'inspect_lens_slice',
    'propose_script_patch',
    'propose_text_replace',
    'propose_script_title',
  ],
  check: ['get_script_overview', 'get_script_source', 'inspect_lens_slice', 'report_audit_review'],
  draft: [
    'get_script_overview',
    'get_script_source',
    'inspect_lens_slice',
    'propose_script_draft',
    'propose_script_title',
  ],
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
      description: getDefaultToolDescription('get_script_overview'),
      parameters: {
        type: 'object',
        properties: {},
      },
    },
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
              'Optional list of Macro-Block IDs ("MB0", "MB2"), header names ("AESTHETIC", "EXECUTION"), or Macro-State IDs ("S1", "S3") to read. Omit to read the entire script.',
          },
          annotateIds: {
            type: 'boolean',
            description:
              'Defaults to true. Prefixes each returned Staging Macro-Block and Execution Macro-State with its exact MB# / S# ID alongside the canonical plain text.',
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
            description:
              'Built-in audit lens preset (lens1_spatial_optics, lens2_temporal_pacing_wear, lens3_props_inventory, lens4_acoustics_voice, lens5_blocks_grammar).',
          },
          includeStaging: {
            type: 'boolean',
            description:
              'Optional shorthand override. Set to false to omit Phase 1 Staging Macro-Blocks and return only Execution Macro-States.',
          },
          macroStateIds: {
            type: 'array',
            items: {type: 'string'},
            description:
              'Optional shorthand list of Execution Macro-State IDs (e.g. ["S3", "S4"]) to include while preserving inherited resolvedCamera framing from earlier states.',
          },
          spec: {
            type: 'object',
            description:
              'Optional custom LensSliceSpec (includeStaging, macroBlocks, aestheticKeys, macroStateIds, dimensions, subStateTags, includeAllSubStates, includeResolvedCamera, includeTokenMappings, includeReferenceBindings, includeSceneTopology, includeTrailingResolution, diagnosticLenses, includeAllDiagnostics).',
            properties: {
              preset: {type: 'string', enum: lensPresetIds},
              includeStaging: {type: 'boolean'},
              macroBlocks: {type: 'array', items: {type: 'string'}},
              aestheticKeys: {type: 'array', items: {type: 'string'}},
              macroStateIds: {type: 'array', items: {type: 'string'}},
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
      description: getDefaultToolDescription('propose_script_patch'),
      parameters: patchSchema,
    },
    propose_text_replace: {
      type: 'function',
      name: 'propose_text_replace',
      description: getDefaultToolDescription('propose_text_replace'),
      parameters: sanitizeJsonSchemaForTool({
        type: 'object',
        properties: {
          expectedSnapshotHash: {
            type: 'string',
            description: 'Current script snapshotHash from Live Editor State or get_script_overview.',
          },
          summary: {
            type: 'string',
            description: 'Concise one-line summary of the staged text/regex replacement.',
          },
          replacements: {
            type: 'array',
            description: '1 to 20 ordered find-and-replace rules applied in one atomic pass.',
            items: {
              type: 'object',
              properties: {
                find: {
                  type: 'string',
                  description: 'Literal substring or regular expression pattern to find.',
                },
                replace: {
                  type: 'string',
                  description:
                    'Replacement text (supports $1/$& capture references when isRegex=true; treated literally when isRegex=false).',
                },
                isRegex: {
                  type: 'boolean',
                  description: 'Treat find as a JavaScript regular expression (defaults to false).',
                },
                caseSensitive: {
                  type: 'boolean',
                  description: 'Match case sensitively (defaults to true). Set false for case-insensitive matching.',
                },
                wholeWord: {
                  type: 'boolean',
                  description: 'Wrap pattern in word boundaries (\\b) to avoid partial-word matches.',
                },
                targetIds: {
                  type: 'array',
                  items: {type: 'string'},
                  description:
                    'Optional list of target IDs ("MB0", "AESTHETIC", "S3", "S4") to scope this replacement rule.',
                },
              },
              required: ['find', 'replace'],
            },
          },
        },
        required: ['expectedSnapshotHash', 'summary', 'replacements'],
      }) as Record<string, unknown>,
    },
    propose_script_draft: {
      type: 'function',
      name: 'propose_script_draft',
      description: getDefaultToolDescription('propose_script_draft'),
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
    propose_script_title: {
      type: 'function',
      name: 'propose_script_title',
      description: getDefaultToolDescription('propose_script_title'),
      parameters: sanitizeJsonSchemaForTool({
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Proposed scene title (non-empty, trimmed, 120 characters or fewer).',
          },
          rationale: {
            type: 'string',
            description: 'Optional concise one-sentence reason why this title fits the scene.',
          },
        },
        required: ['title'],
      }) as Record<string, unknown>,
    },
    report_audit_review: {
      type: 'function',
      name: 'report_audit_review',
      description: getDefaultToolDescription('report_audit_review'),
      parameters: reviewSchema,
    },
    ask_question: {
      type: 'function',
      name: 'ask_question',
      description: getDefaultToolDescription('ask_question'),
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
