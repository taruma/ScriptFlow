import {useMemo, useState} from 'react';
import {ChevronDown, ChevronRight, Code2, Lock, RotateCcw, ShieldCheck, ShieldOff} from 'lucide-react';
import {
  DEFAULT_TOOL_PROTOCOL_CORE,
  buildToolProtocolRuntimeHeader,
  type ComposedAgentContext,
  type ResolvedScriptTool,
  type ScriptToolName,
  type ToolActivationMode,
} from '../../../services/auteurKnowledge.ts';
import {getToolParametersSchema} from '../../../services/scriptTools.ts';
import type {AiSkillsState} from '../../../ui/aiSkillsStore.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';

const ACTIVATION_MODES: readonly ToolActivationMode[] = ['auto', 'enabled', 'disabled'];

function getToolStatusBadge(
  tool: ResolvedScriptTool,
  focusLabel: string
): {label: string; className: string} {
  const labels = UI_LABELS.ai.contextInspector.functionTools;
  if (tool.status === 'disabled') {
    return {
      label: labels.statusDisabled,
      className: 'border-border-subtle bg-surface-subtle text-text-faint',
    };
  }
  if (tool.status === 'active') {
    return tool.reason === 'forced_on'
      ? {
          label: labels.statusActiveForced,
          className: 'auteur-phase-continuity',
        }
      : {
          label: labels.statusActiveAuto,
          className: 'auteur-phase-aesthetic',
        };
  }
  return {
    label:
      tool.reason === 'inactive_no_available_skills'
        ? labels.statusInactiveNoSkills
        : labels.statusInactiveFocus(focusLabel),
    className: 'border-border-main bg-surface text-text-muted',
  };
}

export interface FunctionToolsToolbarProps {
  composedContext: ComposedAgentContext;
  onSetAllToolModes?: (mode: 'auto' | 'disabled') => void;
}

export function FunctionToolsToolbar({
  composedContext,
  onSetAllToolModes,
}: FunctionToolsToolbarProps) {
  const labels = UI_LABELS.ai.contextInspector.functionTools;
  const activeCount = composedContext.resolvedTools.filter((t) => t.status === 'active').length;
  const inactiveCount = composedContext.resolvedTools.filter((t) => t.status === 'inactive').length;
  const disabledCount = composedContext.resolvedTools.filter((t) => t.status === 'disabled').length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[11px] text-text-faint tabular-nums">
        {labels.summary(activeCount, inactiveCount, disabledCount)}
      </span>
      {onSetAllToolModes && composedContext.resolvedTools.length > 0 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={composedContext.resolvedTools.every((t) => t.activationMode === 'auto')}
            onClick={() => onSetAllToolModes('auto')}
            aria-label={labels.autoAllAria}
            className={`${UI_TOKENS.button.actionPill} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <span>{labels.autoAllButton}</span>
          </button>
          <button
            type="button"
            disabled={composedContext.resolvedTools.every((t) => t.activationMode === 'disabled')}
            onClick={() => onSetAllToolModes('disabled')}
            aria-label={labels.disableAllAria}
            className={`${UI_TOKENS.button.actionPill} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <span>{labels.disableAllButton}</span>
          </button>
        </div>
      )}
    </div>
  );
}

export interface FunctionToolsTabProps {
  composedContext: ComposedAgentContext;
  skillsState: AiSkillsState;
  onSetToolProtocol: (value: string | null) => void;
  onSetEnforceLinterGate: (enforce: boolean) => void;
  onSetToolMode: (toolName: ScriptToolName, mode: ToolActivationMode) => void;
  onSetToolDescription: (toolName: ScriptToolName, description: string | null) => void;
  onSetToolGuidance: (toolName: ScriptToolName, guidance: string | null) => void;
  onResetTool: (toolName: ScriptToolName) => void;
}

