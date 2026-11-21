import {renderSubState} from '../ir.ts';
import type {AuteurScriptIR, DerivedDiagnosticIR} from '../irSchemas.ts';

export function normalizeDiagnosticMessage(message: string): string {
  return message.replace(/(?<![@\[A-Za-z0-9_-])S\d+(?![A-Za-z0-9_\]-])/g, 'S#');
}

export function diagnosticSignature(d: DerivedDiagnosticIR, originTargetId = d.targetId): string {
  return `${originTargetId}::${d.ruleId}::${d.severity}::${normalizeDiagnosticMessage(d.message)}`;
}

/**
 * Maps each post-compilation snapshot ID (`MB#`, `S#`) back to its pre-patch origin ID
 * (`MB#`/`S#` for surviving nodes, or `__new_*` for newly inserted nodes) so beat or block
 * index shifts never cause false `LINT_ERROR_INTRODUCED` rejections or false resolutions.
 */
export function buildAfterToOriginTargetMap(working: AuteurScriptIR): Map<string, string> {
  const map = new Map<string, string>();

  working.stagingMacroBlocks.forEach((block, idx) => {
    map.set(`MB${idx}`, block.id);
  });

  if (working.executionMacroBlock) {
    let beatIdx = 0;
    for (const ms of working.executionMacroBlock.macroStates) {
      const renderedLine = ms.subStates
        .map((sub) => renderSubState(sub))
        .filter((segment) => segment.length > 0)
        .join(' -> ');
      if (renderedLine.length > 0) {
        beatIdx += 1;
        map.set(`S${beatIdx}`, ms.id);
      }
    }
  }

  return map;
}

export function diffDiagnostics(
  diagnosticsBefore: DerivedDiagnosticIR[],
  diagnosticsAfter: DerivedDiagnosticIR[],
  afterToOriginTargetId: Map<string, string>
): {
  introduced: DerivedDiagnosticIR[];
  resolved: DerivedDiagnosticIR[];
} {
  const beforeCounts = new Map<string, number>();
  for (const d of diagnosticsBefore) {
    const sig = diagnosticSignature(d);
    beforeCounts.set(sig, (beforeCounts.get(sig) ?? 0) + 1);
  }

  const remainingBefore = new Map(beforeCounts);
  const introduced: DerivedDiagnosticIR[] = [];
  const afterCounts = new Map<string, number>();

  for (const d of diagnosticsAfter) {
    const originId = afterToOriginTargetId.get(d.targetId) ?? d.targetId;
    const sig = diagnosticSignature(d, originId);
    afterCounts.set(sig, (afterCounts.get(sig) ?? 0) + 1);

    const prevCount = remainingBefore.get(sig) ?? 0;
    if (prevCount > 0) {
      remainingBefore.set(sig, prevCount - 1);
    } else {
      introduced.push(d);
    }
  }

  const remainingAfter = new Map(afterCounts);
  const resolved: DerivedDiagnosticIR[] = [];
  for (const d of diagnosticsBefore) {
    const sig = diagnosticSignature(d);
    const nextCount = remainingAfter.get(sig) ?? 0;
    if (nextCount > 0) {
      remainingAfter.set(sig, nextCount - 1);
    } else {
      resolved.push(d);
    }
  }

  return {introduced, resolved};
}
