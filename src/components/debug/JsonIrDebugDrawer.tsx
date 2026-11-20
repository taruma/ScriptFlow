import {useCallback, useEffect, useMemo, useState} from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Braces,
  Check,
  CheckCircle2,
  Copy,
  FileCode2,
  Filter,
  Play,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import {
  AUDIT_LENS_PRESETS,
  applyAuteurPatch,
  compileAuteurDraft,
  exportPlainText,
  fromAuteurIR,
  getAuteurJsonSchemas,
  sliceAuteurEnvelope,
  toAuteurEnvelope,
  type AuteurJsonSchemaRegistry,
  type AuteurLensPresetId,
  type CompileDraftResult,
  type LensSliceSpec,
  type PatchApplyResult,
  type SubStateDimension,
} from '../../core/index.ts';
import {copyTextToClipboard} from '../../ui/clipboard.ts';
import {UI_LABELS} from '../../ui/labels.ts';
import {UI_TOKENS} from '../../ui/tokens/ui.ts';

export interface JsonIrDebugDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  rawText: string;
  readOnly?: boolean;
  onCommitRawText: (nextRawText: string, toastMessage?: string) => void;
}

type DebugTab = 'envelope' | 'slicer' | 'patch' | 'draft' | 'schemas';
type EnvelopeSubView = 'full' | 'document' | 'derived';
type SchemaKey = keyof AuteurJsonSchemaRegistry;
type TokenMappingMode = 'off' | 'referenced' | 'all';

const ALL_DIMENSIONS: SubStateDimension[] = [
  'camera',
  'action',
  'block',
  'light',
  'state_boundary',
  'tier2',
  'dialogue',
  'foley',
  'score',
  'onscreen_text',
  'plain',
];

const LENS_PRESET_IDS: AuteurLensPresetId[] = [
  'lens1_spatial_optics',
  'lens2_temporal_pacing_wear',
  'lens3_props_inventory',
  'lens4_acoustics_voice',
  'lens5_blocks_grammar',
];

const SCHEMA_KEYS: SchemaKey[] = ['draft', 'ir', 'envelope', 'patch', 'review'];

function buildSampleDraftJson(): string {
  return JSON.stringify(
    {
      stagingMacroBlocks: [
        {
          header: 'INTENT',
          format: 'prose',
          body: 'Create a taut detective scene in a rainy archive featuring @image1 as Ada (voice: @audio1) inspecting a forged ledger.',
        },
        {
          header: 'LOGIC',
          format: 'prose',
          body: 'Keep Ada frame-left facing screen-right with a brass magnifying glass in her right hand. No subtitles appear on screen.',
        },
        {
          header: 'AESTHETIC',
          format: 'key_value',
          entries: [
            {key: 'Medium', value: '35mm film, warm tungsten grain'},
            {key: 'Location', value: 'rainy wood-paneled archive -> LOC01'},
            {key: 'Audio', value: 'rain tapping on glass, distant clock tick'},
          ],
        },
        {
          header: 'OPENING',
          format: 'prose',
          body: 'MS at eye level across the oak desk. Frame-left, Ada sits facing screen-right with a brass magnifying glass resting in her right hand.',
        },
      ],
      executionMacroBlock: {
        header: 'EXECUTION',
        macroStates: [
          {
            subStates: [
              {dimension: 'camera', subStateTag: 'CAM', identifier: '01', content: 'MS on Ada in LOC01'},
              {
                dimension: 'action',
                subStateTag: 'ACT',
                content: 'Ada lifts the brass magnifying glass in her right hand over the ledger date',
              },
              {dimension: 'dialogue', speaker: 'Ada', modifiers: '(low)', line: 'The ink is still fresh.'},
              {dimension: 'foley', sound: 'crisp ledger page turning'},
            ],
          },
          {
            subStates: [
              {dimension: 'camera', subStateTag: 'CAM', identifier: '01', content: ''},
              {
                dimension: 'action',
                subStateTag: 'ACT',
                content: 'Ada sets the glass down with her right hand and turns her gaze toward the door',
              },
              {dimension: 'foley', sound: 'brass rim clinking on oak'},
            ],
          },
        ],
      },
    },
    null,
    2
  );
}

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
  onCommitRawText,
}: JsonIrDebugDrawerProps) {
  if (!isOpen) return null;

  return (
    <JsonIrDebugDrawerContent
      onClose={onClose}
      rawText={rawText}
      readOnly={readOnly}
      onCommitRawText={onCommitRawText}
    />
  );
}

