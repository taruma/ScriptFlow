import {RotateCcw} from 'lucide-react';
import {DEFAULT_FOUNDATIONAL_CRAFT} from '../../../services/auteurKnowledge.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';

export interface FoundationalCraftTabProps {
  foundationalCraftOverride: string | null;
  onSetFoundationalCraft: (value: string | null) => void;
}

export function FoundationalCraftTab({
  foundationalCraftOverride,
  onSetFoundationalCraft,
}: FoundationalCraftTabProps) {
  const labels = UI_LABELS.ai.contextInspector;
  const foundationalCraftValue = foundationalCraftOverride ?? DEFAULT_FOUNDATIONAL_CRAFT;
  const isFoundationalModified = foundationalCraftOverride !== null;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border-subtle bg-surface p-4 space-y-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-text-main">
                {labels.foundationalCraftHeading}
              </h3>
              {isFoundationalModified && (
                <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] auteur-phase-intent">
                  {labels.modifiedBadge}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-text-muted leading-relaxed">
              {labels.foundationalCraftDesc}
            </p>
          </div>
          <button
            type="button"
            disabled={!isFoundationalModified}
            onClick={() => onSetFoundationalCraft(null)}
            className={`${UI_TOKENS.button.actionPill} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <RotateCcw className="h-3 w-3" />
            <span>{labels.resetToDefaultButton}</span>
          </button>
        </div>

        <textarea
          data-native-undo="true"
          aria-label={labels.foundationalCraftAria}
          rows={18}
          value={foundationalCraftValue}
          onChange={(event) => onSetFoundationalCraft(event.target.value)}
          className={`${UI_TOKENS.input.field} font-mono text-[11px] leading-relaxed auteur-pane-scroll resize-y`}
        />
      </section>
    </div>
  );
}
