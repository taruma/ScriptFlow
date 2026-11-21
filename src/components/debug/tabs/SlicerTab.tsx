import {useCallback, useMemo, type Dispatch, type SetStateAction} from 'react';
import {Check, Copy} from 'lucide-react';
import {
  AUDIT_LENS_PRESETS,
  sliceAuteurEnvelope,
  type AuteurEnvelope,
  type AuteurLensPresetId,
  type LensSliceSpec,
  type SubStateDimension,
} from '../../../core/index.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';

export type TokenMappingMode = 'off' | 'referenced' | 'all';

export interface SlicerTabState {
  activePresetLabel: string;
  selectedMacroBlocks: string[];
  selectedAestheticKeys: string[];
  selectedDimensions: SubStateDimension[];
  includeResolvedCamera: boolean;
  includeReferenceBindings: boolean;
  includeSceneTopology: boolean;
  includeTrailingResolution: boolean;
  tokenMappingMode: TokenMappingMode;
}

export const DEFAULT_SLICER_TAB_STATE: SlicerTabState = {
  activePresetLabel: 'custom_act_cam',
  selectedMacroBlocks: ['LOGIC', 'OPENING'],
  selectedAestheticKeys: [],
  selectedDimensions: ['action'],
  includeResolvedCamera: true,
  includeReferenceBindings: false,
  includeSceneTopology: true,
  includeTrailingResolution: false,
  tokenMappingMode: 'referenced',
};

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

export interface SlicerTabProps {
  envelope: AuteurEnvelope;
  state: SlicerTabState;
  setState: Dispatch<SetStateAction<SlicerTabState>>;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
}

export function SlicerTab({envelope, state, setState, copiedId, onCopy}: SlicerTabProps) {
  const fullEnvelopeByteLen = useMemo(() => JSON.stringify(envelope).length, [envelope]);

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

  const sliceSpec = useMemo<LensSliceSpec>(() => {
    return {
      ...(state.selectedMacroBlocks.length > 0
        ? {macroBlocks: state.selectedMacroBlocks}
        : {macroBlocks: []}),
      ...(state.selectedAestheticKeys.length > 0
        ? {aestheticKeys: state.selectedAestheticKeys}
        : {}),
      ...(state.selectedDimensions.length > 0
        ? {dimensions: state.selectedDimensions}
        : {includeAllSubStates: true}),
      includeResolvedCamera: state.includeResolvedCamera,
      includeReferenceBindings: state.includeReferenceBindings,
      includeSceneTopology: state.includeSceneTopology,
      includeTrailingResolution: state.includeTrailingResolution,
      ...(state.tokenMappingMode !== 'off'
        ? {includeTokenMappings: state.tokenMappingMode}
        : {}),
    };
  }, [state]);

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
      if (presetId === 'custom_act_cam') {
        setState(DEFAULT_SLICER_TAB_STATE);
        return;
      }

      const preset = AUDIT_LENS_PRESETS[presetId];
      let nextTokenMode: TokenMappingMode = 'off';
      if (preset.includeTokenMappings === 'all') nextTokenMode = 'all';
      else if (preset.includeTokenMappings === 'referenced') nextTokenMode = 'referenced';

      setState({
        activePresetLabel: presetId,
        selectedMacroBlocks: preset.macroBlocks ?? availableMacroBlocks,
        selectedAestheticKeys: preset.aestheticKeys ?? [],
        selectedDimensions: preset.includeAllSubStates ? [] : (preset.dimensions ?? []),
        includeResolvedCamera: Boolean(preset.includeResolvedCamera),
        includeReferenceBindings: Boolean(preset.includeReferenceBindings),
        includeSceneTopology: Boolean(preset.includeSceneTopology),
        includeTrailingResolution: Boolean(preset.includeTrailingResolution),
        tokenMappingMode: nextTokenMode,
      });
    },
    [availableMacroBlocks, setState]
  );

  return (
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
                state.activePresetLabel === 'custom_act_cam'
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
                  state.activePresetLabel === presetId
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
              const active = state.selectedMacroBlocks.includes(header);
              return (
                <button
                  key={header}
                  type="button"
                  onClick={() => {
                    setState((prev) => ({
                      ...prev,
                      activePresetLabel: 'custom',
                      selectedMacroBlocks: prev.selectedMacroBlocks.includes(header)
                        ? prev.selectedMacroBlocks.filter((item) => item !== header)
                        : [...prev.selectedMacroBlocks, header],
                    }));
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
                const active = state.selectedAestheticKeys.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setState((prev) => ({
                        ...prev,
                        activePresetLabel: 'custom',
                        selectedAestheticKeys: prev.selectedAestheticKeys.includes(key)
                          ? prev.selectedAestheticKeys.filter((item) => item !== key)
                          : [...prev.selectedAestheticKeys, key],
                      }));
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
              const active = state.selectedDimensions.includes(dim);
              return (
                <button
                  key={dim}
                  type="button"
                  onClick={() => {
                    setState((prev) => ({
                      ...prev,
                      activePresetLabel: 'custom',
                      selectedDimensions: prev.selectedDimensions.includes(dim)
                        ? prev.selectedDimensions.filter((item) => item !== dim)
                        : [...prev.selectedDimensions, dim],
                    }));
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
                checked={state.includeResolvedCamera}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setState((prev) => ({
                    ...prev,
                    activePresetLabel: 'custom',
                    includeResolvedCamera: checked,
                  }));
                }}
              />
              <span>{UI_LABELS.debug.slicer.resolvedCameraLabel}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={state.includeReferenceBindings}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setState((prev) => ({
                    ...prev,
                    activePresetLabel: 'custom',
                    includeReferenceBindings: checked,
                  }));
                }}
              />
              <span>{UI_LABELS.debug.slicer.referenceBindingsLabel}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={state.includeSceneTopology}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setState((prev) => ({
                    ...prev,
                    activePresetLabel: 'custom',
                    includeSceneTopology: checked,
                  }));
                }}
              />
              <span>{UI_LABELS.debug.slicer.sceneTopologyLabel}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={state.includeTrailingResolution}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setState((prev) => ({
                    ...prev,
                    activePresetLabel: 'custom',
                    includeTrailingResolution: checked,
                  }));
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
                      setState((prev) => ({
                        ...prev,
                        activePresetLabel: 'custom',
                        tokenMappingMode: mode,
                      }));
                    }}
                    className={
                      state.tokenMappingMode === mode
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
            onClick={() => onCopy('slice', slicedJsonString)}
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
              {copiedId === 'slice' ? UI_LABELS.debug.copiedJson : UI_LABELS.debug.copyJson}
            </span>
          </button>
        </div>
        <pre className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed text-text-body select-text whitespace-pre">
          {slicedJsonString}
        </pre>
      </div>
    </div>
  );
}
