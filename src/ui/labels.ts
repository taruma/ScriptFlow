import type {MacroBlockKind} from '../core/types.ts';

/**
 * Single Source of Truth (SSOT) for all user-facing UI labels, captions,
 * placeholders, tooltips, and status copy across the editor interface.
 */

export const APP_META = {
  name: 'ScriptFlow',
  untitledScene: 'Untitled Scene',
} as const;

export interface MacroBlockMeta {
  caption: string;
  badgeClass: string;
}

export const MACRO_BLOCK_META: Record<MacroBlockKind, MacroBlockMeta> = {
  INTENT: {
    caption: 'Directorial Intent',
    badgeClass: 'auteur-phase-intent',
  },
  LOGIC: {
    caption: 'Coordinate Fence',
    badgeClass: 'auteur-phase-logic',
  },
  AESTHETIC: {
    caption: 'World Lookbook',
    badgeClass: 'auteur-phase-aesthetic',
  },
  OPENING: {
    caption: 'First-Frame Anchor · S0',
    badgeClass: 'auteur-phase-opening',
  },
  'CONTINUITY PROTOCOL': {
    caption: 'Continuity Inheritance',
    badgeClass: 'auteur-phase-continuity',
  },
  CHARACTERS: {
    caption: 'Cast Ledger',
    badgeClass: 'auteur-phase-slate',
  },
  REFERENCES: {
    caption: 'Reference Assets',
    badgeClass: 'auteur-phase-slate',
  },
  STAGE: {
    caption: 'Spatial Stage',
    badgeClass: 'auteur-phase-slate',
  },
  EXECUTION: {
    caption: 'Active Timeline',
    badgeClass: 'auteur-phase-execution',
  },
  CUSTOM: {
    caption: 'Staging Block',
    badgeClass: 'auteur-phase-slate',
  },
};

export function getMacroBlockMeta(kind: MacroBlockKind): MacroBlockMeta {
  return MACRO_BLOCK_META[kind] ?? MACRO_BLOCK_META.CUSTOM;
}