function JsonIrDebugDrawerContent({
  onClose,
  rawText,
  readOnly = false,
  onCommitRawText,
}: Omit<JsonIrDebugDrawerProps, 'isOpen'>) {
  const [activeTab, setActiveTab] = useState<DebugTab>('envelope');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Envelope state
  const [envelopeView, setEnvelopeView] = useState<EnvelopeSubView>('full');

  // Lens Slicer state (defaults to "ACT + Resolved CAM" for immediate evaluation)
  const [activePresetLabel, setActivePresetLabel] = useState<string>('custom_act_cam');
  const [selectedMacroBlocks, setSelectedMacroBlocks] = useState<string[]>(['LOGIC', 'OPENING']);
  const [selectedAestheticKeys, setSelectedAestheticKeys] = useState<string[]>([]);
  const [selectedDimensions, setSelectedDimensions] = useState<SubStateDimension[]>(['action']);
  const [includeResolvedCamera, setIncludeResolvedCamera] = useState<boolean>(true);
  const [includeReferenceBindings, setIncludeReferenceBindings] = useState<boolean>(false);
  const [includeSceneTopology, setIncludeSceneTopology] = useState<boolean>(true);
  const [includeTrailingResolution, setIncludeTrailingResolution] = useState<boolean>(false);
  const [tokenMappingMode, setTokenMappingMode] = useState<TokenMappingMode>('referenced');

  // Patch Sandbox state
  const [patchText, setPatchText] = useState<string>('');
  const [rejectOnNewErrors, setRejectOnNewErrors] = useState<boolean>(true);
  const [patchResult, setPatchResult] = useState<PatchApplyResult | null>(null);
  const [patchParseError, setPatchParseError] = useState<string | null>(null);

  // Draft Compiler state
  const [draftText, setDraftText] = useState<string>(buildSampleDraftJson);
  const [draftResult, setDraftResult] = useState<CompileDraftResult | null>(null);
  const [draftParseError, setDraftParseError] = useState<string | null>(null);

  // Schema Explorer state
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
  const envelope = useMemo(() => toAuteurEnvelope(rawText), [rawText]);
  const roundTripExact = useMemo(
    () => fromAuteurIR(envelope.document) === exportPlainText(rawText),
    [envelope.document, rawText]
  );
  const schemas = useMemo(() => getAuteurJsonSchemas(), []);

  const availableMacroBlocks = useMemo(
    () => Array.from(new Set(envelope.document.stagingMacroBlocks.map((b) => b.header))),
    [envelope.document.stagingMacroBlocks]
  );

  const availableAestheticKeys = useMemo(() => {
    const aesthetic = envelope.document.stagingMacroBlocks.find((b) => b.format === 'key_value');
    if (!aesthetic || aesthetic.format !== 'key_value') return [];
    return Array.from(
      new Set(
        aesthetic.entries
          .map((e) => e.key)
          .filter((k): k is string => k !== null && k.trim().length > 0)
      )
    );
  }, [envelope.document.stagingMacroBlocks]);

  // Seed initial sample patch when opening Patch tab with empty textarea
  const buildActionEditSample = useCallback(() => {
    const firstAction = envelope.document.executionMacroBlock?.macroStates
      .flatMap((ms) => ms.subStates)
      .find((s) => s.dimension === 'action');
    const targetSubId = firstAction?.id ?? 'S1.1';
    const currentText =
      firstAction && firstAction.dimension === 'action'
        ? firstAction.content
        : 'Character leans forward deliberately';
    return JSON.stringify(
      {
        expectedSnapshotHash: envelope.snapshotHash,
        summary: `Refine ${targetSubId} physical action`,
        ops: [
          {
            op: 'replace_sub_state',
            subStateId: targetSubId,
            subState: {
              dimension: 'action',
              subStateTag: 'ACT',
              content: `${currentText} with sharp, controlled precision`,
            },
          },
        ],
      },
      null,
      2
    );
  }, [envelope]);

  const buildTokenMappingSample = useCallback(() => {
    return JSON.stringify(
      {
        expectedSnapshotHash: envelope.snapshotHash,
        summary: 'Add shorthand token mapping LOC01 in [AESTHETIC]',
        ops: [
          {
            op: 'upsert_token_mapping',
            category: 'Location',
            description: 'dim concrete staging room',
            token: 'LOC01',
          },
        ],
      },
      null,
      2
    );
  }, [envelope.snapshotHash]);

  const buildLintGateSample = useCallback(() => {
    const firstAction = envelope.document.executionMacroBlock?.macroStates
      .flatMap((ms) => ms.subStates)
      .find((s) => s.dimension === 'action');
    const targetSubId = firstAction?.id ?? 'S1.1';
    return JSON.stringify(
      {
        expectedSnapshotHash: envelope.snapshotHash,
        summary: 'Intentional banned theatrical term to verify lint gate',
        ops: [
          {
            op: 'replace_sub_state',
            subStateId: targetSubId,
            subState: {
              dimension: 'action',
              subStateTag: 'ACT',
              content: 'Subject crosses stage-left toward the table',
            },
          },
        ],
      },
      null,
      2
    );
  }, [envelope]);

  useEffect(() => {
    if (patchText.trim().length === 0) {
      setPatchText(buildActionEditSample());
    }
  }, [patchText, buildActionEditSample]);

  // Envelope JSON string
  const envelopeJsonString = useMemo(() => {
    if (envelopeView === 'document') return JSON.stringify(envelope.document, null, 2);
    if (envelopeView === 'derived') return JSON.stringify(envelope.derived, null, 2);
    return JSON.stringify(envelope, null, 2);
  }, [envelope, envelopeView]);

  const fullEnvelopeByteLen = useMemo(() => JSON.stringify(envelope).length, [envelope]);

  // Active Lens Slice computation
  const sliceSpec = useMemo<LensSliceSpec>(() => {
    return {
      ...(selectedMacroBlocks.length > 0 ? {macroBlocks: selectedMacroBlocks} : {macroBlocks: []}),
      ...(selectedAestheticKeys.length > 0 ? {aestheticKeys: selectedAestheticKeys} : {}),
      ...(selectedDimensions.length > 0
        ? {dimensions: selectedDimensions}
        : {includeAllSubStates: true}),
      includeResolvedCamera,
      includeReferenceBindings,
      includeSceneTopology,
      includeTrailingResolution,
      ...(tokenMappingMode !== 'off' ? {includeTokenMappings: tokenMappingMode} : {}),
    };
  }, [
    selectedMacroBlocks,
    selectedAestheticKeys,
    selectedDimensions,
    includeResolvedCamera,
    includeReferenceBindings,
    includeSceneTopology,
    includeTrailingResolution,
    tokenMappingMode,
  ]);

  const slicedOutput = useMemo(
    () => sliceAuteurEnvelope(envelope, sliceSpec),
    [envelope, sliceSpec]
  );

  const slicedJsonString = useMemo(() => JSON.stringify(slicedOutput, null, 2), [slicedOutput]);
  const sliceCompressionPct = useMemo(() => {
    const slicedLen = JSON.stringify(slicedOutput).length;
    if (fullEnvelopeByteLen === 0) return 0;
    return Math.max(0, Math.round((1 - slicedLen / fullEnvelopeByteLen) * 100));
  }, [slicedOutput, fullEnvelopeByteLen]);

  const applyPresetToSlicer = useCallback(
    (presetId: AuteurLensPresetId | 'custom_act_cam') => {
      setActivePresetLabel(presetId);
      if (presetId === 'custom_act_cam') {
        setSelectedMacroBlocks(['LOGIC', 'OPENING']);
        setSelectedAestheticKeys([]);
        setSelectedDimensions(['action']);
        setIncludeResolvedCamera(true);
        setIncludeReferenceBindings(false);
        setIncludeSceneTopology(true);
        setIncludeTrailingResolution(false);
        setTokenMappingMode('referenced');
        return;
      }

      const preset = AUDIT_LENS_PRESETS[presetId];
      setSelectedMacroBlocks(preset.macroBlocks ?? availableMacroBlocks);
      setSelectedAestheticKeys(preset.aestheticKeys ?? []);
      setSelectedDimensions(preset.includeAllSubStates ? [] : (preset.dimensions ?? []));
      setIncludeResolvedCamera(Boolean(preset.includeResolvedCamera));
      setIncludeReferenceBindings(Boolean(preset.includeReferenceBindings));
      setIncludeSceneTopology(Boolean(preset.includeSceneTopology));
      setIncludeTrailingResolution(Boolean(preset.includeTrailingResolution));
      if (preset.includeTokenMappings === 'all') setTokenMappingMode('all');
      else if (preset.includeTokenMappings === 'referenced') setTokenMappingMode('referenced');
      else setTokenMappingMode('off');
    },
    [availableMacroBlocks]
  );

  const handleCopy = useCallback(async (id: string, text: string) => {
    const ok = await copyTextToClipboard(text);
    if (ok) setCopiedId(id);
  }, []);

  const runPatch = useCallback(
    (commit: boolean) => {
      setPatchParseError(null);
      let parsed: unknown;
      try {
        parsed = JSON.parse(patchText);
      } catch (err) {
        setPatchResult(null);
        setPatchParseError(
          err instanceof Error ? err.message : UI_LABELS.debug.invalidJsonSyntax
        );
        return;
      }

      const result = applyAuteurPatch(rawText, parsed, {rejectOnNewErrors});
      setPatchResult(result);

      if (commit && !readOnly && result.ok) {
        onCommitRawText(result.nextRawText, UI_LABELS.debug.patch.committedToast);
      }
    },
    [patchText, rawText, rejectOnNewErrors, readOnly, onCommitRawText]
  );

  const runDraftCompile = useCallback(
    (applyToEditor: boolean) => {
      setDraftParseError(null);
      let parsed: unknown;
      try {
        parsed = JSON.parse(draftText);
      } catch (err) {
        setDraftResult(null);
        setDraftParseError(
          err instanceof Error ? err.message : UI_LABELS.debug.invalidJsonSyntax
        );
        return;
      }

      const result = compileAuteurDraft(parsed);
      setDraftResult(result);

      if (applyToEditor && !readOnly && result.ok) {
        onCommitRawText(result.rawText, UI_LABELS.debug.draft.appliedToast);
      }
    },
    [draftText, readOnly, onCommitRawText]
  );

  const loadCurrentAsDraft = useCallback(() => {
    const stripped = {
      stagingMacroBlocks: envelope.document.stagingMacroBlocks.map((block) =>
        block.format === 'key_value'
          ? {
              header: block.header,
              format: 'key_value' as const,
              entries: block.entries.map(({key, value}) => ({key, value})),
            }
          : {
              header: block.header,
              format: 'prose' as const,
              body: block.body,
            }
      ),
      executionMacroBlock: envelope.document.executionMacroBlock
        ? {
            header: envelope.document.executionMacroBlock.header,
            macroStates: envelope.document.executionMacroBlock.macroStates.map((ms) => ({
              subStates: ms.subStates.map(({id: _omit, ...rest}) => rest),
            })),
          }
        : null,
    };
    setDraftText(JSON.stringify(stripped, null, 2));
    setDraftResult(null);
    setDraftParseError(null);
  }, [envelope.document]);

  const activeSchemaString = useMemo(
    () => JSON.stringify(schemas[activeSchemaKey], null, 2),
    [schemas, activeSchemaKey]
  );

  const totalSubStates = useMemo(
    () =>
      (envelope.document.executionMacroBlock?.macroStates ?? []).reduce(
        (sum, ms) => sum + ms.subStates.length,
        0
      ),
    [envelope.document.executionMacroBlock]
  );

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
          {/* TAB 1: ENVELOPE & IR */}
          {activeTab === 'envelope' && (
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
                      onClick={() => setEnvelopeView(id)}
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
                    onClick={() => handleCopy('envelope', envelopeJsonString)}
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
          )}

          {/* TAB 2: COMPOSABLE LENS SLICER */}
          {activeTab === 'slicer' && (
            <div className="h-full grid grid-cols-1 md:grid-cols-12 min-h-0">
              {/* Left Controls */}
              <div className="md:col-span-4 border-b md:border-b-0 md:border-r border-border-main bg-surface overflow-y-auto p-4 space-y-5">
                {/* Presets */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={UI_TOKENS.layout.sectionTitleMini}>
                      {UI_LABELS.debug.slicer.presetsHeading}
                    </span>
                    <button
                      type="button"
                      onClick={() => applyPresetToSlicer('custom_act_cam')}
                      className="text-[11px] font-medium text-text-muted hover:text-text-main cursor-pointer"
                    >
                      {UI_LABELS.debug.slicer.resetFilters}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyPresetToSlicer('custom_act_cam')}
                      className={
                        activePresetLabel === 'custom_act_cam'
                          ? UI_TOKENS.button.actionPillActive
                          : UI_TOKENS.button.actionPill
                      }
                    >
                      {UI_LABELS.debug.slicer.customActCamPreset}
                    </button>
                    {LENS_PRESET_IDS.map((presetId) => (
                      <button
                        key={presetId}
                        type="button"
                        onClick={() => applyPresetToSlicer(presetId)}
                        className={
                          activePresetLabel === presetId
                            ? UI_TOKENS.button.actionPillActive
                            : UI_TOKENS.button.actionPill
                        }
                      >
                        {UI_LABELS.debug.slicer.lensPresetShortLabels[presetId]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Staging Macro-Blocks */}
                <div className="space-y-2">
                  <span className={UI_TOKENS.layout.sectionTitleMini}>
                    {UI_LABELS.debug.slicer.macroBlocksHeading}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {availableMacroBlocks.map((header) => {
                      const active = selectedMacroBlocks.includes(header);
                      return (
                        <button
                          key={header}
                          type="button"
                          onClick={() => {
                            setActivePresetLabel('custom');
                            setSelectedMacroBlocks((prev) =>
                              prev.includes(header)
                                ? prev.filter((item) => item !== header)
                                : [...prev, header]
                            );
                          }}
                          className={`px-2 py-1 rounded-lg font-mono text-[11px] border transition-colors cursor-pointer ${
                            active
                              ? 'bg-btn-primary-bg text-btn-primary-text border-btn-primary-bg'
                              : 'bg-surface-subtle text-text-muted border-border-main hover:text-text-main'
                          }`}
                        >
                          [{header}]
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* [AESTHETIC] Keys */}
                {availableAestheticKeys.length > 0 && (
                  <div className="space-y-2">
                    <span className={UI_TOKENS.layout.sectionTitleMini}>
                      {UI_LABELS.debug.slicer.aestheticKeysHeading}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {availableAestheticKeys.map((key) => {
                        const active = selectedAestheticKeys.includes(key);
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              setActivePresetLabel('custom');
                              setSelectedAestheticKeys((prev) =>
                                prev.includes(key)
                                  ? prev.filter((item) => item !== key)
                                  : [...prev, key]
                              );
                            }}
                            className={`px-2 py-1 rounded-lg font-mono text-[11px] border transition-colors cursor-pointer ${
                              active
                                ? 'auteur-phase-aesthetic'
                                : 'bg-surface-subtle text-text-muted border-border-main hover:text-text-main'
                            }`}
                          >
                            {key}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Execution Sub-State Dimensions */}
                <div className="space-y-2">
                  <span className={UI_TOKENS.layout.sectionTitleMini}>
                    {UI_LABELS.debug.slicer.dimensionsHeading}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_DIMENSIONS.map((dim) => {
                      const active = selectedDimensions.includes(dim);
                      return (
                        <button
                          key={dim}
                          type="button"
                          onClick={() => {
                            setActivePresetLabel('custom');
                            setSelectedDimensions((prev) =>
                              prev.includes(dim)
                                ? prev.filter((item) => item !== dim)
                                : [...prev, dim]
                            );
                          }}
                          className={`px-2 py-1 rounded-lg font-mono text-[11px] border transition-colors cursor-pointer ${
                            active
                              ? 'auteur-tok-tag'
                              : 'bg-surface-subtle text-text-muted border-border-main hover:text-text-main'
                          }`}
                        >
                          {dim}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Derived Context Flags */}
                <div className="space-y-2">
                  <span className={UI_TOKENS.layout.sectionTitleMini}>
                    {UI_LABELS.debug.slicer.optionsHeading}
                  </span>
                  <div className="space-y-1.5 text-xs text-text-body">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeResolvedCamera}
                        onChange={(e) => {
                          setActivePresetLabel('custom');
                          setIncludeResolvedCamera(e.target.checked);
                        }}
                      />
                      <span>{UI_LABELS.debug.slicer.resolvedCameraLabel}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeReferenceBindings}
                        onChange={(e) => {
                          setActivePresetLabel('custom');
                          setIncludeReferenceBindings(e.target.checked);
                        }}
                      />
                      <span>{UI_LABELS.debug.slicer.referenceBindingsLabel}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeSceneTopology}
                        onChange={(e) => {
                          setActivePresetLabel('custom');
                          setIncludeSceneTopology(e.target.checked);
                        }}
                      />
                      <span>{UI_LABELS.debug.slicer.sceneTopologyLabel}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeTrailingResolution}
                        onChange={(e) => {
                          setActivePresetLabel('custom');
                          setIncludeTrailingResolution(e.target.checked);
                        }}
                      />
                      <span>{UI_LABELS.debug.slicer.trailingResolutionLabel}</span>
                    </label>
                    <div className="pt-1 flex items-center justify-between gap-2">
                      <span className="text-text-muted">
                        {UI_LABELS.debug.slicer.tokenMappingsLabel}
                      </span>
                      <div className={UI_TOKENS.button.segmentedGroup}>
                        {(['off', 'referenced', 'all'] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => {
                              setActivePresetLabel('custom');
                              setTokenMappingMode(mode);
                            }}
                            className={
                              tokenMappingMode === mode
                                ? UI_TOKENS.button.segmentedItemActive
                                : UI_TOKENS.button.segmentedItem
                            }
                          >
                            {UI_LABELS.debug.slicer.tokenMappingModes[mode]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Sliced JSON Output */}
              <div className="md:col-span-8 flex flex-col min-h-0">
                <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border-subtle bg-surface-subtle shrink-0">
                  <div className="flex items-center gap-2">
                    <span className={UI_TOKENS.layout.sectionTitleMini}>
                      {UI_LABELS.debug.slicer.outputHeading}
                    </span>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-md border border-border-main bg-surface text-text-muted tabular-nums">
                      {UI_LABELS.debug.slicer.compressionBadge(sliceCompressionPct)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy('slice', slicedJsonString)}
                    className={
                      copiedId === 'slice'
                        ? UI_TOKENS.button.actionPillActive
                        : UI_TOKENS.button.actionPill
                    }
                  >
                    {copiedId === 'slice' ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    <span>
                      {copiedId === 'slice'
                        ? UI_LABELS.debug.copiedJson
                        : UI_LABELS.debug.copyJson}
                    </span>
                  </button>
                </div>
                <pre className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed text-text-body select-text whitespace-pre">
                  {slicedJsonString}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 3: TRANSACTIONAL PATCH SANDBOX */}
          {activeTab === 'patch' && (
            <div className="h-full grid grid-cols-1 md:grid-cols-2 min-h-0">
              {/* Left Patch Input */}
              <div className="flex flex-col min-h-0 border-b md:border-b-0 md:border-r border-border-main bg-surface">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-border-subtle bg-surface-subtle shrink-0">
                  <span className={UI_TOKENS.layout.sectionTitleMini}>
                    {UI_LABELS.debug.patch.inputHeading}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setPatchText(buildActionEditSample());
                        setPatchResult(null);
                        setPatchParseError(null);
                      }}
                      className={UI_TOKENS.button.actionPill}
                    >
                      {UI_LABELS.debug.patch.sampleEditAction}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPatchText(buildTokenMappingSample());
                        setPatchResult(null);
                        setPatchParseError(null);
                      }}
                      className={UI_TOKENS.button.actionPill}
                    >
                      {UI_LABELS.debug.patch.sampleTokenMapping}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPatchText(buildLintGateSample());
                        setPatchResult(null);
                        setPatchParseError(null);
                      }}
                      className={UI_TOKENS.button.actionPill}
                    >
                      {UI_LABELS.debug.patch.sampleLintFail}
                    </button>
                  </div>
                </div>

                <textarea
                  value={patchText}
                  onChange={(e) => setPatchText(e.target.value)}
                  spellCheck={false}
                  aria-label={UI_LABELS.debug.patch.inputHeading}
                  placeholder={UI_LABELS.debug.patch.placeholder}
                  className="flex-1 w-full resize-none bg-surface p-4 font-mono text-xs leading-relaxed text-text-body focus:outline-none"
                />

                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-t border-border-subtle bg-surface-subtle shrink-0">
                  <label className="flex items-center gap-2 text-xs text-text-body cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rejectOnNewErrors}
                      onChange={(e) => setRejectOnNewErrors(e.target.checked)}
                    />
                    <span>{UI_LABELS.debug.patch.rejectOnNewErrors}</span>
                  </label>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => runPatch(false)}
                      className={UI_TOKENS.button.secondary}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Play className="h-3.5 w-3.5" />
                        <span>{UI_LABELS.debug.patch.dryRun}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={readOnly}
                      title={readOnly ? UI_LABELS.debug.readOnlyCommitHint : undefined}
                      onClick={() => runPatch(true)}
                      className={`${UI_TOKENS.button.primary} disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      {UI_LABELS.debug.patch.commitToEditor}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Patch Result */}
              <div className="flex flex-col min-h-0 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle bg-surface-subtle shrink-0">
                  <span className={UI_TOKENS.layout.sectionTitleMini}>
                    {UI_LABELS.debug.patch.resultHeading}
                  </span>
                  {patchResult && (
                    <span
                      className={`font-mono text-[10px] px-2 py-0.5 rounded-md border ${
                        patchResult.ok
                          ? 'auteur-phase-aesthetic'
                          : 'border-red-500/40 bg-red-500/10 text-red-500'
                      }`}
                    >
                      {patchResult.ok
                        ? UI_LABELS.debug.patch.statusOk(patchResult.appliedOpsCount)
                        : UI_LABELS.debug.patch.statusRejected(
                            patchResult.errors[0]?.code ?? UI_LABELS.debug.patch.fallbackErrorCode
                          )}
                    </span>
                  )}
                </div>

                <div className="flex-1 overflow-auto p-4 space-y-4">
                  {patchParseError && (
                    <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-500 font-mono">
                      {UI_LABELS.debug.jsonParseErrorPrefix}
                      {patchParseError}
                    </div>
                  )}

                  {!patchParseError && !patchResult && (
                    <p className="text-xs text-text-muted">
                      {UI_LABELS.debug.patch.emptyHintLead}{' '}
                      <code className="font-mono">{UI_LABELS.debug.patch.emptyHintType}</code>{' '}
                      {UI_LABELS.debug.patch.emptyHintMid}{' '}
                      <strong>{UI_LABELS.debug.patch.dryRun}</strong>{' '}
                      {UI_LABELS.debug.patch.emptyHintOr}{' '}
                      <strong>{UI_LABELS.debug.patch.commitToEditor}</strong>{' '}
                      {UI_LABELS.debug.patch.emptyHintTail}
                    </p>
                  )}

                  {patchResult && (
                    <>
                      {patchResult.errors.length > 0 && (
                        <div className="space-y-1.5">
                          {patchResult.errors.map((err, idx) => (
                            <div
                              key={idx}
                              className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-500 space-y-1"
                            >
                              <div className="font-mono font-semibold flex items-center gap-1.5">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                <span>
                                  {err.code}
                                  {err.path ? ` (${err.path})` : ''}
                                </span>
                              </div>
                              <p>{err.message}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                        <div className="rounded-xl border border-border-main bg-surface p-2.5">
                          <div className="text-text-faint">
                            {UI_LABELS.debug.patch.introducedErrLabel}
                          </div>
                          <div className="text-sm font-bold text-text-main tabular-nums">
                            {patchResult.introducedErrors.length}
                          </div>
                        </div>
                        <div className="rounded-xl border border-border-main bg-surface p-2.5">
                          <div className="text-text-faint">
                            {UI_LABELS.debug.patch.introducedWarnLabel}
                          </div>
                          <div className="text-sm font-bold text-text-main tabular-nums">
                            {patchResult.introducedWarnings.length}
                          </div>
                        </div>
                        <div className="rounded-xl border border-border-main bg-surface p-2.5">
                          <div className="text-text-faint">
                            {UI_LABELS.debug.patch.resolvedLabel}
                          </div>
                          <div className="text-sm font-bold text-text-main tabular-nums">
                            {patchResult.resolvedDiagnostics.length}
                          </div>
                        </div>
                      </div>

                      {patchResult.candidateRawText && (
                        <div className="space-y-1.5">
                          <div className={UI_TOKENS.layout.sectionTitleMini}>
                            {UI_LABELS.debug.patch.candidateHeading}
                          </div>
                          <pre className="rounded-xl border border-border-main bg-surface p-3.5 font-mono text-xs leading-relaxed text-text-body whitespace-pre-wrap select-text">
                            {patchResult.candidateRawText}
                          </pre>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: FULL-DRAFT COMPILER */}
          {activeTab === 'draft' && (
            <div className="h-full grid grid-cols-1 md:grid-cols-2 min-h-0">
              {/* Left Draft Input */}
              <div className="flex flex-col min-h-0 border-b md:border-b-0 md:border-r border-border-main bg-surface">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-border-subtle bg-surface-subtle shrink-0">
                  <span className={UI_TOKENS.layout.sectionTitleMini}>
                    {UI_LABELS.debug.draft.inputHeading}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={loadCurrentAsDraft}
                      className={UI_TOKENS.button.actionPill}
                    >
                      {UI_LABELS.debug.draft.loadCurrent}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDraftText(buildSampleDraftJson());
                        setDraftResult(null);
                        setDraftParseError(null);
                      }}
                      className={UI_TOKENS.button.actionPill}
                    >
                      {UI_LABELS.debug.draft.loadSample}
                    </button>
                  </div>
                </div>

                <textarea
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  spellCheck={false}
                  aria-label={UI_LABELS.debug.draft.inputHeading}
                  className="flex-1 w-full resize-none bg-surface p-4 font-mono text-xs leading-relaxed text-text-body focus:outline-none"
                />

                <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-border-subtle bg-surface-subtle shrink-0">
                  <button
                    type="button"
                    onClick={() => runDraftCompile(false)}
                    className={UI_TOKENS.button.secondary}
                  >
                    {UI_LABELS.debug.draft.compileButton}
                  </button>
                  <button
                    type="button"
                    disabled={readOnly}
                    title={readOnly ? UI_LABELS.debug.readOnlyCommitHint : undefined}
                    onClick={() => runDraftCompile(true)}
                    className={`${UI_TOKENS.button.primary} disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    {UI_LABELS.debug.draft.applyToEditor}
                  </button>
                </div>
              </div>

              {/* Right Draft Output */}
              <div className="flex flex-col min-h-0 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle bg-surface-subtle shrink-0">
                  <span className={UI_TOKENS.layout.sectionTitleMini}>
                    {UI_LABELS.debug.draft.resultHeading}
                  </span>
                  {draftResult && (
                    <span
                      className={`font-mono text-[10px] px-2 py-0.5 rounded-md border ${
                        draftResult.ok
                          ? 'auteur-phase-aesthetic'
                          : 'border-red-500/40 bg-red-500/10 text-red-500'
                      }`}
                    >
                      {draftResult.ok
                        ? UI_LABELS.debug.draft.statusValid(draftResult.diagnostics.length)
                        : UI_LABELS.debug.draft.statusInvalid(draftResult.errors.length)}
                    </span>
                  )}
                </div>

                <div className="flex-1 overflow-auto p-4 space-y-4">
                  {draftParseError && (
                    <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-500 font-mono">
                      {UI_LABELS.debug.jsonParseErrorPrefix}
                      {draftParseError}
                    </div>
                  )}

                  {!draftParseError && !draftResult && (
                    <p className="text-xs text-text-muted">
                      {UI_LABELS.debug.draft.emptyHintLead}{' '}
                      <strong>{UI_LABELS.debug.draft.compileButton}</strong>{' '}
                      {UI_LABELS.debug.draft.emptyHintMid}{' '}
                      <code className="font-mono">
                        {UI_LABELS.debug.draft.emptyHintSchemaName}
                      </code>{' '}
                      {UI_LABELS.debug.draft.emptyHintAnd}{' '}
                      <code className="font-mono">{UI_LABELS.debug.draft.emptyHintVersion}</code>{' '}
                      {UI_LABELS.debug.draft.emptyHintTail}
                    </p>
                  )}

                  {draftResult && !draftResult.ok && (
                    <div className="space-y-1.5">
                      {draftResult.errors.map((err, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-500 font-mono"
                        >
                          <span className="font-semibold">
                            {err.path || UI_LABELS.debug.draft.rootPathFallback}:
                          </span>{' '}
                          {err.message}
                        </div>
                      ))}
                    </div>
                  )}

                  {draftResult && draftResult.ok && (
                    <>
                      {draftResult.diagnostics.length > 0 && (
                        <div className="space-y-1.5">
                          {draftResult.diagnostics.map((d) => (
                            <div
                              key={d.id}
                              className={`rounded-xl border p-2.5 text-xs ${
                                d.severity === 'error'
                                  ? 'border-red-500/40 bg-red-500/10 text-red-500'
                                  : 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                              }`}
                            >
                              <div className="font-mono font-semibold flex items-center gap-1.5">
                                {d.severity === 'error' ? (
                                  <AlertCircle className="h-3.5 w-3.5" />
                                ) : (
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                )}
                                <span>
                                  {d.targetId} · {d.ruleId}
                                </span>
                              </div>
                              <p className="mt-1">{d.message}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      <pre className="rounded-xl border border-border-main bg-surface p-3.5 font-mono text-xs leading-relaxed text-text-body whitespace-pre-wrap select-text">
                        {draftResult.rawText}
                      </pre>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: ZOD JSON SCHEMA REGISTRY */}
          {activeTab === 'schemas' && (
            <div className="h-full flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 border-b border-border-subtle bg-surface-subtle shrink-0">
                <div className="flex items-center gap-3">
                  <span className={UI_TOKENS.layout.sectionTitleMini}>
                    {UI_LABELS.debug.schemas.heading}
                  </span>
                  <div className={UI_TOKENS.button.segmentedGroup}>
                    {SCHEMA_KEYS.map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setActiveSchemaKey(key)}
                        className={
                          activeSchemaKey === key
                            ? UI_TOKENS.button.segmentedItemActive
                            : UI_TOKENS.button.segmentedItem
                        }
                      >
                        {UI_LABELS.debug.schemas.keys[key]}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleCopy(`schema-${activeSchemaKey}`, activeSchemaString)}
                  className={
                    copiedId === `schema-${activeSchemaKey}`
                      ? UI_TOKENS.button.actionPillActive
                      : UI_TOKENS.button.actionPill
                  }
                >
                  {copiedId === `schema-${activeSchemaKey}` ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {copiedId === `schema-${activeSchemaKey}`
                      ? UI_LABELS.debug.copiedJson
                      : UI_LABELS.debug.copyJson}
                  </span>
                </button>
              </div>

              <pre className="flex-1 overflow-auto p-5 font-mono text-xs leading-relaxed text-text-body select-text whitespace-pre">
                {activeSchemaString}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
