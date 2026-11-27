import {
  AUDIT_LENS_PRESETS,
  AuteurLensPresetIdSchema,
  LensSliceSpecSchema,
  parseAuteurScript,
  sliceAuteurEnvelope,
  toAuteurEnvelope,
  type AuteurEnvelope,
  type AuteurLensPresetId,
  type AuteurLensSlice,
  type DerivedDiagnosticIR,
  type LensSliceSpec,
  type LintRuleOverrides,
  type SlicedMacroState,
  type StagingMacroBlockIR,
  type TokenMappingIR,
} from '../../../core/index.ts';
import {getLensAuditChecklist, type LensAuditChecklist} from '../../auteurKnowledge.ts';
import type {ScriptToolExecutionResult} from '../suggestions.ts';

function mergeStagingBlocks(slices: readonly AuteurLensSlice[]): StagingMacroBlockIR[] {
  const byId = new Map<string, StagingMacroBlockIR>();
  const orderedIds: string[] = [];

  for (const slice of slices) {
    for (const block of slice.stagingMacroBlocks) {
      const existing = byId.get(block.id);
      if (!existing) {
        orderedIds.push(block.id);
        byId.set(
          block.id,
          block.format === 'key_value'
            ? {...block, entries: block.entries.map((e) => ({...e}))}
            : {...block}
        );
        continue;
      }

      if (existing.format === 'key_value' && block.format === 'key_value') {
        const seenEntryIds = new Set(existing.entries.map((e) => e.id));
        for (const entry of block.entries) {
          if (!seenEntryIds.has(entry.id)) {
            seenEntryIds.add(entry.id);
            existing.entries.push({...entry});
          }
        }
      }
    }
  }

  return orderedIds.map((id) => byId.get(id)!);
}

function mergeMacroStates(
  envelope: AuteurEnvelope,
  slices: readonly AuteurLensSlice[]
): SlicedMacroState[] {
  const docSubOrderByStateId = new Map<string, Map<string, number>>();
  for (const ms of envelope.document.executionMacroBlock?.macroStates ?? []) {
    const subOrder = new Map<string, number>();
    ms.subStates.forEach((sub, idx) => subOrder.set(sub.id, idx));
    docSubOrderByStateId.set(ms.id, subOrder);
  }

  const byStateId = new Map<string, SlicedMacroState>();
  const stateOrder: string[] = [];
  for (const ms of envelope.document.executionMacroBlock?.macroStates ?? []) {
    stateOrder.push(ms.id);
  }

  for (const slice of slices) {
    for (const ms of slice.macroStates) {
      const existing = byStateId.get(ms.id);
      if (!existing) {
        byStateId.set(ms.id, {
          id: ms.id,
          ...(ms.resolvedCamera ? {resolvedCamera: ms.resolvedCamera} : {}),
          subStates: [...ms.subStates],
          ...(ms.endsOnDialogue !== undefined ? {endsOnDialogue: ms.endsOnDialogue} : {}),
        });
        continue;
      }

      if (!existing.resolvedCamera && ms.resolvedCamera) {
        existing.resolvedCamera = ms.resolvedCamera;
      }
      if (existing.endsOnDialogue === undefined && ms.endsOnDialogue !== undefined) {
        existing.endsOnDialogue = ms.endsOnDialogue;
      }

      const seenSubs = new Set(existing.subStates.map((s) => s.id));
      for (const sub of ms.subStates) {
        if (!seenSubs.has(sub.id)) {
          seenSubs.add(sub.id);
          existing.subStates.push(sub);
        }
      }

      const subOrder = docSubOrderByStateId.get(ms.id);
      if (subOrder) {
        existing.subStates.sort(
          (a, b) => (subOrder.get(a.id) ?? 0) - (subOrder.get(b.id) ?? 0)
        );
      }
    }
  }

  const merged: SlicedMacroState[] = [];
  for (const stateId of stateOrder) {
    const item = byStateId.get(stateId);
    if (item) merged.push(item);
  }
  return merged;
}

function mergeMultipleLensSlices(
  envelope: AuteurEnvelope,
  slices: readonly AuteurLensSlice[]
): AuteurLensSlice {
  const first = slices[0];
  const merged: AuteurLensSlice = {
    snapshotHash: first.snapshotHash,
    schemaVersion: first.schemaVersion,
    stagingMacroBlocks: mergeStagingBlocks(slices),
    macroStates: mergeMacroStates(envelope, slices),
  };

  for (const slice of slices) {
    if (slice.sceneTopology !== undefined && merged.sceneTopology === undefined) {
      merged.sceneTopology = slice.sceneTopology;
      merged.hasContinuationContext = slice.hasContinuationContext;
    }
    if (slice.referenceBindings && !merged.referenceBindings) {
      merged.referenceBindings = slice.referenceBindings;
    }
  }

  const tokenMappings: TokenMappingIR[] = [];
  const seenTokens = new Set<string>();
  let hasTokenMappings = false;
  for (const slice of slices) {
    if (!slice.tokenMappings) continue;
    hasTokenMappings = true;
    for (const tm of slice.tokenMappings) {
      if (!seenTokens.has(tm.token)) {
        seenTokens.add(tm.token);
        tokenMappings.push(tm);
      }
    }
  }
  if (hasTokenMappings) {
    merged.tokenMappings = tokenMappings;
  }

  const diagnostics: DerivedDiagnosticIR[] = [];
  const seenDiagIds = new Set<string>();
  let hasDiagnostics = false;
  for (const slice of slices) {
    if (!slice.diagnostics) continue;
    hasDiagnostics = true;
    for (const d of slice.diagnostics) {
      if (!seenDiagIds.has(d.id)) {
        seenDiagIds.add(d.id);
        diagnostics.push(d);
      }
    }
  }
  if (hasDiagnostics) {
    merged.diagnostics = diagnostics;
  }

  return merged;
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
    const renderedBeats = beatItems
      .map((item) => (annotateIds ? `${item.id}: ${item.text}` : item.text))
      .join('\n');
    sourceBlocks.push(`[${doc.execution.headerName}]\n${renderedBeats}`);
  } else if (!isFiltered && doc.execution && doc.execution.beats.length === 0) {
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
            repairHint: `Some requested targetIds were not found (${notFoundIds.join(', ')}). Omit targetIds to read the full script if needed.`,
          }
        : {}),
      sourceText,
    },
  };
}

