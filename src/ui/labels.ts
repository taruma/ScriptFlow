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
    fileButton: 'File',
    fileMenuAria: 'File actions',
    fileMenuNewBlank: 'New Blank Script',
    fileMenuImportFile: 'Import File (.txt / .json)...',
    fileMenuExportHeader: 'Download Current',
    fileMenuDownloadCanonical: 'Download Canonical .txt',
    fileMenuDownloadTagless: 'Download Tagless .txt',
    fileMenuDownloadJsonEnvelope: 'Download JSON Envelope',
    fileMenuLibraryHeader: 'Library & Backup',
    fileMenuBackupAll: 'Backup All Scripts (.json)',
    fileMenuRestoreBackup: 'Restore Backup (.json)...',
    fileMenuBrowseLibrary: 'Browse Library...',
    libraryButton: 'Library',
    libraryAria: 'Open Script Library',
    readOnlyExampleBadge: 'Example · Read-only',
    readOnlyBannerText: 'Viewing bundled reference example in read-only mode.',
    forkToEditButton: 'Fork to Edit',
    forkToEditTitle: 'Create an editable copy of this example in My Scripts',
    newBlankScript: 'New Blank Script',
    settingsButton: 'Settings',
    settingsAria: 'Display and editor settings',
    settingsHeader: 'Settings',
    settingsTextSizeLabel: 'Text size',
    settingsClauseGuidesLabel: 'Clause underlines',
    settingsClauseGuidesDesc: 'Dotted phrases · solid sentences',
    settingsThemeLabel: 'Theme',
    settingsRulesLabel: 'Supervisor rules',
    settingsRulesDesc: 'Tune live linter severities',
    settingsRulesSummaryDefault: 'Default',
    settingsRulesSummaryCustom: (count: number) => `${count} custom`,
    settingsRulesOpenAria: 'Configure Script Supervisor linter rules',
    settingsRulesBackAria: 'Back to settings',
    settingsRulesHeader: 'Supervisor Rules',
    settingsRulesReset: 'Reset defaults',
    settingsRulesResetAria: 'Reset all Script Supervisor rules to default severities',
    settingsRulesSeverityGroupAria: (ruleName: string) => `${ruleName} severity`,
    settingsRulesSeverityLabels: {
      off: 'Off',
      warning: 'Warn',
      error: 'Error',
    } as const,
    settingsRulesLensShort: (lens: string) => lens.split(':')[0] ?? lens,
    settingsRulesFootnote: 'Changes apply live to diagnostics and persist in this browser.',
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
    clauseGuidesTitle: (enabled: boolean) =>
      enabled ? 'Phrase & sentence underlines: On' : 'Phrase & sentence underlines: Off',
    clauseGuidesAria: (enabled: boolean) =>
      `Toggle phrase and sentence underlines (${enabled ? 'currently on' : 'currently off'})`,
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
    historyGroupAria: 'Document history',
    undoAria: 'Undo',
    redoAria: 'Redo',
    undoTitle: 'Undo (⌘Z / Ctrl+Z)',
    redoTitle: 'Redo (⇧⌘Z / Ctrl+Y)',
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
    insertMacroBlockBeforeFirst: 'Insert macro-block before first block',
    insertMacroBlockBetween: (prevName: string, nextName: string) =>
      `Insert macro-block between [${prevName}] and [${nextName}]`,
    addBeat: 'Add beat',
    insertBeatBeforeFirst: 'Insert beat before S1',
    insertBeatBetween: (prevIndex: number, nextIndex: number) =>
      `Insert beat between S${prevIndex} and S${nextIndex}`,
    footerHint:
      'Click any block or step to edit live · Paste any plain-text Auteur Script anywhere to hydrate',
    footerHintReadOnly:
      'Read-only reference example · Click Fork to Edit to make changes, or switch to Source to inspect raw text',
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
    dragReorderTitle: 'Drag to reorder macro-block',
    deleteBlockTitle: (name: string) => `Delete [${name}]`,
  },

  execution: {
    holdFraming: 'hold framing',
    emptySummary: 'Empty macro-state — click to author',
    collapseBeatTitle: (index: number) => `Collapse S${index}`,
    expandBeatTitle: (index: number) => `Expand S${index}`,
    addStep: 'Add step',
    chainHintLead: 'Type',
    chainHintArrow: '->',
    chainHintTail: 'or press Enter to chain next step',
    dragReorderTitle: 'Drag to reorder beat',
    stepsCount: (count: number) => `${count} ${count === 1 ? 'step' : 'steps'}`,
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
    versionBadge: (version: string, hash: string) => `v${version} · #${hash}`,
    charsCount: (count: number) => `${count.toLocaleString()} chars`,
    invalidJsonSyntax: 'Invalid JSON syntax',
    jsonParseErrorPrefix: 'JSON Parse Error: ',
    stats: {
      macroBlocks: (count: number) => `${count} MB`,
      macroStates: (count: number) => `${count} S`,
      subStates: (count: number) => `${count} Sub-States`,
      tokens: (count: number) => `${count} Tokens`,
      refs: (count: number) => `${count} Refs`,
    },
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
      lensPresetShortLabels: {
        lens1_spatial_optics: 'Lens 1 · Spatial',
        lens2_temporal_pacing_wear: 'Lens 2 · Pacing',
        lens3_props_inventory: 'Lens 3 · Props',
        lens4_acoustics_voice: 'Lens 4 · Acoustics',
        lens5_blocks_grammar: 'Lens 5 · Grammar',
      },
      macroBlocksHeading: 'Staging Macro-Blocks',
      aestheticKeysHeading: '[AESTHETIC] Keys',
      dimensionsHeading: 'Sub-State Dimensions',
      optionsHeading: 'Derived Context Flags',
      resolvedCameraLabel: 'Resolved Camera (effectiveFraming)',
      referenceBindingsLabel: 'Reference Bindings (@ref as Name)',
      sceneTopologyLabel: 'Scene Topology',
      trailingResolutionLabel: 'Trailing Dialogue Check',
      tokenMappingsLabel: 'Token Mappings',
      tokenMappingModes: {
        off: 'off',
        referenced: 'referenced',
        all: 'all',
      },
      compressionBadge: (pct: number) => `-${pct}% payload vs full envelope`,
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
      statusOk: (count: number) => `OK · ${count} op(s)`,
      statusRejected: (code: string) => `REJECTED · ${code}`,
      fallbackErrorCode: 'ERROR',
      emptyHintLead: 'Edit or load a sample',
      emptyHintType: 'AuteurPatch',
      emptyHintMid: 'JSON payload on the left, then click',
      emptyHintOr: 'to inspect diagnostics or',
      emptyHintTail: 'to update canonical plain text.',
      introducedErrLabel: 'Introduced Err',
      introducedWarnLabel: 'Introduced Warn',
      resolvedLabel: 'Resolved',
      candidateHeading: 'Compiled v0.4.0 Plain-Text Candidate',
    },
    draft: {
      inputHeading: 'AuteurScriptDraft JSON Input',
      resultHeading: 'Compiled v0.4.0 Output & Diagnostics',
      loadCurrent: 'Load Current as Draft',
      loadSample: 'Load Sample Draft',
      compileButton: 'Compile Draft',
      applyToEditor: 'Load into Editor',
      appliedToast: 'Compiled draft loaded into editor',
      statusValid: (count: number) => `VALID · ${count} lint note(s)`,
      statusInvalid: (count: number) => `INVALID · ${count} schema error(s)`,
      emptyHintLead: 'Click',
      emptyHintMid: 'to validate the JSON against',
      emptyHintSchemaName: 'AuteurScriptDraftSchema',
      emptyHintAnd: 'and preview the compiled canonical',
      emptyHintVersion: 'v0.4.0',
      emptyHintTail: 'plain text.',
      rootPathFallback: '(root)',
    },
    readOnlyCommitHint: 'Read-only example — click Fork to Edit to apply changes',
    schemas: {
      heading: 'Zod-Generated JSON Schema Registry',
      keys: {
        draft: 'draft',
        ir: 'ir',
        envelope: 'envelope',
        patch: 'patch',
        review: 'review',
      },
    },
  },

  errorBoundary: {
    title: 'Editor encountered an unexpected error',
    description:
      'Your last saved script remains safely stored in this browser. Copy it to your clipboard or reload the editor to continue.',
    reloadAction: 'Reload Editor',
    copySavedScript: 'Copy Saved Script',
    copiedSavedScript: 'Saved Script Copied',
    copyFailedNote: 'Unable to access clipboard automatically.',
    noSavedScriptNote: 'No saved script found in local storage.',
  },

  library: {
    dialogAria: 'Script Library',
    title: 'Script Library',
    closeAria: 'Close Script Library',
    newBlankButton: 'New Blank',
    importButton: 'Import',
    searchPlaceholder: 'Search scripts and examples...',
    searchAria: 'Search scripts and examples',
    clearSearchAria: 'Clear search',
    tabsAria: 'Filter script library',
    tabs: {
      all: 'All',
      custom: 'My Scripts',
      examples: 'Examples',
    },
    exampleBadge: 'Example',
    activeBadge: 'Active',
    forkAction: 'Fork',
    forkAria: (title: string) => `Fork ${title}`,
    duplicateAction: 'Duplicate',
    duplicateAria: (title: string) => `Duplicate ${title}`,
    renameAction: 'Rename',
    renameAria: (title: string) => `Rename ${title}`,
    renameInputAria: 'Script title',
    saveRenameAria: 'Save rename',
    cancelRenameAria: 'Cancel rename',
    exportTxtAction: 'Export .txt',
    exportTxtAria: (title: string) => `Export ${title} as .txt`,
    deleteAction: 'Delete',
    deleteAria: (title: string) => `Delete ${title}`,
    emptySearch: 'No scripts match your search.',
    emptyCustom: 'No custom scripts yet. Fork an example, import a file, or create a blank script.',
    emptyAll: 'No scripts available.',
    showMore: (remaining: number) => `Show more (${remaining} remaining)`,
    keyboardHint: '↑↓ navigate · Enter open · Esc close',
    resultsCount: (shown: number, total: number) =>
      shown === total
        ? `${total} ${total === 1 ? 'script' : 'scripts'}`
        : `Showing ${shown} of ${total}`,
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
    deleteScriptTitle: (title: string) => `Delete "${title}"?`,
    deleteScriptDesc:
      'This will permanently remove this script from your browser library.',
  },

  toasts: {
    scriptHydrated: 'Script pasted and hydrated',
    readOnlyPasteBlocked:
      'Read-only example — click Fork to Edit or create a New Blank Script to paste',
    forkedExample: (title: string) => `Forked "${title}" to My Scripts`,
    duplicatedScript: (title: string) => `Duplicated "${title}"`,
    createdBlankScript: 'Created new blank script',
    importedScript: (title: string) => `Imported "${title}"`,
    renamedScript: (title: string) => `Renamed to "${title}"`,
    deletedScript: (title: string) => `Deleted "${title}"`,
    backupExported: (count: number) =>
      `Backed up ${count} ${count === 1 ? 'script' : 'scripts'}`,
    backupEmpty: 'No custom scripts to back up yet',
    backupRestored: (added: number, forked: number, skipped: number) => {
      const parts: string[] = [];
      if (added > 0) parts.push(`${added} added`);
      if (forked > 0) parts.push(`${forked} forked`);
      if (skipped > 0) parts.push(`${skipped} unchanged`);
      return parts.length > 0 ? `Backup restored: ${parts.join(', ')}` : 'Backup contained no scripts';
    },
    fileReadError: 'Unable to read the selected file',
  },
} as const;
