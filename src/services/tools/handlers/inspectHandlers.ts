import {
  AUDIT_LENS_PRESETS,
  AuteurLensPresetIdSchema,
  LensSliceSpecSchema,
  sliceAuteurEnvelope,
  toAuteurEnvelope,
  type AuteurLensPresetId,
  type LensSliceSpec,
  type LintRuleOverrides,
} from '../../../core/index.ts';
import {getLensAuditChecklist} from '../../auteurKnowledge.ts';
import {countBySeverity, type ScriptToolExecutionResult} from '../suggestions.ts';

export function runGetScriptOverview(
  rawText: string,
  ruleOverrides?: LintRuleOverrides
): ScriptToolExecutionResult {
  const envelope = toAuteurEnvelope(rawText, ruleOverrides);
  const {document, derived} = envelope;
  const diagCounts = countBySeverity(derived.diagnostics);
  const beats = document.executionMacroBlock?.macroStates ?? [];
  const continuityById = new Map(
    derived.macroStateContinuity.map((item) => [item.macroStateId, item])
  );

  return {
    ok: true,
    toolName: 'get_script_overview',
    result: {
      ok: true,
      snapshotHash: envelope.snapshotHash,
      schemaVersion: document.schemaVersion,
      sceneTopology: derived.sceneTopology,
      hasContinuationContext: derived.hasContinuationContext,
      stagingMacroBlocks: document.stagingMacroBlocks.map((block) =>
        block.format === 'key_value'
          ? {
              id: block.id,
              header: block.header,
              kind: block.kind,
              format: block.format,
              entryCount: block.entries.length,
              keys: block.entries
                .map((e) => e.key)
                .filter((k): k is string => k !== null),
            }
          : {
              id: block.id,
              header: block.header,
              kind: block.kind,
              format: block.format,
              charCount: block.body.length,
            }
      ),
      executionHeader: document.executionMacroBlock?.header ?? null,
      macroStateCount: beats.length,
      macroStates: beats.map((ms) => {
        const cont = continuityById.get(ms.id);
        return {
          id: ms.id,
          subStateCount: ms.subStates.length,
          activeCameraIdentifier: cont?.activeCameraIdentifier ?? null,
          cameraTransition: cont?.cameraTransition ?? 'NONE',
        };
      }),
      cameraSlots: derived.cameraSlots,
      referenceBindingCount: derived.referenceBindings.length,
      tokenMappingCount: derived.tokenMappings.length,
      diagnosticsSummary: {
        total: derived.diagnostics.length,
        errors: diagCounts.errors,
        warnings: diagCounts.warnings,
      },
      diagnostics: derived.diagnostics.map((d) => ({
        id: d.id,
        ruleId: d.ruleId,
        lens: d.lens,
        severity: d.severity,
        targetId: d.targetId,
        message: d.message,
        repairHint: d.repairHint,
      })),
    },
  };
}

export function runInspectLensSlice(
  args: Record<string, unknown>,
  rawText: string,
  ruleOverrides?: LintRuleOverrides
): ScriptToolExecutionResult {
  const hasPreset = typeof args.preset === 'string' && args.preset.trim().length > 0;
  const hasSpecObject =
    args.spec !== undefined && typeof args.spec === 'object' && args.spec !== null;

  let specOrPreset: LensSliceSpec | AuteurLensPresetId;

  if (hasPreset && !hasSpecObject) {
    const parsedPreset = AuteurLensPresetIdSchema.safeParse(args.preset);
    if (!parsedPreset.success) {
      return {
        ok: false,
        toolName: 'inspect_lens_slice',
        result: {
          ok: false,
          errors: parsedPreset.error.issues.map((issue) => ({
            path: issue.path.join('.') || 'preset',
            message: issue.message,
          })),
          repairHint: `Use one of the valid presets: ${Object.keys(AUDIT_LENS_PRESETS).join(', ')}, or pass a custom spec object.`,
        },
      };
    }
    specOrPreset = parsedPreset.data;
  } else {
    const candidateSpec: Record<string, unknown> = hasSpecObject
      ? {...(args.spec as Record<string, unknown>)}
      : {...args};
    if (hasPreset && candidateSpec.preset === undefined) {
      candidateSpec.preset = args.preset;
    }

    const parsedSpec = LensSliceSpecSchema.safeParse(candidateSpec);
    if (!parsedSpec.success) {
      return {
        ok: false,
        toolName: 'inspect_lens_slice',
        result: {
          ok: false,
          errors: parsedSpec.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
          repairHint:
            'Provide a valid preset ID or valid LensSliceSpec fields (macroBlocks, dimensions, subStateTags, includeResolvedCamera, etc.).',
        },
      };
    }

    // If caller combined preset with custom overrides, merge base preset with overrides
    if (parsedSpec.data.preset) {
      specOrPreset = {
        ...AUDIT_LENS_PRESETS[parsedSpec.data.preset],
        ...parsedSpec.data,
      };
    } else {
      specOrPreset = parsedSpec.data;
    }
  }

  const envelope = toAuteurEnvelope(rawText, ruleOverrides);
  const resolvedSpec: LensSliceSpec =
    typeof specOrPreset === 'string' ? AUDIT_LENS_PRESETS[specOrPreset] : specOrPreset;
  const slice = sliceAuteurEnvelope(envelope, resolvedSpec);
  const resolvedPreset = slice.preset;
  const checklist = resolvedPreset
    ? getLensAuditChecklist(
        resolvedPreset,
        slice.sceneTopology ?? envelope.derived.sceneTopology ?? 'empty'
      )
    : undefined;

  return {
    ok: true,
    toolName: 'inspect_lens_slice',
    result: {
      ok: true,
      slice,
      ...(checklist ? {checklist} : {}),
    },
  };
}
