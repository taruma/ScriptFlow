import {useEffect, useRef, useState} from 'react';
import {Check, Copy, Lock} from 'lucide-react';
import type {ComposedAgentContext} from '../../../services/auteurKnowledge.ts';
import {copyTextToClipboard} from '../../../ui/clipboard.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';

export interface ContextPreviewToolbarProps {
  systemInstruction: string;
}

export function ContextPreviewToolbar({systemInstruction}: ContextPreviewToolbarProps) {
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const copyTimeoutRef = useRef<number | null>(null);
  const labels = UI_LABELS.ai.contextInspector;

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyPrompt = async () => {
    const ok = await copyTextToClipboard(systemInstruction);
    if (!ok) return;
    setCopiedPrompt(true);
    if (copyTimeoutRef.current !== null) {
      window.clearTimeout(copyTimeoutRef.current);
    }
    copyTimeoutRef.current = window.setTimeout(() => {
      setCopiedPrompt(false);
    }, 1800);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[11px] text-text-faint tabular-nums">
        {labels.charsCount(systemInstruction.length)}
      </span>
      <button
        type="button"
        onClick={() => void handleCopyPrompt()}
        aria-label={labels.copyPromptAria}
        className={UI_TOKENS.button.actionPill}
      >
        {copiedPrompt ? (
          <Check className="h-3.5 w-3.5 text-[var(--phase-aesthetic-text)]" />
        ) : (
          <Copy className="h-3.5 w-3.5 text-text-muted" />
        )}
        <span>{copiedPrompt ? labels.copiedPromptButton : labels.copyPromptButton}</span>
      </button>
    </div>
  );
}

export interface ContextPreviewTabProps {
  composedContext: ComposedAgentContext;
}

export function ContextPreviewTab({composedContext}: ContextPreviewTabProps) {
  const labels = UI_LABELS.ai.contextInspector;
  const focusLabel = UI_LABELS.ai.focusLabels[composedContext.focus];

  const previewSections: Array<{
    key: string;
    title: string;
    editable: boolean;
    badgeLabel?: string;
    badgeAccent?: boolean;
    modified?: boolean;
    body: string;
    emptyNote?: string;
  }> = [
    {
      key: 'foundationalCraft',
      title: labels.sectionFoundationalCraft,
      editable: true,
      modified: composedContext.sections.foundationalCraft.isOverridden,
      body: composedContext.sections.foundationalCraft.text,
    },
    {
      key: 'liveEditorState',
      title: labels.sectionLiveEditorState,
      editable: false,
      body: composedContext.sections.liveEditorState.text,
    },
    {
      key: 'sceneBrief',
      title: labels.sectionSceneBrief,
      editable: false,
      badgeLabel: composedContext.sections.sceneBrief.isActive
        ? labels.briefActiveBadge
        : labels.briefInactiveBadge,
      badgeAccent: composedContext.sections.sceneBrief.isActive,
      body: composedContext.sections.sceneBrief.text,
      emptyNote: labels.emptySceneBrief,
    },
    {
      key: 'activeSkills',
      title: labels.sectionActiveSkills,
      editable: false,
      body: composedContext.sections.activeSkills.text,
      emptyNote: labels.emptyActiveSkills,
    },
    {
      key: 'skillDirectory',
      title: labels.sectionSkillDirectory,
      editable: false,
      body: composedContext.sections.skillDirectory.text,
      emptyNote: labels.emptyAvailableSkills,
    },
    {
      key: 'toolProtocol',
      title: labels.sectionToolProtocol,
      editable: false,
      body: composedContext.sections.toolProtocol.text,
    },
  ];

  return (
    <>
      <div className="rounded-xl border border-border-subtle bg-surface px-4 py-3 space-y-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
              {labels.summaryFocus}
            </span>
            <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] auteur-phase-continuity">
              {focusLabel}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
              {labels.summaryTopology}
            </span>
            <span className="font-mono text-[11px] text-text-body">
              {composedContext.editorState.sceneTopology}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
              {labels.summarySnapshot}
            </span>
            <span className="font-mono text-[11px] text-text-body">
              {composedContext.editorState.snapshotHash}
            </span>
            {composedContext.editorState.changedSinceLastTurn && (
              <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] auteur-phase-intent">
                {labels.summaryChangedBadge}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint shrink-0">
            {labels.summaryTools}
          </span>
          {composedContext.allowedToolNames.map((toolName) => (
            <span
              key={toolName}
              className="rounded border border-border-subtle bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-muted"
            >
              {toolName}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {previewSections.map((section) => (
          <section
            key={section.key}
            className="rounded-xl border border-border-subtle bg-surface overflow-hidden"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle bg-surface-subtle/60 px-3.5 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="text-xs font-semibold text-text-main truncate">
                  {section.title}
                </h3>
                {section.modified && (
                  <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] auteur-phase-intent">
                    {labels.modifiedBadge}
                  </span>
                )}
              </div>
              <span
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] shrink-0 ${
                  section.editable || section.badgeAccent
                    ? 'auteur-phase-aesthetic'
                    : 'border-border-subtle bg-surface text-text-faint'
                }`}
              >
                {!section.editable && !section.badgeLabel && <Lock className="h-2.5 w-2.5" />}
                <span>
                  {section.badgeLabel ??
                    (section.editable ? labels.editableBadge : labels.readOnlyBadge)}
                </span>
              </span>
            </div>
            <div className="px-3.5 py-3">
              {section.body.trim().length > 0 ? (
                <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-text-body">
                  {section.body}
                </pre>
              ) : (
                <p className="text-xs italic text-text-faint">{section.emptyNote}</p>
              )}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
