import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  AuteurEnvelopeSchema,
  computeSnapshotHash,
  exportPlainText,
  exportTagless,
  extractMetadata,
  lintDocument,
  parseAuteurScript,
  toAuteurEnvelope,
  toAuteurIR,
} from '../../src/core/index.ts';
import {
  BUNDLED_EXAMPLES,
  EXAMPLE_CATALOG_MANIFEST,
  getBundledExampleById,
  resolveExampleCatalog,
} from '../../src/data/examples/index.ts';
import {
  BLANK_SCRIPT_TEMPLATE,
  DEFAULT_PRESET,
  SCRIPT_PRESETS,
} from '../../src/data/presets.ts';
import {
  AUTEUR_LIBRARY_BACKUP_FORMAT,
  AUTEUR_LIBRARY_BACKUP_VERSION,
  applySelectedLibraryBackup,
  buildCanonicalTxtExport,
  buildJsonEnvelopeExport,
  buildLibraryBackupExport,
  buildTaglessTxtExport,
  createLibraryBackup,
  deriveTitleFromFilename,
  evaluateScriptFit,
  formatExportTimestamp,
  inspectImportedFile,
  mergeLibraryBackup,
  parseImportedFile,
  parseLibraryBackup,
  resolveSourceDroppedFileContent,
  slugifyFilename,
} from '../../src/ui/scriptFileIO.ts';
import {
  createScriptLibraryStore,
  SCRIPT_LIBRARY_STORE_NAME,
  SCRIPT_SNAPSHOTS_STORE_NAME,
  type LegacyLocalStorageAdapter,
  type ScriptRecord,
} from '../../src/ui/scriptLibraryDb.ts';
import {
  mirrorActiveScriptToLocalStorage,
  readActiveScriptId,
  readMirrorUpdatedAt,
  readSavedScriptRaw,
  readSavedTitle,
  writeMirrorUpdatedAt,
} from '../../src/ui/scriptStorage.ts';
import {reconcileHydratedScript} from '../../src/ui/useScriptLibrary.ts';
import {
  buildDuplicatedScriptRecord,
  buildFolderPickerOptions,
  buildLibraryRows,
  collectLibraryFacets,
  countExecutionBeatsFast,
  createCopyTitle,
  extractLibraryScriptPreview,
  filterAndSortLibraryFacets,
  formatRelativeUpdatedTime,
  getScriptFamilyTree,
  LIBRARY_PAGE_SIZE,
  paginateLibraryRows,
  repairLineageOnDelete,
  resolveExampleLineage,
  resolveScriptLineage,
  stepLibrarySelectionIndex,
} from '../../src/ui/scriptLibraryView.ts';
import {createMemoryStorage} from './aiTestFixtures.ts';

function createMemoryLegacyStorage(initial?: {
  script?: string | null;
  title?: string | null;
  activeId?: string | null;
  migrated?: boolean;
}) {
  let savedScript = initial?.script ?? null;
  let savedTitle = initial?.title ?? null;
  let activeScriptId = initial?.activeId ?? null;
  let migrated = initial?.migrated ?? false;

  const adapter: LegacyLocalStorageAdapter = {
    readSavedScript: () => savedScript,
    writeSavedScript: (rawText) => {
      savedScript = rawText;
    },
    readSavedTitle: () => savedTitle,
    writeSavedTitle: (title) => {
      savedTitle = title;
    },
    readActiveScriptId: () => activeScriptId,
    writeActiveScriptId: (id) => {
      activeScriptId = id;
    },
    readMigratedFlag: () => migrated,
    writeMigratedFlag: (flag) => {
      migrated = flag;
    },
  };

  return {
    adapter,
    snapshot: () => ({savedScript, savedTitle, activeScriptId, migrated}),
  };
}

describe('File-Based Bundled Example Catalog (src/data/examples/)', () => {
  it('loads all 6 JSON example families (10 scripts) with metadata overlays and backwards-compatible presets exports', () => {
    expect(EXAMPLE_CATALOG_MANIFEST).toHaveLength(6);
    expect(BUNDLED_EXAMPLES).toHaveLength(10);
    expect(SCRIPT_PRESETS).toHaveLength(10);
    expect(DEFAULT_PRESET).toEqual(SCRIPT_PRESETS[0]);
    expect(DEFAULT_PRESET.title).toBe('The Grand Continental');
    expect(BLANK_SCRIPT_TEMPLATE).toBe('');
    const blankDoc = parseAuteurScript(BLANK_SCRIPT_TEMPLATE);
    expect(blankDoc.stagingBlocks).toHaveLength(0);
    expect(blankDoc.execution).toBeNull();
    expect(lintDocument(blankDoc, extractMetadata(blankDoc))).toEqual([]);

    for (const example of BUNDLED_EXAMPLES) {
      expect(example.file.endsWith('.json')).toBe(true);
      expect(example.content.length).toBeGreaterThan(100);
      expect(example.content.endsWith('\n')).toBe(false);
      expect(getBundledExampleById(example.id)).toEqual(example);
      expect(example.branchNote?.length).toBeGreaterThan(0);
      expect(example.tags?.length).toBeGreaterThan(0);
    }

    // Standalone 4 remain unfoldered; the 2 branched continuation series share "Video Continuation"
    expect(DEFAULT_PRESET.folder).toBeUndefined();
    const threeYearsLate = BUNDLED_EXAMPLES.filter((e) => e.file === 'scriptflow_three-years-late.json');
    expect(threeYearsLate.map((e) => e.title)).toEqual([
      'Three Years Late - Part 1',
      'Three Years Late - Part 2',
      'Three Years Late - Part 3',
      'Three Years Late - Part 4',
    ]);
    expect(threeYearsLate.every((e) => e.folder === 'Video Continuation')).toBe(true);

    const freq = BUNDLED_EXAMPLES.filter((e) => e.file === 'scriptflow_frequency-over-force.json');
    expect(freq.map((e) => e.title)).toEqual([
      'Frequency Over Force - Part 1',
      'Frequency Over Force - Part 2',
    ]);
    expect(freq.every((e) => e.folder === 'Video Continuation')).toBe(true);

    expect(getBundledExampleById('nonexistent-id')).toBeNull();
  });

  it('normalizes CRLF/BOM/trailing newlines, merges overrides, and rejects missing files or duplicate catalog IDs', () => {
    const resolved = resolveExampleCatalog(
      [
        {
          topology: 'Continuous Moving Oner',
          summary: 'Test summary',
          file: 'custom.json',
          category: 'Test',
          folder: 'Showcase',
          tags: ['Oner', '#hybrid'],
          overridesById: {
            'custom-1': {
              branchNote: '  Custom   branch note  ',
            },
          },
        },
      ],
      {
        './custom.json': JSON.stringify({
          format: 'auteur-script-library-backup',
          backupVersion: 1,
          scripts: [
            {
              id: 'custom-1',
              title: 'Custom Example',
              rawText: '\uFEFF[INTENT]\r\nScene body.\r\n\r\n',
              createdAt: 1000,
              updatedAt: 2000,
            },
          ],
        }),
      }
    );

    expect(resolved).toHaveLength(1);
    expect(resolved[0].content).toBe('[INTENT]\nScene body.');
    expect(resolved[0].category).toBe('Test');
    expect(resolved[0].folder).toBe('Showcase');
    expect(resolved[0].tags).toEqual(['oner', 'hybrid']);
    expect(resolved[0].branchNote).toBe('Custom branch note');

    expect(() =>
      resolveExampleCatalog(
        [
          {
            topology: 'Test',
            summary: 'Missing file entry',
            file: 'does-not-exist.json',
          },
        ],
        {}
      )
    ).toThrow(/Missing bundled example JSON file/);

    expect(() =>
      resolveExampleCatalog(
        [
          {topology: 'T', summary: 'S', file: 'a.json'},
          {topology: 'T', summary: 'S', file: 'b.json'},
        ],
        {
          './a.json': {scripts: [{id: 'dup', title: 'A', rawText: '[INTENT]\nHello'}]},
          './b.json': {scripts: [{id: 'dup', title: 'B', rawText: '[INTENT]\nWorld'}]},
        }
      )
    ).toThrow(/Duplicate bundled example id/);
  });
});

