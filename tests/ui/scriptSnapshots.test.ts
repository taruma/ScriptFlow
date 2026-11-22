import {describe, expect, it} from 'vitest';
import {UI_LABELS} from '../../src/ui/labels.ts';
import {createScriptLibraryStore} from '../../src/ui/scriptLibraryDb.ts';
import {
  buildAiSnapshotLabel,
  buildCompactDiffRows,
  computeRestoreDiff,
  formatSnapshotTimestamp,
  getSnapshotOrigin,
  isProtectedSnapshot,
  selectSnapshotsToPrune,
  shouldSkipAutoSnapshot,
  sortScriptSnapshots,
  type ScriptSnapshot,
} from '../../src/ui/scriptSnapshots.ts';

describe('scriptSnapshots pure helpers', () => {
  it('sorts newest-first and protects manual & pinned snapshots from FIFO pruning', () => {
    const base: ScriptSnapshot[] = [
      {id: 's1', scriptId: 'doc-1', trigger: 'ai_patch', label: 'A1', rawText: '1', createdAt: 100},
      {id: 's2', scriptId: 'doc-1', trigger: 'manual', label: 'M1', rawText: '2', createdAt: 200},
      {
        id: 's3',
        scriptId: 'doc-1',
        trigger: 'ai_patch',
        label: 'A2 (pinned)',
        rawText: '3',
        createdAt: 300,
        pinned: true,
      },
      {id: 's4', scriptId: 'doc-1', trigger: 'ai_fix', label: 'A3', rawText: '4', createdAt: 400},
      {id: 's5', scriptId: 'doc-1', trigger: 'ai_draft', label: 'A4', rawText: '5', createdAt: 500},
    ];

    expect(sortScriptSnapshots(base).map((s) => s.id)).toEqual(['s5', 's4', 's3', 's2', 's1']);
    expect(isProtectedSnapshot(base[0])).toBe(false);
    expect(isProtectedSnapshot(base[1])).toBe(true);
    expect(isProtectedSnapshot(base[2])).toBe(true);

    // Cap auto-snapshots at 2 -> only oldest unprotected auto-snapshot ('s1') is pruned
    expect(selectSnapshotsToPrune(base, 2)).toEqual(['s1']);
    // Cap at 1 -> 's4' and 's1' pruned, while 's5' (newest auto), 's3' (pinned), 's2' (manual) stay
    expect(selectSnapshotsToPrune(base, 1)).toEqual(['s4', 's1']);
  });

  it('classifies manual vs. automatic snapshot origins accurately', () => {
    expect(getSnapshotOrigin('manual')).toBe('manual');
    expect(getSnapshotOrigin('ai_draft')).toBe('auto');
    expect(getSnapshotOrigin('ai_patch')).toBe('auto');
    expect(getSnapshotOrigin('ai_fix')).toBe('auto');
    expect(getSnapshotOrigin('pre_restore')).toBe('auto');
  });

  it('skips empty/whitespace and consecutive identical auto-snapshots while allowing explicit manual milestones', () => {
    const latest: ScriptSnapshot = {
      id: 's1',
      scriptId: 'doc-1',
      trigger: 'ai_patch',
      label: 'Before AI Patch',
      rawText: '[EXECUTION]\n[CAM 01] MS',
      createdAt: 1000,
    };

    expect(shouldSkipAutoSnapshot(latest, '[EXECUTION]\n[CAM 01] MS', 'ai_patch')).toBe(true);
    expect(shouldSkipAutoSnapshot(latest, '[EXECUTION]\n[CAM 01] CU', 'ai_patch')).toBe(false);
    expect(shouldSkipAutoSnapshot(latest, '[EXECUTION]\n[CAM 01] MS', 'manual')).toBe(false);
    expect(shouldSkipAutoSnapshot(undefined, '[EXECUTION]\n[CAM 01] MS', 'ai_patch')).toBe(false);

    // Blank / whitespace-only scripts are skipped for automatic triggers, but allowed for manual
    expect(shouldSkipAutoSnapshot(undefined, '', 'ai_draft')).toBe(true);
    expect(shouldSkipAutoSnapshot(undefined, '   \n\t  ', 'ai_patch')).toBe(true);
    expect(shouldSkipAutoSnapshot(latest, '', 'ai_fix')).toBe(true);
    expect(shouldSkipAutoSnapshot(latest, '  ', 'pre_restore')).toBe(true);
    expect(shouldSkipAutoSnapshot(undefined, '', 'manual')).toBe(false);
  });

  it('builds concise before & after AI snapshot labels and computes restore diffs accurately', () => {
    // Default / before phase
    expect(buildAiSnapshotLabel('ai_draft', 'Rainy Alley Confrontation')).toBe(
      'Before AI Draft: Rainy Alley Confrontation'
    );
    expect(buildAiSnapshotLabel('ai_draft')).toBe('Before AI Draft');
    expect(buildAiSnapshotLabel('ai_patch', 'Tighten S2 eyeline', {phase: 'before'})).toBe(
      'Before AI Patch: Tighten S2 eyeline'
    );
    expect(buildAiSnapshotLabel('ai_patch', undefined, {phase: 'before'})).toBe('Before AI Patch');
    expect(buildAiSnapshotLabel('ai_fix', 'Fix prop continuity', {batchCount: 4})).toBe(
      'Before 4 Audit Fixes'
    );
    expect(buildAiSnapshotLabel('ai_fix', 'Fix S3 prop handoff')).toBe(
      'Before Audit Fix: Fix S3 prop handoff'
    );

    // After phase
    expect(
      buildAiSnapshotLabel('ai_draft', 'Rainy Alley Confrontation', {phase: 'after'})
    ).toBe('AI Draft: Rainy Alley Confrontation');
    expect(buildAiSnapshotLabel('ai_draft', undefined, {phase: 'after'})).toBe('AI Draft');
    expect(buildAiSnapshotLabel('ai_patch', 'Tighten S2 eyeline', {phase: 'after'})).toBe(
      'AI Patch: Tighten S2 eyeline'
    );
    expect(buildAiSnapshotLabel('ai_patch', undefined, {phase: 'after'})).toBe('AI Patch');
    expect(
      buildAiSnapshotLabel('ai_fix', 'Fix prop continuity', {batchCount: 4, phase: 'after'})
    ).toBe('Applied 4 Audit Fixes');
    expect(buildAiSnapshotLabel('ai_fix', 'Fix S3 prop handoff', {phase: 'after'})).toBe(
      'Audit Fix: Fix S3 prop handoff'
    );
    expect(buildAiSnapshotLabel('ai_fix', undefined, {phase: 'after'})).toBe('Audit Fix');

    const same = computeRestoreDiff('line 1\nline 2', 'line 1\nline 2');
    expect(same.isIdentical).toBe(true);
    expect(same.added).toBe(0);
    expect(same.removed).toBe(0);

    const diff = computeRestoreDiff('line 1\nline 2 NEW', 'line 1\nline 2 OLD');
    expect(diff.isIdentical).toBe(false);
    expect(diff.added).toBe(1);
    expect(diff.removed).toBe(1);
  });

  it('compacts long diffs into hunks with inline word-level diffs and avoids folding 1-line gaps', () => {
    const baseLines = Array.from({length: 20}, (_, idx) => `line ${idx + 1} steady`);
    const currentLines = [...baseLines];
    const snapshotLines = [...baseLines];
    // Edit word on line 6 (index 5) and line 16 (index 15), plus insert a brand new line after 16
    snapshotLines[5] = 'line 6 RESTORED';
    snapshotLines[15] = 'line 16 RESTORED';
    snapshotLines.splice(16, 0, 'brand new inserted line');

    const diff = computeRestoreDiff(currentLines.join('\n'), snapshotLines.join('\n'));
    const rows = buildCompactDiffRows(diff.lines, 2);

    // Leading lines 1..3 (3 unchanged) folded; lines 4..5 context + line 6 changed + lines 7..8 context;
    // middle lines 9..13 (5 unchanged) folded; lines 14..15 context + line 16 changed + inserted + lines 17..18 context;
    // trailing lines 19..20 (2 unchanged) folded.
    const omittedRows = rows.filter((row) => row.kind === 'omitted');
    expect(omittedRows.map((row) => row.count)).toEqual([3, 5, 2]);
    expect(omittedRows[0].lines.map((l) => l.text)).toEqual([
      'line 1 steady',
      'line 2 steady',
      'line 3 steady',
    ]);
    expect(omittedRows[2].lines.map((l) => l.text)).toEqual([
      'line 19 steady',
      'line 20 steady',
    ]);

    const changedRows = rows.filter((row) => row.kind === 'line' && row.entry.kind === 'changed');
    expect(changedRows).toHaveLength(2);
    expect(changedRows[0].kind === 'line' && changedRows[0].entry.tokens).toEqual([
      {type: 'equal', text: 'line 6 '},
      {type: 'removed', text: 'steady'},
      {type: 'added', text: 'RESTORED'},
    ]);

    const pureAddedRows = rows.filter((row) => row.kind === 'line' && row.entry.kind === 'added');
    expect(pureAddedRows).toHaveLength(1);
    expect(pureAddedRows[0].kind === 'line' && pureAddedRows[0].entry.text).toBe(
      'brand new inserted line'
    );

    // Verify 1-line gap is shown directly rather than folded into a divider
    const smallBefore = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8'];
    const smallAfter = ['l1', 'l2 NEW', 'l3', 'l4', 'l5', 'l6', 'l7 NEW', 'l8'];
    const adjacentDiff = computeRestoreDiff(smallBefore.join('\n'), smallAfter.join('\n'));
    expect(buildCompactDiffRows(adjacentDiff.lines, 2).every((r) => r.kind === 'line')).toBe(true);

    // Add one extra line in the middle so exactly 1 line sits outside radius 2 -> still not folded
    const oneGapBefore = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8', 'l9'];
    const oneGapAfter = ['l1', 'l2 NEW', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8 NEW', 'l9'];
    const oneGapDiff = computeRestoreDiff(oneGapBefore.join('\n'), oneGapAfter.join('\n'));
    expect(buildCompactDiffRows(oneGapDiff.lines, 2).every((r) => r.kind === 'line')).toBe(true);
  });

  it('formats relative and calendar timestamps deterministically', () => {
    const now = Date.UTC(2026, 10, 21, 14, 0, 0);
    expect(formatSnapshotTimestamp(now - 20_000, now)).toBe('Just now');
    expect(formatSnapshotTimestamp(now - 5 * 60_000, now)).toBe('5m ago');
    expect(formatSnapshotTimestamp(now - 3 * 3_600_000, now)).toBe('3h ago');
    expect(formatSnapshotTimestamp(Date.UTC(2025, 4, 10, 9, 30, 0), now)).toBe('May 10, 2025');
  });
});

describe('scriptLibraryDb snapshot persistence & cascade lifecycle', () => {
  it('persists snapshots per script, deduplicates consecutive auto-saves, enforces retention, and cascades deletes', async () => {
    const store = createScriptLibraryStore({indexedDB: null, fallbackStorageKey: null});

    await store.put({
      id: 'script-a',
      title: 'Scene A',
      rawText: 'v0',
      createdAt: 100,
      updatedAt: 100,
    });
    await store.put({
      id: 'script-b',
      title: 'Scene B',
      rawText: 'b0',
      createdAt: 100,
      updatedAt: 100,
    });

    // Save initial auto-snapshot
    const snap1 = await store.saveSnapshot({
      scriptId: 'script-a',
      trigger: 'ai_patch',
      label: 'Before AI Patch 1',
      rawText: 'v0',
      createdAt: 1000,
      maxAuto: 2,
    });
    expect(snap1).not.toBeNull();

    // Consecutive identical auto-snapshot is skipped cleanly
    const duplicateAuto = await store.saveSnapshot({
      scriptId: 'script-a',
      trigger: 'ai_fix',
      label: 'Before Audit Fix',
      rawText: 'v0',
      createdAt: 1100,
      maxAuto: 2,
    });
    expect(duplicateAuto).toBeNull();

    // Explicit manual milestone with identical content IS saved
    const milestone = await store.saveSnapshot({
      scriptId: 'script-a',
      trigger: 'manual',
      label: 'Cut 1 Milestone',
      rawText: 'v0',
      createdAt: 1200,
      maxAuto: 2,
    });
    expect(milestone?.trigger).toBe('manual');

    // Pin snap1 so it survives pruning, then add 2 more auto-snapshots (exceeding maxAuto = 2)
    const pinnedSnap1 = await store.updateSnapshot(snap1!.id, {pinned: true});
    expect(pinnedSnap1?.pinned).toBe(true);

    const snap2 = await store.saveSnapshot({
      scriptId: 'script-a',
      trigger: 'ai_patch',
      label: 'Before AI Patch 2',
      rawText: 'v1',
      createdAt: 2000,
      maxAuto: 2,
    });
    const snap3 = await store.saveSnapshot({
      scriptId: 'script-a',
      trigger: 'ai_draft',
      label: 'Before AI Draft 3',
      rawText: 'v2',
      createdAt: 3000,
      maxAuto: 2,
    });
    const snap4 = await store.saveSnapshot({
      scriptId: 'script-a',
      trigger: 'pre_restore',
      label: 'Before restore',
      rawText: 'v3',
      createdAt: 4000,
      maxAuto: 2,
    });
    expect(snap2 && snap3 && snap4).toBeTruthy();

    // snap2 (oldest unpinned auto) pruned; snap4 + snap3 (2 newest auto), milestone (manual), and snap1 (pinned) remain
    const listA = await store.listSnapshots('script-a');
    expect(listA.map((s) => s.id)).toEqual([snap4!.id, snap3!.id, milestone!.id, snap1!.id]);

    // Script B snapshot remains isolated
    await store.saveSnapshot({
      scriptId: 'script-b',
      trigger: 'ai_patch',
      label: 'Scene B patch',
      rawText: 'b0',
      createdAt: 5000,
    });
    expect((await store.listSnapshots('script-b')).length).toBe(1);

    // Deleting script-a cascades to its snapshots without touching script-b
    await store.delete('script-a');
    expect(await store.listSnapshots('script-a')).toEqual([]);
    expect((await store.listSnapshots('script-b')).length).toBe(1);

    // Clearing the entire library clears all remaining snapshots too
    await store.clearAll();
    expect(await store.listSnapshots('script-b')).toEqual([]);
  });

  it('records before/after AI checkpoints cleanly across blank drafts, consecutive patches, and manual edits with monotonic ordering', async () => {
    const store = createScriptLibraryStore({indexedDB: null, fallbackStorageKey: null});
    const scriptId = 'script-flow';

    await store.put({
      id: scriptId,
      title: 'Untitled Scene',
      rawText: '',
      createdAt: 100,
      updatedAt: 100,
    });

    const applyAiStep = async (
      trigger: 'ai_draft' | 'ai_patch' | 'ai_fix',
      detail: string,
      prevRawText: string,
      nextRawText: string
    ) => {
      if (prevRawText !== nextRawText) {
        await store.saveSnapshot({
          scriptId,
          trigger,
          label: buildAiSnapshotLabel(trigger, detail, {phase: 'before'}),
          rawText: prevRawText,
        });
      }
      await store.saveSnapshot({
        scriptId,
        trigger,
        label: buildAiSnapshotLabel(trigger, detail, {phase: 'after'}),
        rawText: nextRawText,
      });
    };

    // 1. Start from blank ("") -> apply AI Draft (A1): empty pre-draft is skipped; only A1 is stored
    const a1 = '[INTENT]\nDraft A1\n\n[EXECUTION]\n[CAM 01] MS';
    await applyAiStep('ai_draft', 'Draft A1', '', a1);
    const afterDraft = await store.listSnapshots(scriptId);
    expect(afterDraft.map((s) => ({label: s.label, rawText: s.rawText}))).toEqual([
      {label: 'AI Draft: Draft A1', rawText: a1},
    ]);

    // 2. Apply 2 consecutive AI Patches (A1 -> A2 -> A3) without manual edits:
    // redundant pre-apply snapshots matching A1 / A2 are skipped automatically
    const a2 = '[INTENT]\nDraft A1\n\n[EXECUTION]\n[CAM 01] CU';
    const a3 = '[INTENT]\nDraft A1\n\n[EXECUTION]\n[CAM 01] ECU';
    await applyAiStep('ai_patch', 'Tighten to CU', a1, a2);
    await applyAiStep('ai_patch', 'Push to ECU', a2, a3);

    const afterConsecutivePatches = await store.listSnapshots(scriptId);
    expect(afterConsecutivePatches.map((s) => ({label: s.label, rawText: s.rawText}))).toEqual([
      {label: 'AI Patch: Push to ECU', rawText: a3},
      {label: 'AI Patch: Tighten to CU', rawText: a2},
      {label: 'AI Draft: Draft A1', rawText: a1},
    ]);
    expect(afterConsecutivePatches[0].createdAt).toBeGreaterThan(
      afterConsecutivePatches[1].createdAt
    );
    expect(afterConsecutivePatches[1].createdAt).toBeGreaterThan(
      afterConsecutivePatches[2].createdAt
    );

    // 3. User edits manually (A3 -> U1) and applies Patch 4 (U1 -> A4):
    // records BOTH Before AI Patch (U1) and AI Patch (A4) with A4 strictly newest
    const u1 = '[INTENT]\nUser manual revision\n\n[EXECUTION]\n[CAM 01] ECU';
    const a4 = '[INTENT]\nUser manual revision\n\n[EXECUTION]\n[CAM 01] ECU -> [ACT] Blinks';
    await applyAiStep('ai_patch', 'Add blink action', u1, a4);

    const finalList = await store.listSnapshots(scriptId);
    expect(finalList.map((s) => ({label: s.label, rawText: s.rawText}))).toEqual([
      {label: 'AI Patch: Add blink action', rawText: a4},
      {label: 'Before AI Patch: Add blink action', rawText: u1},
      {label: 'AI Patch: Push to ECU', rawText: a3},
      {label: 'AI Patch: Tighten to CU', rawText: a2},
      {label: 'AI Draft: Draft A1', rawText: a1},
    ]);
    expect(finalList[0].createdAt).toBeGreaterThan(finalList[1].createdAt);
  });

  it('formats snapshot-fork branchNote labels and persists forked scripts with branchNote metadata', async () => {
    const store = createScriptLibraryStore({indexedDB: null, fallbackStorageKey: null});
    const note = UI_LABELS.versionHistory.branchedFromSnapshotNote('AI Patch: Tighten opening');
    expect(note).toBe('Branched from snapshot: AI Patch: Tighten opening');

    await store.put({
      id: 'forked-from-snap',
      title: 'Interrogation (Branch)',
      rawText: '[INTENT]\nAlternate interrogation.\n\n[EXECUTION]\n[CAM 01] CU',
      createdAt: 1000,
      updatedAt: 1000,
      forkedFromId: 'parent-script',
      branchNote: note,
    });

    const loaded = await store.get('forked-from-snap');
    expect(loaded?.forkedFromId).toBe('parent-script');
    expect(loaded?.branchNote).toBe('Branched from snapshot: AI Patch: Tighten opening');
  });
});

