import {extractAestheticTokenSegments, parseAestheticLine} from './aesthetic.ts';
import type {
  AestheticToken,
  AuteurDocument,
  BeatCameraLink,
  CameraSlotDefinition,
  CharacterBinding,
  ExtractedMetadata,
} from './types.ts';

const CHARACTER_BINDING_REGEX =
  /(@[A-Za-z0-9_-]+)\s+[aA][sS]\s+([A-Za-z0-9_-]+(?:\s+(?!(?:and|with|locked|in|on|at|from|who|a|an|the|as|pressing|confronting|facing|featuring|set)\b)[A-Z][A-Za-z0-9_-]+)*)(?:\s*\(\s*[vV][oO][iI][cC][eE]\s*:\s*(@[A-Za-z0-9_-]+)\s*\))?/g;

const CONTINUATION_REF_REGEX = /(?:@video[A-Za-z0-9_-]*|@?PREVIOUS_CLIP)\b/i;

export function extractCharacterBindings(doc: AuteurDocument): CharacterBinding[] {
  const results: CharacterBinding[] = [];
  const seen = new Set<string>();

  for (const block of doc.stagingBlocks) {
    block.lines.forEach((line, offset) => {
      const lineIndex = block.contentStartLine + offset;
      CHARACTER_BINDING_REGEX.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = CHARACTER_BINDING_REGEX.exec(line)) !== null) {
        const ref = match[1];
        const name = match[2].trim();
        const voiceRef = match[3] || undefined;
        const key = `${ref.toLowerCase()}::${name.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({
            ref,
            name,
            ...(voiceRef ? {voiceRef} : {}),
            sourceBlock: block.name,
            lineIndex,
          });
        }
      }
    });
  }

  return results;
}

export function extractAestheticTokens(doc: AuteurDocument): AestheticToken[] {
  const results: AestheticToken[] = [];
  const seen = new Set<string>();

  for (const block of doc.stagingBlocks) {
    if (block.kind !== 'AESTHETIC') continue;

    block.lines.forEach((line, offset) => {
      const lineIndex = block.contentStartLine + offset;
      const parsed = parseAestheticLine(line);
      const category = parsed.type === 'kv' ? parsed.key : undefined;
      const remainder = parsed.type === 'kv' ? parsed.value : parsed.raw;

      for (const {description, token} of extractAestheticTokenSegments(remainder)) {
        if (!seen.has(token)) {
          seen.add(token);
          results.push({
            token,
            description,
            ...(category ? {category} : {}),
            lineIndex,
          });
        }
      }
    });
  }

  return results;
}

export function detectContinuationContext(doc: AuteurDocument): boolean {
  for (const block of doc.stagingBlocks) {
    if (block.kind === 'CONTINUITY PROTOCOL') {
      return true;
    }
    if (CONTINUATION_REF_REGEX.test(block.rawBody)) {
      return true;
    }
  }
  return false;
}

export function extractCameraContinuity(doc: AuteurDocument): {
  cameraSlots: Record<string, CameraSlotDefinition>;
  beatLinks: BeatCameraLink[];
} {
  const cameraSlots: Record<string, CameraSlotDefinition> = {};
  const beatLinks: BeatCameraLink[] = [];

  if (!doc.execution) {
    return {cameraSlots, beatLinks};
  }

  let prevSlot: string | null = null;
  let hasPrevBeat = false;

  for (const beat of doc.execution.beats) {
    const camNode = beat.subStates.find((s) => s.kind === 'camera');

    if (!camNode || !camNode.camera) {
      beatLinks.push({
        beatIndex: beat.index,
        slot: prevSlot,
        descriptor: '',
        transition: 'NONE',
        connectsFromPrevious: hasPrevBeat && prevSlot !== null,
        isCutFromPrevious: false,
      });
      hasPrevBeat = true;
      continue;
    }

    const {slot, isNumbered, descriptor} = camNode.camera;

    if (!isNumbered || !slot) {
      beatLinks.push({
        beatIndex: beat.index,
        slot: null,
        descriptor,
        transition: 'MONTAGE',
        connectsFromPrevious: false,
        isCutFromPrevious: hasPrevBeat,
      });
      prevSlot = null;
      hasPrevBeat = true;
      continue;
    }

    const alreadyDefined = Boolean(cameraSlots[slot]);
    if (!alreadyDefined) {
      cameraSlots[slot] = {
        slot,
        firstBeatIndex: beat.index,
        firstDescriptor: descriptor,
        lineIndex: beat.lineIndex,
      };
    }

    if (!hasPrevBeat) {
      beatLinks.push({
        beatIndex: beat.index,
        slot,
        descriptor,
        transition: 'ESTABLISH',
        connectsFromPrevious: false,
        isCutFromPrevious: false,
      });
    } else if (prevSlot === slot) {
      beatLinks.push({
        beatIndex: beat.index,
        slot,
        descriptor,
        transition: 'HOLD',
        connectsFromPrevious: true,
        isCutFromPrevious: false,
      });
    } else if (alreadyDefined) {
      beatLinks.push({
        beatIndex: beat.index,
        slot,
        descriptor,
        transition: 'RECALL',
        connectsFromPrevious: false,
        isCutFromPrevious: true,
      });
    } else {
      beatLinks.push({
        beatIndex: beat.index,
        slot,
        descriptor,
        transition: 'CUT',
        connectsFromPrevious: false,
        isCutFromPrevious: true,
      });
    }

    prevSlot = slot;
    hasPrevBeat = true;
  }

  return {cameraSlots, beatLinks};
}

export function extractMetadata(doc: AuteurDocument): ExtractedMetadata {
  const characters = extractCharacterBindings(doc);
  const aestheticTokens = extractAestheticTokens(doc);
  const hasContinuationContext = detectContinuationContext(doc);
  const {cameraSlots, beatLinks} = extractCameraContinuity(doc);

  return {
    characters,
    aestheticTokens,
    cameraSlots,
    beatLinks,
    hasContinuationContext,
  };
}
