import {describe, expect, it} from 'vitest';
import {
  extractMetadata,
  lintDocument,
  parseAuteurScript,
  updateExecutionSubState,
  updateStagingBlock,
  type LintDiagnostic,
} from '../../src/core/index.ts';
import {reconcileStepFocusOnDelete} from '../../src/ui/beatFocus.ts';
import {matchHistoryShortcut} from '../../src/ui/historyShortcuts.ts';
import {
  areLintRuleOverridesEqual,
  countCustomLintRules,
  DEFAULT_LINT_RULE_OVERRIDES,
  getEffectiveLintRuleSeverity,
  sanitizeLintRuleOverrides,
  setLintRuleOverride,
} from '../../src/ui/lintRules.ts';
import {
  stabilizeAestheticTokens,
  stabilizeBeatLinks,
  stabilizeCharacters,
  stabilizeDiagnosticsMap,
  stabilizeExecutionBeats,
  stabilizeStagingBlocks,
  stabilizeStringArray,
} from '../../src/ui/referenceStability.ts';
import {
  areAllIndicesCollapsed,
  deleteCollapsedIndex,
  insertCollapsedIndex,
  pruneCollapsedIndices,
  reorderCollapsedIndices,
  toggleAllCollapsedIndices,
  toggleCollapsedIndex,
} from '../../src/ui/stagingCollapse.ts';

