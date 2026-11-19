import {toAuteurEnvelope} from './ir.ts';
import {
  AuteurReviewSchema,
  type AuteurEnvelope,
  type AuteurLensPresetId,
  type AuteurReview,
  type DerivedDiagnosticIR,
  type LensSliceSpec,
  type ReferenceBindingIR,
  type SceneTopology,
  type StagingMacroBlockIR,
  type SubStateIR,
  type TokenMappingIR,
} from './irSchemas.ts';
import type {CameraTransitionKind} from './types.ts';

export interface ResolvedCameraContext {
  subStateTag: 'CAM';
  identifier: string | null;
  transition: CameraTransitionKind;
  currentDescriptor: string;
  effectiveFraming: string;
}

export interface SlicedMacroState {
  id: string;
  resolvedCamera?: ResolvedCameraContext;
  subStates: SubStateIR[];
  endsOnDialogue?: boolean;
}

export interface AuteurLensSlice {
  snapshotHash: string;
  schemaVersion: string;
  preset?: AuteurLensPresetId;
  sceneTopology?: SceneTopology;
  hasContinuationContext?: boolean;
  stagingMacroBlocks: StagingMacroBlockIR[];
  referenceBindings?: ReferenceBindingIR[];
  tokenMappings?: TokenMappingIR[];
  macroStates: SlicedMacroState[];
  diagnostics?: DerivedDiagnosticIR[];
}

/**
 * Five built-in Script Supervisor Audit Lens presets aligned with docs/GLOSSARY.md.
 */
export const AUDIT_LENS_PRESETS: Record<AuteurLensPresetId, LensSliceSpec> = {
  lens1_spatial_optics: {
    preset: 'lens1_spatial_optics',
    macroBlocks: ['LOGIC', 'OPENING', 'CONTINUITY PROTOCOL'],
    dimensions: ['camera', 'block', 'action'],
    includeResolvedCamera: true,
    includeTokenMappings: 'referenced',
    includeSceneTopology: true,
    diagnosticLenses: ['Lens 1: Spatial & Optics'],
  },
  lens2_temporal_pacing_wear: {
    preset: 'lens2_temporal_pacing_wear',
    macroBlocks: ['INTENT', 'LOGIC', 'OPENING'],
    dimensions: ['action', 'state_boundary'],
    subStateTags: ['SPEED'],
    includeResolvedCamera: true,
    includeSceneTopology: true,
    diagnosticLenses: ['Lens 2: Temporal, Pacing & Wear'],
  },
  lens3_props_inventory: {
    preset: 'lens3_props_inventory',
    macroBlocks: ['LOGIC', 'OPENING', 'AESTHETIC'],
    aestheticKeys: ['Wardrobe', 'Location'],
    dimensions: ['action'],
    subStateTags: ['PROP'],
    includeResolvedCamera: true,
    diagnosticLenses: ['Lens 3: Props & Inventory'],
  },
  lens4_acoustics_voice: {
    preset: 'lens4_acoustics_voice',
    macroBlocks: ['AESTHETIC'],
    aestheticKeys: ['Audio'],
    dimensions: ['dialogue', 'foley', 'score'],
    includeReferenceBindings: true,
    includeTrailingResolution: true,
    diagnosticLenses: ['Lens 4: Acoustics & Voice'],
  },
  lens5_blocks_grammar: {
    preset: 'lens5_blocks_grammar',
    includeAllSubStates: true,
    includeResolvedCamera: true,
    includeTokenMappings: 'all',
    includeReferenceBindings: true,
    includeSceneTopology: true,
    includeAllDiagnostics: true,
  },
};

