import {extractMetadata} from './extractor.ts';
import type {
  AuteurDocument,
  ExtractedMetadata,
  LintDiagnostic,
  LintRuleDefinition,
  LintRuleId,
  LintRuleOverrides,
} from './types.ts';

const BANNED_THEATRICAL_COORD_REGEX = /\bstage-(left|right)\b/gi;

const ALLOWED_REF_STAGING_BLOCKS = new Set([
  'INTENT',
  'GOAL',
  'CHARACTERS',
  'REFERENCES',
  'CONTINUITY PROTOCOL',
  'UNUSED MATERIALS',
]);

const MULTIMODAL_REF_REGEX = /(?<![A-Za-z0-9._%+-])@[A-Za-z0-9_-]+/g;

const OPENING_TAG_REGEX = /\[([A-Za-z0-9 _-]+)\]/g;

const STATIC_SHOT_SCALE_REGEX =
  /\b(?:EWS|WS|FS|MWS|MLS|MS|MCU|CU|ECU|OTS|POV|INS|two-shot|low-angle|high-angle)\b/i;

const OPERATOR_MOTION_REGEX =
  /\b(?:PAN|PANNING|TILT|TILTING|CRANE|CRANING|TRACK|TRACKING|DOLLY|DOLLYING|PUSH|PUSHING|PULL|PULLING|ARC|ARCING|BOOM|BOOMING|WHIP|SWING|SWINGING|DRIFT|DRIFTING|GLIDE|GLIDING|ORBIT|ORBITING|PEDESTAL|ZOOM|ZOOMING|FOLLOW|FOLLOWING|SLIDE|SLIDING|MOVE|MOVING)\b/i;

/**
 * Rule 1 — Viewport Coordinate Purity (Lens 1: Spatial & Optics)
 * Flags banned theatrical proscenium terms (stage-left / stage-right)
 * in [LOGIC], [OPENING], or [EXECUTION].
 */
export function lintViewportCoordinates(doc: AuteurDocument): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];

  doc.stagingBlocks.forEach((block, blockIndex) => {
    if (block.kind !== 'LOGIC' && block.kind !== 'OPENING') return;

    block.lines.forEach((line, offset) => {
      BANNED_THEATRICAL_COORD_REGEX.lastIndex = 0;
      const matches = [...line.matchAll(BANNED_THEATRICAL_COORD_REGEX)];
      if (matches.length === 0) return;

      const terms = [...new Set(matches.map((m) => m[0]))].join(', ');
      const lineIndex = block.contentStartLine + offset;
      diagnostics.push({
        id: `viewport-staging-${blockIndex}-${lineIndex}`,
        ruleId: 'viewport-coordinate-purity',
        ruleName: 'Viewport Coordinate Purity',
        lens: 'Lens 1: Spatial & Optics',
        severity: 'error',
        message: `Banned theatrical term (${terms}) found in [${block.name}]. Theatrical directions invert viewer screen space.`,
        repairHint:
          'Replace stage-left / stage-right with camera-viewport coordinates (frame-left / frame-right or screen-left / screen-right).',
        target: {
          phase: 'staging',
          blockIndex,
          blockName: block.name,
          lineIndex,
        },
        excerpt: terms,
      });
    });
  });

  if (doc.execution) {
    for (const beat of doc.execution.beats) {
      BANNED_THEATRICAL_COORD_REGEX.lastIndex = 0;
      const matches = [...beat.raw.matchAll(BANNED_THEATRICAL_COORD_REGEX)];
      if (matches.length === 0) continue;

      const terms = [...new Set(matches.map((m) => m[0]))].join(', ');
      diagnostics.push({
        id: `viewport-exec-${beat.index}`,
        ruleId: 'viewport-coordinate-purity',
        ruleName: 'Viewport Coordinate Purity',
        lens: 'Lens 1: Spatial & Optics',
        severity: 'error',
        message: `Banned theatrical term (${terms}) found in S${beat.index}. Theatrical directions cause 50/50 horizontal axis flips.`,
        repairHint:
          'Replace stage-left / stage-right with frame-left / frame-right (or screen-left / screen-right) and separate position from facing orientation.',
        target: {
          phase: 'execution',
          beatIndex: beat.index,
          lineIndex: beat.lineIndex,
        },
        excerpt: terms,
      });
    }
  }

  return diagnostics;
}

