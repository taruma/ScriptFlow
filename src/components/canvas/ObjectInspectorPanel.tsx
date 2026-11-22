import {memo} from 'react';
import {X} from 'lucide-react';
import type {InferredGraphObject, ObjectCallSite} from '../../ui/canvas/index.ts';
import {UI_LABELS} from '../../ui/labels.ts';
import {getObjectColorVar} from './graphContext.tsx';

interface ObjectInspectorPanelProps {
  object: InferredGraphObject | null;
  onClose: () => void;
  onFocusCallSite: (site: ObjectCallSite) => void;
}

export const ObjectInspectorPanel = memo(function ObjectInspectorPanel({
  object,
  onClose,
  onFocusCallSite,
}: ObjectInspectorPanelProps) {
  if (!object) return null;

  const colorVar = getObjectColorVar(object.kind);

  return (
    <aside
      aria-label={UI_LABELS.graph.inspectorAria}
      className="pointer-events-auto absolute top-16 right-3 z-30 w-[332px] max-w-[calc(100%-24px)] rounded-2xl border bg-surface/95 backdrop-blur shadow-xl p-4 text-xs"
      style={{
        borderColor: 'color-mix(in srgb, var(--tok-continuity) 55%, var(--border-main))',
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-border-subtle">
        <div className="min-w-0">
          <div className="flex items-center flex-wrap gap-1.5">
            <span
              style={{
                color: colorVar,
                backgroundColor: `color-mix(in srgb, ${colorVar} 14%, transparent)`,
              }}
              className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider"
            >
              {object.category}
            </span>
            <span className="font-mono text-[10.5px] text-text-muted truncate">
              {UI_LABELS.graph.inspectorSourceFrom(object.sourceBlockName, object.sourceBlockId)}
            </span>
          </div>
          <h3 className="mt-1.5 text-sm font-bold text-text-main break-words">
            {object.label}
          </h3>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label={UI_LABELS.graph.inspectorCloseAria}
          className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors cursor-pointer shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Details */}
      <div className="mt-3 space-y-3">
        {(object.ref || object.voiceRef) && (
          <div className="flex flex-wrap gap-3">
            {object.ref && (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-text-faint mb-1">
                  {UI_LABELS.graph.inspectorBoundRefLabel}
                </div>
                <span
                  style={{
                    color: 'var(--graph-obj-staging_ref)',
                    backgroundColor:
                      'color-mix(in srgb, var(--graph-obj-staging_ref) 12%, transparent)',
                    borderColor:
                      'color-mix(in srgb, var(--graph-obj-staging_ref) 30%, transparent)',
                  }}
                  className="inline-flex items-center rounded-lg border px-2 py-0.5 font-mono text-xs font-medium"
                >
                  {object.ref}
                </span>
              </div>
            )}

            {object.voiceRef && (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-text-faint mb-1">
                  {UI_LABELS.graph.inspectorVoiceRefLabel}
                </div>
                <span
                  style={{
                    color: 'var(--graph-dim-score)',
                    backgroundColor:
                      'color-mix(in srgb, var(--graph-dim-score) 12%, transparent)',
                    borderColor:
                      'color-mix(in srgb, var(--graph-dim-score) 30%, transparent)',
                  }}
                  className="inline-flex items-center rounded-lg border px-2 py-0.5 font-mono text-xs font-medium"
                >
                  {object.voiceRef}
                </span>
              </div>
            )}
          </div>
        )}

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-faint mb-1">
            {UI_LABELS.graph.inspectorDetailLabel}
          </div>
          <p className="rounded-lg border border-border-subtle bg-surface-subtle p-2.5 text-xs leading-relaxed text-text-body select-text">
            {object.detail}
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-text-faint mb-1.5">
            <span>{UI_LABELS.graph.inspectorCallSitesLabel}</span>
            {!object.isStagingOnly && (
              <span className="font-mono tabular-nums">
                {UI_LABELS.graph.inspectorMatchCount(object.callSites.length)}
              </span>
            )}
          </div>

          {object.isStagingOnly ? (
            <p className="text-[11px] leading-relaxed text-text-muted">
              {UI_LABELS.graph.inspectorStagingOnlyNote}
            </p>
          ) : object.callSites.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto auteur-pane-scroll pr-0.5">
              {object.callSites.map((site, idx) => (
                <button
                  key={`${site.targetNodeId}-${idx}`}
                  type="button"
                  onClick={() => onFocusCallSite(site)}
                  title={UI_LABELS.graph.inspectorCallSiteTitle(site.display)}
                  className="rounded-md border border-border-main bg-surface-muted px-2 py-0.5 font-mono text-[11px] font-medium text-text-main hover:border-[var(--tok-continuity)] hover:bg-surface-hover transition-colors cursor-pointer whitespace-nowrap"
                >
                  {site.display}
                  {site.transition && site.transition !== 'NONE' && (
                    <span className="ml-1 text-[9.5px] text-text-muted">
                      · {site.transition}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-text-faint">0 matches</p>
          )}
        </div>
      </div>
    </aside>
  );
});
