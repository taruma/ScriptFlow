import {describe, expect, it} from 'vitest';
import {
  AuteurEnvelopeSchema,
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
  buildCanonicalTxtExport,
  buildJsonEnvelopeExport,
  buildLibraryBackupExport,
  buildTaglessTxtExport,
  createLibraryBackup,
  deriveTitleFromFilename,
  mergeLibraryBackup,
  parseImportedFile,
  parseLibraryBackup,
  slugifyFilename,
} from '../../src/ui/scriptFileIO.ts';
import {
  createScriptLibraryStore,
  type LegacyLocalStorageAdapter,
  type ScriptRecord,
} from '../../src/ui/scriptLibraryDb.ts';
import {
  buildLibraryRows,
  collectLibraryFacets,
  countExecutionBeatsFast,
  createCopyTitle,
  extractLibraryScriptPreview,
  formatRelativeUpdatedTime,
  LIBRARY_PAGE_SIZE,
  paginateLibraryRows,
  stepLibrarySelectionIndex,
} from '../../src/ui/scriptLibraryView.ts';

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
  it('loads all 4 canonical reference scripts from catalog.json and .txt files with backwards-compatible presets exports', () => {
    expect(EXAMPLE_CATALOG_MANIFEST).toHaveLength(4);
    expect(BUNDLED_EXAMPLES).toHaveLength(4);
    expect(SCRIPT_PRESETS).toHaveLength(4);
    expect(DEFAULT_PRESET).toEqual(SCRIPT_PRESETS[0]);
    expect(BLANK_SCRIPT_TEMPLATE).toBe('');
    const blankDoc = parseAuteurScript(BLANK_SCRIPT_TEMPLATE);
    expect(blankDoc.stagingBlocks).toHaveLength(0);
    expect(blankDoc.execution).toBeNull();
    expect(lintDocument(blankDoc, extractMetadata(blankDoc))).toEqual([]);

    expect(SCRIPT_PRESETS.map((p) => p.id)).toEqual([
      'interrogation-coverage',
      'subway-train-oner',
      'forest-pov-horror',
      'heist-montage',
    ]);

    for (const example of BUNDLED_EXAMPLES) {
      expect(example.file.endsWith('.txt')).toBe(true);
      expect(example.content.length).toBeGreaterThan(100);
      expect(example.content.endsWith('\n')).toBe(false);
      expect(getBundledExampleById(example.id)).toEqual(example);

      const doc = parseAuteurScript(example.content);
      const meta = extractMetadata(doc);
      expect(lintDocument(doc, meta)).toEqual([]);
    }

    expect(getBundledExampleById('nonexistent-id')).toBeNull();
  });

  it('normalizes CRLF/BOM/trailing newlines and rejects missing files or duplicate catalog IDs', () => {
    const resolved = resolveExampleCatalog(
      [
        {
          id: 'custom-example',
          title: 'Custom Example',
          topology: 'Continuous Moving Oner',
          summary: 'Test summary',
          file: 'custom.txt',
          category: 'Test',
        },
      ],
      {
        './custom.txt': '\uFEFF[INTENT]\r\nScene body.\r\n\r\n',
      }
    );

    expect(resolved).toHaveLength(1);
    expect(resolved[0].content).toBe('[INTENT]\nScene body.');
    expect(resolved[0].category).toBe('Test');

    expect(() =>
      resolveExampleCatalog(
        [
          {
            id: 'missing-file',
            title: 'Missing',
            topology: 'Test',
            summary: 'Missing file entry',
            file: 'does-not-exist.txt',
          },
        ],
        {}
      )
    ).toThrow(/Missing bundled example script file/);

    expect(() =>
      resolveExampleCatalog(
        [
          {id: 'dup', title: 'A', topology: 'T', summary: 'S', file: 'a.txt'},
          {id: 'dup', title: 'B', topology: 'T', summary: 'S', file: 'a.txt'},
        ],
        {'./a.txt': '[INTENT]\nHello'}
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
    const brokenFactory = {
      open: () => {
        throw new Error('SecurityError: IndexedDB disabled in sandbox');
      },
    } as unknown as IDBFactory;

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

  it('slugifies titles and derives clean human-readable titles from filenames', () => {
    expect(slugifyFilename('Interrogation Room Coverage')).toBe('interrogation-room-coverage');
    expect(slugifyFilename('Café Noir: Act #2 — Rain!')).toBe('cafe-noir-act-2-rain');
    expect(slugifyFilename('   !!!   ')).toBe('untitled-scene');

    expect(deriveTitleFromFilename('interrogation-room-coverage.txt')).toBe(
      'Interrogation Room Coverage'
    );
    expect(deriveTitleFromFilename('interrogation-room-coverage-tagless.txt')).toBe(
      'Interrogation Room Coverage'
    );
    expect(deriveTitleFromFilename('POV Forest Horror.md')).toBe('POV Forest Horror');
    expect(deriveTitleFromFilename('folder/sub/night_vault.auteur.json')).toBe('Night Vault');
    expect(deriveTitleFromFilename('.json')).toBe('Untitled Scene');
  });

  it('builds Canonical .txt, Tagless .txt, and schema-valid JSON Envelope exports', () => {
    const canonical = buildCanonicalTxtExport('Interrogation Room Coverage', sampleRaw);
    expect(canonical.filename).toBe('interrogation-room-coverage.txt');
    expect(canonical.content).toBe(exportPlainText(sampleRaw));

    const tagless = buildTaglessTxtExport('Interrogation Room Coverage', sampleRaw);
    expect(tagless.filename).toBe('interrogation-room-coverage-tagless.txt');
    expect(tagless.content).toBe(exportTagless(sampleRaw));
    expect(tagless.content).not.toContain('[CAM 01]');

    const jsonExport = buildJsonEnvelopeExport('Interrogation Room Coverage', sampleRaw);
    expect(jsonExport.filename).toBe('interrogation-room-coverage.json');
    expect(AuteurEnvelopeSchema.safeParse(JSON.parse(jsonExport.content)).success).toBe(true);
    expect(jsonExport.envelope.snapshotHash).toBe(toAuteurEnvelope(sampleRaw).snapshotHash);
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

    expect(exported.filename).toBe('auteur-library-backup-2026-11-19.json');
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

    const allRows = buildLibraryRows(customScripts, BUNDLED_EXAMPLES, 'all', '');
    expect(allRows).toHaveLength(1205 + BUNDLED_EXAMPLES.length);
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
    expect(examplesByTopology.map((r) => r.id)).toEqual(['heist-montage']);
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

    // Facet collection
    const facets = collectLibraryFacets(loaded);
    expect(facets.folders).toEqual(['Episode 2', 'Pilot Episode']);
    expect(facets.tags).toEqual(['action', 'dialogue', 'noir']);
    expect(facets.pinnedCount).toBe(1);

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
});