describe('IndexedDB Script Library Store (with graceful fallback & legacy migration)', () => {
  it('supports get, put, bulkPut, list (sorted by updatedAt desc), and delete in fallback mode', async () => {
    const store = createScriptLibraryStore({indexedDB: null, fallbackStorageKey: null});
    expect(store.backend).toBe('fallback');

    const older: ScriptRecord = {
      id: 'script-older',
      title: 'Older Scene',
      rawText: '[INTENT]\nOlder.',
      createdAt: 1000,
      updatedAt: 1500,
    };
    const newer: ScriptRecord = {
      id: 'script-newer',
      title: 'Newer Scene',
      rawText: '[INTENT]\nNewer.',
      createdAt: 1200,
      updatedAt: 2500,
      forkedFromId: 'interrogation-coverage',
    };
    const middle: ScriptRecord = {
      id: 'script-middle',
      title: 'Middle Scene',
      rawText: '[INTENT]\nMiddle.',
      createdAt: 1100,
      updatedAt: 2000,
    };

    await store.put(older);
    await store.bulkPut([middle, newer]);

    expect(await store.get('script-newer')).toEqual(newer);
    expect(await store.get('does-not-exist')).toBeNull();

    const listed = await store.list();
    expect(listed.map((r) => r.id)).toEqual(['script-newer', 'script-middle', 'script-older']);

    await store.delete('script-middle');
    expect(await store.get('script-middle')).toBeNull();
    expect((await store.list()).map((r) => r.id)).toEqual(['script-newer', 'script-older']);
  });

  it('falls back gracefully when IndexedDB open throws synchronously', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const brokenFactory = {
      open: () => {
        throw new Error('SecurityError: IndexedDB disabled in sandbox');
      },
    } as unknown as IDBFactory;

    try {
      const store = createScriptLibraryStore({indexedDB: brokenFactory, fallbackStorageKey: null});
      await store.put({
        id: 'safe-1',
        title: 'Resilient Script',
        rawText: '[INTENT]\nStill saved.',
        createdAt: 100,
        updatedAt: 200,
      });

      expect(store.backend).toBe('fallback');
      expect((await store.get('safe-1'))?.title).toBe('Resilient Script');
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('migrates custom legacy localStorage script once and preserves mirrored rawText for ErrorBoundary recovery', async () => {
    const store = createScriptLibraryStore({indexedDB: null, fallbackStorageKey: null});
    const customRaw = `[INTENT]\nMy custom noir draft.\n\n[EXECUTION]\n[CAM 01] MS -> [ACT] Ada closes the latch`;
    const legacy = createMemoryLegacyStorage({
      script: customRaw,
      title: 'Night Archive Draft',
    });

    const first = await store.migrateFromLegacyLocalStorage({
      legacyStorage: legacy.adapter,
      now: () => 5000,
      generateId: () => 'migrated-001',
    });

    expect(first.status).toBe('migrated');
    expect(first.activeScriptId).toBe('migrated-001');
    expect(first.migratedRecord).toEqual({
      id: 'migrated-001',
      title: 'Night Archive Draft',
      rawText: customRaw,
      createdAt: 5000,
      updatedAt: 5000,
    });

    // Legacy mirror stays populated for ErrorBoundary crash recovery
    expect(legacy.snapshot()).toEqual({
      savedScript: customRaw,
      savedTitle: 'Night Archive Draft',
      activeScriptId: 'migrated-001',
      migrated: true,
    });

    // Stored in library DB
    expect(await store.get('migrated-001')).toEqual(first.migratedRecord);

    // Running migration a second time is strictly a no-op
    const second = await store.migrateFromLegacyLocalStorage({
      legacyStorage: legacy.adapter,
      now: () => 9000,
      generateId: () => 'migrated-002',
    });
    expect(second.status).toBe('already-migrated');
    expect(second.migratedRecord).toBeNull();
    expect(await store.list()).toHaveLength(1);
  });

  it('points activeScriptId to bundled example without duplicating when legacy localStorage holds an unmodified starter', async () => {
    const store = createScriptLibraryStore({indexedDB: null, fallbackStorageKey: null});
    const legacy = createMemoryLegacyStorage({
      script: DEFAULT_PRESET.content,
      title: DEFAULT_PRESET.title,
    });

    const result = await store.migrateFromLegacyLocalStorage({
      legacyStorage: legacy.adapter,
    });

    expect(result.status).toBe('matched-bundled');
    expect(result.migratedRecord).toBeNull();
    expect(result.activeScriptId).toBe(DEFAULT_PRESET.id);
    expect(await store.list()).toHaveLength(0);
    expect(legacy.snapshot().activeScriptId).toBe(DEFAULT_PRESET.id);
    expect(legacy.snapshot().savedScript).toBe(DEFAULT_PRESET.content);
  });
});

describe('Single-Script Export Builders & Filename Helpers', () => {
  const sampleRaw = SCRIPT_PRESETS[0].content;

  it('slugifies titles, formats export timestamps, and derives clean titles from filenames', () => {
    expect(slugifyFilename('Interrogation Room Coverage')).toBe('interrogation-room-coverage');
    expect(slugifyFilename('Café Noir: Act #2 — Rain!')).toBe('cafe-noir-act-2-rain');
    expect(slugifyFilename('   !!!   ')).toBe('untitled-scene');

    expect(formatExportTimestamp('2026-11-23T08:36:40.000Z')).toBe('20261123-083640');
    expect(formatExportTimestamp(new Date(2026, 10, 23, 8, 5, 9))).toBe('20261123-080509');

    expect(deriveTitleFromFilename('interrogation-room-coverage.txt')).toBe(
      'Interrogation Room Coverage'
    );
    expect(deriveTitleFromFilename('interrogation-room-coverage-tagless.txt')).toBe(
      'Interrogation Room Coverage'
    );
    expect(
      deriveTitleFromFilename('interrogation-room-coverage-20261123-083640-8f4a2c10.txt')
    ).toBe('Interrogation Room Coverage');
    expect(
      deriveTitleFromFilename('interrogation-room-coverage-20261123-083640-8f4a2c10-tagless.txt')
    ).toBe('Interrogation Room Coverage');
    expect(
      deriveTitleFromFilename('interrogation-room-coverage-20261123-083640-8f4a2c10.json')
    ).toBe('Interrogation Room Coverage');
    expect(deriveTitleFromFilename('POV Forest Horror.md')).toBe('POV Forest Horror');
    expect(deriveTitleFromFilename('folder/sub/night_vault.auteur.json')).toBe('Night Vault');
    expect(deriveTitleFromFilename('.json')).toBe('Untitled Scene');
  });

  it('builds Canonical .txt, Tagless .txt, and schema-valid JSON Envelope exports with timestamp and shared hash', () => {
    const fixedTime = '2026-11-23T08:36:40.000Z';
    const expectedHash = computeSnapshotHash(exportPlainText(sampleRaw));
    expect(expectedHash).toMatch(/^[0-9a-f]{8}$/);

    const canonical = buildCanonicalTxtExport('Interrogation Room Coverage', sampleRaw, {
      exportedAt: fixedTime,
    });
    expect(canonical.filename).toBe(
      `interrogation-room-coverage-20261123-083640-${expectedHash}.txt`
    );
    expect(canonical.content).toBe(exportPlainText(sampleRaw));

    const tagless = buildTaglessTxtExport('Interrogation Room Coverage', sampleRaw, {
      exportedAt: fixedTime,
    });
    expect(tagless.filename).toBe(
      `interrogation-room-coverage-20261123-083640-${expectedHash}-tagless.txt`
    );
    expect(tagless.content).toBe(exportTagless(sampleRaw));
    expect(tagless.content).not.toContain('[CAM 01]');

    const jsonExport = buildJsonEnvelopeExport('Interrogation Room Coverage', sampleRaw, undefined, {
      exportedAt: fixedTime,
    });
    expect(jsonExport.filename).toBe(
      `interrogation-room-coverage-20261123-083640-${expectedHash}.json`
    );
    expect(AuteurEnvelopeSchema.safeParse(JSON.parse(jsonExport.content)).success).toBe(true);
    expect(jsonExport.envelope.snapshotHash).toBe(toAuteurEnvelope(sampleRaw).snapshotHash);
    expect(jsonExport.envelope.snapshotHash).toBe(expectedHash);

    // Default call without explicit exportedAt also follows YYYYMMDD-HHMMSS-<hash8>
    const liveCanonical = buildCanonicalTxtExport('Interrogation Room Coverage', sampleRaw);
    expect(liveCanonical.filename).toMatch(
      new RegExp(`^interrogation-room-coverage-\\d{8}-\\d{6}-${expectedHash}\\.txt$`)
    );
  });
});

describe('Single-File Import Parser (parseImportedFile)', () => {
  const sampleRaw = SCRIPT_PRESETS[0].content;

  it('imports .txt and .md plain-text scripts with title derived from filename', () => {
    const txtRes = parseImportedFile('night-harbor-chase.txt', `\uFEFF${sampleRaw.replace(/\n/g, '\r\n')}\r\n`);
    expect(txtRes.ok).toBe(true);
    if (!txtRes.ok || txtRes.kind !== 'single-script') return;
    expect(txtRes.sourceFormat).toBe('plain-text');
    expect(txtRes.title).toBe('Night Harbor Chase');
    expect(txtRes.rawText).toBe(sampleRaw);

    const mdRes = parseImportedFile('Opening Scene Draft.md', '[INTENT]\nQuiet corridor.\n');
    expect(mdRes.ok).toBe(true);
    if (!mdRes.ok || mdRes.kind !== 'single-script') return;
    expect(mdRes.sourceFormat).toBe('plain-text');
    expect(mdRes.title).toBe('Opening Scene Draft');
    expect(mdRes.rawText).toBe('[INTENT]\nQuiet corridor.');
  });

  it('imports AuteurEnvelope JSON losslessly', () => {
    const envelope = toAuteurEnvelope(sampleRaw);
    const res = parseImportedFile('interrogation-room.json', JSON.stringify(envelope, null, 2));

    expect(res.ok).toBe(true);
    if (!res.ok || res.kind !== 'single-script') return;
    expect(res.sourceFormat).toBe('auteur-envelope');
    expect(res.title).toBe('Interrogation Room');
    expect(res.rawText).toBe(exportPlainText(sampleRaw));
  });

  it('imports addressed AuteurScriptIR JSON losslessly', () => {
    const ir = toAuteurIR(sampleRaw);
    const res = parseImportedFile('scene_ir.json', JSON.stringify(ir, null, 2));

    expect(res.ok).toBe(true);
    if (!res.ok || res.kind !== 'single-script') return;
    expect(res.sourceFormat).toBe('auteur-ir');
    expect(res.title).toBe('Scene Ir');
    expect(res.rawText).toBe(exportPlainText(sampleRaw));
  });

  it('imports ID-less AuteurScriptDraft JSON via compileAuteurDraft', () => {
    const draft = {
      stagingMacroBlocks: [
        {
          header: 'INTENT',
          format: 'prose',
          body: 'A rainy rooftop stakeout.',
        },
        {
          header: 'AESTHETIC',
          format: 'key_value',
          entries: [{key: 'Medium', value: '16mm film, grain'}],
        },
      ],
      executionMacroBlock: {
        header: 'EXECUTION',
        macroStates: [
          {
            subStates: [
              {dimension: 'camera', subStateTag: 'CAM', identifier: '01', content: 'MS on lookout'},
              {dimension: 'action', subStateTag: 'ACT', content: 'Lookout lifts binoculars'},
              {dimension: 'foley', sound: 'rain tapping plastic visor'},
            ],
          },
        ],
      },
    };

    const res = parseImportedFile('rooftop-draft.json', JSON.stringify(draft));
    expect(res.ok).toBe(true);
    if (!res.ok || res.kind !== 'single-script') return;
    expect(res.sourceFormat).toBe('auteur-draft');
    expect(res.title).toBe('Rooftop Draft');
    expect(res.rawText).toContain('[CAM 01] MS on lookout -> [ACT] Lookout lifts binoculars -> <rain tapping plastic visor>');
  });

  it('detects full-library Backup JSON via parseImportedFile', () => {
    const backup = createLibraryBackup(
      [
        {
          id: 'script-a',
          title: 'Scene A',
          rawText: '[INTENT]\nScene A body.',
          createdAt: 1000,
          updatedAt: 2000,
        },
      ],
      {activeScriptId: 'script-a', exportedAt: '2026-11-19T12:00:00.000Z'}
    );

    const res = parseImportedFile('auteur-library-backup-2026-11-19.json', JSON.stringify(backup));
    expect(res.ok).toBe(true);
    if (!res.ok || res.kind !== 'library-backup') return;
    expect(res.sourceFormat).toBe('library-backup');
    expect(res.backup.format).toBe(AUTEUR_LIBRARY_BACKUP_FORMAT);
    expect(res.backup.backupVersion).toBe(AUTEUR_LIBRARY_BACKUP_VERSION);
    expect(res.backup.scripts).toHaveLength(1);
    expect(res.backup.scripts[0].id).toBe('script-a');
  });

  it('rejects empty files, malformed JSON, invalid drafts, and unknown JSON schemas', () => {
    expect(parseImportedFile('empty.txt', '   \n  ').ok).toBe(false);

    const badJson = parseImportedFile('broken.json', '{ "document": [');
    expect(badJson.ok).toBe(false);
    if (!badJson.ok) expect(badJson.error).toMatch(/Malformed JSON/i);

    const badDraft = parseImportedFile(
      'bad-draft.json',
      JSON.stringify({
        stagingMacroBlocks: [{header: 'EXECUTION', format: 'prose', body: 'Illegal reserved header'}],
        executionMacroBlock: null,
      })
    );
    expect(badDraft.ok).toBe(false);

    const unknownJson = parseImportedFile('random.json', JSON.stringify({hello: 'world'}));
    expect(unknownJson.ok).toBe(false);
    if (!unknownJson.ok) expect(unknownJson.error).toMatch(/Unsupported JSON/i);
  });
});

describe('Full-Library Backup Codec & Smart Non-Destructive Merge', () => {
  const existingScripts: ScriptRecord[] = [
    {
      id: 's-keep-local-only',
      title: 'Local Exclusive Scene',
      rawText: '[INTENT]\nOnly exists locally.',
      createdAt: 1000,
      updatedAt: 5000,
    },
    {
      id: 's-unchanged',
      title: 'Unchanged Scene',
      rawText: '[INTENT]\nExact same content.',
      createdAt: 1000,
      updatedAt: 4000,
    },
    {
      id: 's-conflict-same-title',
      title: 'Warehouse Ambush',
      rawText: '[INTENT]\nLocal revision with rain.',
      createdAt: 1000,
      updatedAt: 3000,
    },
    {
      id: 's-conflict-renamed',
      title: 'Harbor Cut A',
      rawText: '[INTENT]\nLocal harbor draft.',
      createdAt: 1000,
      updatedAt: 2000,
    },
  ];

  it('serializes and parses a versioned library backup envelope and rejects malformed payloads', () => {
    const exported = buildLibraryBackupExport(existingScripts, {
      activeScriptId: 's-keep-local-only',
      exportedAt: '2026-11-19T15:30:00.000Z',
    });

    const expectedHash = computeSnapshotHash(JSON.stringify(exported.backup.scripts));
    expect(expectedHash).toMatch(/^[0-9a-f]{8}$/);
    expect(exported.filename).toBe(`auteur-library-backup-20261119-153000-${expectedHash}.json`);

    // Hash remains identical across timestamps when script contents are unchanged
    const exportedLater = buildLibraryBackupExport(existingScripts, {
      activeScriptId: 's-keep-local-only',
      exportedAt: '2026-11-20T09:15:45.000Z',
    });
    expect(exportedLater.filename).toBe(
      `auteur-library-backup-20261120-091545-${expectedHash}.json`
    );
    const parsed = parseLibraryBackup(exported.content);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.format).toBe(AUTEUR_LIBRARY_BACKUP_FORMAT);
    expect(parsed.backup.backupVersion).toBe(AUTEUR_LIBRARY_BACKUP_VERSION);
    expect(parsed.backup.activeScriptId).toBe('s-keep-local-only');
    expect(parsed.backup.scripts).toHaveLength(existingScripts.length);

    expect(parseLibraryBackup('{not valid json').ok).toBe(false);
    expect(parseLibraryBackup('').ok).toBe(false);
    expect(
      parseLibraryBackup(
        JSON.stringify({
          format: 'wrong-format',
          backupVersion: 1,
          exportedAt: '2026-11-19T00:00:00.000Z',
          scripts: [],
        })
      ).ok
    ).toBe(false);
    expect(
      parseLibraryBackup(
        JSON.stringify({
          format: AUTEUR_LIBRARY_BACKUP_FORMAT,
          backupVersion: 99,
          exportedAt: '2026-11-19T00:00:00.000Z',
          scripts: [],
        })
      ).ok
    ).toBe(false);
  });

  it('adds missing scripts, skips unchanged duplicates, forks differing ID conflicts, and never deletes existing scripts', () => {
    const incomingScripts: ScriptRecord[] = [
      // 1. Missing locally -> added verbatim
      {
        id: 's-missing',
        title: 'Freshly Restored Scene',
        rawText: '[INTENT]\nFrom another workstation.',
        createdAt: 1500,
        updatedAt: 6000,
      },
      // 2. Same ID, same title, same canonical text (even with CRLF + trailing space) -> skipped
      {
        id: 's-unchanged',
        title: 'Unchanged Scene',
        rawText: '[INTENT]\r\nExact same content.  \r\n',
        createdAt: 1000,
        updatedAt: 4500,
      },
      // 3. Same ID, same title, differing content -> forked with fresh ID & disambiguated title
      {
        id: 's-conflict-same-title',
        title: 'Warehouse Ambush',
        rawText: '[INTENT]\nBackup revision with fog.',
        createdAt: 1000,
        updatedAt: 3500,
      },
      // 4. Same ID, different title & differing content -> forked with fresh ID, preserving backup title
      {
        id: 's-conflict-renamed',
        title: 'Harbor Cut B',
        rawText: '[INTENT]\nBackup harbor draft.',
        createdAt: 1000,
        updatedAt: 2500,
      },
    ];

    let forkSeq = 1;
    const result = mergeLibraryBackup(existingScripts, incomingScripts, {
      generateId: () => `fork-${forkSeq++}`,
    });

    // Added missing script verbatim
    expect(result.added).toHaveLength(1);
    expect(result.added[0].id).toBe('s-missing');

    // Skipped exact unchanged duplicate
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].id).toBe('s-unchanged');

    // Forked both differing ID conflicts without mutating originals
    expect(result.forked).toHaveLength(2);
    expect(result.forked[0]).toEqual({
      originalId: 's-conflict-same-title',
      forkedRecord: {
        id: 'fork-1',
        title: 'Warehouse Ambush (Imported)',
        rawText: '[INTENT]\nBackup revision with fog.',
        createdAt: 1000,
        updatedAt: 3500,
        forkedFromId: 's-conflict-same-title',
      },
    });
    expect(result.forked[1]).toEqual({
      originalId: 's-conflict-renamed',
      forkedRecord: {
        id: 'fork-2',
        title: 'Harbor Cut B',
        rawText: '[INTENT]\nBackup harbor draft.',
        createdAt: 1000,
        updatedAt: 2500,
        forkedFromId: 's-conflict-renamed',
      },
    });

    // recordsToWrite only includes newly added + forked records (never overwrites existing)
    expect(result.recordsToWrite.map((r) => r.id)).toEqual(['s-missing', 'fork-1', 'fork-2']);

    // Merged contains all 4 existing scripts intact + 1 added + 2 forked = 7 total, sorted by updatedAt desc
    expect(result.merged).toHaveLength(7);
    expect(result.merged.find((r) => r.id === 's-keep-local-only')).toEqual(existingScripts[0]);
    expect(result.merged.find((r) => r.id === 's-conflict-same-title')).toEqual(existingScripts[2]);
    expect(result.merged.map((r) => r.id)).toEqual([
      's-missing',
      's-keep-local-only',
      's-unchanged',
      'fork-1',
      's-conflict-same-title',
      'fork-2',
      's-conflict-renamed',
    ]);
  });
});