function matchesSubStateFilter(sub: SubStateIR, spec: LensSliceSpec): boolean {
  if (spec.includeAllSubStates) return true;

  const hasDimensionFilter = Boolean(spec.dimensions && spec.dimensions.length > 0);
  const hasTagFilter = Boolean(spec.subStateTags && spec.subStateTags.length > 0);

  if (!hasDimensionFilter && !hasTagFilter) {
    return true;
  }

  if (hasDimensionFilter && spec.dimensions!.includes(sub.dimension)) {
    return true;
  }

  if (hasTagFilter && 'subStateTag' in sub) {
    const tagSet = new Set(spec.subStateTags!.map((t) => t.trim().toUpperCase()));
    if (tagSet.has(sub.subStateTag.trim().toUpperCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Produces a focused, low-noise JSON slice of an AuteurEnvelope for automated Script Supervisor
 * evaluation (e.g. isolating [ACT] against deterministically resolved [CAM] framing).
 */
export function sliceAuteurEnvelope(
  envelope: AuteurEnvelope,
  spec: LensSliceSpec
): AuteurLensSlice {
  const macroBlockFilter = spec.macroBlocks
    ? new Set(spec.macroBlocks.map((m) => m.trim().toUpperCase()))
    : null;
  const aestheticKeyFilter = spec.aestheticKeys
    ? new Set(spec.aestheticKeys.map((k) => k.trim().toLowerCase()))
    : null;

  const stagingMacroBlocks: StagingMacroBlockIR[] = [];

  for (const block of envelope.document.stagingMacroBlocks) {
    const includedByBlock =
      macroBlockFilter === null ||
      macroBlockFilter.has(block.header.toUpperCase()) ||
      macroBlockFilter.has(block.kind.toUpperCase());

    const includedByAestheticKeys =
      block.format === 'key_value' && aestheticKeyFilter !== null && macroBlockFilter === null;

    if (!includedByBlock && !includedByAestheticKeys) continue;

    if (block.format === 'key_value' && aestheticKeyFilter !== null) {
      const filteredEntries = block.entries.filter(
        (entry) => entry.key !== null && aestheticKeyFilter.has(entry.key.trim().toLowerCase())
      );
      if (filteredEntries.length > 0) {
        stagingMacroBlocks.push({
          ...block,
          entries: filteredEntries,
        });
      }
    } else {
      stagingMacroBlocks.push(block);
    }
  }

  const continuityById = new Map(
    envelope.derived.macroStateContinuity.map((c) => [c.macroStateId, c])
  );
  const referencedTokenSet = new Set<string>();

  const macroStates: SlicedMacroState[] = (envelope.document.executionMacroBlock?.macroStates ?? []).map(
    (ms) => {
      const cont = continuityById.get(ms.id);
      if (cont) {
        for (const token of cont.referencedTokens) {
          referencedTokenSet.add(token);
        }
      }

      const filteredSubStates = ms.subStates.filter((sub) => matchesSubStateFilter(sub, spec));
      const lastSub = ms.subStates[ms.subStates.length - 1];

      const sliced: SlicedMacroState = {
        id: ms.id,
        subStates: filteredSubStates,
      };

      if (spec.includeResolvedCamera && cont) {
        sliced.resolvedCamera = {
          subStateTag: 'CAM',
          identifier: cont.activeCameraIdentifier,
          transition: cont.cameraTransition,
          currentDescriptor: cont.currentDescriptor,
          effectiveFraming: cont.effectiveFraming,
        };
      }

      if (spec.includeTrailingResolution) {
        sliced.endsOnDialogue = lastSub?.dimension === 'dialogue';
      }

      return sliced;
    }
  );

  const result: AuteurLensSlice = {
    snapshotHash: envelope.snapshotHash,
    schemaVersion: envelope.document.schemaVersion,
    ...(spec.preset ? {preset: spec.preset} : {}),
    stagingMacroBlocks,
    macroStates,
  };

  if (spec.includeSceneTopology) {
    result.sceneTopology = envelope.derived.sceneTopology;
    result.hasContinuationContext = envelope.derived.hasContinuationContext;
  }

  if (spec.includeReferenceBindings) {
    result.referenceBindings = envelope.derived.referenceBindings;
  }

  if (spec.includeTokenMappings) {
    if (spec.includeTokenMappings === 'referenced') {
      result.tokenMappings = envelope.derived.tokenMappings.filter((tm) =>
        referencedTokenSet.has(tm.token)
      );
    } else {
      result.tokenMappings = envelope.derived.tokenMappings;
    }
  }

  if (spec.includeAllDiagnostics) {
    result.diagnostics = envelope.derived.diagnostics;
  } else if (spec.diagnosticLenses && spec.diagnosticLenses.length > 0) {
    const lensSet = new Set(spec.diagnosticLenses);
    result.diagnostics = envelope.derived.diagnostics.filter((d) => lensSet.has(d.lens));
  }

  return result;
}

/**
 * Convenience entry point: slices canonical plain text using either a built-in Audit Lens preset
 * or a custom composable LensSliceSpec.
 */
export function sliceAuteurScript(
  rawText: string,
  specOrPreset: LensSliceSpec | AuteurLensPresetId
): AuteurLensSlice {
  const envelope = toAuteurEnvelope(rawText);
  const spec = typeof specOrPreset === 'string' ? AUDIT_LENS_PRESETS[specOrPreset] : specOrPreset;
  return sliceAuteurEnvelope(envelope, spec);
}

export type ValidateReviewResult =
  | {ok: true; review: AuteurReview}
  | {ok: false; errors: Array<{path: string; message: string}>};

/**
 * Validates an AI Script Supervisor review payload (including any embedded suggestedPatch objects).
 */
export function validateAuteurReview(input: unknown): ValidateReviewResult {
  const parsed = AuteurReviewSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }
  return {ok: true, review: parsed.data};
}
