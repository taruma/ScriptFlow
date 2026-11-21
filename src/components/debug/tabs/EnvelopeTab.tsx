import {useMemo} from 'react';
import {Check, Copy} from 'lucide-react';
import type {AuteurEnvelope} from '../../../core/index.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';

export type EnvelopeSubView = 'full' | 'document' | 'derived';

export interface EnvelopeTabProps {
  envelope: AuteurEnvelope;
  envelopeView: EnvelopeSubView;
  onChangeEnvelopeView: (view: EnvelopeSubView) => void;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
}

export function EnvelopeTab({
  envelope,
  envelopeView,
  onChangeEnvelopeView,
  copiedId,
  onCopy,
}: EnvelopeTabProps) {
  const envelopeJsonString = useMemo(() => {
    if (envelopeView === 'document') return JSON.stringify(envelope.document, null, 2);
    if (envelopeView === 'derived') return JSON.stringify(envelope.derived, null, 2);
    return JSON.stringify(envelope, null, 2);
  }, [envelope, envelopeView]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 border-b border-border-subtle bg-surface-subtle shrink-0">
        <div className={UI_TOKENS.button.segmentedGroup}>
          {(
            [
              {id: 'full', label: UI_LABELS.debug.envelopeViews.full},
              {id: 'document', label: UI_LABELS.debug.envelopeViews.document},
              {id: 'derived', label: UI_LABELS.debug.envelopeViews.derived},
            ] as const
          ).map(({id, label}) => (
            <button
              key={id}
              type="button"
              onClick={() => onChangeEnvelopeView(id)}
              className={
                envelopeView === id
                  ? UI_TOKENS.button.segmentedItemActive
                  : UI_TOKENS.button.segmentedItem
              }
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-text-faint tabular-nums">
            {UI_LABELS.debug.charsCount(envelopeJsonString.length)}
          </span>
          <button
            type="button"
            onClick={() => onCopy('envelope', envelopeJsonString)}
            className={
              copiedId === 'envelope'
                ? UI_TOKENS.button.actionPillActive
                : UI_TOKENS.button.actionPill
            }
          >
            {copiedId === 'envelope' ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span>
              {copiedId === 'envelope'
                ? UI_LABELS.debug.copiedJson
                : UI_LABELS.debug.copyJson}
            </span>
          </button>
        </div>
      </div>

      <pre className="flex-1 overflow-auto p-5 font-mono text-xs leading-relaxed text-text-body select-text whitespace-pre">
        {envelopeJsonString}
      </pre>
    </div>
  );
}
