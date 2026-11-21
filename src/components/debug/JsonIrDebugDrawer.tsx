import {useCallback, useEffect, useMemo, useState} from 'react';
import {
  AlertCircle,
  Braces,
  CheckCircle2,
  FileCode2,
  Filter,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import {
  exportPlainText,
  fromAuteurIR,
  toAuteurEnvelope,
  type LintRuleOverrides,
} from '../../core/index.ts';
import {copyTextToClipboard} from '../../ui/clipboard.ts';
import {UI_LABELS} from '../../ui/labels.ts';
import {UI_TOKENS} from '../../ui/tokens/ui.ts';
import {
  DraftCompilerTab,
  createInitialDraftCompilerState,
  type DraftCompilerState,
} from './tabs/DraftCompilerTab.tsx';
import {EnvelopeTab, type EnvelopeSubView} from './tabs/EnvelopeTab.tsx';
import {
  INITIAL_PATCH_SANDBOX_STATE,
  PatchSandboxTab,
  type PatchSandboxState,
} from './tabs/PatchSandboxTab.tsx';
import {SchemaExplorerTab, type SchemaKey} from './tabs/SchemaExplorerTab.tsx';
import {
  DEFAULT_SLICER_TAB_STATE,
  SlicerTab,
  type SlicerTabState,
} from './tabs/SlicerTab.tsx';

export interface JsonIrDebugDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  rawText: string;
  readOnly?: boolean;
  ruleOverrides?: LintRuleOverrides;
  onCommitRawText: (nextRawText: string, toastMessage?: string) => void;
}

type DebugTab = 'envelope' | 'slicer' | 'patch' | 'draft' | 'schemas';

/**
 * Decoupled, self-contained Debug Inspector for evaluating the pure core JSON IR,
 * Composable Lens Slicer, Transactional Patch Engine, Draft Compiler, and Zod JSON Schemas.
 * Performs zero work when closed.
 */
export function JsonIrDebugDrawer({
  isOpen,
  onClose,
  rawText,
  readOnly = false,
  ruleOverrides,
  onCommitRawText,
}: JsonIrDebugDrawerProps) {
  if (!isOpen) return null;

  return (
    <JsonIrDebugDrawerContent
      onClose={onClose}
      rawText={rawText}
      readOnly={readOnly}
      ruleOverrides={ruleOverrides}
      onCommitRawText={onCommitRawText}
    />
  );
}