/**
 * Rule 2 — Macro-State Resolution Discipline (Lens 4: Acoustics & Voice)
 * Flags any [EXECUTION] Macro-State whose final non-empty Sub-State is spoken {dialogue}.
 */
export function lintMacroStateResolution(doc: AuteurDocument): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];
  if (!doc.execution) return diagnostics;

  for (const beat of doc.execution.beats) {
    if (beat.subStates.length === 0) continue;
    const last = beat.subStates[beat.subStates.length - 1];

    if (last.kind === 'dialogue') {
      diagnostics.push({
        id: `dialogue-resolution-${beat.index}`,
        ruleId: 'macro-state-resolution',
        ruleName: 'Macro-State Resolution Discipline',
        lens: 'Lens 4: Acoustics & Voice',
        severity: 'warning',
        message: `S${beat.index} terminates on spoken dialogue (${last.dialogue?.speaker ?? 'Speaker'}).`,
        repairHint:
          'Chain an immediate physical follow-through in [ACT] or an acoustic trigger <sound> after the spoken line so the beat never ends on dialogue.',
        target: {
          phase: 'execution',
          beatIndex: beat.index,
          lineIndex: beat.lineIndex,
        },
        excerpt: last.raw,
      });
    }
  }

  return diagnostics;
}

/**
 * Rule 3 — Multimodal Reference Isolation (Lens 5: Blocks & Grammar)
 * Flags @ref tokens outside [INTENT], [CHARACTERS], [REFERENCES],
 * [CONTINUITY PROTOCOL], [GOAL], or [UNUSED MATERIALS].
 *
 * Defaults:
 * - Phase 1 Staging blocks ([LOGIC], [AESTHETIC], [OPENING], custom blocks): soft `warning`
 *   (rule of thumb recommending [INTENT] / [CHARACTERS] / [REFERENCES]).
 * - Phase 2 [EXECUTION] beats: `error`.
 */
export function lintMultimodalReferenceIsolation(doc: AuteurDocument): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];

  doc.stagingBlocks.forEach((block, blockIndex) => {
    const upperName = block.name.toUpperCase();
    if (ALLOWED_REF_STAGING_BLOCKS.has(upperName) || block.kind === 'CONTINUITY PROTOCOL') {
      return;
    }

    block.lines.forEach((line, offset) => {
      MULTIMODAL_REF_REGEX.lastIndex = 0;
      const matches = [...line.matchAll(MULTIMODAL_REF_REGEX)];
      if (matches.length === 0) return;

      const refs = [...new Set(matches.map((m) => m[0]))].join(', ');
      const lineIndex = block.contentStartLine + offset;
      diagnostics.push({
        id: `ref-isolation-staging-${blockIndex}-${lineIndex}`,
        ruleId: 'multimodal-reference-isolation',
        ruleName: 'Multimodal Reference Isolation',
        lens: 'Lens 5: Blocks & Grammar',
        severity: 'warning',
        message: `Reference tag (${refs}) used in [${block.name}]. As a rule of thumb, keep @ref declarations in [INTENT], [CHARACTERS], or [REFERENCES].`,
        repairHint:
          'Declare @reference bindings in [INTENT], [CHARACTERS], [REFERENCES], or [CONTINUITY PROTOCOL], then use canonical character names in other Staging blocks.',
        target: {
          phase: 'staging',
          blockIndex,
          blockName: block.name,
          lineIndex,
        },
        excerpt: refs,
      });
    });
  });

  if (doc.execution) {
    for (const beat of doc.execution.beats) {
      MULTIMODAL_REF_REGEX.lastIndex = 0;
      const matches = [...beat.raw.matchAll(MULTIMODAL_REF_REGEX)];
      if (matches.length === 0) continue;

      const refs = [...new Set(matches.map((m) => m[0]))].join(', ');
      diagnostics.push({
        id: `ref-isolation-exec-${beat.index}`,
        ruleId: 'multimodal-reference-isolation',
        ruleName: 'Multimodal Reference Isolation',
        lens: 'Lens 5: Blocks & Grammar',
        severity: 'error',
        message: `Reference tag (${refs}) leaked into Execution beat S${beat.index}.`,
        repairHint:
          'Replace @reference tokens in [EXECUTION] with the established character name declared in [INTENT] or [CHARACTERS].',
        target: {
          phase: 'execution',
          beatIndex: beat.index,
          lineIndex: beat.lineIndex,
        },
        excerpt: refs,
      });
    }
  }

  return diagnostics;
}

