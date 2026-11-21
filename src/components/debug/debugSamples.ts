import type {AuteurEnvelope, AuteurScriptIR} from '../../core/index.ts';

export function buildSampleDraftJson(): string {
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

export function buildActionEditSample(envelope: AuteurEnvelope): string {
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
}

export function buildTokenMappingSample(snapshotHash: string): string {
  return JSON.stringify(
    {
      expectedSnapshotHash: snapshotHash,
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
}

export function buildLintGateSample(envelope: AuteurEnvelope): string {
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
}

export function buildDraftFromDocument(document: AuteurScriptIR): string {
  const stripped = {
    stagingMacroBlocks: document.stagingMacroBlocks.map((block) =>
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
    executionMacroBlock: document.executionMacroBlock
      ? {
          header: document.executionMacroBlock.header,
          macroStates: document.executionMacroBlock.macroStates.map((ms) => ({
            subStates: ms.subStates.map(({id: _omit, ...rest}) => rest),
          })),
        }
      : null,
  };
  return JSON.stringify(stripped, null, 2);
}
