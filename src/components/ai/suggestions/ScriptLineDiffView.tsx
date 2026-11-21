import {memo} from 'react';
import type {ScriptLineDiff} from '../../../services/scriptTools.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';

export interface ScriptLineDiffViewProps {
  diff: ScriptLineDiff;
}

export const ScriptLineDiffView = memo(function ScriptLineDiffView({
  diff,
}: ScriptLineDiffViewProps) {
  const labels = UI_LABELS.ai.suggestions;

  if (!diff.hasChanges) {
    return (
      <div className="rounded-lg border border-border-subtle bg-app px-3 py-2 text-[11px] text-text-muted">
        {labels.noTextChanges}
      </div>
    );
  }

  return (
    <div className={UI_TOKENS.ai.diffContainer}>
      <div className="min-w-max py-1">
        {diff.lines.map((line, index) => {
          const isAdded = line.type === 'added';
          const isRemoved = line.type === 'removed';
          const rowClass = isAdded
            ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
            : isRemoved
              ? 'bg-red-500/12 text-red-700 dark:text-red-300'
              : 'text-text-muted';
          const marker = isAdded ? '+' : isRemoved ? '−' : ' ';
          const lineNo = isAdded
            ? line.afterLineNumber
            : isRemoved
              ? line.beforeLineNumber
              : line.afterLineNumber;

          return (
            <div key={index} className={`flex px-2 py-0.5 ${rowClass}`}>
              <span className="w-7 shrink-0 select-none pr-2 text-right text-[10px] opacity-55 tabular-nums">
                {lineNo ?? ''}
              </span>
              <span className="w-3.5 shrink-0 select-none font-bold">{marker}</span>
              <span className="whitespace-pre">{line.text || ' '}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