describe('Script Library View Helpers (src/ui/scriptLibraryView.ts)', () => {
  it('counts execution beats accurately without full AST parsing across canonical and alias headers', () => {
    for (const example of BUNDLED_EXAMPLES) {
      const parsedCount = parseAuteurScript(example.content).execution?.beats.length ?? 0;
      expect(countExecutionBeatsFast(example.content)).toBe(parsedCount);
    }

    expect(
      countExecutionBeatsFast('[INTENT]\nNo execution yet.\n\n[TIMELINE]\n\n[CAM 01] MS\n   \n[CAM 02] CU\n')
    ).toBe(2);
    expect(countExecutionBeatsFast('[INTENT]\nStaging only.')).toBe(0);
    expect(countExecutionBeatsFast('')).toBe(0);
  });

  it('formats compact relative updated timestamps deterministically with injected clock', () => {
    const now = Date.UTC(2026, 10, 19, 15, 0, 0); // Nov 19, 2026 15:00 UTC
    expect(formatRelativeUpdatedTime(now - 10_000, now)).toBe('just now');
    expect(formatRelativeUpdatedTime(now - 5 * 60_000, now)).toBe('5m ago');
    expect(formatRelativeUpdatedTime(now - 3 * 3600_000, now)).toBe('3h ago');
    expect(formatRelativeUpdatedTime(now - 2 * 86400_000, now)).toBe('2d ago');

    const sameYearDate = Date.UTC(2026, 2, 14, 12, 0, 0);
    expect(formatRelativeUpdatedTime(sameYearDate, now)).toMatch(/^Mar 1[34]$/);

    const priorYearDate = Date.UTC(2024, 5, 10, 12, 0, 0);
    expect(formatRelativeUpdatedTime(priorYearDate, now)).toMatch(/^Jun (9|10), 2024$/);

    expect(formatRelativeUpdatedTime(0, now)).toBe('');
  });

  it('filters tabs and search queries cleanly and paginates 1,200+ scripts smoothly', () => {
    const customScripts: ScriptRecord[] = Array.from({length: 1205}, (_, idx) => ({
      id: `script-${idx}`,
      title: idx === 777 ? 'Midnight Harbor Oner' : `Scene Draft #${idx + 1}`,
      rawText: '[INTENT]\nDraft.\n\n[EXECUTION]\n[CAM 01] MS',
      createdAt: 1000 + idx,
      updatedAt: 10000 - idx,
    }));

    const exampleRootsCount = resolveExampleLineage(BUNDLED_EXAMPLES).families.length;
    expect(exampleRootsCount).toBe(6);

    const allRows = buildLibraryRows(customScripts, BUNDLED_EXAMPLES, 'all', '');
    expect(allRows).toHaveLength(1205 + exampleRootsCount);
    expect(allRows[0].kind).toBe('custom');
    expect(allRows[allRows.length - 1].kind).toBe('example');

    const firstPage = paginateLibraryRows(allRows, LIBRARY_PAGE_SIZE);
    expect(firstPage.visible).toHaveLength(LIBRARY_PAGE_SIZE);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.remainingCount).toBe(allRows.length - LIBRARY_PAGE_SIZE);

    const customOnly = buildLibraryRows(customScripts, BUNDLED_EXAMPLES, 'custom', 'midnight harbor');
    expect(customOnly).toHaveLength(1);
    expect(customOnly[0].id).toBe('script-777');

    const examplesByTopology = buildLibraryRows(customScripts, BUNDLED_EXAMPLES, 'examples', 'montage');
    expect(examplesByTopology.map((r) => r.id)).toEqual([DEFAULT_PRESET.id]);

    // Branched example families expand cleanly and filter by folder/tags consistently with custom scripts
    const threeYearsRoot = BUNDLED_EXAMPLES.find((e) => e.title === 'Three Years Late - Part 1')!;
    const expandedExampleRows = buildLibraryRows([], BUNDLED_EXAMPLES, 'examples', '', {
      expandedRootIds: new Set([threeYearsRoot.id]),
    });
    expect(expandedExampleRows).toHaveLength(9); // 6 roots + 3 expanded children (Parts 2..4)
    expect(expandedExampleRows.some((r) => r.title === 'Three Years Late - Part 3' && r.depth === 2)).toBe(
      true
    );

    const videoContFolder = buildLibraryRows([], BUNDLED_EXAMPLES, 'examples', '', {
      folder: 'Video Continuation',
    });
    expect(videoContFolder).toHaveLength(6); // 4 parts of Three Years Late + 2 parts of Frequency Over Force
    const facets = collectLibraryFacets([], BUNDLED_EXAMPLES);
    expect(facets.folders).toContain('Video Continuation');
    expect(facets.tags).toContain('video-continuation');
  });

  it('generates clean non-colliding copy/fork titles and steps keyboard selection with wrap-around', () => {
    const existing = new Set(['Harbor Scene', 'Harbor Scene (Copy)', 'harbor scene (copy 2)']);
    expect(createCopyTitle('Fresh Scene', existing, 'Copy')).toBe('Fresh Scene');
    expect(createCopyTitle('Harbor Scene', existing, 'Copy')).toBe('Harbor Scene (Copy 3)');
    expect(createCopyTitle('Harbor Scene', existing, 'Fork')).toBe('Harbor Scene (Fork)');

    expect(stepLibrarySelectionIndex(0, 1, 3)).toBe(1);
    expect(stepLibrarySelectionIndex(2, 1, 3)).toBe(0);
    expect(stepLibrarySelectionIndex(0, -1, 3)).toBe(2);
    expect(stepLibrarySelectionIndex(-1, 1, 3)).toBe(0);
    expect(stepLibrarySelectionIndex(-1, -1, 3)).toBe(2);
    expect(stepLibrarySelectionIndex(0, 1, 0)).toBe(-1);
  });

  it('supports full-text body search with excerpts, folder/tag facets, pinned-first sorting, and editorial preview extraction', async () => {
    const store = createScriptLibraryStore({
      indexedDB: null,
      fallbackStorageKey: null,
    });

    await store.bulkPut([
      {
        id: 'alpha',
        title: 'Zeta Rooftop',
        rawText: '[INTENT]\nTense standoff in rain.\n\n[EXECUTION]\n[CAM 01] MS\n[CAM 02] CU -> Detective whispers {drop the briefcase}',
        createdAt: 1000,
        updatedAt: 2000,
        pinned: true,
        folder: 'Pilot Episode',
        tags: ['Noir', 'Action', 'noir'],
      },
      {
        id: 'beta',
        title: 'Alpha Diner',
        rawText: '[INTENT]\nQuiet morning coffee.\n\n[EXECUTION]\n[CAM 01] WS\n[CAM 02] MS\n[CAM 03] CU',
        createdAt: 1000,
        updatedAt: 5000,
        folder: 'Pilot Episode',
        tags: ['dialogue'],
      },
      {
        id: 'gamma',
        title: 'Harbor Chase',
        rawText: '[INTENT]\nBoat escape.\n\n[EXECUTION]\n[CAM 01] WS',
        createdAt: 1000,
        updatedAt: 4000,
        folder: 'Episode 2',
        tags: ['action'],
      },
    ]);

    const loaded = await store.list();
    // Tags are normalized & deduplicated, and backup preserves pinned/folder/tags
    const alpha = loaded.find((r) => r.id === 'alpha')!;
    expect(alpha.pinned).toBe(true);
    expect(alpha.folder).toBe('Pilot Episode');
    expect(alpha.tags).toEqual(['noir', 'action']);

    const backup = createLibraryBackup(loaded, {exportedAt: '2026-11-21T00:00:00.000Z'});
    const parsedBackup = parseLibraryBackup(JSON.stringify(backup));
    expect(parsedBackup.ok).toBe(true);
    if (parsedBackup.ok) {
      const restoredAlpha = parsedBackup.backup.scripts.find((r) => r.id === 'alpha');
      expect(restoredAlpha?.pinned).toBe(true);
      expect(restoredAlpha?.folder).toBe('Pilot Episode');
      expect(restoredAlpha?.tags).toEqual(['noir', 'action']);
    }

    // Facet collection, counts, tab scoping, and popover facet filtering/sorting
    const facets = collectLibraryFacets(loaded);
    expect(facets.folders).toEqual(['Episode 2', 'Pilot Episode']);
    expect(facets.tags).toEqual(['action', 'dialogue', 'noir']);
    expect(facets.folderCounts).toEqual({'Pilot Episode': 2, 'Episode 2': 1});
    expect(facets.tagCounts).toEqual({action: 2, dialogue: 1, noir: 1});
    expect(facets.pinnedCount).toBe(1);

    const customOnlyFacets = collectLibraryFacets(loaded, BUNDLED_EXAMPLES, 'custom');
    expect(customOnlyFacets.folders).toEqual(['Episode 2', 'Pilot Episode']);
    expect(customOnlyFacets.tags).toEqual(['action', 'dialogue', 'noir']);

    const exampleOnlyFacets = collectLibraryFacets(loaded, BUNDLED_EXAMPLES, 'examples');
    expect(exampleOnlyFacets.folders).not.toContain('Pilot Episode');
    expect(exampleOnlyFacets.tags).toContain('video-continuation');
    expect(exampleOnlyFacets.tags).not.toContain('noir');

    const sortedAllFacets = filterAndSortLibraryFacets(facets, '');
    expect(sortedAllFacets.folders).toEqual(['Episode 2', 'Pilot Episode']);
    expect(sortedAllFacets.tags).toEqual(['action', 'dialogue', 'noir']); // action (2) first, then alphabetical

    const hashFilteredFacets = filterAndSortLibraryFacets(facets, '#noi');
    expect(hashFilteredFacets.folders).toEqual([]);
    expect(hashFilteredFacets.tags).toEqual(['noir']);

    // Pinned floats first across all sort modes
    const byRecent = buildLibraryRows(loaded, [], 'custom', '', {sortBy: 'recent'});
    expect(byRecent.map((r) => r.id)).toEqual(['alpha', 'beta', 'gamma']);

    const byTitle = buildLibraryRows(loaded, [], 'custom', '', {sortBy: 'title'});
    expect(byTitle.map((r) => r.id)).toEqual(['alpha', 'beta', 'gamma']);

    const byBeats = buildLibraryRows(loaded, [], 'custom', '', {sortBy: 'beats'});
    expect(byBeats.map((r) => r.id)).toEqual(['alpha', 'beta', 'gamma']);

    // Folder & tag filtering
    const ep2Only = buildLibraryRows(loaded, BUNDLED_EXAMPLES, 'all', '', {folder: 'Episode 2'});
    expect(ep2Only.map((r) => r.id)).toEqual(['gamma']);

    const actionTagged = buildLibraryRows(loaded, BUNDLED_EXAMPLES, 'all', '', {tag: 'action'});
    expect(actionTagged.map((r) => r.id)).toEqual(['alpha', 'gamma']);

    // Full-text body search returns matchSnippet
    const bodyMatch = buildLibraryRows(loaded, [], 'custom', 'briefcase');
    expect(bodyMatch.map((r) => r.id)).toEqual(['alpha']);
    expect(bodyMatch[0].matchSnippet).toContain('briefcase');

    // Editorial preview extraction
    const preview = extractLibraryScriptPreview(BUNDLED_EXAMPLES[0].content, 2);
    expect(preview.stagingBlocks.length).toBeGreaterThan(0);
    expect(preview.leadSummary.length).toBeGreaterThan(0);
    expect(preview.previewBeats).toHaveLength(2);
    expect(preview.remainingBeatCount).toBe(preview.beatCount - 2);

    // Bulk delete removes multiple records cleanly
    await store.bulkDelete(['alpha', 'gamma']);
    const afterBulkDelete = await store.list();
    expect(afterBulkDelete.map((r) => r.id)).toEqual(['beta']);

    // clearAll empties all remaining saved scripts cleanly
    await store.clearAll();
    expect(await store.list()).toEqual([]);
    expect(await store.get('beta')).toBeNull();
  });

  it('builds duplicated ScriptRecords for active custom scripts and read-only examples with folder/tags and unique titles', () => {
    const existing = new Set(['Heist Teaser', 'Heist Teaser (Copy)']);
    const dupCustom = buildDuplicatedScriptRecord({
      id: 'script-dup-1',
      sourceId: 'script-orig-1',
      sourceTitle: 'Heist Teaser',
      rawText: '[INTENT]\nCopy me.',
      existingTitles: existing,
      now: 123456,
      folder: 'Season 1',
      tags: ['comedy', 'montage'],
    });

    expect(dupCustom).toEqual({
      id: 'script-dup-1',
      title: 'Heist Teaser (Copy 2)',
      rawText: '[INTENT]\nCopy me.',
      createdAt: 123456,
      updatedAt: 123456,
      forkedFromId: 'script-orig-1',
      folder: 'Season 1',
      tags: ['comedy', 'montage'],
    });

    const dupExample = buildDuplicatedScriptRecord({
      id: 'script-dup-2',
      sourceId: BUNDLED_EXAMPLES[0].id,
      sourceTitle: BUNDLED_EXAMPLES[0].title,
      rawText: BUNDLED_EXAMPLES[0].content,
      existingTitles: existing,
      now: 789000,
    });
    expect(dupExample.title).toBe(BUNDLED_EXAMPLES[0].title);
    expect(dupExample.forkedFromId).toBe(BUNDLED_EXAMPLES[0].id);
    expect(dupExample.folder).toBeUndefined();
    expect(dupExample.tags).toBeUndefined();
  });

  it('supports branch suffix, explicit title, and normalized branchNote on buildDuplicatedScriptRecord', () => {
    const existing = new Set(['Warehouse Ambush', 'Warehouse Ambush (Branch)']);
    const branched = buildDuplicatedScriptRecord({
      id: 'script-branch-1',
      sourceId: 'script-root-1',
      sourceTitle: 'Warehouse Ambush',
      rawText: '[INTENT]\nAlternate single-take approach.',
      existingTitles: existing,
      now: 555000,
      suffix: 'Branch',
      branchNote: '  Try single-take   handheld approach  ',
    });

    expect(branched.title).toBe('Warehouse Ambush (Branch 2)');
    expect(branched.forkedFromId).toBe('script-root-1');
    expect(branched.branchNote).toBe('Try single-take handheld approach');

    const namedBranch = buildDuplicatedScriptRecord({
      id: 'script-branch-2',
      sourceId: 'script-root-1',
      sourceTitle: 'Warehouse Ambush',
      rawText: '[INTENT]\nNoir rain cut.',
      existingTitles: existing,
      now: 556000,
      explicitTitle: 'Noir Rain Cut',
      branchNote: '   ',
    });

    expect(namedBranch.title).toBe('Noir Rain Cut');
    expect(namedBranch.branchNote).toBeUndefined();
  });
});

