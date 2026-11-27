import {parseAestheticLine, parseAestheticTokenSegment} from '../../aesthetic.ts';
import type {
  AestheticEntryDraft,
  AuteurPatchOp,
  AuteurScriptIR,
  StagingMacroBlockIR,
} from '../../irSchemas.ts';
import {normalizeLineEndings} from '../../parser.ts';
import {
  ensureAestheticBlock,
  findStagingBlockIndex,
  materializeStagingBlock,
} from '../irHelpers.ts';
import {createOpError, type PatchError} from '../types.ts';

export type StagingPatchOp = Extract<
  AuteurPatchOp,
  {
    op:
      | 'set_macro_block'
      | 'insert_macro_block'
      | 'delete_macro_block'
      | 'set_aesthetic_entry'
      | 'delete_aesthetic_entry'
      | 'upsert_token_mapping'
      | 'delete_token_mapping';
  }
>;

function findExistingAestheticBlock(
  working: AuteurScriptIR
): Extract<StagingMacroBlockIR, {format: 'key_value'}> | undefined {
  return working.stagingMacroBlocks.find(
    (b): b is Extract<StagingMacroBlockIR, {format: 'key_value'}> => b.format === 'key_value'
  );
}

export function applyStagingOp(
  working: AuteurScriptIR,
  op: StagingPatchOp,
  opIndex: number,
  nextId: () => string
): PatchError | null {
  switch (op.op) {
    case 'set_macro_block': {
      const idx = findStagingBlockIndex(working.stagingMacroBlocks, op.macroBlockId, op.header);
      if (idx === -1) {
        return createOpError(
          opIndex,
          op.op,
          'TARGET_NOT_FOUND',
          `Staging Macro-Block not found (${op.macroBlockId ?? op.header}).`
        );
      }
      const target = working.stagingMacroBlocks[idx];
      if (target.format === 'key_value') {
        if (op.entries !== undefined) {
          target.entries = op.entries.map((entry: AestheticEntryDraft) => ({
            id: entry.id ?? nextId(),
            key: entry.key,
            value: entry.value,
          }));
        } else if (op.body !== undefined) {
          const lines = normalizeLineEndings(op.body).split('\n');
          target.entries = lines.map((line) => {
            const parsed = parseAestheticLine(line);
            return parsed.type === 'kv'
              ? {id: nextId(), key: parsed.key, value: parsed.value}
              : {id: nextId(), key: null, value: parsed.raw};
          });
        }
      } else {
        if (op.body === undefined) {
          return createOpError(
            opIndex,
            op.op,
            'INVALID_OPERATION',
            `Macro-Block [${target.header}] is prose format and requires a "body" string.`
          );
        }
        target.body = op.body;
      }
      return null;
    }

    case 'insert_macro_block': {
      const materialized = materializeStagingBlock(op.macroBlock, nextId(), nextId);
      if (op.afterMacroBlockId === null) {
        working.stagingMacroBlocks.unshift(materialized);
        return null;
      }
      let afterIdx = working.stagingMacroBlocks.findIndex((b) => b.id === op.afterMacroBlockId);
      if (afterIdx === -1) {
        const posMatch = /^MB(\d+)$/i.exec(op.afterMacroBlockId.trim());
        if (posMatch) {
          const posIdx = Number.parseInt(posMatch[1], 10);
          if (
            posIdx >= 0 &&
            posIdx < working.stagingMacroBlocks.length &&
            working.stagingMacroBlocks[posIdx].id.startsWith('__new_')
          ) {
            afterIdx = posIdx;
          }
        }
      }
      if (afterIdx === -1) {
        return createOpError(
          opIndex,
          op.op,
          'TARGET_NOT_FOUND',
          `afterMacroBlockId "${op.afterMacroBlockId}" not found.`
        );
      }
      working.stagingMacroBlocks.splice(afterIdx + 1, 0, materialized);
      return null;
    }

    case 'delete_macro_block': {
      const idx = findStagingBlockIndex(working.stagingMacroBlocks, op.macroBlockId, op.header);
      if (idx === -1) {
        return createOpError(
          opIndex,
          op.op,
          'TARGET_NOT_FOUND',
          `Staging Macro-Block not found (${op.macroBlockId ?? op.header}).`
        );
      }
      working.stagingMacroBlocks.splice(idx, 1);
      return null;
    }

    case 'set_aesthetic_entry': {
      const aesthetic = ensureAestheticBlock(working, nextId);
      if (op.entryId) {
        const entry = aesthetic.entries.find((e) => e.id === op.entryId);
        if (!entry) {
          return createOpError(
            opIndex,
            op.op,
            'TARGET_NOT_FOUND',
            `[AESTHETIC] entry "${op.entryId}" not found.`
          );
        }
        if (op.key !== undefined) {
          entry.key = op.key.trim();
        }
        entry.value = op.value;
        return null;
      }

      const targetKey = op.key!.trim();
      const existing = aesthetic.entries.find(
        (e) => e.key !== null && e.key.toLowerCase() === targetKey.toLowerCase()
      );
      if (existing) {
        existing.value = op.value;
      } else {
        aesthetic.entries.push({
          id: nextId(),
          key: targetKey,
          value: op.value,
        });
      }
      return null;
    }

    case 'delete_aesthetic_entry': {
      const aesthetic = findExistingAestheticBlock(working);
      if (!aesthetic) {
        return createOpError(
          opIndex,
          op.op,
          'TARGET_NOT_FOUND',
          'No [AESTHETIC] Macro-Block exists in this document.'
        );
      }
      const idx = op.entryId
        ? aesthetic.entries.findIndex((e) => e.id === op.entryId)
        : aesthetic.entries.findIndex(
            (e) => e.key !== null && e.key.toLowerCase() === op.key!.trim().toLowerCase()
          );

      if (idx === -1) {
        return createOpError(
          opIndex,
          op.op,
          'TARGET_NOT_FOUND',
          `[AESTHETIC] entry not found (${op.entryId ?? op.key}).`
        );
      }
      aesthetic.entries.splice(idx, 1);
      return null;
    }

    case 'upsert_token_mapping': {
      const aesthetic = ensureAestheticBlock(working, nextId);
      const category = op.category.trim();
      const description = op.description.trim();
      const token = op.token.trim();
      const formattedSegment = `${description} -> ${token}`;

      // First check if token already exists in any entry; if found in same category, update in place;
      // if found in a different category, remove old occurrence before inserting into target category.
      for (let i = aesthetic.entries.length - 1; i >= 0; i--) {
        const entry = aesthetic.entries[i];
        const segments = entry.value
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        const matchIdx = segments.findIndex((seg) => {
          const parsed = parseAestheticTokenSegment(seg);
          return parsed !== null && parsed.token === token;
        });

        if (matchIdx !== -1) {
          if (entry.key !== null && entry.key.toLowerCase() === category.toLowerCase()) {
            segments[matchIdx] = formattedSegment;
            entry.value = segments.join('; ');
            return null;
          } else {
            segments.splice(matchIdx, 1);
            if (segments.length === 0) {
              aesthetic.entries.splice(i, 1);
            } else {
              entry.value = segments.join('; ');
            }
          }
        }
      }

      const targetEntry = aesthetic.entries.find(
        (e) => e.key !== null && e.key.toLowerCase() === category.toLowerCase()
      );
      if (targetEntry) {
        const trimmed = targetEntry.value.trim();
        targetEntry.value = trimmed.length > 0 ? `${trimmed}; ${formattedSegment}` : formattedSegment;
      } else {
        aesthetic.entries.push({
          id: nextId(),
          key: category,
          value: formattedSegment,
        });
      }
      return null;
    }

    case 'delete_token_mapping': {
      const aesthetic = findExistingAestheticBlock(working);
      if (!aesthetic) {
        return createOpError(
          opIndex,
          op.op,
          'TARGET_NOT_FOUND',
          'No [AESTHETIC] Macro-Block exists in this document.'
        );
      }

      const token = op.token.trim();
      let found = false;

      for (let i = aesthetic.entries.length - 1; i >= 0; i--) {
        const entry = aesthetic.entries[i];
        const segments = entry.value
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        const nextSegments = segments.filter((seg) => {
          const parsed = parseAestheticTokenSegment(seg);
          if (parsed !== null && parsed.token === token) {
            found = true;
            return false;
          }
          return true;
        });

        if (nextSegments.length !== segments.length) {
          if (nextSegments.length === 0) {
            aesthetic.entries.splice(i, 1);
          } else {
            entry.value = nextSegments.join('; ');
          }
        }
      }

      if (!found) {
        return createOpError(
          opIndex,
          op.op,
          'TARGET_NOT_FOUND',
          `Token mapping "${token}" not found in [AESTHETIC].`
        );
      }
      return null;
    }
  }
}
