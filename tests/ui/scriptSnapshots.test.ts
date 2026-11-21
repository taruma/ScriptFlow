import {describe, expect, it} from 'vitest';
import {createScriptLibraryStore} from '../../src/ui/scriptLibraryDb.ts';
import {
  buildAiSnapshotLabel,
  computeRestoreDiff,
  formatSnapshotTimestamp,
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

  it('deduplicates consecutive identical auto-snapshots while allowing explicit manual milestones', () => {
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
  });

  it('builds concise AI snapshot labels and computes restore diffs accurately', () => {
    expect(buildAiSnapshotLabel('ai_draft', 'Rainy Alley Confrontation')).toBe(
      'Before AI Draft: Rainy Alley Confrontation'
    );
    expect(buildAiSnapshotLabel('ai_patch', 'Tighten S2 eyeline')).toBe(
      'Before AI Patch: Tighten S2 eyeline'
    );
    expect(buildAiSnapshotLabel('ai_fix', 'Fix prop continuity', {batchCount: 4})).toBe(
      'Before 4 Audit Fixes'
    );
    expect(buildAiSnapshotLabel('ai_fix', 'Fix S3 prop handoff')).toBe(
      'Before Audit Fix: Fix S3 prop handoff'
    );

    const same = computeRestoreDiff('line 1\nline 2', 'line 1\nline 2');
    expect(same.isIdentical).toBe(true);
    expect(same.added).toBe(0);
    expect(same.removed).toBe(0);

    const diff = computeRestoreDiff('line 1\nline 2 NEW', 'line 1\nline 2 OLD');
    expect(diff.isIdentical).toBe(false);
    expect(diff.added).toBe(1);
    expect(diff.removed).toBe(1);
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
});