describe('stagingCollapse helpers', () => {
  it('toggles duplicate-header blocks independently by index', () => {
    // Imagine two [NOTES] blocks at indices 1 and 3
    let state = new Set<number>();
    state = toggleCollapsedIndex(state, 1);
    expect(state.has(1)).toBe(true);
    expect(state.has(3)).toBe(false);

    state = toggleCollapsedIndex(state, 3);
    expect(state.has(1)).toBe(true);
    expect(state.has(3)).toBe(true);

    state = toggleCollapsedIndex(state, 1);
    expect(state.has(1)).toBe(false);
    expect(state.has(3)).toBe(true);
  });

  it('follows the dragged block across forward and backward reorders', () => {
    // [0: expanded, 1: collapsed, 2: expanded, 3: collapsed]
    const initial = new Set<number>([1, 3]);

    // Drag collapsed block 1 forward to index 2 -> [0: exp, 1: exp, 2: col, 3: col]
    const movedForward = reorderCollapsedIndices(initial, 1, 2, 4);
    expect(Array.from(movedForward).sort((a, b) => a - b)).toEqual([2, 3]);

    // Drag collapsed block 3 backward to index 0 -> [0: col, 1: exp, 2: col, 3: exp]
    const movedBackward = reorderCollapsedIndices(initial, 3, 0, 4);
    expect(Array.from(movedBackward).sort((a, b) => a - b)).toEqual([0, 2]);
  });

  it('shifts collapsed indices cleanly on insert, delete, and prune', () => {
    const initial = new Set<number>([0, 2, 4]);

    // Insert at index 2 -> 0 stays 0, 2 becomes 3, 4 becomes 5 (new block at 2 starts expanded)
    const afterInsert = insertCollapsedIndex(initial, 2);
    expect(Array.from(afterInsert).sort((a, b) => a - b)).toEqual([0, 3, 5]);

    // Delete index 2 -> 0 stays 0, 2 removed, 4 becomes 3
    const afterDelete = deleteCollapsedIndex(initial, 2);
    expect(Array.from(afterDelete).sort((a, b) => a - b)).toEqual([0, 3]);

    // Prune when list shrinks to length 3
    const pruned = pruneCollapsedIndices(initial, 3);
    expect(Array.from(pruned).sort((a, b) => a - b)).toEqual([0, 2]);
  });

  it('detects and toggles bulk collapse/expand state across any item count', () => {
    expect(areAllIndicesCollapsed(new Set(), 0)).toBe(false);
    expect(areAllIndicesCollapsed(new Set([0, 1]), 3)).toBe(false);
    expect(areAllIndicesCollapsed(new Set([0, 1, 2]), 3)).toBe(true);

    // Partial -> Collapse all
    const collapsedAll = toggleAllCollapsedIndices(new Set([1]), 4);
    expect(Array.from(collapsedAll).sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
    expect(areAllIndicesCollapsed(collapsedAll, 4)).toBe(true);

    // All collapsed -> Expand all
    const expandedAll = toggleAllCollapsedIndices(collapsedAll, 4);
    expect(expandedAll.size).toBe(0);
    expect(areAllIndicesCollapsed(expandedAll, 4)).toBe(false);

    // Empty list stays empty
    expect(toggleAllCollapsedIndices(new Set(), 0).size).toBe(0);
  });
});

describe('reconcileStepFocusOnDelete', () => {
  const steps = ['[CAM 01] MS on Ada', '[ACT] Ada turns', '<rain on glass>', 'Ada says {Quiet.}'];

  it('moves focus and active draft to the previous step when deleting the focused step', () => {
    const result = reconcileStepFocusOnDelete(
      {
        focusedStepIndex: 2,
        activeDraft: '<rain on glass>',
        pendingAfterIndex: null,
        pendingDraft: '',
      },
      steps,
      2
    );

    expect(result.focusedStepIndex).toBe(1);
    expect(result.activeDraft).toBe('[ACT] Ada turns');
    expect(result.nextFocusTarget).toEqual({
      type: 'step',
      index: 1,
      caret: '[ACT] Ada turns'.length,
    });
  });

  it('shifts focusedStepIndex down and preserves activeDraft/caret when deleting an earlier step', () => {
    const result = reconcileStepFocusOnDelete(
      {
        focusedStepIndex: 3,
        activeDraft: 'Ada says {Quiet now.}',
        pendingAfterIndex: null,
        pendingDraft: '',
      },
      steps,
      1,
      14
    );

    expect(result.focusedStepIndex).toBe(2);
    expect(result.activeDraft).toBe('Ada says {Quiet now.}');
    expect(result.nextFocusTarget).toEqual({
      type: 'step',
      index: 2,
      caret: 14,
    });
  });

  it('keeps focus and draft untouched when deleting a later step', () => {
    const result = reconcileStepFocusOnDelete(
      {
        focusedStepIndex: 0,
        activeDraft: '[CAM 01] MS on Ada',
        pendingAfterIndex: null,
        pendingDraft: '',
      },
      steps,
      2,
      8
    );

    expect(result.focusedStepIndex).toBe(0);
    expect(result.activeDraft).toBe('[CAM 01] MS on Ada');
    expect(result.nextFocusTarget).toBeNull();
  });

  it('shifts pendingAfterIndex when deleting a step at or before the pending anchor', () => {
    const result = reconcileStepFocusOnDelete(
      {
        focusedStepIndex: null,
        activeDraft: '',
        pendingAfterIndex: 2,
        pendingDraft: '[LIGHT]',
      },
      steps,
      1,
      7
    );

    expect(result.focusedStepIndex).toBeNull();
    expect(result.pendingAfterIndex).toBe(1);
    expect(result.nextFocusTarget).toEqual({
      type: 'pending',
      index: 1,
      caret: 7,
    });
  });
});

describe('matchHistoryShortcut', () => {
  const base = {key: '', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false};

  it('matches Cmd+Z and Ctrl+Z as undo (case-insensitive)', () => {
    expect(matchHistoryShortcut({...base, key: 'z', metaKey: true})).toBe('undo');
    expect(matchHistoryShortcut({...base, key: 'Z', ctrlKey: true})).toBe('undo');
  });

  it('matches Cmd+Shift+Z, Ctrl+Shift+Z, and Ctrl+Y as redo', () => {
    expect(matchHistoryShortcut({...base, key: 'z', metaKey: true, shiftKey: true})).toBe('redo');
    expect(matchHistoryShortcut({...base, key: 'Z', ctrlKey: true, shiftKey: true})).toBe('redo');
    expect(matchHistoryShortcut({...base, key: 'y', ctrlKey: true})).toBe('redo');
    expect(matchHistoryShortcut({...base, key: 'Y', ctrlKey: true})).toBe('redo');
  });

  it('ignores non-matching chords, Cmd+Y, Alt combinations, and IME composition events', () => {
    expect(matchHistoryShortcut({...base, key: 'z'})).toBeNull();
    expect(matchHistoryShortcut({...base, key: 'y', metaKey: true})).toBeNull();
    expect(matchHistoryShortcut({...base, key: 'y', ctrlKey: true, shiftKey: true})).toBeNull();
    expect(matchHistoryShortcut({...base, key: 'z', ctrlKey: true, altKey: true})).toBeNull();
    expect(
      matchHistoryShortcut({...base, key: 'z', metaKey: true, isComposing: true})
    ).toBeNull();
  });
});

function groupExecutionDiagnostics(diagnostics: LintDiagnostic[]): Map<number, LintDiagnostic[]> {
  const map = new Map<number, LintDiagnostic[]>();
  for (const diag of diagnostics) {
    if (diag.target.phase === 'execution') {
      const list = map.get(diag.target.beatIndex) ?? [];
      list.push(diag);
      map.set(diag.target.beatIndex, list);
    }
  }
  return map;
}

describe('referenceStability helpers', () => {
  const buildLongScript = (beatCount: number): string => {
    const beats = Array.from({length: beatCount}, (_, idx) => {
      const beatNum = idx + 1;
      if (beatNum === 1) {
        return '[CAM 01] MS, eye level -> [ACT] Ada opens the ledger -> <paper rustle>';
      }
      if (beatNum === 10) {
        // Intentional warning on beat 10 (ends on dialogue) to test non-empty diagnostic stability
        return '[CAM 01] -> Ada says {Still checking.}';
      }
      return `[CAM 01] -> [ACT] Ada flips page ${beatNum} -> <soft tap>`;
    });

    return [
      '[INTENT]',
      '@img1 as ADA (voice: @audio1)',
      '',
      '[AESTHETIC]',
      'Lighting: Sodium overhead -> SODIUM_KEY',
      'Palette: Cold slate -> SLATE_WASH',
      '',
      '[EXECUTION]',
      ...beats,
    ].join('\n');
  };

  it('preserves references for all unaffected staging blocks, metadata, beats, and diagnostics on a single-beat edit', () => {
    const raw1 = buildLongScript(80);
    const doc1 = parseAuteurScript(raw1);
    const meta1 = extractMetadata(doc1);
    const diags1 = lintDocument(doc1, meta1);
    const beatDiagMap1 = groupExecutionDiagnostics(diags1);

    // Edit only Beat 42, Step 1 (an [ACT] sub-state)
    const raw2 = updateExecutionSubState(raw1, 42, 1, '[ACT] Ada underlines page 42');
    const doc2 = parseAuteurScript(raw2);
    const meta2 = extractMetadata(doc2);
    const diags2 = lintDocument(doc2, meta2);
    const beatDiagMap2 = groupExecutionDiagnostics(diags2);

    const stableStaging = stabilizeStagingBlocks(doc1.stagingBlocks, doc2.stagingBlocks);
    const stableCharacters = stabilizeCharacters(meta1.characters, meta2.characters);
    const stableTokens = stabilizeAestheticTokens(meta1.aestheticTokens, meta2.aestheticTokens);
    const stableLinks = stabilizeBeatLinks(meta1.beatLinks, meta2.beatLinks);
    const stableBeats = stabilizeExecutionBeats(
      doc1.execution!.beats,
      doc2.execution!.beats
    );
    const stableDiagMap = stabilizeDiagnosticsMap(beatDiagMap1, beatDiagMap2);

    expect(stableStaging).toBe(doc1.stagingBlocks);
    expect(stableCharacters).toBe(meta1.characters);
    expect(stableTokens).toBe(meta1.aestheticTokens);
    expect(stableLinks).toBe(meta1.beatLinks);
    expect(stableDiagMap).toBe(beatDiagMap1);
    expect(stableDiagMap.get(10)).toBe(beatDiagMap1.get(10));

    // Only Beat 42 (index 41) changed; all other 79 beats preserve strict === identity
    expect(stableBeats).not.toBe(doc1.execution!.beats);
    for (let i = 0; i < stableBeats.length; i++) {
      if (i === 41) {
        expect(stableBeats[i]).not.toBe(doc1.execution!.beats[i]);
        expect(stableBeats[i].raw).toContain('underlines page 42');
      } else {
        expect(stableBeats[i]).toBe(doc1.execution!.beats[i]);
      }
    }
  });

  it('preserves unaffected beat diagnostics when another beat gains a new lint error', () => {
    const raw1 = buildLongScript(40);
    const doc1 = parseAuteurScript(raw1);
    const meta1 = extractMetadata(doc1);
    const beatDiagMap1 = groupExecutionDiagnostics(lintDocument(doc1, meta1));

    // Introduce a banned viewport term on Beat 25
    const raw2 = updateExecutionSubState(raw1, 25, 1, '[ACT] Ada glances stage-left');
    const doc2 = parseAuteurScript(raw2);
    const meta2 = extractMetadata(doc2);
    const beatDiagMap2 = groupExecutionDiagnostics(lintDocument(doc2, meta2));

    const stableDiagMap = stabilizeDiagnosticsMap(beatDiagMap1, beatDiagMap2);

    expect(stableDiagMap).not.toBe(beatDiagMap1);
    expect(stableDiagMap.get(10)).toBe(beatDiagMap1.get(10));
    expect(stableDiagMap.get(25)?.length).toBe(1);
  });

  it('keeps aestheticTokens, execution beats, and beatLinks stable when adding lines in an earlier Staging block', () => {
    const raw1 = buildLongScript(30);
    const doc1 = parseAuteurScript(raw1);
    const meta1 = extractMetadata(doc1);

    // Insert extra lines inside [INTENT] (block 0), shifting lineIndex of [AESTHETIC] and all beats
    const raw2 = updateStagingBlock(
      raw1,
      0,
      '@img1 as ADA (voice: @audio1)\nExtra director note\nSecond line'
    );
    const doc2 = parseAuteurScript(raw2);
    const meta2 = extractMetadata(doc2);

    const stableStaging = stabilizeStagingBlocks(doc1.stagingBlocks, doc2.stagingBlocks);
    const stableTokens = stabilizeAestheticTokens(meta1.aestheticTokens, meta2.aestheticTokens);
    const stableBeats = stabilizeExecutionBeats(
      doc1.execution!.beats,
      doc2.execution!.beats
    );
    const stableLinks = stabilizeBeatLinks(meta1.beatLinks, meta2.beatLinks);

    expect(stableStaging[0]).not.toBe(doc1.stagingBlocks[0]);
    expect(stableStaging[1]).toBe(doc1.stagingBlocks[1]);
    expect(stableTokens).toBe(meta1.aestheticTokens);
    expect(stableBeats).toBe(doc1.execution!.beats);
    expect(stableLinks).toBe(meta1.beatLinks);
  });

  it('reuses string array reference when IDs/names are unchanged', () => {
    const ids1 = ['beat-1', 'beat-2', 'beat-3'];
    expect(stabilizeStringArray(ids1, ['beat-1', 'beat-2', 'beat-3'])).toBe(ids1);
    expect(stabilizeStringArray(ids1, ['beat-1', 'beat-2', 'beat-3', 'beat-4'])).toEqual([
      'beat-1',
      'beat-2',
      'beat-3',
      'beat-4',
    ]);
  });
});

describe('lintRules UI state helpers', () => {
  it('sanitizes persisted override payloads by dropping unknown rule IDs and invalid values', () => {
    expect(sanitizeLintRuleOverrides(null)).toEqual({});
    expect(sanitizeLintRuleOverrides(['off'])).toEqual({});
    expect(
      sanitizeLintRuleOverrides({
        'viewport-coordinate-purity': 'warning',
        'macro-state-resolution': 'off',
        'unknown-rule': 'error',
        'frozen-first-frame-purity': 'critical',
      })
    ).toEqual({
      'viewport-coordinate-purity': 'warning',
      'macro-state-resolution': 'off',
    });
  });

  it('resolves effective severities, updates overrides cleanly, and removes keys returning to default', () => {
    let overrides = DEFAULT_LINT_RULE_OVERRIDES;
    expect(getEffectiveLintRuleSeverity('viewport-coordinate-purity', overrides)).toBe('error');
    expect(getEffectiveLintRuleSeverity('macro-state-resolution', overrides)).toBe('warning');
    expect(countCustomLintRules(overrides)).toBe(0);

    // Override a default-error rule to off
    overrides = setLintRuleOverride(overrides, 'viewport-coordinate-purity', 'off');
    expect(getEffectiveLintRuleSeverity('viewport-coordinate-purity', overrides)).toBe('off');
    expect(countCustomLintRules(overrides)).toBe(1);

    // Promote a default-warning rule to error
    overrides = setLintRuleOverride(overrides, 'macro-state-resolution', 'error');
    expect(getEffectiveLintRuleSeverity('macro-state-resolution', overrides)).toBe('error');
    expect(countCustomLintRules(overrides)).toBe(2);

    // Selecting the same severity again returns the exact same reference
    expect(setLintRuleOverride(overrides, 'macro-state-resolution', 'error')).toBe(overrides);

    // Returning rules to their built-in defaults removes the override keys
    overrides = setLintRuleOverride(overrides, 'viewport-coordinate-purity', 'error');
    expect(overrides['viewport-coordinate-purity']).toBeUndefined();
    expect(countCustomLintRules(overrides)).toBe(1);

    overrides = setLintRuleOverride(overrides, 'macro-state-resolution', 'warning');
    expect(overrides).toBe(DEFAULT_LINT_RULE_OVERRIDES);
    expect(countCustomLintRules(overrides)).toBe(0);
  });

  it('compares override maps structurally with areLintRuleOverridesEqual', () => {
    expect(areLintRuleOverridesEqual({}, {})).toBe(true);
    expect(
      areLintRuleOverridesEqual(
        {'viewport-coordinate-purity': 'warning'},
        {'viewport-coordinate-purity': 'warning'}
      )
    ).toBe(true);
    expect(
      areLintRuleOverridesEqual(
        {'viewport-coordinate-purity': 'warning'},
        {'viewport-coordinate-purity': 'off'}
      )
    ).toBe(false);
  });
});

