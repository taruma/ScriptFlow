import type {
  AuteurDocument,
  CameraMeta,
  DialogueParts,
  ExecutionBeat,
  ExecutionSection,
  MacroBlockKind,
  StagingBlock,
  SubStateKind,
  SubStateNode,
} from './types.ts';

/** Standalone Macro-Block header line, e.g. [INTENT], [CONTINUITY PROTOCOL], [EXECUTION] */
export const MACRO_HEADER_REGEX = /^\[([A-Z0-9 _-]+)\]$/;

/** Execution phase header aliases per Open Block Principle */
export const EXECUTION_HEADERS = new Set(['EXECUTION', 'TIMELINE', 'BEATS', 'SHOTLIST']);

/** Sub-State chaining delimiter: ASCII -> or Unicode → */
export const CHAIN_SPLIT_REGEX = /\s*(?:->|→)\s*/;

/** Leading bracketed Sub-State tag, e.g. [CAM 01], [ACT], [STATE IN] */
export const SUBSTATE_TAG_REGEX = /^\[([A-Z0-9 _-]+)\](?:\s+(.*))?$/;

/** Locked v0.4.0 spoken dialogue regex supporting multi-word speakers, language, and varied modifiers */
export const DIALOGUE_REGEX =
  /^(?<speaker>[A-Za-z0-9 _-]+?)\s+says(?:\s+in\s+(?<lang>[A-Za-z-]+))?(?:[\s,]+(?<mods>[^{]+?))?\s*\{(?<line>[^}]+)\}$/;

/** Diegetic foley/SFX enclosed in angle brackets */
export const FOLEY_REGEX = /^<([^<>]+)>$/;

/** Opt-in musical score enclosed in parentheses spanning the entire Sub-State */
export const SCORE_REGEX = /^\(([^()]+)\)$/;

/** Opt-in on-screen text enclosed in lenticular brackets */
export const ONSCREEN_TEXT_REGEX = /^【([^】]+)】$/;

export function normalizeLineEndings(raw: string): string {
  return raw.replace(/\r\n?/g, '\n');
}

export function classifyMacroBlock(name: string): MacroBlockKind {
  const upper = name.trim().toUpperCase();
  if (upper === 'INTENT' || upper === 'GOAL') return 'INTENT';
  if (upper === 'LOGIC') return 'LOGIC';
  if (upper === 'AESTHETIC') return 'AESTHETIC';
  if (upper === 'OPENING') return 'OPENING';
  if (upper.includes('CONTINUITY')) return 'CONTINUITY PROTOCOL';
  if (upper === 'CHARACTERS') return 'CHARACTERS';
  if (upper === 'REFERENCES') return 'REFERENCES';
  if (upper === 'STAGE') return 'STAGE';
  if (EXECUTION_HEADERS.has(upper)) return 'EXECUTION';
  return 'CUSTOM';
}