function JsonIrDebugDrawerContent({
  onClose,
  rawText,
  readOnly = false,
  ruleOverrides,
  onCommitRawText,
}: Omit<JsonIrDebugDrawerProps, 'isOpen'>) {
  const [activeTab, setActiveTab] = useState<DebugTab>('envelope');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Lifted tab states preserve typed JSON, results, and filters across tab switches
  const [envelopeView, setEnvelopeView] = useState<EnvelopeSubView>('full');
  const [slicerState, setSlicerState] = useState<SlicerTabState>(DEFAULT_SLICER_TAB_STATE);
  const [patchState, setPatchState] = useState<PatchSandboxState>(INITIAL_PATCH_SANDBOX_STATE);
  const [draftState, setDraftState] = useState<DraftCompilerState>(createInitialDraftCompilerState);
  const [activeSchemaKey, setActiveSchemaKey] = useState<SchemaKey>('draft');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!copiedId) return;
    const timer = window.setTimeout(() => setCopiedId(null), 1600);
    return () => window.clearTimeout(timer);
  }, [copiedId]);

  // Pure core derivations (only computed while inspector is open)
  const envelope = useMemo(
    () => toAuteurEnvelope(rawText, ruleOverrides),
    [rawText, ruleOverrides]
  );
  const roundTripExact = useMemo(
    () => fromAuteurIR(envelope.document) === exportPlainText(rawText),
    [envelope.document, rawText]
  );

  const totalSubStates = useMemo(
    () =>
      (envelope.document.executionMacroBlock?.macroStates ?? []).reduce(
        (sum, ms) => sum + ms.subStates.length,
        0
      ),
    [envelope.document.executionMacroBlock]
  );

  const handleCopy = useCallback(async (id: string, text: string) => {
    const ok = await copyTextToClipboard(text);
    if (ok) setCopiedId(id);
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={UI_LABELS.debug.dialogAria}
      className={UI_TOKENS.modal.overlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface border border-border-main rounded-2xl shadow-2xl w-full max-w-6xl h-[86vh] flex flex-col overflow-hidden text-text-main">
        {/* Top Modal Header */}
        <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-border-main bg-surface-subtle shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-border-main bg-surface text-text-main shrink-0">
              <Braces className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-sm font-bold tracking-tight text-text-main truncate">
                  {UI_LABELS.debug.title}
                </h2>
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-md border border-border-main bg-surface text-text-muted">
                  {UI_LABELS.debug.versionBadge(
                    envelope.document.schemaVersion,
                    envelope.snapshotHash
                  )}
                </span>
                <span
                  className={`inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded-md border ${
                    roundTripExact
                      ? 'auteur-phase-aesthetic'
                      : 'border-red-500/40 bg-red-500/10 text-red-500'
                  }`}
                >
                  {roundTripExact ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <AlertCircle className="h-3 w-3" />
                  )}
                  <span>
                    {roundTripExact
                      ? UI_LABELS.debug.roundTripPass
                      : UI_LABELS.debug.roundTripDiff}
                  </span>
                </span>
              </div>
              <p className="text-[11px] text-text-muted truncate">{UI_LABELS.debug.subtitle}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={UI_LABELS.debug.closeAria}
            className={UI_TOKENS.button.iconClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation Tab Bar + Compact Document Stats */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2 border-b border-border-subtle bg-surface shrink-0">
          <div role="tablist" className={UI_TOKENS.button.segmentedGroup}>
            {(
              [
                {id: 'envelope', label: UI_LABELS.debug.tabs.envelope, icon: Braces},
                {id: 'slicer', label: UI_LABELS.debug.tabs.slicer, icon: Filter},
                {id: 'patch', label: UI_LABELS.debug.tabs.patch, icon: Wrench},
                {id: 'draft', label: UI_LABELS.debug.tabs.draft, icon: Sparkles},
                {id: 'schemas', label: UI_LABELS.debug.tabs.schemas, icon: FileCode2},
              ] as const
            ).map(({id, label, icon: Icon}) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                onClick={() => setActiveTab(id)}
                className={
                  activeTab === id
                    ? UI_TOKENS.button.segmentedItemActive
                    : UI_TOKENS.button.segmentedItem
                }
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="hidden lg:flex items-center gap-3 font-mono text-[11px] text-text-faint tabular-nums">
            <span>
              {UI_LABELS.debug.stats.macroBlocks(envelope.document.stagingMacroBlocks.length)}
            </span>
            <span>·</span>
            <span>
              {UI_LABELS.debug.stats.macroStates(
                envelope.document.executionMacroBlock?.macroStates.length ?? 0
              )}
            </span>
            <span>·</span>
            <span>{UI_LABELS.debug.stats.subStates(totalSubStates)}</span>
            <span>·</span>
            <span>{UI_LABELS.debug.stats.tokens(envelope.derived.tokenMappings.length)}</span>
            <span>·</span>
            <span>{UI_LABELS.debug.stats.refs(envelope.derived.referenceBindings.length)}</span>
            <span>·</span>
            <span className="text-text-muted">{envelope.derived.sceneTopology}</span>
          </div>
        </div>

        {/* Main Workspace Body */}
        <div className="flex-1 min-h-0 overflow-hidden bg-app">
          {activeTab === 'envelope' && (
            <EnvelopeTab
              envelope={envelope}
              envelopeView={envelopeView}
              onChangeEnvelopeView={setEnvelopeView}
              copiedId={copiedId}
              onCopy={handleCopy}
            />
          )}

          {activeTab === 'slicer' && (
            <SlicerTab
              envelope={envelope}
              state={slicerState}
              setState={setSlicerState}
              copiedId={copiedId}
              onCopy={handleCopy}
            />
          )}

          {activeTab === 'patch' && (
            <PatchSandboxTab
              envelope={envelope}
              rawText={rawText}
              readOnly={readOnly}
              ruleOverrides={ruleOverrides}
              onCommitRawText={onCommitRawText}
              state={patchState}
              setState={setPatchState}
            />
          )}

          {activeTab === 'draft' && (
            <DraftCompilerTab
              document={envelope.document}
              readOnly={readOnly}
              ruleOverrides={ruleOverrides}
              onCommitRawText={onCommitRawText}
              state={draftState}
              setState={setDraftState}
            />
          )}

          {activeTab === 'schemas' && (
            <SchemaExplorerTab
              activeSchemaKey={activeSchemaKey}
              onChangeSchemaKey={setActiveSchemaKey}
              copiedId={copiedId}
              onCopy={handleCopy}
            />
          )}
        </div>
      </div>
    </div>
  );
}
