import type {AuteurPatchOp, AuteurScriptIR} from '../irSchemas.ts';
import {applyExecutionOp} from './ops/executionOps.ts';
import {applyStagingOp} from './ops/stagingOps.ts';
import type {PatchError} from './types.ts';

export function applySingleOp(
  working: AuteurScriptIR,
  op: AuteurPatchOp,
  opIndex: number,
  nextId: () => string
): PatchError | null {
  switch (op.op) {
    case 'set_macro_block':
    case 'insert_macro_block':
    case 'delete_macro_block':
    case 'set_aesthetic_entry':
    case 'delete_aesthetic_entry':
    case 'upsert_token_mapping':
    case 'delete_token_mapping':
      return applyStagingOp(working, op, opIndex, nextId);

    case 'replace_macro_state':
    case 'insert_macro_state':
    case 'delete_macro_state':
    case 'reorder_macro_states':
    case 'replace_sub_state':
    case 'insert_sub_state':
    case 'delete_sub_state':
      return applyExecutionOp(working, op, opIndex, nextId);
  }
}