/**
 * Rule 4 — Frozen First-Frame Purity (Lens 5: Blocks & Grammar)
 * Flags any square-bracketed [TAG] token inside [OPENING].
 */
export function lintFrozenFirstFrame(doc: AuteurDocument): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];

  doc.stagingBlocks.forEach((block, blockIndex) => {
    if (block.kind !== 'OPENING') return;

    block.lines.forEach((line, offset) => {
      OPENING_TAG_REGEX.lastIndex = 0;
      const matches = [...line.matchAll(OPENING_TAG_REGEX)];
      if (matches.length === 0) return;

      const tags = [...new Set(matches.map((m) => m[0]))].join(', ');
      const lineIndex = block.contentStartLine + offset;
      diagnostics.push({
        id: `opening-tag-${blockIndex}-${lineIndex}`,
        ruleId: 'frozen-first-frame-purity',
        ruleName: 'Frozen First-Frame Purity',
        lens: 'Lens 5: Blocks & Grammar',
        severity: 'error',
        message: `Square-bracketed tag (${tags}) found inside [OPENING].`,
        repairHint:
          'Remove all bracketed tags from [OPENING] and describe the frozen t=0 still canvas in 2–4 sentences of plain prose.',
        target: {
          phase: 'staging',
          blockIndex,
          blockName: block.name,
          lineIndex,
        },
        excerpt: tags,
      });
    });
  });

  return diagnostics;
}

/**
 * Rule 5 — Camera Re-Definition & Oner Jump-Cut Guard (Lens 1: Spatial & Optics)
 * Tracks declared numbered camera slots ([CAM 01], [CAM 02], ...) and flags when
 * a previously defined slot re-declares a static shot-scale token on a subsequent
 * beat without an operator motion transition.
 *
 * Bare holds/recalls ([CAM 01] ->) and operator transitions ([CAM 01] PAN LEFT ->)
 * are valid and never flagged. In continuation scripts ([CONTINUITY PROTOCOL] or @video1),
 * the first appearance of each [CAM XX] slot in [EXECUTION] is explicitly allowed.
 */
export function lintCameraRedefinition(
  doc: AuteurDocument,
  metadata?: ExtractedMetadata
): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];
  if (!doc.execution) return diagnostics;

  const meta = metadata ?? extractMetadata(doc);
  const declaredSlots = new Map<string, number>();

  for (const beat of doc.execution.beats) {
    for (const sub of beat.subStates) {
      if (sub.kind !== 'camera' || !sub.camera || !sub.camera.isNumbered || !sub.camera.slot) {
        continue;
      }

      const {slot, descriptor} = sub.camera;

      if (!declaredSlots.has(slot)) {
        // First appearance in [EXECUTION]: establish slot (also satisfies continuation first-appearance exception)
        declaredSlots.set(slot, beat.index);
        continue;
      }

      // Bare hold or recall ([CAM 01] ->) is always valid
      if (descriptor.length === 0) {
        continue;
      }

      // Operator motion transition ([CAM 01] PAN LEFT ->, CRANING DOWN ->, etc.) is valid
      if (OPERATOR_MOTION_REGEX.test(descriptor)) {
        continue;
      }

      // Static shot-scale re-declaration on an already-established camera slot risks jump-cut / drift
      const scaleMatch = STATIC_SHOT_SCALE_REGEX.exec(descriptor);
      if (scaleMatch) {
        const firstBeat = declaredSlots.get(slot);
        diagnostics.push({
          id: `camera-redef-${beat.index}-${slot.replace(/\s+/g, '')}`,
          ruleId: 'camera-redefinition-guard',
          ruleName: 'Camera Re-Definition & Oner Jump-Cut Guard',
          lens: 'Lens 1: Spatial & Optics',
          severity: 'warning',
          message: `[${slot}] re-declares static framing "${scaleMatch[0]}" in S${beat.index} (already established in S${firstBeat}).${meta.hasContinuationContext ? ' Subsequent re-definitions within the same clip still trigger drift.' : ''}`,
          repairHint: `Use a bare recall ([${slot}] ->) to hold/return to this setup, an operator move ([${slot}] PAN / CRANING / TRACKING ->) to reframe continuously, or cut to a new camera slot.`,
          target: {
            phase: 'execution',
            beatIndex: beat.index,
            lineIndex: beat.lineIndex,
          },
          excerpt: sub.raw,
        });
      }
    }
  }

  return diagnostics;
}