describe('Script lineage, branching, and anti-clutter library grouping', () => {
  const makeScript = (
    id: string,
    title: string,
    createdAt: number,
    updatedAt: number,
    extra: Partial<ScriptRecord> = {}
  ): ScriptRecord => ({
    id,
    title,
    rawText: `[INTENT]\n${title} premise.\n\n[EXECUTION]\n[CAM 01] MS\n`,
    createdAt,
    updatedAt,
    ...extra,
  });

  it('sanitizes and round-trips branchNote and forkedFromId across store persistence and library backup codec', async () => {
    const store = createScriptLibraryStore({indexedDB: null, fallbackStorageKey: null});
    const overlongNote = `  ${'A'.repeat(200)}   extra  `;

    await store.put({
      id: 'root-1',
      title: 'Subway Oner',
      rawText: '[INTENT]\nRoot version.\n\n[EXECUTION]\n[CAM 01] WS',
      createdAt: 1000,
      updatedAt: 1000,
      branchNote: '   ',
    });
    await store.put({
      id: 'branch-1',
      title: 'Subway Oner (Branch)',
      rawText: '[INTENT]\nPOV handheld version.\n\n[EXECUTION]\n[CAM 01] POV',
      createdAt: 2000,
      updatedAt: 2000,
      forkedFromId: 'root-1',
      branchNote: overlongNote,
    });

    const loadedRoot = await store.get('root-1');
    const loadedBranch = await store.get('branch-1');
    expect(loadedRoot?.branchNote).toBeUndefined();
    expect(loadedBranch?.forkedFromId).toBe('root-1');
    expect(loadedBranch?.branchNote).toHaveLength(160);
    expect(loadedBranch?.branchNote).toBe('A'.repeat(160));

    const backup = createLibraryBackup([loadedRoot!, loadedBranch!], {
      exportedAt: '2026-01-01T00:00:00.000Z',
    });
    const parsed = parseLibraryBackup(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const restoredBranch = parsed.backup.scripts.find((s) => s.id === 'branch-1');
    expect(restoredBranch?.forkedFromId).toBe('root-1');
    expect(restoredBranch?.branchNote).toBe('A'.repeat(160));
  });

  it('resolves multi-level custom trees, isolates bundled example forks as separate roots, and breaks cycles deterministically', () => {
    const example = BUNDLED_EXAMPLES[0];
    const scripts: ScriptRecord[] = [
      makeScript('root', 'Interrogation', 100, 100),
      makeScript('branch-a', 'Interrogation — Tight CU', 200, 250, {
        forkedFromId: 'root',
        branchNote: 'Push tighter on detective eyes',
      }),
      makeScript('branch-a1', 'Interrogation — Silent Cut', 300, 400, {
        forkedFromId: 'branch-a',
        branchNote: 'Strip dialogue for pure foley tension',
      }),
      makeScript('branch-b', 'Interrogation — Oner', 250, 350, {
        forkedFromId: 'root',
        branchNote: 'Single continuous orbit around table',
      }),
      makeScript('ex-fork-1', 'My Subway Remix 1', 500, 500, {
        forkedFromId: example.id,
      }),
      makeScript('ex-fork-2', 'My Subway Remix 2', 600, 600, {
        forkedFromId: example.id,
      }),
      // Artificial cycle A <-> B to verify cycle protection
      makeScript('cyc-a', 'Cycle A', 700, 700, {forkedFromId: 'cyc-b'}),
      makeScript('cyc-b', 'Cycle B', 800, 800, {forkedFromId: 'cyc-a'}),
    ];

    const index = resolveScriptLineage(scripts, BUNDLED_EXAMPLES);

    // Custom root family has 4 members in pre-order (root -> branch-a -> branch-a1 -> branch-b)
    const rootFamily = index.familyByRootId.get('root');
    expect(rootFamily).toBeDefined();
    expect(rootFamily?.nodes.map((n) => `${n.id}@${n.depth}`)).toEqual([
      'root@0',
      'branch-a@1',
      'branch-a1@2',
      'branch-b@1',
    ]);
    expect(rootFamily?.branchCount).toBe(3);
    expect(rootFamily?.familyMaxUpdatedAt).toBe(400);
    expect(index.nodeById.get('branch-a1')?.parentTitle).toBe('Interrogation — Tight CU');

    // Bundled example forks are two independent custom roots, each preserving originExample
    expect(index.familyByRootId.has('ex-fork-1')).toBe(true);
    expect(index.familyByRootId.has('ex-fork-2')).toBe(true);
    expect(index.familyByRootId.get('ex-fork-1')?.originExample).toEqual({
      id: example.id,
      title: example.title,
    });
    expect(index.customForksByExampleId.get(example.id)?.map((s) => s.id)).toEqual([
      'ex-fork-1',
      'ex-fork-2',
    ]);

    // Example family tree lookup surfaces direct custom forks and multi-part bundled series
    const exampleTree = getScriptFamilyTree(example.id, scripts, BUNDLED_EXAMPLES);
    expect(exampleTree?.kind).toBe('example');
    expect(exampleTree?.exampleForks.map((s) => s.id)).toEqual(['ex-fork-1', 'ex-fork-2']);

    const threeYearsPart2 = BUNDLED_EXAMPLES.find((e) => e.title === 'Three Years Late - Part 2')!;
    const branchedExampleTree = getScriptFamilyTree(threeYearsPart2.id, [], BUNDLED_EXAMPLES);
    expect(branchedExampleTree?.kind).toBe('example');
    expect(branchedExampleTree?.parentExample?.title).toBe('Three Years Late - Part 1');
    expect(branchedExampleTree?.exampleFamilyNodes.map((n) => `${n.record.title}@${n.depth}`)).toEqual([
      'Three Years Late - Part 1@0',
      'Three Years Late - Part 2@1',
      'Three Years Late - Part 3@2',
      'Three Years Late - Part 4@3',
    ]);

    // Cycle broken cleanly at earliest-created member ('cyc-a' createdAt 700 < 'cyc-b' createdAt 800)
    const cycleFamily = index.familyByRootId.get('cyc-a');
    expect(cycleFamily?.nodes.map((n) => `${n.id}@${n.depth}`)).toEqual(['cyc-a@0', 'cyc-b@1']);
  });

  it('repairs lineage cleanly when deleting an intermediate branch or a family root', () => {
    const exampleId = BUNDLED_EXAMPLES[0].id;
    const before: ScriptRecord[] = [
      makeScript('A', 'Root Scene', 100, 100, {forkedFromId: exampleId}),
      makeScript('B', 'Middle Branch', 200, 200, {forkedFromId: 'A'}),
      makeScript('C', 'Leaf Branch', 300, 300, {forkedFromId: 'B'}),
      makeScript('D', 'Sibling Branch', 250, 250, {forkedFromId: 'A'}),
    ];

    // 1. Delete intermediate branch B -> C re-parents directly to surviving ancestor A
    const afterDeleteB = before.filter((s) => s.id !== 'B');
    const repairedAfterB = repairLineageOnDelete(afterDeleteB, new Set(['B']), before);
    expect(repairedAfterB).toHaveLength(1);
    expect(repairedAfterB[0].id).toBe('C');
    expect(repairedAfterB[0].forkedFromId).toBe('A');

    // 2. Delete root A -> earliest-created child B (createdAt 200 < D 250) becomes new root
    // inheriting bundled example origin, and sibling D re-parents to B (C already points to B)
    const afterDeleteA = before.filter((s) => s.id !== 'A');
    const repairedAfterA = repairLineageOnDelete(afterDeleteA, new Set(['A']), before);
    const byId = new Map(repairedAfterA.map((s) => [s.id, s]));
    expect(repairedAfterA).toHaveLength(2);
    expect(byId.get('B')?.forkedFromId).toBe(exampleId);
    expect(byId.get('D')?.forkedFromId).toBe('B');

    // 3. Delete root without external origin -> promoted child clears forkedFromId to undefined
    const plainBefore: ScriptRecord[] = [
      makeScript('R', 'Plain Root', 100, 100),
      makeScript('C1', 'Child 1', 200, 200, {forkedFromId: 'R'}),
      makeScript('C2', 'Child 2', 300, 300, {forkedFromId: 'R'}),
    ];
    const repairedPlain = repairLineageOnDelete(
      plainBefore.filter((s) => s.id !== 'R'),
      ['R'],
      plainBefore
    );
    const plainById = new Map(repairedPlain.map((s) => [s.id, s]));
    expect(plainById.get('C1')?.forkedFromId).toBeUndefined();
    expect(plainById.get('C2')?.forkedFromId).toBe('C1');
  });

  it('groups child branches under roots, bubbles active families by familyMaxUpdatedAt, and surfaces matches on search', () => {
    const scripts: ScriptRecord[] = [
      makeScript('old-root', 'Alley Chase', 100, 100),
      makeScript('fresh-child', 'Alley Chase (Rain Cut)', 200, 900, {
        forkedFromId: 'old-root',
        branchNote: 'Handheld neon rainstorm chase',
      }),
      makeScript('mid-root', 'Coffee Shop Talk', 300, 500),
    ];

    // Collapsed by default: only roots shown, but 'old-root' bubbles above 'mid-root' because
    // its child 'fresh-child' was updated at 900 > 500
    const collapsed = buildLibraryRows(scripts, [], 'custom', '', {sortBy: 'recent'}).filter(
      (r) => r.kind === 'custom'
    );
    expect(collapsed.map((r) => r.id)).toEqual(['old-root', 'mid-root']);
    expect(collapsed[0].branchCount).toBe(1);
    expect(collapsed[0].isFamilyExpanded).toBe(false);
    expect(collapsed[0].depth).toBe(0);

    // Expanded root inserts child directly beneath root at depth 1
    const expanded = buildLibraryRows(scripts, [], 'custom', '', {
      sortBy: 'recent',
      expandedRootIds: new Set(['old-root']),
    }).filter((r) => r.kind === 'custom');
    expect(expanded.map((r) => `${r.id}@${r.depth}`)).toEqual([
      'old-root@0',
      'fresh-child@1',
      'mid-root@0',
    ]);
    expect(expanded[0].isFamilyExpanded).toBe(true);
    expect(expanded[1].parentTitle).toBe('Alley Chase');
    expect(expanded[1].branchNote).toBe('Handheld neon rainstorm chase');

    // Searching by branchNote auto-surfaces the matching child even when root is collapsed
    const searched = buildLibraryRows(scripts, [], 'custom', 'neon rainstorm', {
      sortBy: 'recent',
    }).filter((r) => r.kind === 'custom');
    expect(searched.map((r) => r.id)).toEqual(['fresh-child']);
    expect(searched[0].parentTitle).toBe('Alley Chase');
    expect(searched[0].branchNote).toBe('Handheld neon rainstorm chase');
  });
});

interface MockIdbControls {
  factory: IDBFactory;
  scriptsTable: Map<string, Record<string, unknown>>;
  snapshotsTable: Map<string, Record<string, unknown>>;
  openCount: () => number;
  failNextTransactions: (count: number) => void;
  setOpenError: (error: Error | null) => void;
}

function createMockIndexedDbFactory(): MockIdbControls {
  const scriptsTable = new Map<string, Record<string, unknown>>();
  const snapshotsTable = new Map<string, Record<string, unknown>>();
  let opens = 0;
  let remainingTxFailures = 0;
  let openError: Error | null = null;

  const getTable = (storeName: string) =>
    storeName === SCRIPT_SNAPSHOTS_STORE_NAME ? snapshotsTable : scriptsTable;

  const createDb = (): IDBDatabase => {
    const objectStoreNames = {
      contains: (name: string) =>
        name === SCRIPT_LIBRARY_STORE_NAME || name === SCRIPT_SNAPSHOTS_STORE_NAME,
    };

    const db = {
      objectStoreNames,
      onversionchange: null as ((event: Event) => void) | null,
      onclose: null as ((event: Event) => void) | null,
      close: () => undefined,
      transaction: (_storeNames: string | string[]) => {
        if (remainingTxFailures > 0) {
          remainingTxFailures -= 1;
          throw new Error('InvalidStateError: The database connection is closing.');
        }

        const tx: {
          oncomplete: (() => void) | null;
          onerror: (() => void) | null;
          onabort: (() => void) | null;
          error: Error | null;
          objectStore: (storeName: string) => unknown;
        } = {
          oncomplete: null,
          onerror: null,
          onabort: null,
          error: null,
          objectStore: (storeName: string) => {
            const table = getTable(storeName);
            const scheduleComplete = () => {
              queueMicrotask(() => {
                tx.oncomplete?.();
              });
            };
            return {
              get: (id: string) => {
                const req: {result?: unknown; onsuccess: (() => void) | null; onerror: (() => void) | null} = {
                  onsuccess: null,
                  onerror: null,
                };
                queueMicrotask(() => {
                  const found = table.get(id);
                  req.result = found ? {...found} : undefined;
                  req.onsuccess?.();
                  tx.oncomplete?.();
                });
                return req;
              },
              put: (value: Record<string, unknown>) => {
                table.set(String(value.id), {...value});
                scheduleComplete();
              },
              delete: (id: string) => {
                table.delete(id);
                scheduleComplete();
              },
              clear: () => {
                table.clear();
                scheduleComplete();
              },
              index: (indexName: string) => ({
                openCursor: (range?: {only?: string} | null) => {
                  const req: {
                    result?: {value: Record<string, unknown>; continue: () => void; delete: () => void} | null;
                    onsuccess: (() => void) | null;
                    onerror: (() => void) | null;
                  } = {onsuccess: null, onerror: null};
                  const rows = Array.from(table.values()).filter((row) =>
                    range && range.only !== undefined ? row[indexName] === range.only : true
                  );
                  let cursorIdx = 0;
                  const emit = () => {
                    queueMicrotask(() => {
                      if (cursorIdx < rows.length) {
                        const row = rows[cursorIdx];
                        cursorIdx += 1;
                        req.result = {
                          value: {...row},
                          continue: emit,
                          delete: () => {
                            table.delete(String(row.id));
                          },
                        };
                        req.onsuccess?.();
                      } else {
                        req.result = null;
                        req.onsuccess?.();
                      }
                    });
                  };
                  emit();
                  return req;
                },
                getAll: (range?: {only?: string}) => {
                  const req: {result?: unknown[]; onsuccess: (() => void) | null; onerror: (() => void) | null} = {
                    onsuccess: null,
                    onerror: null,
                  };
                  queueMicrotask(() => {
                    req.result = Array.from(table.values())
                      .filter((row) =>
                        range && range.only !== undefined ? row[indexName] === range.only : true
                      )
                      .map((row) => ({...row}));
                    req.onsuccess?.();
                  });
                  return req;
                },
              }),
            };
          },
        };
        return tx;
      },
    };
    return db as unknown as IDBDatabase;
  };

  const factory = {
    open: () => {
      opens += 1;
      const req: {
        result?: IDBDatabase;
        error?: Error;
        onupgradeneeded: (() => void) | null;
        onsuccess: (() => void) | null;
        onerror: (() => void) | null;
        onblocked: (() => void) | null;
      } = {
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
      };
      queueMicrotask(() => {
        if (openError) {
          req.error = openError;
          req.onerror?.();
          return;
        }
        req.result = createDb();
        req.onsuccess?.();
      });
      return req;
    },
  } as unknown as IDBFactory;

  return {
    factory,
    scriptsTable,
    snapshotsTable,
    openCount: () => opens,
    failNextTransactions: (count: number) => {
      remainingTxFailures = count;
    },
    setOpenError: (error: Error | null) => {
      openError = error;
    },
  };
}

describe('Persistence hardening: IndexedDB retry, fallback reconciliation & hydration rescue', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('retries once on a stale/closed IndexedDB connection without falling back to localStorage', async () => {
    const mockIdb = createMockIndexedDbFactory();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = createScriptLibraryStore({
      indexedDB: mockIdb.factory,
      fallbackStorageKey: null,
    });

    // Establish initial connection cleanly
    await store.put({
      id: 'script-initial',
      title: 'Existing Scene',
      rawText: '[INTENT]\nInitial.',
      createdAt: 1000,
      updatedAt: 1000,
    });
    expect(mockIdb.openCount()).toBe(1);

    // Inject a single transient closed-connection failure on the next transaction
    mockIdb.failNextTransactions(1);

    await store.put({
      id: 'script-new-blank',
      title: 'Untitled Scene',
      rawText: '[INTENT]\nAI drafted scene.',
      createdAt: 2000,
      updatedAt: 2500,
    });

    // Reopened IndexedDB, retried transparently, stayed on indexeddb, and persisted both scripts
    expect(store.backend).toBe('indexeddb');
    expect(mockIdb.openCount()).toBe(2);
    expect(warnSpy).not.toHaveBeenCalled();
    expect((await store.list()).map((r) => r.id)).toEqual(['script-new-blank', 'script-initial']);
  });

  it('merges stranded fallback scripts & snapshots back into IndexedDB on startup and clears fallback keys', async () => {
    const memoryStorage = createMemoryStorage();
    vi.stubGlobal('window', {localStorage: memoryStorage});
    vi.stubGlobal('IDBKeyRange', {only: (value: string) => ({only: value})});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const fallbackKey = 'test-fallback-library-v1';
    const mockIdb = createMockIndexedDbFactory();

    // Seed IndexedDB with an older script + a newer script that should NOT be overwritten by older fallback data
    const initialStore = createScriptLibraryStore({
      indexedDB: mockIdb.factory,
      fallbackStorageKey: fallbackKey,
    });
    await initialStore.put({
      id: 'script-older-in-idb',
      title: 'Older In IDB',
      rawText: '[INTENT]\nStale IDB version.',
      createdAt: 1000,
      updatedAt: 1000,
    });
    await initialStore.put({
      id: 'script-newer-in-idb',
      title: 'Newer In IDB',
      rawText: '[INTENT]\nAlready fresh in IDB.',
      createdAt: 1000,
      updatedAt: 9000,
    });

    // Simulate a double failure (initial + retry) so a new blank + AI draft + snapshot land in localStorage fallback
    mockIdb.failNextTransactions(4);
    await initialStore.put({
      id: 'script-stranded',
      title: 'AI Drafted Scene',
      rawText: '[INTENT]\nDrafted while IDB hiccuped.',
      createdAt: 3000,
      updatedAt: 3500,
    });
    await initialStore.put({
      id: 'script-older-in-idb',
      title: 'Updated In Fallback',
      rawText: '[INTENT]\nNewer fallback edit.',
      createdAt: 1000,
      updatedAt: 4000,
    });
    // Also inject a stale fallback entry for script-newer-in-idb to verify newer IDB wins
    mockIdb.failNextTransactions(4);
    await initialStore.put({
      id: 'script-newer-in-idb',
      title: 'Stale Fallback Copy',
      rawText: '[INTENT]\nShould not overwrite newer IDB.',
      createdAt: 1000,
      updatedAt: 2000,
    });
    mockIdb.failNextTransactions(4);
    await initialStore.saveSnapshot({
      id: 'snap-stranded-1',
      scriptId: 'script-stranded',
      trigger: 'ai_draft',
      label: 'AI Draft: AI Drafted Scene',
      rawText: '[INTENT]\nDrafted while IDB hiccuped.',
      createdAt: 3501,
    });

    expect(initialStore.backend).toBe('fallback');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(memoryStorage.getItem(fallbackKey)).not.toBeNull();
    expect(memoryStorage.getItem(`${fallbackKey}-snapshots`)).not.toBeNull();

    // Simulate a fresh page reload where IndexedDB is healthy again
    mockIdb.failNextTransactions(0);
    const reloadedStore = createScriptLibraryStore({
      indexedDB: mockIdb.factory,
      fallbackStorageKey: fallbackKey,
    });
    const reconciled = await reloadedStore.reconcileFallbackStorage();

    expect(reconciled).toEqual({mergedScripts: 2, mergedSnapshots: 1});
    expect(reloadedStore.backend).toBe('indexeddb');
    expect(memoryStorage.getItem(fallbackKey)).toBeNull();
    expect(memoryStorage.getItem(`${fallbackKey}-snapshots`)).toBeNull();

    const loaded = await reloadedStore.list();
    expect(loaded.map((r) => r.id)).toEqual([
      'script-newer-in-idb',
      'script-older-in-idb',
      'script-stranded',
    ]);
    expect(loaded.find((r) => r.id === 'script-stranded')?.rawText).toBe(
      '[INTENT]\nDrafted while IDB hiccuped.'
    );
    expect(loaded.find((r) => r.id === 'script-older-in-idb')?.rawText).toBe(
      '[INTENT]\nNewer fallback edit.'
    );
    expect(loaded.find((r) => r.id === 'script-newer-in-idb')?.rawText).toBe(
      '[INTENT]\nAlready fresh in IDB.'
    );

    const snaps = await reloadedStore.listSnapshots('script-stranded');
    expect(snaps.map((s) => s.id)).toEqual(['snap-stranded-1']);
  });

  it('recovers mid-session from transient IndexedDB failure and reconciles pending fallback data automatically', async () => {
    const memoryStorage = createMemoryStorage();
    vi.stubGlobal('window', {localStorage: memoryStorage});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const fallbackKey = 'test-mid-session-fallback-v1';
    const mockIdb = createMockIndexedDbFactory();
    const store = createScriptLibraryStore({
      indexedDB: mockIdb.factory,
      fallbackStorageKey: fallbackKey,
    });

    // Fail both attempts on put() -> falls back to localStorage
    mockIdb.failNextTransactions(2);
    await store.put({
      id: 'script-transient',
      title: 'Transient Draft',
      rawText: '[INTENT]\nSaved during outage.',
      createdAt: 5000,
      updatedAt: 5000,
    });
    expect(store.backend).toBe('fallback');
    expect(mockIdb.scriptsTable.has('script-transient')).toBe(false);

    // Next operation when IndexedDB is healthy again auto-merges pending fallback writes into IndexedDB
    const listed = await store.list();
    expect(store.backend).toBe('indexeddb');
    expect(listed.map((r) => r.id)).toEqual(['script-transient']);
    expect(mockIdb.scriptsTable.has('script-transient')).toBe(true);
    expect(memoryStorage.getItem(fallbackKey)).toBeNull();
  });

  it('reconciles hydrated scripts without clobbering newer mirror edits or dropping missing custom scripts', () => {
    const idbRecord: ScriptRecord = {
      id: 'script-1',
      title: 'Untitled Scene',
      rawText: '',
      createdAt: 1000,
      updatedAt: 1000,
      folder: 'Drafts',
      tags: ['noir'],
    };

    // 1. Mirror is newer than IndexedDB (e.g. tab discarded within 350ms of AI Draft apply) -> keep mirror & persist
    const newerMirror = reconcileHydratedScript({
      loadedRecords: [idbRecord],
      targetId: 'script-1',
      mirror: {
        activeScriptId: 'script-1',
        rawText: '[INTENT]\nFresh AI draft.',
        title: 'Midnight Alley',
        updatedAt: 2500,
      },
      now: 3000,
    });
    expect(newerMirror).toEqual({
      kind: 'custom',
      needsPersist: true,
      record: {
        ...idbRecord,
        title: 'Midnight Alley',
        rawText: '[INTENT]\nFresh AI draft.',
        updatedAt: 2500,
      },
    });

    // 2. IndexedDB is newer than or equal to mirror -> trust IndexedDB (no redundant persist)
    const idbWins = reconcileHydratedScript({
      loadedRecords: [{...idbRecord, rawText: '[INTENT]\nNewer in IDB.', updatedAt: 5000}],
      targetId: 'script-1',
      mirror: {
        activeScriptId: 'script-1',
        rawText: '[INTENT]\nOlder mirror.',
        title: 'Old Title',
        updatedAt: 2000,
      },
      now: 6000,
    });
    expect(idbWins.kind).toBe('custom');
    if (idbWins.kind === 'custom') {
      expect(idbWins.needsPersist).toBe(false);
      expect(idbWins.record.rawText).toBe('[INTENT]\nNewer in IDB.');
    }

    // 3. Custom targetId missing from IndexedDB while mirror still holds its text -> rescue instead of resetting to example
    const rescued = reconcileHydratedScript({
      loadedRecords: [],
      targetId: 'script-missing',
      mirror: {
        activeScriptId: 'script-missing',
        rawText: '[INTENT]\nRescued after reload.',
        title: 'Rescued Scene',
        updatedAt: 4200,
      },
      now: 5000,
    });
    expect(rescued).toEqual({
      kind: 'custom',
      needsPersist: true,
      record: {
        id: 'script-missing',
        title: 'Rescued Scene',
        rawText: '[INTENT]\nRescued after reload.',
        createdAt: 4200,
        updatedAt: 4200,
      },
    });

    // 4. Bundled example targetId always resolves to the bundled example
    const exampleRes = reconcileHydratedScript({
      loadedRecords: [idbRecord],
      targetId: DEFAULT_PRESET.id,
      mirror: {
        activeScriptId: DEFAULT_PRESET.id,
        rawText: DEFAULT_PRESET.content,
        title: DEFAULT_PRESET.title,
        updatedAt: 4200,
      },
    });
    expect(exampleRes).toEqual({kind: 'example', example: DEFAULT_PRESET});

    // 5. Missing targetId without a matching mirror falls back cleanly to DEFAULT_PRESET
    const fallbackExample = reconcileHydratedScript({
      loadedRecords: [idbRecord],
      targetId: 'script-deleted',
      mirror: {
        activeScriptId: 'script-other',
        rawText: '[INTENT]\nDifferent script.',
        title: 'Other',
        updatedAt: 4200,
      },
    });
    expect(fallbackExample).toEqual({kind: 'example', example: DEFAULT_PRESET});

    // 6. Retired bundled example IDs in localStorage never resurrect as custom scripts
    const retiredExampleFallback = reconcileHydratedScript({
      loadedRecords: [idbRecord],
      targetId: 'interrogation-coverage',
      mirror: {
        activeScriptId: 'interrogation-coverage',
        rawText: '[INTENT]\nOld starter example.',
        title: 'Interrogation Room Coverage',
        updatedAt: 4200,
      },
    });
    expect(retiredExampleFallback).toEqual({kind: 'example', example: DEFAULT_PRESET});
  });

  it('persists and clears mirrorActiveScriptToLocalStorage timestamps cleanly', () => {
    const memoryStorage = createMemoryStorage();
    vi.stubGlobal('window', {localStorage: memoryStorage});

    mirrorActiveScriptToLocalStorage('script-42', '[INTENT]\nMirror test.', 'Mirror Scene', 12345.9);
    expect(readActiveScriptId()).toBe('script-42');
    expect(readSavedScriptRaw()).toBe('[INTENT]\nMirror test.');
    expect(readSavedTitle()).toBe('Mirror Scene');
    expect(readMirrorUpdatedAt()).toBe(12345);

    writeMirrorUpdatedAt(null);
    expect(readMirrorUpdatedAt()).toBeNull();
  });

  it('builds folder combobox options across focus, filtering, creation, and clearing', () => {
    const folders = ['Extension', 'Feature Film', 'Short'];

    // 1. On focus/toggle (filterByDraft=false), shows all existing folders with active marker + clear option
    expect(buildFolderPickerOptions(folders, 'Extension', 'Extension', false)).toEqual({
      hasExistingMatches: true,
      items: [
        {kind: 'existing', folder: 'Extension', isCurrent: true},
        {kind: 'existing', folder: 'Feature Film', isCurrent: false},
        {kind: 'existing', folder: 'Short', isCurrent: false},
        {kind: 'clear'},
      ],
    });

    // 2. While typing a partial match (filterByDraft=true), filters existing folders and offers Create option
    expect(buildFolderPickerOptions(folders, '  feat  ', 'Extension', true)).toEqual({
      hasExistingMatches: true,
      items: [
        {kind: 'existing', folder: 'Feature Film', isCurrent: false},
        {kind: 'create', folder: 'feat'},
      ],
    });

    // 3. Exact case-insensitive match suppresses redundant Create option
    expect(buildFolderPickerOptions(folders, 'feature film', 'Extension', true)).toEqual({
      hasExistingMatches: true,
      items: [{kind: 'existing', folder: 'Feature Film', isCurrent: false}],
    });

    // 4. Completely new folder name offers Create option only
    expect(buildFolderPickerOptions(folders, 'Act   Two', '', true)).toEqual({
      hasExistingMatches: false,
      items: [{kind: 'create', folder: 'Act Two'}],
    });

    // 5. Clearing input while assigned shows all folders plus Remove from folder
    expect(buildFolderPickerOptions(folders, '', 'Extension', true)).toEqual({
      hasExistingMatches: true,
      items: [
        {kind: 'existing', folder: 'Extension', isCurrent: true},
        {kind: 'existing', folder: 'Feature Film', isCurrent: false},
        {kind: 'existing', folder: 'Short', isCurrent: false},
        {kind: 'clear'},
      ],
    });
  });
});

