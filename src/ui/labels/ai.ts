export const AI_LABELS = {
  ai: {
    sidebarAria: 'AI Script Assistant',
    title: 'AI Assistant',
    newChatButton: 'New Chat',
    newChatTitle: 'Start a fresh conversation for this script',
    closeAria: 'Close AI Assistant',
    resizeAria: 'Resize AI Assistant panel',
    settingsChipTitle: 'Configure Gemini API key, model, and reasoning level',
    settingsChipAria: (modelLabel: string, levelLabel: string) =>
      `AI Settings: ${modelLabel}, ${levelLabel} reasoning`,
    contextButton: 'Context',
    contextButtonTitle: 'Inspect live prompt context, craft instructions, and extension skills',
    contextButtonAria: (activeCount: number, customCount: number) =>
      customCount > 0
        ? `Context & Skills: ${activeCount} active skills, ${customCount} ${customCount === 1 ? 'customization' : 'customizations'}`
        : `Context & Skills: ${activeCount} active skills`,
    focusAria: 'Assistant focus',
    focusLabels: {
      auto: 'Auto',
      draft: 'Draft',
      refine: 'Refine',
      audit: 'Audit',
    } as const,
    focuses: {
      autoEmpty: {
        placeholder: 'Describe your scene idea, or open Brief below to add cast refs and specs...',
        emptyTitle: 'Draft an Auteur Script',
        emptyDesc:
          'Describe the premise, cast, and look—or open Brief below for @ref handles, specs, and subtext. Drafts compile with live lint checks before applying.',
      },
      autoActive: {
        placeholder:
          'Ask to refine Macro-States or Sub-States, audit continuity, draft a fresh scene, or discuss craft...',
        emptyTitle: 'Unified Auteur Assistant',
        emptyDesc:
          'Ask for targeted edits, run a Script Supervisor audit, draft from a brief, or discuss camera and blocking. Every script change is staged with a diff before applying.',
      },
      draft: {
        placeholder: 'Describe the scene premise, characters, look, and camera topology...',
        emptyTitle: 'Draft a new scene',
        emptyDesc:
          'Provide a scene idea and optional Brief / Refs to compile a lint-checked v0.4.0 script ready to preview and apply.',
      },
      refine: {
        placeholder: 'Describe a targeted edit, rewrite, or continuity fix...',
        emptyTitle: 'Targeted script refinement',
        emptyDesc:
          'Ask for camera tightening, sharper blocking, dialogue polish, or lookbook updates. Edits are staged with a diff before applying.',
      },
      audit: {
        placeholder: 'Ask for a custom Script Supervisor check or click a lens below...',
        emptyTitle: 'Script Supervisor audit',
        emptyDesc:
          'Run a full 5-lens audit or focus on a single lens to surface clickable issues and dry-run fixes.',
      },
    },
    skillSources: {
      passive: 'Auto',
      pinned: 'Pinned',
      tool: 'Loaded',
    } as const,
    skillSourceDescriptions: {
      passive: 'Auto-activated from current script or Scene Brief',
      pinned: 'Pinned in Context & Skills',
      tool: 'Loaded on demand during this turn',
    } as const,
    modesAria: 'Assistant mode',
    modes: {
      refine: {
        label: 'Refine',
        placeholder: 'Describe a targeted edit, rewrite, or continuity fix...',
        emptyTitle: 'Targeted script refinement',
        emptyDesc:
          'Ask for camera tightening, sharper blocking, dialogue polish, or lookbook updates. Edits are staged with a diff before applying.',
      },
      check: {
        label: 'Check',
        placeholder: 'Ask for a custom Script Supervisor check or click a lens below...',
        emptyTitle: 'Script Supervisor audit',
        emptyDesc:
          'Run a full 5-lens audit or focus on a single lens to surface clickable issues and dry-run fixes.',
      },
      draft: {
        label: 'Draft',
        placeholder: 'Describe the scene premise, characters, look, and camera topology...',
        emptyTitle: 'Draft a new scene',
        emptyDesc:
          'Provide a brief and the assistant will compile a lint-checked v0.4.0 script ready to preview and apply.',
      },
    },
    refineTargetLabel: 'Scope',
    refineTargetAria: 'Target scope for refinement',
    refineWholeScript: 'Whole Script',
    quickAuditAllButton: 'Audit All',
    quickAuditAllTitle: 'Run a full 5-lens Script Supervisor audit without leaving Auto focus',
    quickScanButton: 'Quick Scan',
    quickScanTitle:
      'Run a fast (~400ms, $0 output) Decisions API semantic craft & Brief pre-check across atomic rules',
    quickScanRunning: 'Running Quick Scan…',
    quickScanFallbackButton: 'Run Standard Audit All instead',
    quickScan: {
      cardTitle: 'Quick Scan',
      dismissedBadge: 'Dismissed',
      runningLabel: 'Evaluating atomic checks…',
      staleNotice: 'Script edited since this scan.',
      rescanButton: 'Re-scan',
      collapseCardAria: 'Collapse Quick Scan card',
      expandCardAria: 'Expand Quick Scan card',
      expandAllLensesButton: 'Expand all',
      collapseAllLensesButton: 'Collapse all',
      showPassedChecksButton: (count: number) =>
        `Show ${count} passed ${count === 1 ? 'check' : 'checks'}`,
      hidePassedChecksButton: (count: number) =>
        `Hide ${count} passed ${count === 1 ? 'check' : 'checks'}`,
      youtubeNotice: (handles: readonly string[]) =>
        `YouTube ${handles.join(', ')} evaluated via text labels only (Decisions API omits YouTube streams).`,
      checksSummary: (count: number) => `${count} ${count === 1 ? 'check' : 'checks'}`,
      statusFlagged: 'Flagged',
      statusBorderline: 'Borderline',
      statusClean: 'Clean',
      summaryAllClean: 'All clean',
      summaryCounts: (flagged: number, borderline: number) => {
        const parts: string[] = [];
        if (flagged > 0) parts.push(`${flagged} flagged`);
        if (borderline > 0) parts.push(`${borderline} borderline`);
        return parts.join(' · ') || 'Clean';
      },
      lensLabels: {
        lens1_spatial_optics: 'Lens 1 · Spatial & Optics',
        lens2_temporal_pacing_wear: 'Lens 2 · Temporal & Wear',
        lens3_props_inventory: 'Lens 3 · Props & Inventory',
        lens4_acoustics_voice: 'Lens 4 · Acoustics & Voice',
        lens5_blocks_grammar: 'Lens 5 · Blocks & Grammar',
        brief: 'Scene Brief & Media',
      } as const,
      lensCheckboxAria: (label: string) => `Include ${label} in Deep Audit`,
      lensExpandAria: (label: string) => `Show checked rules for ${label}`,
      lensCollapseAria: (label: string) => `Hide checked rules for ${label}`,
      deterministicBadge: 'Lint',
      questionAskedLabel: 'Question:',
      flaggedIfLabel: 'Flagged if:',
      expandFindingAria: (label: string) => `Show question asked for ${label}`,
      collapseFindingAria: (label: string) => `Hide question asked for ${label}`,
      suspectStatesHeading: 'Suspect Macro-States',
      jumpToStateTitle: (targetId: string, topRule: string, pct: number) =>
        `Jump to ${targetId} (${topRule} · ${pct}%)`,
      deepAuditSelectedButton: (count: number) =>
        `Deep Audit Selected (${count})`,
      runFullDeepAuditButton: 'Run Full Deep Audit',
      dismissButton: 'Dismiss',
      noRulesRanNote:
        'No Quick Scan rules matched this script. Enable rules in Context → Quick Scan Rules.',
      liveIndicatorTriggerAria: (beatIndex: number, count: number, hasFlagged: boolean) =>
        `Quick Scan on S${beatIndex}: ${count} ${count === 1 ? 'suspect rule' : 'suspect rules'}${
          hasFlagged ? ' (flagged)' : ' (borderline)'
        } — hover to inspect, click to pin`,
      liveIndicatorDialogAria: (beatIndex: number) => `Quick Scan findings for S${beatIndex}`,
      liveIndicatorHeader: (beatIndex: number) => `Quick Scan · S${beatIndex}`,
      liveIndicatorCloseAria: 'Close Quick Scan preview',
      liveIndicatorAuditButton: (beatIndex: number) => `Audit S${beatIndex}`,
      liveIndicatorFooterHint:
        'System-1 semantic pre-check · click Audit to verify with Gemini 4 & stage fixes',
    },
    auditQuickGroupAria: 'Quick Script Supervisor audit lenses',
    auditQuickAll: 'All Lenses',
    auditQuickLensShort: {
      lens1_spatial_optics: 'Lens 1 · Spatial',
      lens2_temporal_pacing_wear: 'Lens 2 · Pacing',
      lens3_props_inventory: 'Lens 3 · Props',
      lens4_acoustics_voice: 'Lens 4 · Acoustics',
      lens5_blocks_grammar: 'Lens 5 · Grammar',
    } as const,
    briefToggle: 'Brief',
    briefPausedLabel: 'Brief · Off',
    briefToggleTitle: 'Open Scene Brief & References (carried across all modes)',
    briefToggleAria: (isOpen: boolean, hasContent: boolean, isActive: boolean) =>
      `${isOpen ? 'Close' : 'Open'} Scene Brief & References${
        hasContent ? (isActive ? ' (active)' : ' (paused)') : ''
      }`,
    askFirstToggle: 'Ask First',
    askFirstTitle:
      'Have the assistant ask multi-select clarifying questions before drafting or editing (resets after sending)',
    askFirstDisabledTitle:
      'Clarifying questions (ask_question) is disabled in Context → Function Tools',
    askFirstAria: (enabled: boolean, disabled = false) =>
      disabled
        ? 'Ask clarifying questions first (disabled in Context → Function Tools)'
        : `Ask clarifying questions first (${enabled ? 'on for next send' : 'off'})`,
    askFirstBadge: 'Ask First',
    briefTray: {
      dialogAria: 'Scene Brief & References',
      title: 'Scene Brief & References',
      subtitle: 'Cast handles, format specs, and additional instructions carried across all modes.',
      closeAria: 'Close Scene Brief & References',
      doneButton: 'Done',
      regionAria: 'Scene brief and references',
      enableLabel: 'Include in AI context',
      enableDesc: 'Applies as reference context across Auto, Draft, Refine, and Audit turns',
      enableAria: 'Include Scene Brief and References in AI context',
      pausedHint: 'Paused — your notes are saved here and will not be sent until turned back on.',
      refsHeading: 'Cast & References',
      addRefButton: 'Text handle',
      addRefAria: 'Add a text-only reference handle',
      filesApiButton: 'Files API',
      filesApiAria: 'Upload or browse Gemini Files API media',
      youtubeButton: 'YouTube',
      youtubeAria: 'Attach a public YouTube video URL',
      dropzoneTitle: 'Drop Image or Text',
      dropzoneSubtitle: '1600px · 85% · Click or drag files',
      dropzoneBrowseButton: 'Browse',
      dropzoneAria: 'Upload local image or text reference files',
      dropzoneHint:
        'Local images compress to 1600px (85%) and text files attach inline. Use Files API for video, audio, PDFs, or full-fidelity originals.',
      previewClickHint: 'Click to inspect',
      previewPlayHint: 'Click to play preview',
      previewCloseAria: 'Close reference preview',
      previewOpenYoutube: 'Open on YouTube',
      previewFilesApiUriLabel: 'Gemini Files URI',
      previewExpiresLabel: 'Expires',
      previewLinesChars: (lines: number, chars: number) =>
        `${lines.toLocaleString()} ${lines === 1 ? 'line' : 'lines'} · ${chars.toLocaleString()} chars`,
      previewNoLocalMedia:
        'Hosted on Gemini Cloud (Files API). Gemini reads this asset directly via its URI during AI turns.',
      previewExpiredMedia:
        'This Gemini Files API asset has expired (48-hour limit) and is skipped on new AI turns. Re-upload it via Files API or remove this reference.',
      filesApiRedirectNotice: (fileName: string) =>
        `"${fileName}" uses Gemini Files API (for video, audio, PDFs, or large files).`,
      filesApiRedirectAction: 'Upload via Files API',
      dismissNoticeAria: 'Dismiss notice',
      youtubeUrlPlaceholder: 'https://www.youtube.com/watch?v=...',
      youtubeUrlAria: 'Public YouTube video URL',
      youtubeLabelPlaceholder: 'Optional label (e.g. Rainy alley lighting ref)',
      youtubeLabelAria: 'YouTube reference label',
      youtubeAddButton: 'Attach',
      youtubeCancelButton: 'Cancel',
      youtubeInvalidError: 'Enter a valid public YouTube URL (youtube.com/watch?v=... or youtu.be/...).',
      filesApiPanelTitle: 'Gemini Files API (Up to 2 GB · 48h Cloud)',
      filesApiDropTitle: 'Drop files to upload via Files API',
      filesApiDropAria: 'Drop or choose files to upload to Gemini Files API',
      filesApiUploadButton: 'Choose Files',
      filesApiUploadHint: 'Video, audio, PDF, full-res images, or large text documents',
      filesApiUploading: 'Uploading directly to Gemini Cloud…',
      filesApiUploadingBatch: (current: number, total: number) =>
        `Uploading ${current}/${total} to Gemini Cloud…`,
      filesApiProcessing: 'Processing media tracks on Gemini…',
      filesApiProcessingBatch: (current: number, total: number) =>
        `Processing ${current}/${total} on Gemini…`,
      filesApiMissingKey: 'Add your Gemini API key in AI Settings to upload or browse Files API media.',
      filesApiOpenSettings: 'Open AI Settings',
      filesApiRefreshButton: 'Refresh',
      filesApiRefreshAria: 'Refresh Gemini Files list',
      filesApiCloudHeading: 'Active Gemini Cloud Files (48h)',
      filesApiLoadingList: 'Loading cloud files…',
      filesApiEmptyList: 'No active files on this API key yet.',
      filesApiAttachButton: 'Attach',
      filesApiAttachedBadge: 'Attached',
      filesApiDeleteAria: (name: string) => `Delete ${name} from Gemini Cloud`,
      filesApiCloseButton: 'Close',
      cardMapToName: 'Label',
      cardFilesApiBadge: 'FILES API',
      cardFilesApiExpiredBadge: 'EXPIRED',
      cardFilesApiExpiredMeta: 'Expired (48h)',
      cardFilesApiExpiredTitle:
        'Gemini Files API link expired after 48 hours and will be skipped — re-upload or remove.',
      cardYoutubeBadge: 'YT',
      cardInlineTextBadge: 'TEXT',
      cardManualBadge: 'HANDLE',
      cardVideoModeStatic: 'Static',
      cardVideoModeAgentic: 'Agentic',
      cardVideoModeTitle: 'Toggle Static (1 fps) vs. Agentic video understanding',
      emptyRefsHint:
        'Drop an image or text file, attach a YouTube link, or upload video/audio/PDF via Files API.',
      handlePlaceholder: '@image1',
      handleAria: 'Reference handle',
      labelPlaceholder: 'Subject (e.g. Mark)',
      labelAria: 'Reference subject label',
      notePlaceholder: 'Optional note (e.g. voice: @audio1)',
      noteAria: 'Reference note',
      removeRefAria: 'Remove reference',
      specsLabel: 'Format & Specs',
      specsPlaceholder: 'Camera topology, Macro-State cadence, dialogue or acoustic constraints...',
      specsAria: 'Format and specifications',
      subtextLabel: 'Subtext & Additional Instructions',
      subtextPlaceholder:
        'Unspoken tension, directorial notes, or extra constraints to carry across turns...',
      subtextAria: 'Subtext and additional instructions',
      clearButton: 'Clear',
      clearAria: 'Clear all brief and reference fields',
    },
    missingKeyTitle: 'Bring your own Gemini API key',
    missingKeyDesc:
      'Your key is stored only in this browser and sent directly to the Gemini API. Nothing is routed through a third-party server.',
    missingKeyCta: 'Open AI Settings',
    composerAria: 'Message the AI Script Assistant',
    composerResizeAria: 'Resize prompt box height',
    composerResizeTitle: 'Drag to resize prompt box · double-click to reset',
    composerAttach: {
      buttonAria: 'Attach files, Gemini Cloud media, or YouTube URL',
      buttonTitle: 'Attach document, image, video, audio, or URL to this message',
      menuAria: 'Attachment sources',
      menuUploadFiles: 'Upload file(s)…',
      menuUploadFilesHint: 'Images, text inline · video, audio, PDF via Files API',
      menuCloudFiles: 'Gemini Cloud Files (48h)…',
      menuCloudFilesHint: 'Reuse active Files API uploads across sessions',
      menuYoutubeUrl: 'YouTube URL…',
      menuYoutubeUrlHint: 'Attach a public video link to this turn',
      cloudModalAria: 'Attach from Gemini Cloud Files',
      cloudModalTitle: 'Attach from Gemini Cloud Files',
      cloudModalSubtitle: 'Select an active 48-hour upload or upload a new file for this message.',
      cloudModalCloseAria: 'Close Gemini Cloud Files picker',
      dropOverlayLabel: 'Drop files to attach to this message',
      uploadingStatus: 'Uploading…',
      processingStatus: 'Processing…',
      removeChipAria: (name: string) => `Remove attachment ${name}`,
      inspectChipTitle: 'Click to preview',
      omittedInlineChipTitle: 'Inline file payload is not persisted across reloads',
      missingKeyForFilesApi:
        'Add your Gemini API key in AI Settings to upload video, audio, or PDF via Files API.',
      sendBlockedUploadingTitle: 'Wait for file uploads to finish before sending',
      sendBlockedErrorTitle: 'Remove failed attachments before sending',
    },
    sendButton: 'Send',
    sendAria: 'Send message',
    stopButton: 'Stop',
    stopAria: 'Cancel active request',
    composerHint: 'Enter to send · Shift+Enter for newline',
    reasoningToggleLabel: 'Thinking',
    reasoningRunning: 'Thinking…',
    reasoningThoughtFor: (duration: string) => `Thought for ${duration}`,
    reasoningToolCount: (count: number) => `${count} ${count === 1 ? 'tool' : 'tools'}`,
    reasoningSkillCount: (count: number) => `${count} ${count === 1 ? 'skill' : 'skills'}`,
    reasoningNoSummary: 'Reasoning summary hidden in AI Settings.',
    toolsSkillsRegionAria: 'Active skills and tool calls for this turn',
    activityRunningTool: (toolTitle: string) => `${toolTitle}…`,
    activityExpandAria: (summary: string) => `Show turn activity: ${summary}`,
    activityCollapseAria: (summary: string) => `Hide turn activity: ${summary}`,
    jumpToLatestButton: 'Latest',
    jumpToLatestAria: 'Scroll to latest assistant output',
    inspectTraceButton: 'Inspect',
    inspectTraceTitle: 'Inspect sanitized Gemini Interactions API trace for this turn',
    inspectTraceAria: 'Inspect AI debug trace for this turn',
    cost: {
      turnBadgeAria: (formattedUsd: string) => `Estimated turn cost ${formattedUsd}`,
      turnTooltipTitle: 'Estimated Turn Cost',
      turnTooltipSubtitle: (modelLabel: string, rounds: number, isPromo: boolean) => {
        const roundText = `${rounds} ${rounds === 1 ? 'round' : 'rounds'}`;
        return isPromo ? `${modelLabel} · ${roundText} · Promo rate` : `${modelLabel} · ${roundText}`;
      },
      sessionBadgeAria: (formattedUsd: string, turns: number) =>
        `Estimated session cost ${formattedUsd} across ${turns} ${turns === 1 ? 'turn' : 'turns'}`,
      sessionTooltipTitle: 'Session Estimated Cost',
      sessionTooltipSubtitle: (turns: number) =>
        `${turns} ${turns === 1 ? 'turn' : 'turns'} in this chat · resets on New Chat`,
      rowInput: 'Input',
      rowCached: 'Cached',
      rowToolInput: 'Tool input',
      rowOutput: 'Output',
      rowThinking: 'Thinking',
      rowTotalTokens: 'Total tokens',
      formatTokens: (count: number) => `${Math.round(count).toLocaleString()} tok`,
      disclaimer: 'Client-side estimate from standard Gemini API token rates.',
    },
    hitToolLimitNote:
      'Reached the maximum tool-call rounds for this turn. Ask a follow-up to continue.',
    openSettingsAction: 'Open AI Settings',
    retryHint: 'You can edit your prompt or adjust AI Settings and try again.',
    stoppedNote: 'Generation stopped.',
    toolStatusRunning: 'running',
    toolStatusOk: 'done',
    toolStatusError: 'retrying',
    toolStatusStopped: 'stopped',
    suggestions: {
      patchLabel: 'Proposed Patch',
      draftLabel: 'Proposed Draft',
      titleBadge: 'Proposed Title',
      currentTitleLabel: 'Current',
      proposedTitleLabel: 'Proposed',
      applyTitleButton: 'Apply Title',
      forkAndApplyTitleButton: 'Fork & Apply Title',
      auditLabel: 'Script Supervisor Audit',
      questionLabel: 'Clarifying Questions',
      questionSingleSelectHint: 'Single pick',
      questionMultiSelectHint: 'Multi-select',
      questionMixedSelectHint: 'Single or multi-pick',
      questionPerQuestionSingleTag: 'Single',
      questionPerQuestionMultiTag: 'Multi',
      questionCount: (count: number) => `${count} ${count === 1 ? 'question' : 'questions'}`,
      questionStepProgress: (current: number, total: number) => `${current} / ${total}`,
      questionStepPillAria: (index: number, answered: boolean) =>
        `Question ${index + 1}${answered ? ' (answered)' : ''}`,
      questionBackButton: 'Back',
      questionNextButton: 'Next',
      questionSkipStepButton: 'Skip',
      questionSkipAllButton: 'Skip all',
      questionCommentPlaceholder: 'Add optional note or detail to your pick...',
      questionCommentAria: (index: number) => `Optional note for question ${index + 1}`,
      questionSubmitButton: 'Submit Answers',
      questionSubmitDisabledTitle: 'Select at least one option or add a note',
      questionSkipButton: 'Skip & Proceed',
      questionSkipTitle: 'Your call — skip questions and proceed with Auteur defaults',
      questionAnsweredBadge: 'Answered',
      questionSkippedBadge: 'Skipped',
      questionAnsweredSummary: (answered: number, total: number) =>
        `${answered}/${total} answered`,
      questionSkippedSummary: 'Your call — skipped questions',
      questionSkippedNote: 'No preference — assistant decides',
      applyButton: 'Apply',
      applyFixButton: 'Apply Fix',
      applyAllFixesButton: (count: number) => `Apply All (${count})`,
      forkAndApplyButton: 'Fork & Apply',
      forkAndApplyAllFixesButton: (count: number) => `Fork & Apply All (${count})`,
      finishingLabel: 'Finishing…',
      waitUntilFinishedTitle: 'Wait for response to finish before applying',
      dismissButton: 'Dismiss',
      appliedBadge: 'Applied',
      allFixesAppliedBadge: 'All Applied',
      batchPartialNote: (included: number, total: number) =>
        `${included} of ${total} non-conflicting fixes ready to combine`,
      dismissedBadge: 'Dismissed',
      showDiff: 'Show diff',
      hideDiff: 'Hide diff',
      showPreview: 'Preview script',
      hidePreview: 'Hide preview',
      viewModeDiff: 'Diff',
      viewModePreview: 'Preview',
      noTextChanges: 'No textual changes produced.',
      staleWarning:
        'Script changed since this suggestion was staged. Ask the assistant to regenerate it so manual edits are not overwritten.',
      lintClean: 'Lint clean',
      lintDeltaResolved: (count: number) => `-${count} resolved`,
      lintWarnings: (count: number) => `${count} ${count === 1 ? 'warn' : 'warns'}`,
      lintErrors: (count: number) => `${count} ${count === 1 ? 'err' : 'errs'}`,
      draftStats: (blocks: number, beats: number) =>
        `${blocks} MB · ${beats} ${beats === 1 ? 'Macro-State' : 'Macro-States'}`,
      auditNoIssues: 'No issues found across the inspected lenses.',
      showIssuesToggle: (count: number) => `Show ${count} ${count === 1 ? 'issue' : 'issues'}`,
      hideIssuesToggle: (count: number) => `Hide ${count} ${count === 1 ? 'issue' : 'issues'}`,
      appliedProgressBadge: (applied: number, total: number) => `${applied}/${total} applied`,
      expandDetailsAria: 'Expand suggestion details',
      collapseDetailsAria: 'Collapse suggestion details',
      auditCounts: (errors: number, warnings: number) => {
        if (errors === 0 && warnings === 0) return 'Clean';
        const parts: string[] = [];
        if (errors > 0) parts.push(`${errors} err`);
        if (warnings > 0) parts.push(`${warnings} warn`);
        return parts.join(' · ');
      },
      jumpToTargetTitle: (targetId: string) => `Jump to ${targetId} in editor`,
      repairHintPrefix: 'Repair: ',
      embeddedPatchUnavailable: 'Automatic fix withheld due to validation checks.',
    },
    settingsModal: {
      dialogAria: 'AI Settings',
      title: 'AI Settings',
      subtitle: 'Configure your browser-local Gemini API key, model, and reasoning depth.',
      closeAria: 'Close AI Settings',
      apiKeyLabel: 'Gemini API Key (BYOK)',
      apiKeyPlaceholder: 'AIza...',
      apiKeyAria: 'Gemini API Key',
      showKeyAria: 'Show API key',
      hideKeyAria: 'Hide API key',
      privacyNote:
        'Stays in this browser only and is sent directly to the Gemini API. Never read from server environment variables.',
      privacyNoteShort: 'Browser-local only · sent directly to Gemini API',
      sessionOnlyLabel: 'Session only',
      sessionOnlyDesc: 'Keep key in sessionStorage (clears when this tab closes)',
      sessionOnlyAria: 'Store API key for this browser session only',
      clearKeyButton: 'Clear Key',
      clearKeyAria: 'Clear stored Gemini API key',
      keyConfiguredBadge: 'Key saved',
      keyMissingBadge: 'Not set',
      modelLabel: 'Gemini Model',
      modelMetaHint: '1M context · in / out per 1M',
      modelPromoBadge: 'promo',
      modelLiteBadge: 'budget',
      modelGroupAria: 'Gemini model selection',
      reasoningLabel: 'Reasoning Level',
      reasoningGroupAria: 'Reasoning level selection',
      quickScanSensitivityLabel: 'Quick Scan Sensitivity',
      quickScanSensitivityGroupAria: 'Quick Scan sensitivity selection',
      quickScanSensitivityMeta: 'gemini-decision-1 · $0.10 / $0 per 1M',
      thinkingSummaryLabel: 'Show reasoning summary',
      thinkingSummaryDesc: 'Streamed thought summaries in the Thinking accordion',
      thinkingSummaryAria: 'Toggle reasoning summary display',
      estimatedCostLabel: 'Show estimated cost',
      estimatedCostDesc: 'Per-turn and session USD token estimates in the AI sidebar',
      estimatedCostAria: 'Toggle estimated USD cost display',
      debugTraceLabel: 'Show Debug Trace',
      debugTraceDesc: 'Quiet Inspect button on turns for requests, tool loops, and errors',
      debugTraceAria: 'Toggle AI debug trace inspector',
      resetDefaultsButton: 'Reset to defaults',
      resetDefaultsTitle:
        'Restore default model, reasoning level, and display toggles without clearing your API key',
      resetDefaultsAria: 'Reset AI preferences to defaults without clearing API key',
      doneButton: 'Done',
    },
    contextInspector: {
      dialogAria: 'Agent Context & Skills',
      title: 'Agent Context & Skills',
      subtitle: 'Inspect the cache-stable system instruction and delta turn context sent on the next turn, and customize Auteur craft or extension skills.',
      closeAria: 'Close Agent Context & Skills',
      tabsAria: 'Context inspector sections',
      tabPreview: 'Live Prompt Preview',
      tabCraft: 'Foundational Craft',
      tabSkills: 'Skills & Extensions',
      tabTools: 'Function Tools',
      tabQuickScan: 'Quick Scan Rules',
      functionTools: {
        summary: (active: number, inactive: number, disabled: number) =>
          disabled > 0
            ? `${active} active · ${inactive} inactive · ${disabled} disabled`
            : `${active} active · ${inactive} inactive`,
        autoAllButton: 'Auto all',
        disableAllButton: 'Disable all',
        autoAllAria: 'Set all function tools to Auto activation mode',
        disableAllAria: 'Disable all function tools for pure conversation mode',
        linterGateHeading: 'Enforce Linter Gate on Staged Proposals',
        linterGateDesc:
          'When enabled, mutation tools reject proposals that introduce deterministic Script Supervisor errors so the assistant self-repairs before staging. AST schema and expectedSnapshotHash concurrency checks always remain active.',
        linterGateToggleAria: 'Enforce deterministic Script Supervisor linter gate on staged proposals',
        linterGateActiveBadge: 'Enforced',
        linterGateBypassedBadge: 'Bypassed',
        coreProtocolHeading: 'Core Tool & Safety Protocol',
        coreProtocolDesc:
          'Foundational tool-use safety rules injected into the cache-stable System Instruction whenever at least one tool is active. Live focus and active tool names stay auto-synced below (expectedSnapshotHash travels with Live Editor State per turn).',
        coreProtocolRuntimeHeaderLabel: 'Auto-Synced Runtime Header (Cache-Stable Preview)',
        coreProtocolTextareaAria: 'Core Tool and Safety Protocol instructions',
        pureChatNotice:
          'All tools are currently inactive or disabled — the next turn runs in Pure Conversation Mode with zero tool schemas sent.',
        toolsListHeading: 'Function Tools',
        toolsListDesc:
          'Control per-tool activation (Auto exposes all 10 tools consistently with Ask First enforced via turn directive, Always On forces exposure, Disabled removes schema & guidance) and customize each tool’s prompt guidance or API description.',
        activationModeGroupAria: (label: string) => `Activation mode for ${label}`,
        activationModes: {
          auto: 'Auto',
          enabled: 'Always On',
          disabled: 'Disabled',
        } as const,
        categories: {
          inspect: 'Read-Only',
          mutation: 'Staged Edit',
          audit: 'Audit',
          workflow: 'Workflow',
        } as const,
        statusActiveAuto: 'Active · Auto',
        statusActiveForced: 'Active · Always On',
        statusInactiveFocus: (focusLabel: string) => `Inactive in ${focusLabel}`,
        statusInactiveNoSkills: 'Inactive · No available skills',
        statusDisabled: 'Disabled',
        expandToolAria: (label: string) => `Inspect or customize ${label}`,
        collapseToolAria: (label: string) => `Collapse ${label} settings`,
        guidanceFieldLabel: 'Protocol Guidance Bullet (Injected When Active)',
        guidanceFieldAria: (label: string) => `Protocol guidance bullet for ${label}`,
        descriptionFieldLabel: 'API FunctionDeclaration Description',
        descriptionFieldAria: (label: string) => `API description for ${label}`,
        schemaToggleShow: 'Show JSON Schema parameters',
        schemaToggleHide: 'Hide JSON Schema parameters',
        schemaReadOnlyBadge: 'Read-Only Schema',
        resetToolButton: 'Reset tool',
        resetAllToolsButton: 'Reset tools & protocol',
        confirmResetAllToolsTitle: 'Reset all function tool & protocol overrides?',
        confirmResetAllToolsDesc: (
          hasCoreOverride: boolean,
          linterBypassed: boolean,
          toolOverrideCount: number
        ) => {
          const parts: string[] = [];
          if (hasCoreOverride) parts.push('revert your Core Protocol edit');
          if (linterBypassed) parts.push('re-enable the deterministic Linter Gate');
          if (toolOverrideCount > 0) {
            parts.push(
              `reset ${toolOverrideCount} function tool ${
                toolOverrideCount === 1 ? 'override' : 'overrides'
              }`
            );
          }
          const summary =
            parts.length > 0 ? parts.join(', ') : 'restore all function tool and protocol defaults';
          return `This will ${summary} stored in this browser. Your Foundational Craft and Skills stay untouched.`;
        },
        confirmResetAllToolsAction: 'Reset Tools',
      },
      quickScanRules: {
        upstreamUpdateTitle: 'Built-in Quick Scan rules updated',
        upstreamUpdateDesc:
          'Built-in Quick Scan rules have been updated since your overrides were saved. Keep your overrides or reset to adopt the new catalog.',
        summary: (enabled: number, total: number, custom: number) =>
          custom > 0
            ? `${enabled}/${total} enabled · ${custom} custom`
            : `${enabled}/${total} enabled`,
        description:
          'Atomic binary checks run in a single Decisions API pass (gemini-decision-1). Per-Macro-State rules fan out over S# lines ({{STATE_ID}}) and Per-Sub-State rules fan out over individual S#.# units ({{SUB_STATE_ID}}).',
        addCustomRuleButton: 'Add Custom Rule',
        enableAllRulesButton: 'Enable all',
        disableAllRulesButton: 'Disable all',
        enableAllRulesAria: 'Enable all built-in and custom Quick Scan rules',
        disableAllRulesAria: 'Disable all built-in and custom Quick Scan rules',
        formAddTitle: 'New Custom Quick Scan Rule',
        formEditTitle: 'Edit Custom Quick Scan Rule',
        fieldLabel: 'Rule Label',
        fieldLabelPlaceholder: 'e.g. Avoid Unmotivated Slow Motion',
        fieldId: 'Rule ID (snake_case)',
        fieldIdPlaceholder: 'avoid_unmotivated_slow_mo',
        fieldLens: 'Audit Lens Group',
        fieldScope: 'Evaluation Scope',
        scopeDocument: 'Document (1 check)',
        scopeMacroState: 'Per Macro-State (S1..Sn)',
        scopeSubState: 'Per Sub-State (S1.1..Sn.k)',
        fieldWhen: 'Run Condition (AST Filter)',
        whenLabels: {
          all: 'Always',
          continuous: 'Continuous scenes',
          oner: 'Continuous oners only',
          montage: 'Montage scenes only',
          has_opening: 'Has [OPENING]',
          has_intent: 'Has [INTENT]',
          has_aesthetic: 'Has [AESTHETIC]',
          has_dialogue: 'Has {dialogue}',
          has_foley: 'State has <foley>',
          has_action: 'State has [ACT]',
          has_action_or_prop: 'State has [ACT]/[PROP]',
          has_brief_text: 'Active Brief text',
          has_brief_media: 'Active Brief media',
          sub_is_action: 'Sub-State is [ACT]',
          sub_is_camera: 'Sub-State is [CAM]',
          sub_is_foley: 'Sub-State is <foley>',
          sub_is_dialogue: 'Sub-State is {dialogue}',
          sub_is_action_or_prop: 'Sub-State is [ACT]/[PROP]',
        } as const,
        fieldInstructions: 'Binary Question (Yes = Issue)',
        fieldInstructionsPlaceholder:
          'Does {{SUB_STATE_ID}} / {{STATE_ID}} violate ...?',
        fieldTrueDesc: 'Violation Criteria (True)',
        fieldTrueDescPlaceholder: 'Concrete condition that means an issue IS present...',
        fieldFalseDesc: 'Clean Criteria (False)',
        fieldFalseDescPlaceholder: 'Concrete condition that means the script is clean...',
        fieldEscalationHint: 'Deep Audit Hint (Optional)',
        fieldEscalationHintPlaceholder: 'Short repair guidance passed to Gemini 4 on escalation...',
        saveRuleButton: 'Save Rule',
        updateRuleButton: 'Update Rule',
        toggleAria: (label: string, enabled: boolean) =>
          `${enabled ? 'Disable' : 'Enable'} Quick Scan rule ${label}`,
        resetAllRulesButton: 'Reset Quick Scan rules',
        confirmDeleteTitle: (label: string) => `Delete "${label}"?`,
        confirmDeleteDesc:
          'This custom Quick Scan rule will be permanently removed from this browser.',
        confirmDeleteAction: 'Delete Rule',
        confirmResetAllTitle: 'Reset all Quick Scan rules?',
        confirmResetAllDesc:
          'This will permanently delete all custom Quick Scan rules and restore every built-in rule default stored in this browser. Export your Agent Context first if you want a backup.',
        confirmResetAllDetailedDesc: (customCount: number, overrideCount: number) => {
          const parts: string[] = [];
          if (customCount > 0) {
            parts.push(
              `permanently delete ${customCount} custom Quick Scan ${customCount === 1 ? 'rule' : 'rules'}`
            );
          }
          if (overrideCount > 0) {
            parts.push(
              `reset ${overrideCount} built-in rule ${overrideCount === 1 ? 'override' : 'overrides'}`
            );
          }
          const actionSummary =
            parts.length > 0
              ? parts.join(' and ')
              : 'restore all Quick Scan rule defaults';
          return `This will ${actionSummary} stored in this browser. Custom rules cannot be recovered after reset — export your Agent Context first if you want a backup.`;
        },
        confirmResetAllAction: 'Reset Rules',
      },
      upstreamUpdateTitle: 'Built-in Auteur knowledge updated',
      upstreamUpdateDesc:
        'Built-in craft defaults have been updated since your overrides were saved. Keep your custom rules or reset to adopt the new defaults.',
      acknowledgeButton: 'Keep My Overrides',
      resetAllButton: 'Reset All',
      summaryFocus: 'Focus',
      summaryTopology: 'Topology',
      summarySnapshot: 'Snapshot',
      summaryTools: 'Tools',
      summaryToolsNone: 'none (pure conversation mode)',
      summaryToolsJumpTitle: 'Open Function Tools tab to configure active tools',
      sectionJumpTitle: (tabLabel: string) => `Open ${tabLabel} tab to edit`,
      summaryChangedBadge: 'changed',
      charsCount: (count: number) => `${count.toLocaleString()} chars`,
      copyPromptButton: 'Copy System Prompt',
      copiedPromptButton: 'Copied',
      copyPromptAria: 'Copy cache-stable system instruction to clipboard',
      groupSystemInstructionHeading: 'System Instruction (Cache-Stable Prefix)',
      groupSystemInstructionDesc:
        'Sent as system_instruction. Stays byte-for-byte identical across script edits, Brief updates, and Ask First toggles to keep Gemini 4 implicit caching warm.',
      groupTurnContextHeading: 'Next Turn Context (Delta Payload)',
      groupTurnContextDesc:
        'Prepended to your next user message only when needed so prior conversation history stays cached.',
      editableBadge: 'Editable',
      readOnlyBadge: 'Read-Only · Code-Owned',
      liveStateFullBadge: 'Full Snapshot',
      liveStateUnchangedBadge: 'Unchanged · Compact',
      briefActiveBadge: 'Active · From Brief',
      briefUpdatedBadge: 'Updated · Will Send',
      briefClearedBadge: 'Paused · Will Notify',
      briefCachedBadge: 'Already Sent · Cached',
      briefInactiveBadge: 'Not Attached',
      turnDirectiveActiveBadge: 'Active · Next Turn',
      turnDirectiveOffBadge: 'Off',
      modifiedBadge: 'Modified',
      sectionFoundationalCraft: 'Foundational Auteur Craft',
      sectionLiveEditorState: 'Live Editor State',
      sectionSceneBrief: 'Scene Brief & References',
      sectionTurnDirective: 'Turn Directive',
      sectionActiveSkills: 'Pinned Skills (Always in System Prompt)',
      sectionSkillDirectory: 'On-Demand Skill Directory',
      sectionToolProtocol: 'Tool & Safety Protocol',
      emptySceneBrief:
        'No active Scene Brief attached. Open Brief in the sidebar to add cast refs, specs, or additional instructions.',
      cachedSceneBrief:
        'Scene Brief already sent earlier in this conversation chain and remains cached in history.',
      emptyTurnDirective: 'Ask First is OFF — no turn directive will be prepended.',
      emptyActiveSkills:
        'No pinned skills. All non-muted skills stay in the On-Demand Skill Directory until you pin one.',
      emptyAvailableSkills: 'All non-muted skills are currently pinned.',
      foundationalCraftHeading: 'Foundational Auteur Craft',
      foundationalCraftDesc:
        'Directorial rules sent on every turn. Customize Tool & Safety Protocol and tool activation in the Function Tools tab.',
      foundationalCraftAria: 'Foundational Auteur Craft instructions',
      resetToDefaultButton: 'Reset to default',
      skillsSummary: (active: number, available: number, muted: number) =>
        `${active} pinned · ${available} on-demand · ${muted} muted`,
      autoAllSkillsButton: 'On-Demand all',
      muteAllSkillsButton: 'Mute all',
      autoAllSkillsAria: 'Set all built-in and custom skills to On-Demand mode',
      muteAllSkillsAria: 'Mute all built-in and custom skills',
      addCustomSkillButton: 'Add Custom Skill',
      cancelFormButton: 'Cancel',
      formAddTitle: 'New Custom Skill',
      formEditTitle: 'Edit Custom Skill',
      fieldNameLabel: 'Skill Name',
      fieldNamePlaceholder: 'e.g. Action Choreography Polish',
      fieldIdLabel: 'Skill ID (snake_case)',
      fieldIdPlaceholder: 'action_choreography_polish',
      fieldIdHint: 'Unique lowercase identifier used by load_auteur_skill. Cannot match built-in IDs.',
      fieldTriggerLabel: 'Trigger Hint',
      fieldTriggerPlaceholder:
        'When the user asks to choreograph combat [ACT] Sub-States or kinetic camera passes.',
      fieldBodyLabel: 'Skill Instructions',
      fieldBodyPlaceholder: 'Write clear, Auteur Script v0.4.0 guidelines for this skill...',
      saveSkillButton: 'Save Skill',
      updateSkillButton: 'Update Skill',
      builtInBadge: 'Built-in',
      customBadge: 'Custom',
      categoryWorkflow: 'Workflow',
      categoryModule: 'Module',
      statusActivePinned: 'Pinned',
      statusAvailable: 'On-Demand',
      statusMuted: 'Muted',
      pinModeGroupAria: (name: string) => `Activation mode for ${name}`,
      pinModes: {
        auto: 'On-Demand',
        pinned: 'Pin',
        muted: 'Mute',
      } as const,
      expandSkillAria: (name: string) => `Inspect or edit instructions for ${name}`,
      collapseSkillAria: (name: string) => `Collapse instructions for ${name}`,
      skillBodyOverrideLabel: 'Skill Instructions Override',
      skillBodyOverrideAria: (name: string) => `Instructions for ${name}`,
      editButton: 'Edit',
      deleteButton: 'Delete',
      resetSkillButton: 'Reset',
      resetAllDefaultsButton: 'Reset all defaults',
      doneButton: 'Done',
      confirmDeleteTitle: (name: string) => `Delete "${name}"?`,
      confirmDeleteDesc:
        'This custom skill and any pin override for it will be permanently removed from this browser.',
      confirmDeleteAction: 'Delete Skill',
      confirmResetAllTitle: 'Reset all craft & skill defaults?',
      confirmResetAllDesc:
        'This will permanently delete all custom skills and restore built-in Foundational Craft and skill defaults stored in this browser. Export your Agent Context first if you want a backup.',
      confirmResetAllDetailedDesc: (
        hasCraftOverride: boolean,
        customSkillCount: number,
        overrideCount: number,
        toolOverrideCount = 0
      ) => {
        const parts: string[] = [];
        if (customSkillCount > 0) {
          parts.push(
            `permanently delete ${customSkillCount} custom ${customSkillCount === 1 ? 'skill' : 'skills'}`
          );
        }
        if (hasCraftOverride) {
          parts.push('revert your Foundational Craft edit');
        }
        if (overrideCount > 0) {
          parts.push(
            `reset ${overrideCount} built-in skill ${overrideCount === 1 ? 'override' : 'overrides'}`
          );
        }
        if (toolOverrideCount > 0) {
          parts.push(
            `reset ${toolOverrideCount} tool/protocol ${toolOverrideCount === 1 ? 'customization' : 'customizations'}`
          );
        }
        const actionSummary =
          parts.length > 0
            ? parts.join(', ')
            : 'restore built-in Foundational Craft, skill, and function tool defaults';
        return `This will ${actionSummary} stored in this browser. Custom skills cannot be recovered after reset — export your Agent Context first if you want a backup.`;
      },
      confirmResetAllAction: 'Reset All',
      exportBackupBeforeResetButton: 'Export Agent Context first',
      exportBackupBeforeResetDone: 'Backup JSON exported',
      exportImport: {
        exportButton: 'Export JSON',
        exportAria:
          'Export unified Agent Context, Skills, Function Tools, and Quick Scan Rules as JSON',
        exportTitle:
          'Export Foundational Craft override, skill pin/body overrides, custom skills, Tool & Safety Protocol / Function Tool overrides, and Quick Scan rules as one JSON file',
        importButton: 'Import JSON',
        importAria:
          'Import Agent Context, Skills, Function Tools, and Quick Scan Rules from a JSON file',
        importTitle:
          'Import an exported Agent Context JSON pack (click or drop a .json file onto this header)',
        dropOverlayTitle: 'Drop Agent Context JSON pack to import',
        dropOverlaySubtitle:
          'Opens the selective Merge / Replace inspector before applying any changes',
        dismissNoticeAria: 'Dismiss import notice',
        exportedNotice: (filename: string) => `Exported ${filename}`,
        exportFailedNotice: 'Unable to download the Agent Context JSON file in this environment.',
        importReadError: 'Unable to read the selected JSON file.',
        importedSuccessNotice: (summary: string) => `Import applied: ${summary}`,
        dialogAria: 'Import Agent Context & Skills',
        dialogTitle: 'Import Agent Context & Skills',
        closeDialogAria: 'Close import dialog',
        exportedAtMeta: (date: string) => `Exported ${date}`,
        packVersionMeta: (version: number) => `Pack v${version}`,
        warningsHeading: 'Sanitizer notes',
        modeHeading: 'Import Strategy',
        modeMergeTitle: 'Merge (Keep existing)',
        modeMergeDesc:
          'Apply only the checked items below on top of your current setup. Unchecked local overrides and custom items stay untouched.',
        modeReplaceTitle: 'Replace (Switch profile)',
        modeReplaceDesc:
          'Replace each checked section below with only the selected items. Local custom items and overrides in checked sections not selected here will be removed.',
        selectAllButton: 'Select all',
        selectNoneButton: 'None',
        domainSkillsTitle: 'Foundational Craft, Skills & Tools',
        domainSkillsToggleAria: 'Include Foundational Craft, Skills & Function Tools section in import',
        domainSkillsEmptyNote:
          'This file contains no Foundational Craft, Skill, or Function Tool customizations (default baseline).',
        domainQuickScanTitle: 'Quick Scan Rules',
        domainQuickScanToggleAria: 'Include Quick Scan Rules section in import',
        domainQuickScanEmptyNote:
          'This file contains no Quick Scan Rule customizations (default baseline).',
        groupFoundationalCraft: 'Foundational Craft Override',
        groupBuiltInSkillOverrides: (count: number) => `Built-in Skill Overrides (${count})`,
        groupCustomSkills: (count: number) => `Custom Skills (${count})`,
        groupToolProtocol: 'Tool & Safety Protocol Override',
        groupToolOverrides: (count: number) => `Function Tool Overrides (${count})`,
        groupBuiltInRuleOverrides: (count: number) => `Built-in Rule Overrides (${count})`,
        groupCustomRules: (count: number) => `Custom Quick Scan Rules (${count})`,
        badgeNew: 'New',
        badgeOverwrites: 'Overwrites local',
        badgeEditedBody: 'Edited body',
        badgeEditedDesc: 'Edited description',
        badgeEditedGuidance: 'Edited guidance',
        badgeLinterBypassed: 'Linter bypassed',
        badgeEnabled: 'Enabled',
        badgeDisabled: 'Disabled',
        badgeEditedCriteria: 'Edited criteria',
        scopeShortDocument: 'Doc',
        scopeShortMacroState: 'S#',
        scopeShortSubState: 'S#.#',
        impactHeading: 'Import Summary',
        impactNoSelectionMerge: 'Select at least one item above to merge.',
        impactNoDomainReplace: 'Check at least one section above to replace.',
        impactWillApplyPrefix: 'Will apply: ',
        impactNoItemsReplaceBaseline: 'Restores checked section(s) to clean built-in defaults.',
        impactDestructiveWarning: (details: string) =>
          `Replace will permanently remove/reset: ${details}.`,
        exportCurrentBeforeReplace: 'Export current backup first',
        exportCurrentBeforeReplaceDone: 'Current backup exported',
        cancelButton: 'Cancel',
        confirmMergeButton: (count: number) =>
          count > 0 ? `Merge ${count} ${count === 1 ? 'Item' : 'Items'}` : 'Merge Selected',
        confirmReplaceButton: 'Replace Selected',
      },
    },
    traceModal: {
      dialogAria: 'AI Trace Inspector',
      title: 'AI Trace Inspector',
      subtitle: 'Sanitized Gemini API request, tool loop, and response diagnostics',
      quickScanSubtitle:
        'Sanitized Gemini Decisions API (v1beta) atomic question matrix and calibrated probabilities',
      quickScanSensitivity: 'Sensitivity',
      quickScanQuestions: 'Questions',
      quickScanBatches: 'Batches',
      quickScanAnswersHeading: (count: number) => `Calibrated Answers (${count})`,
      quickScanQuestionsHeading: (count: number) => `Questions Sent (${count})`,
      quickScanInputHeading: 'Shared Input Sent',
      closeAria: 'Close AI Trace Inspector',
      copyJsonButton: 'Copy Trace JSON',
      copiedJsonButton: 'Copied',
      copyJsonAria: 'Copy sanitized trace JSON to clipboard',
      doneButton: 'Done',
      summaryModel: 'Model',
      summaryReasoning: 'Reasoning',
      summaryMode: 'Mode',
      summaryFocus: 'Focus',
      summarySkills: 'Skills',
      skillActivePrefix: 'active',
      skillLoadedPrefix: 'loaded',
      summaryDuration: 'Duration',
      summaryRounds: 'Tool Rounds',
      summaryStatus: 'Status',
      summaryInteractionChain: 'Interaction Chain',
      summaryUsage: 'Token Usage',
      summaryEstimatedCost: 'Est. Cost',
      costPromoBadge: 'promo',
      costRateSummary: (inputPer1M: number, outputPer1M: number) =>
        `$${inputPer1M}/$${outputPer1M} per 1M`,
      summaryStartedAt: 'Started',
      statusCompleted: 'Completed',
      statusRoundLimit: 'Round Limit',
      statusStopped: 'Stopped',
      statusError: 'Error',
      roundLimitBadge: 'max rounds',
      noInteractionId: 'none',
      errorDetailsHeading: 'Error Details',
      errorStatusLabel: 'HTTP',
      errorCodeLabel: 'Code',
      roundsHeading: (count: number) =>
        `Round Timeline (${count} ${count === 1 ? 'round' : 'rounds'})`,
      noRoundsNote: 'This turn ended before an Interactions API request round was sent.',
      roundTitle: (index: number) => `Round ${index}`,
      roundToolCount: (count: number) => `${count} ${count === 1 ? 'tool' : 'tools'}`,
      sectionRequest: 'Request Sent',
      sectionToolCalls: (count: number) => `Tool Calls & Results (${count})`,
      requestModelLabel: 'model',
      requestPrevIdLabel: 'previous_interaction_id',
      requestGenConfigLabel: 'generation_config',
      requestToolsLabel: 'tools',
      requestNoTools: 'none',
      requestInputLabel: 'input',
      requestSystemInstructionLabel: 'system_instruction',
      charsCount: (count: number) => `${count.toLocaleString()} chars`,
      toolStatusOk: 'ok',
      toolStatusError: 'error',
      toolStagedLabel: 'staged',
      toolRepairHintLabel: 'Repair Hint',
      toolArgumentsLabel: 'arguments',
      toolResultLabel: 'result',
      formatDurationMs: (ms: number) =>
        ms < 1 ? '< 1 ms' : `${Math.round(ms).toLocaleString()} ms`,
    },
    history: {
      buttonTitle: 'Browse & resume saved AI chat sessions',
      buttonAria: 'Open AI Chat History',
      recentHeading: 'Recent Sessions',
      viewAllButton: 'View all',
      thisScriptBadge: 'This script',
      scriptDeletedBadge: 'Script deleted',
      turnsLabel: (count: number) => `${count} ${count === 1 ? 'turn' : 'turns'}`,
      emptyRecentHint: 'Saved AI chats appear here automatically across reloads.',
      crossScriptNotice: (scriptTitle: string) =>
        `Loaded from "${scriptTitle}". Continuing on current script via recap.`,
      crossScriptDeletedNotice: (scriptTitle: string) =>
        `Loaded from deleted script "${scriptTitle}". Continuing on current script via recap.`,
      switchToScriptButton: (scriptTitle: string) => `Switch to "${scriptTitle}"`,
      dismissBannerAria: 'Dismiss loaded session notice',
      bridgedExpiredBadge: 'Continued via local recap · previous Gemini chain expired',
      bridgedCrossScriptBadge: 'Continued via local recap · adapted from another script',
      omittedMediaNotice: 'Media not saved in history — re-attach if starting a fresh chain',
      copyUserPromptTitle: 'Copy prompt',
      copyUserPromptAria: 'Copy user prompt to clipboard',
      copiedUserPromptAria: 'Prompt copied to clipboard',
      copyAssistantReplyTitle: 'Copy response',
      copyAssistantReplyAria: 'Copy assistant response to clipboard',
      copiedAssistantReplyAria: 'Response copied to clipboard',
      dialogAria: 'AI Chat History',
      title: 'AI Chat History',
      subtitle: 'Auto-saved locally in IndexedDB · Text-only Brief & full Trace Inspector fidelity',
      closeAria: 'Close AI Chat History',
      searchPlaceholder: 'Search titles, prompts, replies, or Brief...',
      searchAria: 'Search saved AI sessions',
      clearSearchAria: 'Clear session search',
      filterGroupAria: 'Filter AI sessions',
      filterAll: 'All',
      filterCurrentScript: 'This Script',
      filterPinned: 'Pinned',
      emptyList: 'No saved AI chat sessions yet. Start a conversation in the AI Assistant and it will auto-save here.',
      emptySearch: 'No saved AI sessions match this filter or search.',
      selectPrompt: 'Select a session to inspect prompts, replies, Brief notes, and Trace logs.',
      loadInSidebarButton: 'Load in Sidebar',
      switchScriptAndLoadButton: 'Switch Script & Load',
      copyPromptButton: 'Copy',
      copiedPromptButton: 'Copied',
      copyBriefButton: 'Copy Brief',
      copiedBriefButton: 'Copied',
      downloadButton: 'Download',
      downloadDefaultTitle: 'Download conversation as Markdown (.md)',
      downloadDefaultAria: 'Download conversation as Markdown',
      downloadMenuAria: 'Choose download format',
      downloadConversationLabel: 'Conversation',
      downloadConversationDesc: 'Prompts, replies, Brief & outcomes',
      downloadFullConversationJsonLabel: 'Full Conversation',
      downloadFullConversationJsonDesc: 'Conversation, diffs, skills, tools & metrics',
      downloadFullJsonLabel: 'Full Payload',
      downloadFullJsonDesc: 'Traces, tools & system instructions',
      downloadTagMd: '.MD',
      downloadTagJson: '.JSON',
      renameButton: 'Rename',
      renamePlaceholder: 'Session title...',
      renameAria: 'Session title',
      saveRenameAria: 'Save session title',
      cancelRenameAria: 'Cancel rename',
      pinButton: 'Pin',
      unpinButton: 'Unpin',
      pinAria: 'Pin session to protect from auto-pruning',
      unpinAria: 'Unpin session',
      deleteButton: 'Delete',
      deleteConfirmTitle: 'Delete AI Session?',
      deleteConfirmMessage: (title: string) =>
        `Permanently remove "${title}" from saved AI chat history? Your script will not be affected.`,
      deleteConfirmLabel: 'Delete Session',
      savedBriefHeading: 'Saved Scene Brief (Text-Only)',
      omittedMediaHint: 'Binary media attachments are omitted from saved history to keep storage fast and reliable.',
      inspectTraceButton: 'Trace',
      noTurnsYet: 'No turns recorded in this session.',
      pausedBadge: 'Paused',
      backupButton: 'Backup',
      backupButtonTitle: 'Export all or selected AI chat sessions as a portable JSON backup',
      backupButtonAria: 'Backup AI chat sessions',
      importButton: 'Import',
      importButtonTitle: 'Inspect and import AI chat sessions from a JSON backup',
      importButtonAria: 'Import AI chat sessions',
      cleanupButton: 'Clean up',
      cleanupButtonTitle: 'Reclaim storage by stripping old API traces or deleting stale sessions',
      cleanupButtonAria: 'Clean up AI chat history',
      storageSummary: (count: number, formattedTotal: string) =>
        `${count} ${count === 1 ? 'session' : 'sessions'} · ${formattedTotal}`,
      storageTracesHint: (formattedTraces: string) => `${formattedTraces} traces`,
      lastBackupLabel: (relativeTime: string) => `Last backup: ${relativeTime}`,
      lastBackupNever: 'Not backed up yet',
      lastBackupUpdatedSince: (count: number) => `${count} updated since`,
      lastBackupTooltip: (dateStr: string, count: number, includesTraces: boolean) =>
        `Exported ${dateStr} (${count} ${count === 1 ? 'session' : 'sessions'}, ${
          includesTraces ? 'with API traces' : 'without traces'
        })`,
      cleanupSuccessStrippedToast: (count: number, formattedFreed: string) =>
        `Stripped API traces from ${count} ${count === 1 ? 'session' : 'sessions'} (freed ~${formattedFreed}).`,
      cleanupSuccessDeletedToast: (count: number, formattedFreed: string) =>
        `Deleted ${count} ${count === 1 ? 'session' : 'sessions'} (freed ~${formattedFreed}).`,
      importSuccessToast: (added: number, forked: number) => {
        const total = added + forked;
        if (forked > 0 && added > 0) {
          return `Imported ${total} AI sessions (${added} new, ${forked} forked as copies).`;
        }
        if (forked > 0) {
          return `Imported ${forked} AI ${forked === 1 ? 'session' : 'sessions'} as new copies.`;
        }
        return `Imported ${added} AI ${added === 1 ? 'session' : 'sessions'}.`;
      },
      backup: {
        dialogAria: 'Backup AI Chat History',
        title: 'Backup AI Chat History',
        subtitle: 'Export portable JSON snapshots of your local AI sessions (API keys excluded).',
        closeAria: 'Close Backup AI Chat History',
        scopeHeading: 'What to Include',
        scopeAll: 'All Sessions',
        scopeCurrentScript: 'This Script',
        scopePinned: 'Pinned Only',
        scopeSelected: 'Pick Specific',
        pickSearchPlaceholder: 'Filter sessions to pick...',
        pickSearchAria: 'Filter sessions for backup',
        selectAllButton: 'Select All',
        clearSelectionButton: 'Clear',
        emptyScopeHint: 'No sessions match this scope.',
        includeTracesLabel: 'Include API request traces',
        includeTracesDesc:
          'Keeps raw Gemini API rounds and system instructions for Trace Inspector. Turn off for a much smaller file—conversations, thinking summaries, tool calls, suggestions, Brief, and resume recap remain intact.',
        traceBadge: 'Traces',
        noTraceBadge: 'No traces',
        summarySelected: (count: number) =>
          `${count} ${count === 1 ? 'session' : 'sessions'} selected`,
        summaryEstimatedSize: (formattedSize: string) => `File size: ${formattedSize}`,
        cancelButton: 'Cancel',
        downloadButton: (count: number) =>
          count > 0 ? `Download Backup (${count})` : 'Download Backup',
      },
      import: {
        dialogAria: 'Import AI Chat History',
        title: 'Import AI Chat History',
        subtitle: 'Inspect file condition, trace coverage, and session conflicts before importing.',
        closeAria: 'Close Import AI Chat History',
        dropTitle: 'Drop AI backup JSON here',
        dropSubtitle: 'Supports AI Chat History Backups and single-session Full Payload (.json)',
        chooseFileButton: 'Choose JSON File',
        chooseFileAria: 'Choose an AI chat backup JSON file',
        chooseAnotherButton: 'Choose Another File',
        formatBackupBadge: 'History Backup',
        formatSingleBadge: 'Single Session Export',
        exportedAtPrefix: 'Exported',
        summaryNew: (count: number) => `${count} new`,
        summaryConflict: (count: number) => `${count} conflict (fork)`,
        summaryDuplicate: (count: number) => `${count} duplicate`,
        summaryWithTraces: (count: number) => `${count} with traces`,
        summaryWithoutTraces: (count: number) => `${count} without traces`,
        noTracesNotice:
          'This file omits raw API traces. Transcripts, thinking summaries, tool calls, suggestions, Brief notes, and resuming chats via recap will still work normally—only the Trace Inspector button is unavailable.',
        orphanedScriptsNotice: (count: number) =>
          `${count} ${count === 1 ? 'session references' : 'sessions reference'} a script not found in this browser. You can still inspect ${count === 1 ? 'it' : 'them'} or resume via recap on any open script.`,
        selectRecommendedButton: 'Select Recommended',
        selectAllButton: 'Select All',
        clearButton: 'Clear',
        statusNewBadge: 'New',
        statusConflictBadge: 'Conflict → Fork',
        statusDuplicateBadge: 'Duplicate',
        conflictDetail: (existingTitle: string) =>
          `Matches an existing ID ("${existingTitle}") with different content — imports as a separate copy without overwriting.`,
        duplicateDetail: 'Already present locally with identical content (skipped by default).',
        tracesPresentBadge: 'Traces',
        tracesOmittedBadge: 'No traces',
        scriptMissingBadge: 'Not in library',
        cancelButton: 'Cancel',
        confirmButton: (count: number) =>
          count > 0 ? `Import ${count} ${count === 1 ? 'Session' : 'Sessions'}` : 'Import Selected',
        importingButton: 'Importing…',
        importErrorTitle: 'Could not import file',
      },
      cleanup: {
        dialogAria: 'Clean Up AI Chat History',
        title: 'Clean Up AI Chat History',
        subtitle:
          'Reclaim local storage by stripping heavy API traces or removing stale sessions.',
        closeAria: 'Close Clean Up AI Chat History',
        actionHeading: 'Cleanup Mode',
        actionStripLabel: 'Strip API traces only',
        actionStripDesc:
          'Removes raw Gemini API trace rounds and system instructions while preserving transcripts, thinking summaries, tool calls, suggestions, Brief, cost totals, and resume recap.',
        actionDeleteLabel: 'Delete matching sessions',
        actionDeleteDesc:
          'Permanently removes the matched sessions from local storage. Your scripts are never affected.',
        filtersHeading: 'Filter Sessions',
        ageLabel: 'Age',
        ageAny: 'Any time',
        age7d: 'Older than 7d',
        age30d: 'Older than 30d',
        age90d: 'Older than 90d',
        scriptLabel: 'Script',
        scriptAll: 'All scripts',
        scriptOrphaned: 'Orphaned (script deleted)',
        onlyWithTracesLabel: 'Only sessions containing API traces',
        includePinnedLabel: 'Include pinned sessions',
        previewHeading: (matchedCount: number, actionableCount: number, freedSize: string) =>
          actionableCount === 0
            ? 'No matching sessions to update'
            : `${actionableCount} of ${matchedCount} matched · ~${freedSize} freed`,
        emptyMatchHint: 'No saved sessions match the selected cleanup filters.',
        noTracesToStripHint: 'Matched sessions do not contain any API traces to strip.',
        backupFirstButton: 'Backup matching first',
        backupFirstDoneButton: 'Backup downloaded',
        cancelButton: 'Cancel',
        confirmStripButton: (count: number) =>
          count > 0 ? `Strip Traces (${count})` : 'Strip Traces',
        confirmDeleteButton: (count: number) =>
          count > 0 ? `Delete ${count} ${count === 1 ? 'Session' : 'Sessions'}` : 'Delete',
        processingButton: 'Cleaning up…',
        deleteConfirmTitle: 'Delete Matched AI Sessions?',
        deleteConfirmMessage: (count: number, formattedFreed: string) =>
          `Permanently delete ${count} ${
            count === 1 ? 'AI session' : 'AI sessions'
          } (reclaiming ~${formattedFreed})? Your scripts will not be affected.`,
        deleteConfirmLabel: 'Delete Sessions',
      },
    },
  },
} as const;
