import {
  EXECUTION_HEADERS,
  normalizeLineEndings,
  parseAuteurScript,
  splitExecutionSubStates,
} from './parser.ts';

const LEADING_TAG_STRIP_REGEX = /^\[[A-Z0-9 _-]+\]\s*/;

function sanitizeSingleLineBeat(beatText: string): string {
  return normalizeLineEndings(beatText)
    .split('\n')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' ');
}

function serializeBlocksAndBeats(
  preambleLines: string[],
  stagingBlocks: Array<{name: string; rawBody: string}>,
  execution: {headerName: string; beats: string[]} | null
): string {
  const sections: string[] = [];

  const trimmedPreamble = [...preambleLines];
  while (trimmedPreamble.length > 0 && trimmedPreamble[trimmedPreamble.length - 1].trim() === '') {
    trimmedPreamble.pop();
  }
  if (trimmedPreamble.length > 0) {
    sections.push(trimmedPreamble.join('\n'));
  }

  for (const block of stagingBlocks) {
    const cleanBody = normalizeLineEndings(block.rawBody).replace(/\n+$/, '');
    if (cleanBody.length > 0) {
      sections.push(`[${block.name}]\n${cleanBody}`);
    } else {
      sections.push(`[${block.name}]`);
    }
  }

  if (execution) {
    if (execution.beats.length > 0) {
      sections.push(`[${execution.headerName}]\n${execution.beats.join('\n')}`);
    } else {
      sections.push(`[${execution.headerName}]`);
    }
  }

  return sections.join('\n\n');
}

/**
 * Updates the raw body of a Staging Macro-Block by its 0-based index,
 * preserving all other Staging blocks and the Execution timeline losslessly.
 */
export function updateStagingBlock(raw: string, blockIndex: number, newBody: string): string {
  const doc = parseAuteurScript(raw);
  if (blockIndex < 0 || blockIndex >= doc.stagingBlocks.length) {
    return doc.raw;
  }

  const nextStaging = doc.stagingBlocks.map((block, idx) =>
    idx === blockIndex ? {name: block.name, rawBody: newBody} : {name: block.name, rawBody: block.rawBody}
  );

  const nextExecution = doc.execution
    ? {
        headerName: doc.execution.headerName,
        beats: doc.execution.beats.map((b) => b.raw),
      }
    : null;

  return serializeBlocksAndBeats(doc.preambleLines, nextStaging, nextExecution);
}

