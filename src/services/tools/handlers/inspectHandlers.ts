import {
  AUDIT_LENS_PRESETS,
  AuteurLensPresetIdSchema,
  LensSliceSpecSchema,
  parseAuteurScript,
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
  ruleOverrides?: LintRuleOverrides,
  sceneTitle?: string
): ScriptToolExecutionResult {
  const envelope = toAuteurEnvelope(rawText, ruleOverrides);
  const {document, derived} = envelope;
  const diagCounts = countBySeverity(derived.diagnostics);
  const beats = document.executionMacroBlock?.macroStates ?? [];
  const continuityById = new Map(
    derived.macroStateContinuity.map((item) => [item.macroStateId, item])
  );
  const normalizedTitle = sceneTitle?.trim() ? sceneTitle.trim() : null;

  return {
    ok: true,
    toolName: 'get_script_overview',
    result: {
      ok: true,
      sceneTitle: normalizedTitle,
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

interface AnnotatedStagingSection {
  id: string;
  phase: 'staging';
  header: string;
  text: string;
}

interface AnnotatedExecutionSection {
  id: string;
  phase: 'execution';
  header: string;
  macroStates: Array<{id: string; text: string}>;
}

export function runGetScriptSource(
  args: Record<string, unknown>,
  rawText: string,
  ruleOverrides?: LintRuleOverrides,
  sceneTitle?: string
): ScriptToolExecutionResult {
  const envelope = toAuteurEnvelope(rawText, ruleOverrides);
  const doc = parseAuteurScript(rawText);
  const annotateIds = args.annotateIds !== false;
  const normalizedTitle = sceneTitle?.trim() ? sceneTitle.trim() : null;

  const rawTargetIds = Array.isArray(args.targetIds)
    ? args.targetIds
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : [];

  const isFiltered = rawTargetIds.length > 0;
  const selectedStagingIndices = new Set<number>();
  const selectedBeatIndices = new Set<number>();
  const notFoundIds: string[] = [];

  if (!isFiltered) {
    doc.stagingBlocks.forEach((_, idx) => selectedStagingIndices.add(idx));
    (doc.execution?.beats ?? []).forEach((beat) => selectedBeatIndices.add(beat.index));
  } else {
    const execHeaderUpper = doc.execution?.headerName.trim().toUpperCase() ?? 'EXECUTION';

    for (const rawId of rawTargetIds) {
      const cleaned = rawId.replace(/^\[|\]$/g, '').trim();
      const upper = cleaned.toUpperCase();

      const mbMatch = /^MB(\d+)(?:\.\d+)?$/.exec(upper);
      if (mbMatch) {
        const blockIdx = Number.parseInt(mbMatch[1], 10);
        if (blockIdx >= 0 && blockIdx < doc.stagingBlocks.length) {
          selectedStagingIndices.add(blockIdx);
        } else {
          notFoundIds.push(rawId);
        }
        continue;
      }

      const stateMatch = /^S(\d+)(?:\.\d+)?$/.exec(upper);
      if (stateMatch) {
        const beatIdx = Number.parseInt(stateMatch[1], 10);
        const foundBeat = doc.execution?.beats.find((b) => b.index === beatIdx);
        if (foundBeat) {
          selectedBeatIndices.add(foundBeat.index);
        } else {
          notFoundIds.push(rawId);
        }
        continue;
      }

      if (upper === 'EXECUTION' || upper === execHeaderUpper) {
        if (doc.execution) {
          for (const beat of doc.execution.beats) {
            selectedBeatIndices.add(beat.index);
          }
        } else {
          notFoundIds.push(rawId);
        }
        continue;
      }

      let matchedHeader = false;
      doc.stagingBlocks.forEach((block, idx) => {
        if (
          block.name.trim().toUpperCase() === upper ||
          block.kind.trim().toUpperCase() === upper
        ) {
          selectedStagingIndices.add(idx);
          matchedHeader = true;
        }
      });

      if (!matchedHeader) {
        notFoundIds.push(rawId);
      }
    }

    if (selectedStagingIndices.size === 0 && selectedBeatIndices.size === 0) {
      const validIds = [
        ...doc.stagingBlocks.map((b, i) => `MB${i} ([${b.name}])`),
        ...(doc.execution?.beats.map((b) => `S${b.index}`) ?? []),
      ];
      return {
        ok: false,
        toolName: 'get_script_source',
        result: {
          ok: false,
          snapshotHash: envelope.snapshotHash,
          notFoundIds,
          error: `None of the requested targetIds matched the current script: ${notFoundIds.join(', ')}.`,
          repairHint:
            validIds.length > 0
              ? `Use valid IDs from the current script (${validIds.slice(0, 16).join(', ')}${validIds.length > 16 ? ', ...' : ''}) or omit targetIds to read the full script.`
              : 'The current script is empty. Omit targetIds or draft a script first.',
        },
      };
    }
  }

  const annotatedSections: Array<AnnotatedStagingSection | AnnotatedExecutionSection> = [];
  const sourceBlocks: string[] = [];
  const matchedIds: string[] = [];

  if (!isFiltered) {
    const trimmedPreamble = [...doc.preambleLines];
    while (trimmedPreamble.length > 0 && trimmedPreamble[trimmedPreamble.length - 1].trim() === '') {
      trimmedPreamble.pop();
    }
    if (trimmedPreamble.length > 0) {
      sourceBlocks.push(trimmedPreamble.join('\n'));
    }
  }

  doc.stagingBlocks.forEach((block, idx) => {
    if (!selectedStagingIndices.has(idx)) return;
    const id = `MB${idx}`;
    matchedIds.push(id);
    const body = block.rawBody.replace(/\n+$/, '');
    const canonicalSection = body.length > 0 ? `[${block.name}]\n${body}` : `[${block.name}]`;
    annotatedSections.push({
      id,
      phase: 'staging',
      header: block.name,
      text: canonicalSection,
    });
    sourceBlocks.push(annotateIds ? `# ${id}\n${canonicalSection}` : canonicalSection);
  });

  if (doc.execution && selectedBeatIndices.size > 0) {
    const selectedBeats = doc.execution.beats.filter((beat) =>
      selectedBeatIndices.has(beat.index)
    );
    const beatItems = selectedBeats.map((beat) => {
      const id = `S${beat.index}`;
      matchedIds.push(id);
      return {id, text: beat.raw};
    });
    annotatedSections.push({
      id: doc.execution.headerName,
      phase: 'execution',
      header: doc.execution.headerName,
      macroStates: beatItems,
    });
    const renderedBeats = beatItems
      .map((item) => (annotateIds ? `${item.id}: ${item.text}` : item.text))
      .join('\n');
    sourceBlocks.push(`[${doc.execution.headerName}]\n${renderedBeats}`);
  } else if (!isFiltered && doc.execution && doc.execution.beats.length === 0) {
    annotatedSections.push({
      id: doc.execution.headerName,
      phase: 'execution',
      header: doc.execution.headerName,
      macroStates: [],
    });
    sourceBlocks.push(`[${doc.execution.headerName}]`);
  }

  const sourceText = !isFiltered && !annotateIds ? doc.raw : sourceBlocks.join('\n\n');

  return {
    ok: true,
    toolName: 'get_script_source',
    result: {
      ok: true,
      snapshotHash: envelope.snapshotHash,
      sceneTitle: normalizedTitle,
      filtered: isFiltered,
      totalChars: sourceText.length,
      ...(isFiltered ? {matchedIds} : {}),
      ...(notFoundIds.length > 0
        ? {
            notFoundIds,
            repairHint: `Some requested targetIds were not found (${notFoundIds.join(', ')}). Call get_script_overview if you need the complete list of IDs.`,
          }
        : {}),
      sourceText,
      annotatedSections,
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
  const topLevelOverrideKeys = Object.keys(args).filter(
    (key) => key !== 'preset' && key !== 'spec' && args[key] !== undefined
  );

  let specOrPreset: LensSliceSpec | AuteurLensPresetId;

  if (hasPreset && !hasSpecObject && topLevelOverrideKeys.length === 0) {
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
      : {};
    for (const key of topLevelOverrideKeys) {
      if (candidateSpec[key] === undefined) {
        candidateSpec[key] = args[key];
      }
    }
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
            'Provide a valid preset ID or valid LensSliceSpec fields (includeStaging, macroBlocks, macroStateIds, dimensions, subStateTags, includeResolvedCamera, etc.).',
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
