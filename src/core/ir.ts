import {extractMetadata} from './extractor.ts';
import {
  AUTEUR_IR_SCHEMA_VERSION,
  AuteurScriptDraftSchema,
  type AestheticEntryIR,
  type AuteurDerivedContext,
  type AuteurEnvelope,
  type AuteurScriptDraft,
  type AuteurScriptIR,
  type CameraSlotIR,
  type DerivedDiagnosticIR,
  type ExecutionMacroBlockIR,
  type MacroStateContinuityIR,
  type MacroStateIR,
  type ReferenceBindingIR,
  type SceneTopology,
  type StagingMacroBlockDraft,
  type StagingMacroBlockIR,
  type SubStateDraft,
  type SubStateIR,
  type TokenMappingIR,
} from './irSchemas.ts';
import {parseAestheticLine} from './aesthetic.ts';
import {lintDocument} from './linter.ts';
import {classifyMacroBlock, normalizeLineEndings, parseAuteurScript} from './parser.ts';
import type {AuteurDocument, ExtractedMetadata, LintDiagnostic, SubStateNode} from './types.ts';

const AESTHETIC_TOKEN_SEGMENT_REGEX = /^(.*?)\s*(?:->|→)\s*([A-Za-z0-9_-]+)\s*$/;

function sanitizeSingleLine(value: string): string {
  return normalizeLineEndings(value)
    .split('\n')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' ');
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Pure, deterministic FNV-1a 32-bit hex hash for snapshot concurrency checks.
 * Zero Node crypto or browser SubtleCrypto dependencies.
 */