function sanitizeStagingHeaderName(rawName: string): string {
  return rawName
    .trim()
    .replace(/^\[+/, '')
    .replace(/\]+$/, '')
    .replace(/[^A-Za-z0-9 _/-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Inserts a new Staging Macro-Block at the end of Phase 1 (or immediately after
 * afterBlockIndex when specified), preserving all other blocks and Execution beats losslessly.
 * Ignores empty names or reserved Phase 2 Execution headers.
 */
export function insertStagingBlock(
  raw: string,
  headerName: string,
  initialBody = '',
  afterBlockIndex?: number
): string {
  const doc = parseAuteurScript(raw);
  const cleanName = sanitizeStagingHeaderName(headerName);
  if (cleanName.length === 0 || EXECUTION_HEADERS.has(cleanName)) {
    return doc.raw;
  }

  const nextStaging = doc.stagingBlocks.map((block) => ({
    name: block.name,
    rawBody: block.rawBody,
  }));

  const insertPos =
    afterBlockIndex === undefined
      ? nextStaging.length
      : Math.max(0, Math.min(afterBlockIndex + 1, nextStaging.length));

  nextStaging.splice(insertPos, 0, {
    name: cleanName,
    rawBody: normalizeLineEndings(initialBody).replace(/\n+$/, ''),
  });

  const nextExecution = doc.execution
    ? {
        headerName: doc.execution.headerName,
        beats: doc.execution.beats.map((b) => b.raw),
      }
    : null;

  return serializeBlocksAndBeats(doc.preambleLines, nextStaging, nextExecution);
}

/**
 * Deletes a Staging Macro-Block by its 0-based index, preserving all remaining
 * Staging blocks and the Execution timeline losslessly.
 */
export function deleteStagingBlock(raw: string, blockIndex: number): string {
  const doc = parseAuteurScript(raw);
  if (blockIndex < 0 || blockIndex >= doc.stagingBlocks.length) {
    return doc.raw;
  }

  const nextStaging = doc.stagingBlocks
    .filter((_, idx) => idx !== blockIndex)
    .map((block) => ({name: block.name, rawBody: block.rawBody}));

  const nextExecution = doc.execution
    ? {
        headerName: doc.execution.headerName,
        beats: doc.execution.beats.map((b) => b.raw),
      }
    : null;

  return serializeBlocksAndBeats(doc.preambleLines, nextStaging, nextExecution);
}

/**
 * Updates a single Execution Macro-State line by its 1-based beat index.
 * If newBeatLine is empty/whitespace, deletes the beat cleanly.
 */
export function updateExecutionBeat(raw: string, beatIndex: number, newBeatLine: string): string {
  const doc = parseAuteurScript(raw);
  if (!doc.execution) return doc.raw;

  const targetIdx = beatIndex - 1;
  if (targetIdx < 0 || targetIdx >= doc.execution.beats.length) {
    return doc.raw;
  }

  const sanitized = sanitizeSingleLineBeat(newBeatLine);
  if (sanitized.length === 0) {
    return deleteExecutionBeat(raw, beatIndex);
  }

  const lines = [...doc.lines];
  const lineIndex = doc.execution.beats[targetIdx].lineIndex;
  lines[lineIndex] = sanitized;
  return lines.join('\n');
}

/**
 * Inserts a new Execution Macro-State after the given 1-based beat index.
 * Passing afterBeatIndex = 0 inserts at the top of [EXECUTION].
 */
export function insertExecutionBeat(raw: string, afterBeatIndex: number, newBeatLine: string): string {
  const doc = parseAuteurScript(raw);
  const sanitized = sanitizeSingleLineBeat(newBeatLine);

  if (!doc.execution) {
    const trimmed = doc.raw.replace(/\n+$/, '');
    const prefix = trimmed.length > 0 ? `${trimmed}\n\n` : '';
    return `${prefix}[EXECUTION]\n${sanitized}`;
  }

  const beats = doc.execution.beats;
  const lines = [...doc.lines];

  if (beats.length === 0 || afterBeatIndex <= 0) {
    const insertLineIdx = doc.execution.headerLineIndex + 1;
    lines.splice(insertLineIdx, 0, sanitized);
    return lines.join('\n');
  }

  const clampedIdx = Math.min(afterBeatIndex, beats.length) - 1;
  const insertLineIdx = beats[clampedIdx].lineIndex + 1;
  lines.splice(insertLineIdx, 0, sanitized);
  return lines.join('\n');
}

/**
 * Deletes an Execution Macro-State by its 1-based beat index.
 */
export function deleteExecutionBeat(raw: string, beatIndex: number): string {
  const doc = parseAuteurScript(raw);
  if (!doc.execution) return doc.raw;

  const targetIdx = beatIndex - 1;
  if (targetIdx < 0 || targetIdx >= doc.execution.beats.length) {
    return doc.raw;
  }

  const lines = [...doc.lines];
  lines.splice(doc.execution.beats[targetIdx].lineIndex, 1);
  return lines.join('\n');
}

/**
 * Reorders an Execution Macro-State from 1-based fromBeatIndex to 1-based toBeatIndex.
 */
export function reorderExecutionBeats(raw: string, fromBeatIndex: number, toBeatIndex: number): string {
  const doc = parseAuteurScript(raw);
  if (!doc.execution) return doc.raw;

  const count = doc.execution.beats.length;
  const fromIdx = fromBeatIndex - 1;
  const toIdx = toBeatIndex - 1;

  if (fromIdx < 0 || fromIdx >= count || toIdx < 0 || toIdx >= count || fromIdx === toIdx) {
    return doc.raw;
  }

  const nextBeats = doc.execution.beats.map((b) => b.raw);
  const [moved] = nextBeats.splice(fromIdx, 1);
  nextBeats.splice(toIdx, 0, moved);

  const nextStaging = doc.stagingBlocks.map((b) => ({name: b.name, rawBody: b.rawBody}));
  return serializeBlocksAndBeats(doc.preambleLines, nextStaging, {
    headerName: doc.execution.headerName,
    beats: nextBeats,
  });
}

/**
 * Updates a single Sub-State (0-based subStateIndex) inside a Macro-State beat (1-based beatIndex).
 * If nextSubStateRaw contains chaining arrows (-> / →), it naturally expands into multiple Sub-States.
 * If nextSubStateRaw is empty/whitespace, removes that Sub-State (or deletes the beat if none remain).
 */
export function updateExecutionSubState(
  raw: string,
  beatIndex: number,
  subStateIndex: number,
  nextSubStateRaw: string
): string {
  const doc = parseAuteurScript(raw);
  if (!doc.execution) return doc.raw;

  const beat = doc.execution.beats[beatIndex - 1];
  if (!beat) return doc.raw;

  const segments = splitExecutionSubStates(beat.raw);
  if (subStateIndex < 0 || subStateIndex >= segments.length) {
    return doc.raw;
  }

  const sanitized = sanitizeSingleLineBeat(nextSubStateRaw);
  const nextSegments = [...segments];

  if (sanitized.length === 0) {
    nextSegments.splice(subStateIndex, 1);
  } else {
    const expanded = splitExecutionSubStates(sanitized);
    nextSegments.splice(subStateIndex, 1, ...expanded);
  }

  if (nextSegments.length === 0) {
    return deleteExecutionBeat(raw, beatIndex);
  }

  return updateExecutionBeat(raw, beatIndex, nextSegments.join(' -> '));
}

/**
 * Inserts a new Sub-State inside a Macro-State beat immediately after afterSubStateIndex (0-based).
 */
export function insertExecutionSubState(
  raw: string,
  beatIndex: number,
  afterSubStateIndex: number,
  nextSubStateRaw: string
): string {
  const doc = parseAuteurScript(raw);
  if (!doc.execution) return doc.raw;

  const beat = doc.execution.beats[beatIndex - 1];
  if (!beat) return doc.raw;

  const sanitized = sanitizeSingleLineBeat(nextSubStateRaw);
  if (sanitized.length === 0) return doc.raw;

  const segments = splitExecutionSubStates(beat.raw);
  const insertPos = Math.max(0, Math.min(afterSubStateIndex + 1, segments.length));
  const expanded = splitExecutionSubStates(sanitized);
  segments.splice(insertPos, 0, ...expanded);

  return updateExecutionBeat(raw, beatIndex, segments.join(' -> '));
}

/**
 * Deletes a single Sub-State (0-based subStateIndex) from a Macro-State beat.
 * If it was the only Sub-State, deletes the beat cleanly.
 */
export function deleteExecutionSubState(
  raw: string,
  beatIndex: number,
  subStateIndex: number
): string {
  return updateExecutionSubState(raw, beatIndex, subStateIndex, '');
}

/**
 * Merges Sub-State at subStateIndex (>= 1) back into subStateIndex - 1.
 * Used when pressing Backspace at column 0 of an indented waterfall step.
 */
export function mergeExecutionSubStateWithPrevious(
  raw: string,
  beatIndex: number,
  subStateIndex: number
): string {
  const doc = parseAuteurScript(raw);
  if (!doc.execution) return doc.raw;

  const beat = doc.execution.beats[beatIndex - 1];
  if (!beat) return doc.raw;

  const segments = splitExecutionSubStates(beat.raw);
  if (subStateIndex <= 0 || subStateIndex >= segments.length) {
    return doc.raw;
  }

  const prev = segments[subStateIndex - 1];
  const curr = segments[subStateIndex];
  const merged = curr.length > 0 ? `${prev} ${curr}` : prev;
  segments.splice(subStateIndex - 1, 2, merged);

  return updateExecutionBeat(raw, beatIndex, segments.join(' -> '));
}

/**
 * Exports canonical v0.4.0 plain text with normalized line endings and clean spacing.
 */
export function exportPlainText(raw: string): string {
  const normalized = normalizeLineEndings(raw);
  return normalized
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .trim();
}

/**
 * Strips bracketed Sub-State tags ([CAM 01], [CAM], [ACT], [BLOCK], etc.) inside
 * [EXECUTION] lines while preserving the -> flow intact.
 *
 * Cleans up bare camera holds/recalls (e.g. "[CAM 01] -> [ACT] Miller leans forward")
 * so empty leading segments are dropped and never leave a dangling "-> " prefix.
 */
export function exportTagless(raw: string): string {
  const doc = parseAuteurScript(raw);

  const staging = doc.stagingBlocks.map((block) => ({
    name: block.name,
    rawBody: block.rawBody,
  }));

  if (!doc.execution) {
    return serializeBlocksAndBeats(doc.preambleLines, staging, null);
  }

  const taglessBeats = doc.execution.beats
    .map((beat) => {
      const segments = splitExecutionSubStates(beat.raw);
      const cleaned = segments
        .map((seg) => seg.replace(LEADING_TAG_STRIP_REGEX, '').trim())
        .filter((seg) => seg.length > 0);
      return cleaned.join(' -> ');
    })
    .filter((line) => line.length > 0);

  return serializeBlocksAndBeats(doc.preambleLines, staging, {
    headerName: doc.execution.headerName,
    beats: taglessBeats,
  });
}