export const UI_LABELS = {
  topBar: {
    sceneTitleAria: 'Scene title',
    beatUnit: (count: number) => (count === 1 ? 'beat' : 'beats'),
    errorShort: (count: number) => `${count} err`,
    warningShort: (count: number) => `${count} warn`,
    jumpToFirstDiagnostic: 'Jump to first Script Supervisor diagnostic',
    viewModeAria: 'Editor view mode',
    liveMode: 'Live',
    sourceMode: 'Source',
    presetsButton: 'Presets',
    presetsHeader: 'Reference Scripts (v0.4.0)',
    newBlankScript: 'New Blank Script',
    themeHeader: 'Appearance',
    themeAria: (label: string) => `Theme: ${label}`,
    textSizeGroupAria: 'Script text size',
    decreaseTextSizeLabel: 'A−',
    increaseTextSizeLabel: 'A+',
    decreaseTextSizeAria: 'Decrease script text size',
    increaseTextSizeAria: 'Increase script text size',
    resetTextSizeTitle: (px: number, isDefault: boolean) =>
      isDefault ? `Text size: ${px}px (default)` : `Text size: ${px}px — click to reset`,
    resetTextSizeAria: (label: string, px: number) =>
      `Text size ${label} (${px}px). Reset to default`,
    copyButton: 'Copy',
    copiedPlain: 'Copied',
    copiedTagless: 'Copied Tagless',
    copyHeader: 'Export to Clipboard',
    copyPlainTitle: 'Copy Plain Text',
    copyPlainDesc: 'Canonical v0.4.0 script',
    copyTaglessTitle: 'Copy Tagless',
    copyTaglessDesc: 'Strips [TAG] labels, keeps -> flow',
    debugButton: 'JSON IR',
    debugAria: 'Open JSON IR Debug Inspector',
  },

  document: {
    stagingPaneAria: 'Phase 1 Staging',
    executionPaneAria: 'Phase 2 Execution',
    phase1Kicker: 'Phase 1',
    phase1Name: 'Staging',
    phase2Kicker: 'Phase 2',
    phase2Name: 'Execution',
    phase1Title: 'Phase 1 — Staging',
    phase2Title: 'Phase 2 — Execution',
    stagingBlockCount: (count: number) => `S0 · ${count} ${count === 1 ? 'block' : 'blocks'}`,
    noStagingBlocks: 'No staging blocks in this script yet. Switch to Source to add [INTENT], [LOGIC], [AESTHETIC], or [OPENING].',
    expandAll: 'Expand all',
    collapseAll: 'Collapse all',
    noBeatsYet: 'No beats yet',
    beatRange: (count: number) => (count === 0 ? 'No beats yet' : count === 1 ? 'S1' : `S1 → S${count}`),
    cutMarker: 'cut',
    cutRecallMarker: 'cut · recall',
    addMacroBlock: 'Add macro-block',
    addBeat: 'Add beat',
    insertBeatBeforeFirst: 'Insert beat before S1',
    insertBeatBetween: (prevIndex: number, nextIndex: number) =>
      `Insert beat between S${prevIndex} and S${nextIndex}`,
    footerHint:
      'Click any block or step to edit live · Paste any plain-text Auteur Script anywhere to hydrate',
  },

  staging: {
    emptySummary: 'Empty staging block — click to author',
    editAria: (name: string) => `Edit [${name}] block`,
    editPlaceholder: (name: string) => `Write [${name}] content...`,
    castBindings: (count: number) => `${count} ${count === 1 ? '@ref' : '@refs'}`,
    mappedTokens: (count: number) => `${count} ${count === 1 ? 'token' : 'tokens'}`,
    lookbookLines: (count: number) => `${count} lookbook ${count === 1 ? 'line' : 'lines'}`,
    keysCount: (count: number) => `${count} ${count === 1 ? 'key' : 'keys'}`,
    linesCount: (count: number) => `${count} ${count === 1 ? 'line' : 'lines'}`,
    expandPreviewTitle: (name: string) => `Expand [${name}] block`,
    aestheticKeyPlaceholder: 'Key',
    aestheticValuePlaceholder: 'Describe lookbook detail or -> TOKEN...',
    addAestheticKey: 'Add key',
    removeAestheticKeyTitle: 'Remove key',
    aestheticKeyAria: (index: number) => `Aesthetic key ${index + 1}`,
    aestheticValueAria: (key: string, index: number) =>
      key ? `Aesthetic value for ${key}` : `Aesthetic value ${index + 1}`,
    pickerHeader: 'Add Staging Macro-Block',
    alreadyAdded: 'Added',
    customHeaderPlaceholder: 'Custom block (e.g. PROPS, AUDIO NOTES)',
    customHeaderAdd: 'Add',
    customHeaderReservedError: 'Reserved for Phase 2 Execution',
    deleteBlockTitle: (name: string) => `Delete [${name}]`,
  },

  execution: {
    holdFraming: 'hold framing',
    addStep: 'Add step',
    chainHintLead: 'Type',
    chainHintArrow: '->',
    chainHintTail: 'or press Enter to chain next step',
    dragReorderTitle: 'Drag to reorder beat',
    deleteBeatTitle: (index: number) => `Delete S${index}`,
    removeStepTitle: 'Remove step',
    removeStepAria: (stepNumber: number, beatIndex: number) =>
      `Remove step ${stepNumber} from S${beatIndex}`,
    leadStepAria: (beatIndex: number) => `S${beatIndex} lead step`,
    stepAria: (beatIndex: number, stepNumber: number) => `S${beatIndex} step ${stepNumber}`,
    newStepAria: (beatIndex: number) => `New Sub-State in S${beatIndex}`,
    leadPlaceholder: '[CAM 01] MS, eye level',
    stepPlaceholder: '[ACT] ..., Speaker says {line}, or <foley>',
  },

  source: {
    heading: 'Canonical Plain-Text Source',
    linesCount: (count: number) => `${count} ${count === 1 ? 'line' : 'lines'}`,
    charsCount: (count: number) => `${count} ${count === 1 ? 'char' : 'chars'}`,
    ariaLabel: 'Canonical Auteur Script plain-text source',
    placeholder: '[INTENT]\nCreate a cinematic scene...',
  },

  diagnostics: {
    dialogAria: 'Script Supervisor Diagnostics',
    headerTitle: (count: number) => `Script Supervisor (${count})`,
    closeAria: 'Close diagnostics',
    repairPrefix: 'Repair: ',
    triggerAria: (count: number, hasError: boolean) =>
      `${count} Script Supervisor ${hasError ? 'error' : 'warning'}${count === 1 ? '' : 's'}`,
  },

  debug: {
    dialogAria: 'Programmatic JSON IR Inspector',
    title: 'JSON IR Debug Inspector',
    subtitle: 'Decoupled evaluation sandbox for AuteurScriptIR, Lens Slicer, Patch Engine & Zod Schemas',
    closeAria: 'Close JSON IR Inspector',
    copyJson: 'Copy JSON',
    copiedJson: 'Copied',
    roundTripPass: 'Round-Trip Lossless',
    roundTripDiff: 'Round-Trip Diff',
    tabs: {
      envelope: 'Envelope & IR',
      slicer: 'Lens Slicer',
      patch: 'Patch Sandbox',
      draft: 'Draft Compiler',
      schemas: 'JSON Schemas',
    },
    envelopeViews: {
      full: 'Full Envelope',
      document: 'Document IR',
      derived: 'Derived Context',
    },
    slicer: {
      presetsHeading: 'Audit Lens Presets',
      customActCamPreset: 'ACT + Resolved CAM',
      macroBlocksHeading: 'Staging Macro-Blocks',
      aestheticKeysHeading: '[AESTHETIC] Keys',
      dimensionsHeading: 'Sub-State Dimensions',
      optionsHeading: 'Derived Context Flags',
      resolvedCameraLabel: 'Resolved Camera (effectiveFraming)',
      referenceBindingsLabel: 'Reference Bindings (@ref as Name)',
      sceneTopologyLabel: 'Scene Topology',
      trailingResolutionLabel: 'Trailing Dialogue Check',
      tokenMappingsLabel: 'Token Mappings',
      resetFilters: 'Reset',
      outputHeading: 'Sliced JSON Projection',
    },
    patch: {
      inputHeading: 'AuteurPatch JSON Payload',
      resultHeading: 'Transactional Evaluation Result',
      rejectOnNewErrors: 'Reject on new lint errors',
      dryRun: 'Dry Run',
      commitToEditor: 'Commit to Editor',
      sampleEditAction: 'Sample: Edit S1 Action',
      sampleTokenMapping: 'Sample: Upsert Token LOC01',
      sampleLintFail: 'Sample: Trigger Lint Gate',
      placeholder: '{\n  "ops": []\n}',
      committedToast: 'Patch committed to editor',
    },
    draft: {
      inputHeading: 'AuteurScriptDraft JSON Input',
      resultHeading: 'Compiled v0.4.0 Output & Diagnostics',
      loadCurrent: 'Load Current as Draft',
      loadSample: 'Load Sample Draft',
      compileButton: 'Compile Draft',
      applyToEditor: 'Load into Editor',
      appliedToast: 'Compiled draft loaded into editor',
    },
    schemas: {
      heading: 'Zod-Generated JSON Schema Registry',
    },
  },

  confirm: {
    dialogAria: 'Confirm action',
    cancel: 'Cancel',
    delete: 'Delete',
    deleteMacroBlockTitle: (name: string) => `Delete [${name}] macro-block?`,
    deleteMacroBlockDesc:
      'This will remove this staging macro-block and its content from the script.',
    deleteMacroStateTitle: (beatIndex: number) => `Delete S${beatIndex} macro-state?`,
    deleteMacroStateDesc:
      'This will remove this beat and all of its chained sub-states from the execution timeline.',
  },

  toasts: {
    scriptHydrated: 'Script pasted and hydrated',
  },
} as const;