export function splitExecutionSubStates(line: string): string[] {
  return line
    .split(CHAIN_SPLIT_REGEX)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

export function parseCameraTag(tag: string, body: string): CameraMeta | null {
  const upper = tag.trim().toUpperCase();
  if (upper === 'CAM') {
    return {
      slot: null,
      isNumbered: false,
      descriptor: body.trim(),
    };
  }
  const numbered = /^CAM\s+(\d+[A-Z]?)$/.exec(upper);
  if (numbered) {
    return {
      slot: `CAM ${numbered[1]}`,
      isNumbered: true,
      descriptor: body.trim(),
    };
  }
  return null;
}

export function parseDialogueSubState(segment: string): DialogueParts | null {
  const match = DIALOGUE_REGEX.exec(segment);
  if (!match || !match.groups) return null;

  const speaker = match.groups.speaker.trim();
  const language = match.groups.lang?.trim() || undefined;
  const modifiers = match.groups.mods?.trim() || undefined;
  const line = match.groups.line;

  return {
    speaker,
    ...(language ? {language} : {}),
    ...(modifiers ? {modifiers} : {}),
    line,
  };
}

export function parseSubState(segment: string, index: number): SubStateNode {
  const trimmed = segment.trim();

  const tagMatch = SUBSTATE_TAG_REGEX.exec(trimmed);
  if (tagMatch) {
    const tag = tagMatch[1].trim();
    const body = (tagMatch[2] ?? '').trim();
    const camera = parseCameraTag(tag, body);

    if (camera) {
      return {
        index,
        raw: trimmed,
        kind: 'camera',
        tag,
        body,
        camera,
      };
    }

    const upper = tag.toUpperCase();
    let kind: SubStateKind = 'tier2';
    if (upper === 'ACT') kind = 'action';
    else if (upper === 'BLOCK') kind = 'block';
    else if (upper === 'LIGHT') kind = 'light';
    else if (upper === 'STATE IN' || upper === 'STATE OUT') kind = 'state_boundary';

    return {
      index,
      raw: trimmed,
      kind,
      tag,
      body,
    };
  }

  const foleyMatch = FOLEY_REGEX.exec(trimmed);
  if (foleyMatch) {
    return {
      index,
      raw: trimmed,
      kind: 'foley',
      body: foleyMatch[1].trim(),
    };
  }

  const textMatch = ONSCREEN_TEXT_REGEX.exec(trimmed);
  if (textMatch) {
    return {
      index,
      raw: trimmed,
      kind: 'onscreen_text',
      body: textMatch[1],
    };
  }

  const scoreMatch = SCORE_REGEX.exec(trimmed);
  if (scoreMatch) {
    return {
      index,
      raw: trimmed,
      kind: 'score',
      body: scoreMatch[1].trim(),
    };
  }

  const dialogue = parseDialogueSubState(trimmed);
  if (dialogue) {
    return {
      index,
      raw: trimmed,
      kind: 'dialogue',
      body: dialogue.line,
      dialogue,
    };
  }

  return {
    index,
    raw: trimmed,
    kind: 'plain',
    body: trimmed,
  };
}

export function parseExecutionLine(line: string, beatIndex: number, lineIndex: number): ExecutionBeat {
  const trimmed = line.trim();
  const segments = splitExecutionSubStates(trimmed);
  const subStates = segments.map((seg, idx) => parseSubState(seg, idx));

  return {
    id: `beat-${beatIndex}`,
    index: beatIndex,
    lineIndex,
    raw: trimmed,
    subStates,
  };
}

/**
 * Parses raw canonical plain-text Auteur Script (v0.4.0) into a lossless AST.
 *
 * Key grammar invariants enforced:
 * - Macro-Block headers are standalone lines matching ^\[([A-Z0-9 _-]+)\]$
 * - Once [EXECUTION] (or [TIMELINE]/[BEATS]/[SHOTLIST]) starts, subsequent [TAG]
 *   tokens are Sub-States, never new Staging Macro-Blocks.
 * - -> / → is only split into Sub-State chains inside [EXECUTION]; inside [AESTHETIC]
 *   it remains intact for token mapping extraction.
 * - Blank lines inside [EXECUTION] are harmless visual spacers.
 */
export function parseAuteurScript(input: string): AuteurDocument {
  const raw = normalizeLineEndings(input);
  const lines = raw.length === 0 ? [] : raw.split('\n');

  const preambleLines: string[] = [];
  const stagingBlocks: StagingBlock[] = [];
  let execution: ExecutionSection | null = null;

  interface DraftStaging {
    name: string;
    headerLineIndex: number;
    rawLines: string[];
  }

  let activeStaging: DraftStaging | null = null;

  const flushStaging = () => {
    if (!activeStaging) return;

    // Trim trailing blank spacer lines between Macro-Blocks while keeping internal lines intact
    const bodyLines = [...activeStaging.rawLines];
    while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === '') {
      bodyLines.pop();
    }

    const blockIdx = stagingBlocks.length;
    const contentStartLine = activeStaging.headerLineIndex + 1;
    const contentEndLine =
      bodyLines.length > 0 ? contentStartLine + bodyLines.length - 1 : activeStaging.headerLineIndex;

    stagingBlocks.push({
      id: `staging-${blockIdx}`,
      name: activeStaging.name,
      kind: classifyMacroBlock(activeStaging.name),
      headerLineIndex: activeStaging.headerLineIndex,
      contentStartLine,
      contentEndLine,
      rawBody: bodyLines.join('\n'),
      lines: bodyLines,
    });
    activeStaging = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!execution) {
      const headerMatch = MACRO_HEADER_REGEX.exec(trimmed);
      if (headerMatch) {
        const headerName = headerMatch[1].trim();
        flushStaging();

        if (EXECUTION_HEADERS.has(headerName)) {
          execution = {
            headerName,
            headerLineIndex: i,
            beats: [],
          };
        } else {
          activeStaging = {
            name: headerName,
            headerLineIndex: i,
            rawLines: [],
          };
        }
        continue;
      }

      if (activeStaging) {
        activeStaging.rawLines.push(line);
      } else {
        preambleLines.push(line);
      }
    } else {
      // Phase 2: Execution Timeline. Every non-empty line is one Macro-State.
      if (trimmed.length > 0) {
        const beatIndex = execution.beats.length + 1;
        execution.beats.push(parseExecutionLine(line, beatIndex, i));
      }
    }
  }

  flushStaging();

  return {
    raw,
    lines,
    preambleLines,
    stagingBlocks,
    execution,
  };
}