export function computeSnapshotHash(rawText: string): string {
  const normalized = normalizeLineEndings(rawText);
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Parses [AESTHETIC] lookbook lines into structured key: value entries.
 * Lines without a "Key:" prefix are preserved losslessly with key: null.
 */
export function parseAestheticEntries(lines: string[], macroBlockId: string): AestheticEntryIR[] {
  return lines.map((line, idx) => {
    const id = `${macroBlockId}.${idx}`;
    const parsed = parseAestheticLine(line);
    if (parsed.type === 'kv') {
      return {
        id,
        key: parsed.key,
        value: parsed.value,
      };
    }
    return {
      id,
      key: null,
      value: parsed.raw,
    };
  });
}

function extractCameraIdentifier(slot: string | null): string | null {
  if (!slot) return null;
  const match = /^CAM\s+([A-Za-z0-9]+)$/i.exec(slot.trim());
  return match ? match[1].toUpperCase() : null;
}

function subStateNodeToIR(node: SubStateNode, macroStateId: string): SubStateIR {
  const id = `${macroStateId}.${node.index}`;

  switch (node.kind) {
    case 'camera': {
      const identifier = node.camera?.isNumbered ? extractCameraIdentifier(node.camera.slot) : null;
      return {
        id,
        dimension: 'camera',
        subStateTag: 'CAM',
        identifier,
        content: node.camera?.descriptor ?? node.body,
      };
    }
    case 'action':
      return {
        id,
        dimension: 'action',
        subStateTag: 'ACT',
        content: node.body,
      };
    case 'block':
      return {
        id,
        dimension: 'block',
        subStateTag: 'BLOCK',
        content: node.body,
      };
    case 'light':
      return {
        id,
        dimension: 'light',
        subStateTag: 'LIGHT',
        content: node.body,
      };
    case 'state_boundary': {
      const upperTag = (node.tag ?? 'STATE IN').trim().toUpperCase();
      return {
        id,
        dimension: 'state_boundary',
        subStateTag: upperTag === 'STATE OUT' ? 'STATE OUT' : 'STATE IN',
        content: node.body,
      };
    }
    case 'tier2':
      return {
        id,
        dimension: 'tier2',
        subStateTag: (node.tag ?? 'CUSTOM').trim().toUpperCase(),
        content: node.body,
      };
    case 'dialogue':
      return {
        id,
        dimension: 'dialogue',
        speaker: node.dialogue?.speaker ?? 'Speaker',
        ...(node.dialogue?.language ? {language: node.dialogue.language} : {}),
        ...(node.dialogue?.modifiers ? {modifiers: node.dialogue.modifiers} : {}),
        line: node.dialogue?.line ?? node.body,
      };
    case 'foley':
      return {
        id,
        dimension: 'foley',
        sound: node.body,
      };
    case 'score':
      return {
        id,
        dimension: 'score',
        cue: node.body,
      };
    case 'onscreen_text':
      return {
        id,
        dimension: 'onscreen_text',
        text: node.body,
      };
    case 'plain':
    default:
      return {
        id,
        dimension: 'plain',
        content: node.body,
      };
  }
}

/**
 * Deterministically compiles a typed Sub-State into canonical v0.4.0 inline syntax.
 */
export function renderSubState(subState: SubStateDraft | SubStateIR): string {
  switch (subState.dimension) {
    case 'camera': {
      const tag =
        subState.identifier !== null && subState.identifier.trim().length > 0
          ? `[CAM ${subState.identifier.trim().toUpperCase()}]`
          : '[CAM]';
      const content = sanitizeSingleLine(subState.content);
      return content.length > 0 ? `${tag} ${content}` : tag;
    }
    case 'action':
      return `[ACT] ${sanitizeSingleLine(subState.content)}`;
    case 'block':
      return `[BLOCK] ${sanitizeSingleLine(subState.content)}`;
    case 'light':
      return `[LIGHT] ${sanitizeSingleLine(subState.content)}`;
    case 'state_boundary':
      return `[${subState.subStateTag}] ${sanitizeSingleLine(subState.content)}`;
    case 'tier2': {
      const tag = subState.subStateTag.trim().toUpperCase();
      const content = sanitizeSingleLine(subState.content);
      return content.length > 0 ? `[${tag}] ${content}` : `[${tag}]`;
    }
    case 'dialogue': {
      const parts: string[] = [`${sanitizeSingleLine(subState.speaker)} says`];
      if (subState.language && subState.language.trim().length > 0) {
        parts.push(`in ${sanitizeSingleLine(subState.language)}`);
      }
      if (subState.modifiers && subState.modifiers.trim().length > 0) {
        parts.push(sanitizeSingleLine(subState.modifiers));
      }
      parts.push(`{${sanitizeSingleLine(subState.line)}}`);
      return parts.join(' ');
    }
    case 'foley':
      return `<${sanitizeSingleLine(subState.sound)}>`;
    case 'score':
      return `(${sanitizeSingleLine(subState.cue)})`;
    case 'onscreen_text':
      return `【${sanitizeSingleLine(subState.text)}】`;
    case 'plain':
      return sanitizeSingleLine(subState.content);
  }
}

/**
 * Converts canonical plain-text Auteur Script into a clean, addressed JSON IR.
 */
export function toAuteurIR(rawText: string): AuteurScriptIR {
  const doc = parseAuteurScript(rawText);
  return documentToIR(doc);
}

export function documentToIR(doc: AuteurDocument): AuteurScriptIR {
  const preamble = [...doc.preambleLines];
  while (preamble.length > 0 && preamble[preamble.length - 1].trim() === '') {
    preamble.pop();
  }

  const stagingMacroBlocks: StagingMacroBlockIR[] = doc.stagingBlocks.map((block, index) => {
    const id = `MB${index}`;
    const header = block.name.trim().toUpperCase();

    if (block.kind === 'AESTHETIC') {
      return {
        id,
        header,
        kind: 'AESTHETIC',
        format: 'key_value',
        entries: parseAestheticEntries(block.lines, id),
      };
    }

    return {
      id,
      header,
      kind: block.kind === 'EXECUTION' ? 'CUSTOM' : block.kind,
      format: 'prose',
      body: block.rawBody,
    };
  });

  const executionMacroBlock: ExecutionMacroBlockIR | null = doc.execution
    ? {
        header: doc.execution.headerName.trim().toUpperCase(),
        macroStates: doc.execution.beats.map((beat): MacroStateIR => {
          const macroStateId = `S${beat.index}`;
          return {
            id: macroStateId,
            subStates: beat.subStates.map((sub) => subStateNodeToIR(sub, macroStateId)),
          };
        }),
      }
    : null;

  return {
    schemaVersion: AUTEUR_IR_SCHEMA_VERSION,
    preamble,
    stagingMacroBlocks,
    executionMacroBlock,
  };
}

function renderStagingBlock(block: StagingMacroBlockDraft | StagingMacroBlockIR): string {
  const header = block.header.trim().toUpperCase();
  let body: string;

  if (block.format === 'key_value') {
    body = block.entries
      .map((entry) => {
        if (entry.key !== null && entry.key.trim().length > 0) {
          return `${entry.key.trim()}: ${entry.value}`;
        }
        return entry.value;
      })
      .join('\n')
      .replace(/\n+$/, '');
  } else {
    body = normalizeLineEndings(block.body).replace(/\n+$/, '');
  }

  return body.length > 0 ? `[${header}]\n${body}` : `[${header}]`;
}

/**
 * Deterministically compiles an AuteurScriptIR or AuteurScriptDraft into canonical v0.4.0 plain text.
 */
export function fromAuteurIR(ir: AuteurScriptIR | AuteurScriptDraft): string {
  const sections: string[] = [];

  const preamble = [...(ir.preamble ?? [])];
  while (preamble.length > 0 && preamble[preamble.length - 1].trim() === '') {
    preamble.pop();
  }
  if (preamble.length > 0) {
    sections.push(preamble.join('\n'));
  }

  for (const block of ir.stagingMacroBlocks) {
    sections.push(renderStagingBlock(block));
  }

  if (ir.executionMacroBlock) {
    const header = ir.executionMacroBlock.header.trim().toUpperCase();
    const lines = ir.executionMacroBlock.macroStates
      .map((ms) =>
        ms.subStates
          .map((sub) => renderSubState(sub))
          .filter((segment) => segment.length > 0)
          .join(' -> ')
      )
      .filter((line) => line.length > 0);

    if (lines.length > 0) {
      sections.push(`[${header}]\n${lines.join('\n')}`);
    } else {
      sections.push(`[${header}]`);
    }
  }

  return sections.join('\n\n');
}

function inferSceneTopology(ir: AuteurScriptIR, metadata: ExtractedMetadata): SceneTopology {
  if (!ir.executionMacroBlock || ir.executionMacroBlock.macroStates.length === 0) {
    return 'empty';
  }

  const numberedIdentifiers = new Set<string>();
  let hasMontage = false;

  for (const link of metadata.beatLinks) {
    if (link.transition === 'MONTAGE') {
      hasMontage = true;
    } else if (link.slot) {
      const id = extractCameraIdentifier(link.slot);
      if (id) numberedIdentifiers.add(id);
    }
  }

  if (hasMontage && numberedIdentifiers.size > 0) return 'mixed';
  if (hasMontage) return 'discontinuous_montage';
  if (numberedIdentifiers.size === 1) return 'continuous_oner';
  if (numberedIdentifiers.size > 1) return 'multi_camera_coverage';
  return 'mixed';
}

function extractDerivedTokenMappings(ir: AuteurScriptIR): TokenMappingIR[] {
  const results: TokenMappingIR[] = [];
  const seen = new Set<string>();

  for (const block of ir.stagingMacroBlocks) {
    if (block.format !== 'key_value') continue;

    for (const entry of block.entries) {
      if (!entry.value.includes('->') && !entry.value.includes('→')) continue;

      const segments = entry.value.split(';');
      for (const rawSeg of segments) {
        const seg = rawSeg.trim();
        if (!seg) continue;

        const match = AESTHETIC_TOKEN_SEGMENT_REGEX.exec(seg);
        if (match) {
          const description = match[1].trim();
          const token = match[2].trim();
          if (token && !seen.has(token)) {
            seen.add(token);
            results.push({
              token,
              description,
              ...(entry.key ? {category: entry.key} : {}),
              entryId: entry.id,
            });
          }
        }
      }
    }
  }

  return results;
}

function buildDerivedContext(
  doc: AuteurDocument,
  ir: AuteurScriptIR,
  metadata: ExtractedMetadata,
  diagnostics: LintDiagnostic[]
): AuteurDerivedContext {
  const blockIdByName = new Map<string, string>();
  doc.stagingBlocks.forEach((block, index) => {
    const key = block.name.trim().toUpperCase();
    if (!blockIdByName.has(key)) {
      blockIdByName.set(key, `MB${index}`);
    }
  });

  const referenceBindings: ReferenceBindingIR[] = metadata.characters.map((char) => {
    const blockUpper = char.sourceBlock.trim().toUpperCase();
    return {
      ref: char.ref,
      name: char.name,
      ...(char.voiceRef ? {voiceRef: char.voiceRef} : {}),
      sourceMacroBlockId: blockIdByName.get(blockUpper) ?? 'MB0',
      sourceMacroBlock: char.sourceBlock,
    };
  });

  const tokenMappings = extractDerivedTokenMappings(ir);
  const tokenMatchers = tokenMappings.map((tm) => ({
    token: tm.token,
    regex: new RegExp(`(?<![A-Za-z0-9_-])${escapeRegExp(tm.token)}(?![A-Za-z0-9_-])`),
  }));

  const cameraSlots: Record<string, CameraSlotIR> = {};
  for (const def of Object.values(metadata.cameraSlots)) {
    const identifier = extractCameraIdentifier(def.slot);
    if (!identifier) continue;
    cameraSlots[identifier] = {
      subStateTag: 'CAM',
      identifier,
      establishedAt: `S${def.firstBeatIndex}`,
      initialFraming: def.firstDescriptor,
    };
  }

  const slotBaseFraming = new Map<string, string>();
  const slotLastFraming = new Map<string, string>();
  let prevEffectiveFraming = '';

  const macroStateContinuity: MacroStateContinuityIR[] = [];
  const beats = doc.execution?.beats ?? [];

  metadata.beatLinks.forEach((link, idx) => {
    const macroStateId = `S${link.beatIndex}`;
    const beatRaw = beats[idx]?.raw ?? '';
    const identifier = extractCameraIdentifier(link.slot);
    const descriptor = link.descriptor.trim();

    let effectiveFraming = '';

    if (link.transition === 'MONTAGE') {
      effectiveFraming = descriptor;
      prevEffectiveFraming = effectiveFraming;
    } else if (link.transition === 'NONE') {
      effectiveFraming = prevEffectiveFraming;
    } else if (identifier) {
      if (link.transition === 'ESTABLISH' || link.transition === 'CUT') {
        slotBaseFraming.set(identifier, descriptor);
        slotLastFraming.set(identifier, descriptor);
        effectiveFraming = descriptor;
      } else {
        // HOLD or RECALL
        const base = slotBaseFraming.get(identifier) ?? '';
        const last = slotLastFraming.get(identifier) ?? base;
        if (descriptor.length === 0) {
          effectiveFraming = last;
        } else {
          effectiveFraming = base.length > 0 ? `${base} | ${descriptor}` : descriptor;
          slotLastFraming.set(identifier, effectiveFraming);
        }
      }
      prevEffectiveFraming = effectiveFraming;
    }

    const referencedTokens = tokenMatchers
      .filter((tm) => tm.regex.test(beatRaw))
      .map((tm) => tm.token);

    macroStateContinuity.push({
      macroStateId,
      activeCameraIdentifier: identifier,
      cameraTransition: link.transition,
      currentDescriptor: descriptor,
      effectiveFraming,
      referencedTokens,
    });
  });

  const derivedDiagnostics: DerivedDiagnosticIR[] = diagnostics.map((d) => ({
    id: d.id,
    ruleId: d.ruleId,
    ruleName: d.ruleName,
    lens: d.lens,
    severity: d.severity,
    targetPhase: d.target.phase,
    targetId: d.target.phase === 'staging' ? `MB${d.target.blockIndex}` : `S${d.target.beatIndex}`,
    message: d.message,
    repairHint: d.repairHint,
    ...(d.excerpt ? {excerpt: d.excerpt} : {}),
  }));

  return {
    referenceBindings,
    tokenMappings,
    hasContinuationContext: metadata.hasContinuationContext,
    sceneTopology: inferSceneTopology(ir, metadata),
    cameraSlots,
    macroStateContinuity,
    diagnostics: derivedDiagnostics,
  };
}

/**
 * Builds the full read-only AI Envelope (addressed AuteurScriptIR + derived continuity & diagnostics).
 */
export function toAuteurEnvelope(rawText: string): AuteurEnvelope {
  const doc = parseAuteurScript(rawText);
  const metadata = extractMetadata(doc);
  const diagnostics = lintDocument(doc, metadata);
  const ir = documentToIR(doc);
  const derived = buildDerivedContext(doc, ir, metadata, diagnostics);

  return {
    snapshotHash: computeSnapshotHash(doc.raw),
    document: ir,
    derived,
  };
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export type CompileDraftResult =
  | {
      ok: true;
      rawText: string;
      ir: AuteurScriptIR;
      envelope: AuteurEnvelope;
      diagnostics: DerivedDiagnosticIR[];
    }
  | {
      ok: false;
      errors: ValidationIssue[];
    };

/**
 * Validates an untrusted JSON draft (e.g. from full-draft generation) via Zod,
 * compiles it deterministically into canonical v0.4.0 plain text, and runs the Script Supervisor linter.
 */
export function compileAuteurDraft(draftInput: unknown): CompileDraftResult {
  const parsed = AuteurScriptDraftSchema.safeParse(draftInput);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  const normalizedDraft: AuteurScriptDraft = {
    ...parsed.data,
    stagingMacroBlocks: parsed.data.stagingMacroBlocks.map((block) => {
      const header = block.header.trim().toUpperCase();
      if (block.format === 'key_value') {
        return {
          ...block,
          header,
          kind: 'AESTHETIC',
        };
      }
      const inferredKind = classifyMacroBlock(header);
      return {
        ...block,
        header,
        kind: block.kind ?? (inferredKind === 'EXECUTION' ? 'CUSTOM' : inferredKind),
      };
    }),
  };

  const rawText = fromAuteurIR(normalizedDraft);
  const envelope = toAuteurEnvelope(rawText);

  return {
    ok: true,
    rawText,
    ir: envelope.document,
    envelope,
    diagnostics: envelope.derived.diagnostics,
  };
}
