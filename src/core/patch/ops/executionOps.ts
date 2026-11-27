import type {AuteurPatchOp, AuteurScriptIR, MacroStateIR} from '../../irSchemas.ts';
import {ensureExecutionMacroBlock, materializeSubState} from '../irHelpers.ts';
import {createOpError, type PatchError} from '../types.ts';

export type ExecutionPatchOp = Extract<
  AuteurPatchOp,
  {
    op:
      | 'replace_macro_state'
      | 'insert_macro_state'
      | 'delete_macro_state'
      | 'reorder_macro_states'
      | 'replace_sub_state'
      | 'insert_sub_state'
      | 'delete_sub_state';
  }
>;

export function applyExecutionOp(
  working: AuteurScriptIR,
  op: ExecutionPatchOp,
  opIndex: number,
  nextId: () => string
): PatchError | null {
  switch (op.op) {
    case 'replace_macro_state': {
      const exec = working.executionMacroBlock;
      if (!exec) {
        return createOpError(
          opIndex,
          op.op,
          'TARGET_NOT_FOUND',
          'No Execution Macro-Block exists in this document.'
        );
      }
      const ms = exec.macroStates.find((m) => m.id === op.macroStateId);
      if (!ms) {
        return createOpError(
          opIndex,
          op.op,
          'TARGET_NOT_FOUND',
          `Macro-State "${op.macroStateId}" not found.`
        );
      }
      ms.subStates = op.subStates.map((sub) => materializeSubState(sub, nextId()));
      return null;
    }

    case 'insert_macro_state': {
      const exec = ensureExecutionMacroBlock(working);
      const created: MacroStateIR = {
        id: nextId(),
        subStates: op.subStates.map((sub) => materializeSubState(sub, nextId())),
      };
      if (op.afterMacroStateId === null) {
        exec.macroStates.unshift(created);
        return null;
      }
      let afterIdx = exec.macroStates.findIndex((m) => m.id === op.afterMacroStateId);
      if (afterIdx === -1) {
        const posMatch = /^S(\d+)$/i.exec(op.afterMacroStateId.trim());
        if (posMatch) {
          const posIdx = Number.parseInt(posMatch[1], 10) - 1;
          if (
            posIdx >= 0 &&
            posIdx < exec.macroStates.length &&
            exec.macroStates[posIdx].id.startsWith('__new_')
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
          `afterMacroStateId "${op.afterMacroStateId}" not found.`
        );
      }
      exec.macroStates.splice(afterIdx + 1, 0, created);
      return null;
    }

    case 'delete_macro_state': {
      const exec = working.executionMacroBlock;
      if (!exec) {
        return createOpError(
          opIndex,
          op.op,
          'TARGET_NOT_FOUND',
          'No Execution Macro-Block exists in this document.'
        );
      }
      const idx = exec.macroStates.findIndex((m) => m.id === op.macroStateId);
      if (idx === -1) {
        return createOpError(
          opIndex,
          op.op,
          'TARGET_NOT_FOUND',
          `Macro-State "${op.macroStateId}" not found.`
        );
      }
      exec.macroStates.splice(idx, 1);
      return null;
    }

    case 'reorder_macro_states': {
      const exec = working.executionMacroBlock;
      if (!exec) {
        return createOpError(
          opIndex,
          op.op,
          'TARGET_NOT_FOUND',
          'No Execution Macro-Block exists in this document.'
        );
      }
      if (op.afterMacroStateId === op.macroStateId) {
        return null;
      }
      const fromIdx = exec.macroStates.findIndex((m) => m.id === op.macroStateId);
      if (fromIdx === -1) {
        return createOpError(
          opIndex,
          op.op,
          'TARGET_NOT_FOUND',
          `Macro-State "${op.macroStateId}" not found.`
        );
      }
      if (
        op.afterMacroStateId !== null &&
        !exec.macroStates.some((m) => m.id === op.afterMacroStateId)
      ) {
        return createOpError(
          opIndex,
          op.op,
          'TARGET_NOT_FOUND',
          `afterMacroStateId "${op.afterMacroStateId}" not found.`
        );
      }

      const [moved] = exec.macroStates.splice(fromIdx, 1);
      if (op.afterMacroStateId === null) {
        exec.macroStates.unshift(moved);
      } else {
        const anchorIdx = exec.macroStates.findIndex((m) => m.id === op.afterMacroStateId);
        exec.macroStates.splice(anchorIdx + 1, 0, moved);
      }
      return null;
    }

    case 'replace_sub_state': {
      const exec = working.executionMacroBlock;
      if (!exec) {
        return createOpError(
          opIndex,
          op.op,
          'TARGET_NOT_FOUND',
          'No Execution Macro-Block exists in this document.'
        );
      }
      for (const ms of exec.macroStates) {
        const subIdx = ms.subStates.findIndex((s) => s.id === op.subStateId);
        if (subIdx !== -1) {
          ms.subStates[subIdx] = materializeSubState(op.subState, op.subStateId);
          return null;
        }
      }
      return createOpError(
        opIndex,
        op.op,
        'TARGET_NOT_FOUND',
        `Sub-State "${op.subStateId}" not found.`
      );
    }

    case 'insert_sub_state': {
      const exec = working.executionMacroBlock;
      if (!exec) {
        return createOpError(
          opIndex,
          op.op,
          'TARGET_NOT_FOUND',
          'No Execution Macro-Block exists in this document.'
        );
      }
      const ms = exec.macroStates.find((m) => m.id === op.macroStateId);
      if (!ms) {
        return createOpError(
          opIndex,
          op.op,
          'TARGET_NOT_FOUND',
          `Macro-State "${op.macroStateId}" not found.`
        );
      }
      const created = materializeSubState(op.subState, nextId());
      if (op.afterSubStateId === null) {
        ms.subStates.unshift(created);
        return null;
      }
      const afterIdx = ms.subStates.findIndex((s) => s.id === op.afterSubStateId);
      if (afterIdx === -1) {
        return createOpError(
          opIndex,
          op.op,
          'TARGET_NOT_FOUND',
          `afterSubStateId "${op.afterSubStateId}" not found in Macro-State "${op.macroStateId}".`
        );
      }
      ms.subStates.splice(afterIdx + 1, 0, created);
      return null;
    }

    case 'delete_sub_state': {
      const exec = working.executionMacroBlock;
      if (!exec) {
        return createOpError(
          opIndex,
          op.op,
          'TARGET_NOT_FOUND',
          'No Execution Macro-Block exists in this document.'
        );
      }
      for (let msIdx = 0; msIdx < exec.macroStates.length; msIdx++) {
        const ms = exec.macroStates[msIdx];
        const subIdx = ms.subStates.findIndex((s) => s.id === op.subStateId);
        if (subIdx !== -1) {
          ms.subStates.splice(subIdx, 1);
          if (ms.subStates.length === 0) {
            exec.macroStates.splice(msIdx, 1);
          }
          return null;
        }
      }
      return createOpError(
        opIndex,
        op.op,
        'TARGET_NOT_FOUND',
        `Sub-State "${op.subStateId}" not found.`
      );
    }
  }
}