describe('Unified Import Pre-Flight & Content Duplicate Detection', () => {
  const sampleRaw = SCRIPT_PRESETS[0].content;

  it('reports v0.4.0 fitStatus=ready for valid canonical scripts and detects tagless, legacy, and unstructured text', () => {
    const clean = evaluateScriptFit(sampleRaw, 'interrogation-room-coverage-20261123-083640-deadbeef.txt');
    expect(clean.fitStatus).toBe('ready');
    expect(clean.errorCount).toBe(0);
    expect(clean.warningCount).toBe(0);
    expect(clean.compatibilityNotes).toEqual([]);
    expect(clean.snapshotHash).toBe(computeSnapshotHash(exportPlainText(sampleRaw)));

    const tagless = evaluateScriptFit(
      exportTagless(sampleRaw),
      'interrogation-room-coverage-20261123-083640-deadbeef-tagless.txt'
    );
    expect(tagless.fitStatus).toBe('warnings');
    expect(tagless.compatibilityNotes.some((n) => n.kind === 'tagless_export')).toBe(true);

    const legacy = evaluateScriptFit(
      '[INTENT]\nLegacy test.\n\n[EXECUTION]\n[CAM 01] MS -> [DIAL] Ada says "Watch out" -> [AUDIO] thunder'
    );
    expect(legacy.fitStatus).toBe('warnings');
    expect(legacy.compatibilityNotes.some((n) => n.kind === 'legacy_syntax')).toBe(true);

    const unstructured = evaluateScriptFit('Just some loose prose notes without any Macro-Blocks.');
    expect(unstructured.fitStatus).toBe('unstructured');
    expect(unstructured.compatibilityNotes.some((n) => n.kind === 'unstructured_text')).toBe(true);
  });

  it('detects single-script content-hash duplicates against custom scripts and bundled examples even when filenames differ', () => {
    const customScripts: ScriptRecord[] = [
      {
        id: 'script-existing',
        title: 'My Saved Interrogation',
        rawText: sampleRaw,
        createdAt: 1000,
        updatedAt: 2000,
      },
    ];

    const inspected = inspectImportedFile('completely-different-name.txt', `${sampleRaw}\r\n`, {
      customScripts,
      examples: BUNDLED_EXAMPLES,
      activeScript: {kind: 'custom', id: 'script-existing'},
    });

    expect(inspected.kind).toBe('single-script');
    if (inspected.kind !== 'single-script') return;
    expect(inspected.suggestedTitle).toBe('Completely Different Name');
    expect(inspected.hasTitleCollision).toBe(false);
    expect(inspected.contentDuplicates).toEqual([
      {kind: 'custom', id: 'script-existing', title: 'My Saved Interrogation', isActive: true},
      {kind: 'example', id: SCRIPT_PRESETS[0].id, title: SCRIPT_PRESETS[0].title, isActive: false},
    ]);
  });

  it('flags library backup scripts with matching content hashes (even with different IDs) as duplicate_content and excludes them by default', () => {
    const existing: ScriptRecord[] = [
      {
        id: 'local-1',
        title: 'Local Harbor Scene',
        rawText: '[INTENT]\nHarbor scene at dawn.',
        createdAt: 1000,
        updatedAt: 2000,
      },
      {
        id: 'local-2',
        title: 'Rooftop Chase',
        rawText: '[INTENT]\nOriginal rooftop draft.',
        createdAt: 1000,
        updatedAt: 2500,
      },
    ];

    const backup = createLibraryBackup(
      [
        // Different ID, different title, IDENTICAL canonical content -> duplicate_content (unchecked by default)
        {
          id: 'remote-copy-of-1',
          title: 'Harbor Copy From Laptop',
          rawText: '[INTENT]\r\nHarbor scene at dawn.   ',
          createdAt: 1000,
          updatedAt: 3000,
        },
        // Same ID as local-2, DIFFERENT content -> modified_conflict (checked by default)
        {
          id: 'local-2',
          title: 'Rooftop Chase',
          rawText: '[INTENT]\nRevised rooftop draft in heavy rain.',
          createdAt: 1000,
          updatedAt: 4000,
        },
        // Brand new ID and unique content -> new (checked by default)
        {
          id: 'remote-new-3',
          title: 'Subway Tunnel',
          rawText: '[INTENT]\nSubway tunnel tension.',
          createdAt: 1500,
          updatedAt: 5000,
        },
      ],
      {exportedAt: '2026-11-23T09:00:00.000Z'}
    );

    const inspected = inspectImportedFile(
      'auteur-library-backup-20261123-090000-abcdef12.json',
      JSON.stringify(backup),
      {customScripts: existing, examples: BUNDLED_EXAMPLES}
    );

    expect(inspected.kind).toBe('library-backup');
    if (inspected.kind !== 'library-backup') return;
    expect(inspected.newCount).toBe(1);
    expect(inspected.modifiedCount).toBe(1);
    expect(inspected.duplicateContentCount).toBe(1);

    const dupItem = inspected.items.find((i) => i.record.id === 'remote-copy-of-1')!;
    expect(dupItem.status).toBe('duplicate_content');
    expect(dupItem.defaultSelected).toBe(false);
    expect(dupItem.matchedExisting).toEqual({
      kind: 'custom',
      id: 'local-1',
      title: 'Local Harbor Scene',
      sameId: false,
    });

    const modItem = inspected.items.find((i) => i.record.id === 'local-2')!;
    expect(modItem.status).toBe('modified_conflict');
    expect(modItem.defaultSelected).toBe(true);
    expect(modItem.disambiguatedTitle).toBe('Rooftop Chase (Imported)');

    const newItem = inspected.items.find((i) => i.record.id === 'remote-new-3')!;
    expect(newItem.status).toBe('new');
    expect(newItem.defaultSelected).toBe(true);

    // Default selection applies only new + modified_conflict, skipping duplicate_content
    const defaultSelectedIds = new Set(
      inspected.items.filter((i) => i.defaultSelected).map((i) => i.record.id)
    );
    const defaultResult = applySelectedLibraryBackup(existing, inspected.items, defaultSelectedIds, {
      generateId: () => 'forked-local-2',
    });
    expect(defaultResult.added.map((r) => r.id)).toEqual(['remote-new-3']);
    expect(defaultResult.forked.map((f) => f.forkedRecord.id)).toEqual(['forked-local-2']);
    expect(defaultResult.merged).toHaveLength(4);
  });
});

