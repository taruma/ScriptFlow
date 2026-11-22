import {describe, expect, it} from 'vitest';
import {parseAuteurScript} from '../../src/core/index.ts';
import {
  AUDIT_QUICK_CHECKS,
  buildAiTargetOptions,
  buildAuditQuickPrompt,
  buildScopedRefinePrompt,
  formatToolCallTooltip,
  formatToolDisplayName,
  isSuggestionStale,
  reconcileTargetScope,
  resolveEditorJumpTarget,
  shouldShowSettingsLinkForError,
} from '../../src/ui/aiAssistant.ts';
import {parseMarkdownBlocks, parseMarkdownInline} from '../../src/ui/markdown.ts';
import {SAMPLE_SCRIPT} from './aiTestFixtures.ts';
describe('aiAssistant pure UI sidebar & target-scoping helpers', () => {
  it('builds Refine target options, reconciles removed targets, and scopes prompts cleanly', () => {
    const doc = parseAuteurScript(SAMPLE_SCRIPT);
    const options = buildAiTargetOptions(doc);

    expect(options[0]).toEqual({kind: 'whole', key: 'whole', label: 'Whole Script'});
    const mb0 = options.find((o) => o.key === 'MB0');
    const s1 = options.find((o) => o.key === 'S1');
    expect(mb0?.kind).toBe('macro_block');
    expect(s1?.kind).toBe('macro_state');

    expect(reconcileTargetScope('S999', options).key).toBe('whole');
    expect(reconcileTargetScope('S1', options).key).toBe('S1');

    expect(buildScopedRefinePrompt('Tighten pacing.', options[0])).toBe('Tighten pacing.');
    expect(buildScopedRefinePrompt('Clarify tone.', mb0!)).toContain('Staging Macro-Block MB0');
    expect(buildScopedRefinePrompt('Sharpen blocking.', s1!)).toContain('Execution Macro-State S1');
    expect(buildScopedRefinePrompt('Sharpen blocking.', s1!)).not.toContain('Execution Beat');
  });

  it('resolves MB#, MB#.#, S#, S#.#, and header names to editor jump targets and checks staleness', () => {
    const doc = parseAuteurScript(SAMPLE_SCRIPT);

    expect(resolveEditorJumpTarget('MB0', doc)).toEqual({
      phase: 'staging',
      blockIndex: 0,
      domId: 'staging-block-0',
    });
    expect(resolveEditorJumpTarget('MB1.2', doc)).toEqual({
      phase: 'staging',
      blockIndex: 1,
      domId: 'staging-block-1',
    });
    expect(resolveEditorJumpTarget('S1', doc)).toEqual({
      phase: 'execution',
      beatIndex: 1,
      domId: 'execution-beat-1',
    });
    expect(resolveEditorJumpTarget('S2.1', doc)).toEqual({
      phase: 'execution',
      beatIndex: 2,
      subStateIndex: 0,
      domId: 'execution-beat-2-substate-0',
      fallbackDomId: 'execution-beat-2',
    });
    expect(resolveEditorJumpTarget('S2.2', doc)).toEqual({
      phase: 'execution',
      beatIndex: 2,
      subStateIndex: 1,
      domId: 'execution-beat-2-substate-1',
      fallbackDomId: 'execution-beat-2',
    });
    expect(resolveEditorJumpTarget('S2.0', doc)).toEqual({
      phase: 'execution',
      beatIndex: 2,
      domId: 'execution-beat-2',
    });
    expect(resolveEditorJumpTarget('S2.99', doc)).toEqual({
      phase: 'execution',
      beatIndex: 2,
      domId: 'execution-beat-2',
    });
    expect(resolveEditorJumpTarget('[OPENING]', doc)?.phase).toBe('staging');
    expect(resolveEditorJumpTarget('S999', doc)).toBeNull();
    expect(resolveEditorJumpTarget('MB999', doc)).toBeNull();

    expect(isSuggestionStale('abc123', 'abc123')).toBe(false);
    expect(isSuggestionStale('abc123', 'def456')).toBe(true);

    expect(AUDIT_QUICK_CHECKS).toHaveLength(6);
    for (const check of AUDIT_QUICK_CHECKS) {
      expect(buildAuditQuickPrompt(check.id)).toContain('report_audit_review');
    }

    expect(shouldShowSettingsLinkForError('missing_api_key')).toBe(true);
    expect(shouldShowSettingsLinkForError('invalid_api_key')).toBe(true);
    expect(shouldShowSettingsLinkForError('model_not_found')).toBe(true);
    expect(shouldShowSettingsLinkForError('network_error')).toBe(false);
    expect(shouldShowSettingsLinkForError('aborted')).toBe(false);
  });

  it('formats display names and hover tooltips for get_script_source, propose_text_replace, propose_script_title, and surgical inspect_lens_slice', () => {
    expect(formatToolDisplayName('get_script_source')).toBe('Read script source');
    expect(formatToolDisplayName('propose_text_replace')).toBe('Stage text replace');
    expect(formatToolDisplayName('propose_script_title')).toBe('Suggest scene title');

    const sourceAll = formatToolCallTooltip({
      callId: 'c-src-all',
      name: 'get_script_source',
      arguments: {},
      status: 'ok',
    });
    expect(sourceAll.title).toBe('Read script source');
    expect(sourceAll.detail).toContain('plain-text');

    const sourceScoped = formatToolCallTooltip({
      callId: 'c-src-scoped',
      name: 'get_script_source',
      arguments: {targetIds: ['MB0', 'S3', 'S4']},
      status: 'ok',
    });
    expect(sourceScoped.detail).toBe('Targets: MB0, S3, S4');

    const replaceTip = formatToolCallTooltip({
      callId: 'c-rep',
      name: 'propose_text_replace',
      arguments: {
        summary: 'Rename Mark to Marcus everywhere',
        replacements: [{find: 'Mark', replace: 'Marcus'}],
      },
      status: 'ok',
    });
    expect(replaceTip.title).toBe('Stage text replace');
    expect(replaceTip.detail).toBe('1 rule · Rename Mark to Marcus everywhere');

    const titleTip = formatToolCallTooltip({
      callId: 'c-title',
      name: 'propose_script_title',
      arguments: {title: 'Midnight Platform'},
      status: 'ok',
    });
    expect(titleTip.title).toBe('Suggest scene title');
    expect(titleTip.detail).toBe('"Midnight Platform"');

    const surgicalSliceTip = formatToolCallTooltip({
      callId: 'c-slice',
      name: 'inspect_lens_slice',
      arguments: {
        preset: 'lens1_spatial_optics',
        macroStateIds: ['S3', 'S4'],
      },
      status: 'ok',
    });
    expect(surgicalSliceTip.detail).toBe('Preset: lens1_spatial_optics · States: S3, S4');
  });
});