export function runInspectLensSlice(
  args: Record<string, unknown>,
  rawText: string,
  ruleOverrides?: LintRuleOverrides
): ScriptToolExecutionResult {
  const hasSpecObject =
    args.spec !== undefined && typeof args.spec === 'object' && args.spec !== null;
  const rawPresetsArray = Array.isArray(args.presets) ? args.presets : [];
  const hasPreset = typeof args.preset === 'string' && args.preset.trim().length > 0;

  if (!hasSpecObject && (rawPresetsArray.length > 0 || hasPreset)) {
    const requestedPresetsRaw: unknown[] = [];
    if (hasPreset) requestedPresetsRaw.push(args.preset);
    for (const item of rawPresetsArray) {
      requestedPresetsRaw.push(item);
    }

    const resolvedPresets: AuteurLensPresetId[] = [];
    const seenPresets = new Set<AuteurLensPresetId>();
    for (const rawPreset of requestedPresetsRaw) {
      const parsed = AuteurLensPresetIdSchema.safeParse(rawPreset);
      if (!parsed.success) {
        return {
          ok: false,
          toolName: 'inspect_lens_slice',
          result: {
            ok: false,
            errors: parsed.error.issues.map((issue) => ({
              path: issue.path.join('.') || 'presets',
              message: issue.message,
            })),
            repairHint: `Use valid presets: ${Object.keys(AUDIT_LENS_PRESETS).join(', ')}.`,
          },
        };
      }
      if (!seenPresets.has(parsed.data)) {
        seenPresets.add(parsed.data);
        resolvedPresets.push(parsed.data);
      }
    }

    const overrideFields: Partial<LensSliceSpec> = {};
    if (typeof args.includeStaging === 'boolean') {
      overrideFields.includeStaging = args.includeStaging;
    }
    if (Array.isArray(args.macroStateIds)) {
      const validIds = args.macroStateIds
        .filter((id): id is string => typeof id === 'string')
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
      if (validIds.length > 0) {
        overrideFields.macroStateIds = validIds;
      }
    }

    const envelope = toAuteurEnvelope(rawText, ruleOverrides);
    const topology = envelope.derived.sceneTopology ?? 'empty';

    if (resolvedPresets.length === 1) {
      const presetId = resolvedPresets[0];
      const spec: LensSliceSpec = {
        ...AUDIT_LENS_PRESETS[presetId],
        ...overrideFields,
      };
      const slice = sliceAuteurEnvelope(envelope, spec);
      const checklist = getLensAuditChecklist(presetId, slice.sceneTopology ?? topology);
      return {
        ok: true,
        toolName: 'inspect_lens_slice',
        result: {
          ok: true,
          slice,
          checklist,
        },
      };
    }

    const individualSlices = resolvedPresets.map((presetId) =>
      sliceAuteurEnvelope(envelope, {
        ...AUDIT_LENS_PRESETS[presetId],
        ...overrideFields,
      })
    );
    const mergedSlice = mergeMultipleLensSlices(envelope, individualSlices);
    const checklists: LensAuditChecklist[] = resolvedPresets.map((presetId) =>
      getLensAuditChecklist(presetId, topology)
    );

    return {
      ok: true,
      toolName: 'inspect_lens_slice',
      result: {
        ok: true,
        presets: resolvedPresets,
        slice: mergedSlice,
        checklists,
      },
    };
  }

  // Backward-compatible fallback for custom LensSliceSpec callers
  const topLevelOverrideKeys = Object.keys(args).filter(
    (key) => key !== 'preset' && key !== 'presets' && key !== 'spec' && args[key] !== undefined
  );
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
        repairHint: `Provide preset or presets (${Object.keys(AUDIT_LENS_PRESETS).join(', ')}), optionally with macroStateIds or includeStaging.`,
      },
    };
  }

  const specOrPreset = parsedSpec.data.preset
    ? {...AUDIT_LENS_PRESETS[parsedSpec.data.preset], ...parsedSpec.data}
    : parsedSpec.data;

  const envelope = toAuteurEnvelope(rawText, ruleOverrides);
  const slice = sliceAuteurEnvelope(envelope, specOrPreset);
  const checklist = slice.preset
    ? getLensAuditChecklist(slice.preset, slice.sceneTopology ?? envelope.derived.sceneTopology ?? 'empty')
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