export function FunctionToolsTab({
  composedContext,
  skillsState,
  onSetToolProtocol,
  onSetEnforceLinterGate,
  onSetToolMode,
  onSetToolDescription,
  onSetToolGuidance,
  onResetTool,
}: FunctionToolsTabProps) {
  const [expandedToolNames, setExpandedToolNames] = useState<Record<string, boolean>>({});
  const [expandedSchemaNames, setExpandedSchemaNames] = useState<Record<string, boolean>>({});
  const [isCoreProtocolOpen, setIsCoreProtocolOpen] = useState<boolean>(true);

  const ctxLabels = UI_LABELS.ai.contextInspector;
  const labels = ctxLabels.functionTools;
  const focusLabel = UI_LABELS.ai.focusLabels[composedContext.focus];

  const isCoreProtocolModified = skillsState.toolProtocolOverride !== null;
  const coreProtocolValue = skillsState.toolProtocolOverride ?? DEFAULT_TOOL_PROTOCOL_CORE;
  const isPureConversationMode = composedContext.allowedToolNames.length === 0;

  const runtimeHeaderText = useMemo(
    () =>
      buildToolProtocolRuntimeHeader({
        focus: composedContext.focus,
        allowedToolNames: composedContext.allowedToolNames,
        enforceToolLinterGate: composedContext.enforceToolLinterGate,
      }).join('\n'),
    [
      composedContext.focus,
      composedContext.allowedToolNames,
      composedContext.enforceToolLinterGate,
    ]
  );

  const toggleToolExpanded = (name: ScriptToolName) => {
    setExpandedToolNames((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
  };

  const toggleSchemaExpanded = (name: ScriptToolName) => {
    setExpandedSchemaNames((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
  };

  return (
    <div className="space-y-4">
      {/* Pure Conversation Mode Notice */}
      {isPureConversationMode && (
        <div
          role="status"
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-[11px] leading-snug text-text-body"
        >
          {labels.pureChatNotice}
        </div>
      )}

      {/* Linter Gate Toggle Card */}
      <section className="rounded-xl border border-border-subtle bg-surface px-4 py-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface-subtle text-text-muted"
          >
            {skillsState.enforceToolLinterGate ? (
              <ShieldCheck className="h-3.5 w-3.5 text-[var(--phase-aesthetic-text)]" />
            ) : (
              <ShieldOff className="h-3.5 w-3.5 text-[var(--phase-intent-text)]" />
            )}
          </span>
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="text-xs font-semibold text-text-main">{labels.linterGateHeading}</h3>
              <span
                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                  skillsState.enforceToolLinterGate
                    ? 'auteur-phase-aesthetic'
                    : 'auteur-phase-intent'
                }`}
              >
                {skillsState.enforceToolLinterGate
                  ? labels.linterGateActiveBadge
                  : labels.linterGateBypassedBadge}
              </span>
            </div>
            <p className="text-[11px] text-text-muted leading-relaxed">{labels.linterGateDesc}</p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={skillsState.enforceToolLinterGate}
          aria-label={labels.linterGateToggleAria}
          onClick={() => onSetEnforceLinterGate(!skillsState.enforceToolLinterGate)}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors cursor-pointer mt-0.5 ${
            skillsState.enforceToolLinterGate
              ? 'border-[var(--phase-aesthetic-border)] bg-[var(--phase-aesthetic-bg)]'
              : 'border-border-main bg-surface-subtle'
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-3.5 w-3.5 rounded-full transition-transform ${
              skillsState.enforceToolLinterGate
                ? 'translate-x-4 bg-[var(--phase-aesthetic-text)]'
                : 'translate-x-0.5 bg-text-faint'
            }`}
          />
        </button>
      </section>

      {/* Core Tool & Safety Protocol Editor Card */}
      <section className="rounded-xl border border-border-subtle bg-surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <button
            type="button"
            onClick={() => setIsCoreProtocolOpen((prev) => !prev)}
            aria-expanded={isCoreProtocolOpen}
            className="flex flex-1 min-w-[200px] items-start gap-2 text-left cursor-pointer group"
          >
            <span className="mt-0.5 text-text-faint group-hover:text-text-main transition-colors">
              {isCoreProtocolOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </span>
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="text-xs font-semibold text-text-main">
                  {labels.coreProtocolHeading}
                </h3>
                {isCoreProtocolModified && (
                  <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] auteur-phase-intent">
                    {ctxLabels.modifiedBadge}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-text-muted leading-snug">{labels.coreProtocolDesc}</p>
            </div>
          </button>

          <button
            type="button"
            disabled={!isCoreProtocolModified}
            onClick={() => onSetToolProtocol(null)}
            className={`${UI_TOKENS.button.actionPill} shrink-0 disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <RotateCcw className="h-3 w-3" />
            <span>{ctxLabels.resetToDefaultButton}</span>
          </button>
        </div>

        {isCoreProtocolOpen && (
          <div className="border-t border-border-subtle bg-surface-subtle/35 px-4 py-3 space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                  {labels.coreProtocolRuntimeHeaderLabel}
                </span>
                <span className="inline-flex items-center gap-1 rounded border border-border-subtle bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-faint">
                  <Lock className="h-2.5 w-2.5" />
                  <span>{ctxLabels.readOnlyBadge}</span>
                </span>
              </div>
              <pre className="whitespace-pre-wrap break-words rounded-lg border border-border-subtle bg-surface px-3 py-2 font-mono text-[11px] leading-relaxed text-text-muted">
                {runtimeHeaderText}
              </pre>
            </div>

            <textarea
              data-native-undo="true"
              aria-label={labels.coreProtocolTextareaAria}
              rows={5}
              value={coreProtocolValue}
              onChange={(event) => onSetToolProtocol(event.target.value)}
              className={`${UI_TOKENS.input.field} font-mono text-[11px] leading-relaxed auteur-pane-scroll resize-y`}
            />
          </div>
        )}
      </section>

      {/* 10 Function Tool Cards */}
      <div className="space-y-2.5">
        <div className="px-0.5 space-y-0.5">
          <h3 className="text-xs font-semibold text-text-main">{labels.toolsListHeading}</h3>
          <p className="text-[11px] text-text-muted leading-snug">{labels.toolsListDesc}</p>
        </div>

        {composedContext.resolvedTools.map((tool) => {
          const isExpanded = Boolean(expandedToolNames[tool.name]);
          const isSchemaOpen = Boolean(expandedSchemaNames[tool.name]);
          const statusBadge = getToolStatusBadge(tool, focusLabel);
          const hasTextOverride = tool.isDescriptionOverridden || tool.isProtocolGuidanceOverridden;
          const hasAnyOverride = Boolean(skillsState.toolOverrides?.[tool.name]);

          const schemaJson = isSchemaOpen
            ? JSON.stringify(
                getToolParametersSchema(tool.name, composedContext.availableSkills),
                null,
                2
              )
            : '';

          return (
            <article
              key={tool.name}
              className="rounded-xl border border-border-subtle bg-surface overflow-hidden"
            >
              <div className="px-3.5 py-3 flex flex-wrap items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => toggleToolExpanded(tool.name)}
                  aria-expanded={isExpanded}
                  aria-label={
                    isExpanded
                      ? labels.collapseToolAria(tool.label)
                      : labels.expandToolAria(tool.label)
                  }
                  className="flex flex-1 min-w-[200px] items-start gap-2 text-left cursor-pointer group"
                >
                  <span className="mt-0.5 text-text-faint group-hover:text-text-main transition-colors">
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold text-text-main">{tool.label}</span>
                      <span className="font-mono text-[10px] text-text-faint">{tool.name}</span>
                      <span className="rounded border border-border-subtle bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
                        {labels.categories[tool.category]}
                      </span>
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${statusBadge.className}`}
                      >
                        {statusBadge.label}
                      </span>
                      {hasTextOverride && (
                        <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] auteur-phase-intent">
                          {ctxLabels.modifiedBadge}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-text-muted leading-snug line-clamp-2">
                      {tool.description}
                    </p>
                  </div>
                </button>

                {/* 3-Way Auto / Always On / Disabled Toggle */}
                <div
                  role="group"
                  aria-label={labels.activationModeGroupAria(tool.label)}
                  className={`${UI_TOKENS.button.segmentedGroup} inline-flex shrink-0`}
                >
                  {ACTIVATION_MODES.map((mode) => {
                    const selected = tool.activationMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onSetToolMode(tool.name, mode)}
                        className={
                          selected
                            ? UI_TOKENS.button.segmentedItemActive
                            : UI_TOKENS.button.segmentedItem
                        }
                      >
                        {labels.activationModes[mode]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-border-subtle bg-surface-subtle/40 px-3.5 py-3 space-y-3">
                  {/* Editable Protocol Guidance Bullet */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-text-muted">
                        {labels.guidanceFieldLabel}
                      </span>
                      {hasAnyOverride && (
                        <button
                          type="button"
                          onClick={() => onResetTool(tool.name)}
                          className={UI_TOKENS.button.actionPill}
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>{labels.resetToolButton}</span>
                        </button>
                      )}
                    </div>
                    <textarea
                      data-native-undo="true"
                      aria-label={labels.guidanceFieldAria(tool.label)}
                      rows={3}
                      value={tool.protocolGuidance}
                      onChange={(event) => onSetToolGuidance(tool.name, event.target.value)}
                      className={`${UI_TOKENS.input.field} font-mono text-[11px] leading-relaxed auteur-pane-scroll resize-y`}
                    />
                  </div>

                  {/* Editable API FunctionDeclaration Description */}
                  <div className="space-y-1">
                    <span className="block text-[11px] font-medium text-text-muted">
                      {labels.descriptionFieldLabel}
                    </span>
                    <textarea
                      data-native-undo="true"
                      aria-label={labels.descriptionFieldAria(tool.label)}
                      rows={3}
                      value={tool.description}
                      onChange={(event) => onSetToolDescription(tool.name, event.target.value)}
                      className={`${UI_TOKENS.input.field} font-mono text-[11px] leading-relaxed auteur-pane-scroll resize-y`}
                    />
                  </div>

                  {/* Collapsible Read-Only JSON Schema Parameters Viewer */}
                  <div className="space-y-2 pt-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleSchemaExpanded(tool.name)}
                        aria-expanded={isSchemaOpen}
                        className={UI_TOKENS.button.actionPill}
                      >
                        <Code2 className="h-3 w-3 text-text-muted" />
                        <span>
                          {isSchemaOpen ? labels.schemaToggleHide : labels.schemaToggleShow}
                        </span>
                      </button>
                      <span className="inline-flex items-center gap-1 rounded border border-border-subtle bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-faint">
                        <Lock className="h-2.5 w-2.5" />
                        <span>{labels.schemaReadOnlyBadge}</span>
                      </span>
                    </div>

                    {isSchemaOpen && (
                      <pre className="max-h-72 overflow-auto auteur-pane-scroll whitespace-pre-wrap break-words rounded-lg border border-border-subtle bg-surface p-3 font-mono text-[11px] leading-relaxed text-text-body">
                        {schemaJson}
                      </pre>
                    )}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