describe('markdown parser for AI assistant replies', () => {
  it('parses headings, loose ordered lists with nested bullets, code blocks, and inline spans', () => {
    const sample = [
      'A full 5-lens audit on snapshot `d1aed335` passed with **0 errors** and **0 warnings**.',
      '',
      '### 5-Lens Audit Breakdown',
      '',
      '1. **Lens 1: Spatial & Optics — Pass**',
      '   - `sceneTopology` (`multi_camera_coverage`) is respected across `S1`.',
      '   - Framing stays clean for *Ray*.',
      '',
      '2. **Lens 2: Temporal, Pacing & Wear — Pass**',
      '   - `MB3` (`OPENING`) is properly frozen.',
      '',
      '```text',
      '[CAM 01] MS, eye level',
      '```',
    ].join('\n');

    const blocks = parseMarkdownBlocks(sample);
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'heading', 'list', 'code_block']);

    const heading = blocks[1];
    expect(heading.type === 'heading' && heading.level).toBe(3);

    const list = blocks[2];
    expect(list.type).toBe('list');
    if (list.type === 'list') {
      expect(list.ordered).toBe(true);
      expect(list.items).toHaveLength(2);
      expect(list.items[0].nestedLists).toHaveLength(1);
      expect(list.items[0].nestedLists[0].ordered).toBe(false);
      expect(list.items[0].nestedLists[0].items).toHaveLength(2);
      expect(list.items[1].nestedLists[0].items).toHaveLength(1);
    }

    const codeBlock = blocks[3];
    expect(codeBlock).toEqual({
      type: 'code_block',
      language: 'text',
      code: '[CAM 01] MS, eye level',
    });
  });

  it('preserves snake_case identifiers and blocks unsafe link protocols', () => {
    const inline = parseMarkdownInline(
      'Check multi_camera_coverage and [docs](https://example.com) and [bad](javascript:alert(1))'
    );
    expect(inline.some((n) => n.type === 'em')).toBe(false);
    expect(inline.filter((n) => n.type === 'link')).toEqual([
      {
        type: 'link',
        label: [{type: 'text', text: 'docs'}],
        href: 'https://example.com',
      },
    ]);
  });
});