describe('Source Mode Direct File Drop Resolver (resolveSourceDroppedFileContent)', () => {
  const sampleRaw = SCRIPT_PRESETS[0].content;

  it('extracts normalized plain text from .txt and .md files', () => {
    const txtRes = resolveSourceDroppedFileContent(
      'quick-scene.txt',
      `\uFEFF${sampleRaw.replace(/\n/g, '\r\n')}\r\n`
    );
    expect(txtRes).toEqual({
      ok: true,
      rawText: sampleRaw,
      sourceFormat: 'plain-text',
    });

    const mdRes = resolveSourceDroppedFileContent('draft.md', '[INTENT]\r\nAlleyway beat.\r\n\n');
    expect(mdRes).toEqual({
      ok: true,
      rawText: '[INTENT]\nAlleyway beat.',
      sourceFormat: 'plain-text',
    });
  });

  it('unwraps AuteurEnvelope, AuteurScriptIR, and AuteurScriptDraft JSON into canonical plain text', () => {
    const envelope = toAuteurEnvelope(sampleRaw);
    const envRes = resolveSourceDroppedFileContent('scene.json', JSON.stringify(envelope));
    expect(envRes).toEqual({
      ok: true,
      rawText: exportPlainText(sampleRaw),
      sourceFormat: 'auteur-envelope',
    });

    const ir = toAuteurIR(sampleRaw);
    const irRes = resolveSourceDroppedFileContent('ir.json', JSON.stringify(ir));
    expect(irRes).toEqual({
      ok: true,
      rawText: exportPlainText(sampleRaw),
      sourceFormat: 'auteur-ir',
    });

    const draftRes = resolveSourceDroppedFileContent(
      'draft.json',
      JSON.stringify({
        stagingMacroBlocks: [{header: 'INTENT', format: 'prose', body: 'Rainy street.'}],
        executionMacroBlock: null,
      })
    );
    expect(draftRes.ok).toBe(true);
    if (!draftRes.ok) return;
    expect(draftRes.sourceFormat).toBe('auteur-draft');
    expect(draftRes.rawText).toContain('[INTENT]\nRainy street.');
  });

  it('extracts the first script rawText from single-script and multi-script library backup bundles', () => {
    const singleBackup = createLibraryBackup([
      {
        id: 's-1',
        title: 'Solo Exported Scene',
        rawText: '[INTENT]\r\nSingle exported script.\r\n',
        createdAt: 1000,
        updatedAt: 2000,
      },
    ]);
    const singleRes = resolveSourceDroppedFileContent('single-export.json', JSON.stringify(singleBackup));
    expect(singleRes).toEqual({
      ok: true,
      rawText: '[INTENT]\nSingle exported script.',
      sourceFormat: 'library-backup',
      bundleInfo: {
        pickedTitle: 'Solo Exported Scene',
        totalScripts: 1,
      },
    });

    const multiBackup = createLibraryBackup([
      {
        id: 's-older',
        title: 'Older Scene',
        rawText: '[INTENT]\nOlder body.',
        createdAt: 1000,
        updatedAt: 1500,
      },
      {
        id: 's-newer',
        title: 'Newest Scene',
        rawText: '[INTENT]\nNewest body.',
        createdAt: 1000,
        updatedAt: 3000,
      },
    ]);
    const multiRes = resolveSourceDroppedFileContent('bundle.json', JSON.stringify(multiBackup));
    expect(multiRes).toEqual({
      ok: true,
      rawText: '[INTENT]\nNewest body.',
      sourceFormat: 'library-backup',
      bundleInfo: {
        pickedTitle: 'Newest Scene',
        totalScripts: 2,
      },
    });
  });

  it('rejects empty files, empty backup bundles, malformed JSON, and unknown JSON schemas', () => {
    expect(resolveSourceDroppedFileContent('empty.txt', '  \n ').ok).toBe(false);

    const emptyBackup = createLibraryBackup([]);
    const emptyBackupRes = resolveSourceDroppedFileContent('empty-backup.json', JSON.stringify(emptyBackup));
    expect(emptyBackupRes).toEqual({
      ok: false,
      error: 'Backup JSON contains no scripts.',
    });

    const badJsonRes = resolveSourceDroppedFileContent('broken.json', '{ "bad": ');
    expect(badJsonRes.ok).toBe(false);

    const unknownRes = resolveSourceDroppedFileContent('other.json', JSON.stringify({foo: 'bar'}));
    expect(unknownRes.ok).toBe(false);
  });
});