/**
 * Declarative catalog of all deterministic Script Supervisor linter rules.
 * Adding, refining, or reordering rules happens here so lintDocument() and UI toggles stay in sync.
 */
export const LINT_RULE_REGISTRY: readonly LintRuleDefinition[] = [
  {
    id: 'viewport-coordinate-purity',
    name: 'Viewport Coordinate Purity',
    lens: 'Lens 1: Spatial & Optics',
    defaultSeverity: 'error',
    description:
      'Flags theatrical stage-left / stage-right terms in [LOGIC], [OPENING], and [EXECUTION].',
    run: (doc) => lintViewportCoordinates(doc),
  },
  {
    id: 'camera-redefinition-guard',
    name: 'Camera Re-Definition Guard',
    lens: 'Lens 1: Spatial & Optics',
    defaultSeverity: 'warning',
    description:
      'Flags established [CAM XX] slots re-declaring static shot scales without an operator move.',
    run: (doc, metadata) => lintCameraRedefinition(doc, metadata),
  },
  {
    id: 'macro-state-resolution',
    name: 'Macro-State Resolution',
    lens: 'Lens 4: Acoustics & Voice',
    defaultSeverity: 'warning',
    description:
      'Flags [EXECUTION] beats ending on spoken {dialogue} without [ACT] or <foley> follow-through.',
    run: (doc) => lintMacroStateResolution(doc),
  },
  {
    id: 'multimodal-reference-isolation',
    name: 'Reference Isolation (@ref)',
    lens: 'Lens 5: Blocks & Grammar',
    defaultSeverity: 'error',
    description:
      'Warn in Staging blocks outside [INTENT]/[CHARACTERS]/[REFERENCES]; error in [EXECUTION].',
    run: (doc) => lintMultimodalReferenceIsolation(doc),
  },
  {
    id: 'frozen-first-frame-purity',
    name: 'Frozen First-Frame Purity',
    lens: 'Lens 5: Blocks & Grammar',
    defaultSeverity: 'error',
    description: 'Flags square-bracketed [TAG] tokens inside [OPENING] still-frame prose.',
    run: (doc) => lintFrozenFirstFrame(doc),
  },
] as const;

export function getLintRuleDefinition(id: LintRuleId): LintRuleDefinition | undefined {
  return LINT_RULE_REGISTRY.find((rule) => rule.id === id);
}

/**
 * Runs all declarative Script Supervisor linter rules over a parsed AuteurDocument.
 *
 * When `ruleOverrides` is omitted, every rule runs with its built-in default severities
 * (preserving phase-contextual defaults such as Staging warning vs Execution error for
 * `multimodal-reference-isolation`). Passing `'off'` suppresses a rule completely, while
 * passing `'warning'` or `'error'` overrides the severity of all diagnostics from that rule.
 */
export function lintDocument(
  doc: AuteurDocument,
  metadata?: ExtractedMetadata,
  ruleOverrides?: LintRuleOverrides
): LintDiagnostic[] {
  const meta = metadata ?? extractMetadata(doc);
  const diagnostics: LintDiagnostic[] = [];

  for (const rule of LINT_RULE_REGISTRY) {
    const override = ruleOverrides?.[rule.id];
    if (override === 'off') {
      continue;
    }

    const ruleDiagnostics = rule.run(doc, meta);
    if (override === 'warning' || override === 'error') {
      for (const diag of ruleDiagnostics) {
        diagnostics.push(diag.severity === override ? diag : {...diag, severity: override});
      }
    } else {
      diagnostics.push(...ruleDiagnostics);
    }
  }

  return diagnostics;
}
