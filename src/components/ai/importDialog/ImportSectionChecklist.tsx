import type {ReactNode} from 'react';
import {Layers, ScanSearch} from 'lucide-react';
import type {
  AgentContextImportAnalysis,
  AgentContextImportSelection,
} from '../../../ui/agentContextCodec.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';

export type ImportChecklistBadgeTone = 'neutral' | 'faint' | 'intent' | 'overwrite' | 'new';

export interface ImportChecklistBadge {
  label: string;
  tone: ImportChecklistBadgeTone;
}

export interface ImportChecklistItem {
  key: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  title: string;
  meta?: string;
  badges: readonly ImportChecklistBadge[];
  subtitle?: string;
  subtitleMono?: boolean;
  bodySpacing?: 'tight' | 'normal';
}

export interface ImportChecklistGroup {
  key: string;
  heading: string;
  items: readonly ImportChecklistItem[];
}

export interface ImportSectionChecklistProps {
  enabled: boolean;
  toggleAriaLabel: string;
  icon: ReactNode;
  title: string;
  itemsTotal: number;
  emptyNote: string;
  groups: readonly ImportChecklistGroup[];
  onSetAllSelected: (checked: boolean) => void;
}

const BADGE_TONE_CLASS: Record<ImportChecklistBadgeTone, string> = {
  neutral: 'border-border-subtle bg-surface-subtle text-text-muted',
  faint: 'border-border-subtle bg-surface-subtle text-text-faint',
  intent: 'auteur-phase-intent',
  overwrite: 'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  new: 'auteur-phase-aesthetic',
};

export function ImportSectionChecklist({
  enabled,
  toggleAriaLabel,
  icon,
  title,
  itemsTotal,
  emptyNote,
  groups,
  onSetAllSelected,
}: ImportSectionChecklistProps) {
  const labels = UI_LABELS.ai.contextInspector.exportImport;

  return (
    <section className="rounded-xl border border-border-subtle bg-surface-subtle/35 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle bg-surface-subtle/70 px-3.5 py-2.5">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={enabled}
            aria-label={toggleAriaLabel}
            onChange={(event) => onSetAllSelected(event.target.checked)}
            className="h-3.5 w-3.5 rounded border-border-main accent-[var(--phase-continuity-text)] cursor-pointer"
          />
          {icon}
          <span className="text-xs font-semibold text-text-main">{title}</span>
          <span className="font-mono text-[10px] text-text-faint">({itemsTotal})</span>
        </label>

        {itemsTotal > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSetAllSelected(true)}
              className={UI_TOKENS.button.actionPill}
            >
              {labels.selectAllButton}
            </button>
            <button
              type="button"
              onClick={() => onSetAllSelected(false)}
              className={UI_TOKENS.button.actionPill}
            >
              {labels.selectNoneButton}
            </button>
          </div>
        )}
      </div>

      <div className={`p-3.5 space-y-3 ${enabled ? '' : 'opacity-50'}`}>
        {itemsTotal === 0 ? (
          <p className="text-[11px] italic text-text-muted">{emptyNote}</p>
        ) : (
          groups.map((group) => (
            <div key={group.key} className="space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                {group.heading}
              </div>
              <div className="space-y-1.5">
                {group.items.map((item) => (
                  <label
                    key={item.key}
                    className="flex items-start gap-2.5 rounded-lg border border-border-subtle bg-surface px-3 py-2 cursor-pointer hover:bg-surface-hover transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={(event) => item.onToggle(event.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 rounded border-border-main accent-[var(--phase-continuity-text)] cursor-pointer"
                    />
                    {item.subtitle !== undefined ? (
                      <div
                        className={`min-w-0 flex-1 ${
                          item.bodySpacing === 'normal' ? 'space-y-1' : 'space-y-0.5'
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-medium text-text-main">{item.title}</span>
                          {item.meta && (
                            <span className="font-mono text-[10px] text-text-faint">
                              {item.meta}
                            </span>
                          )}
                          {item.badges.map((badge, index) => (
                            <span
                              key={`${badge.tone}-${badge.label}-${index}`}
                              className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${BADGE_TONE_CLASS[badge.tone]}`}
                            >
                              {badge.label}
                            </span>
                          ))}
                        </div>
                        <p
                          className={`text-[11px] ${
                            item.subtitleMono ? 'font-mono ' : ''
                          }text-text-muted truncate`}
                        >
                          {item.subtitle}
                        </p>
                      </div>
                    ) : (
                      <div className="min-w-0 flex-1 flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-medium text-text-main">{item.title}</span>
                        {item.meta && (
                          <span className="font-mono text-[10px] text-text-faint">{item.meta}</span>
                        )}
                        {item.badges.map((badge, index) => (
                          <span
                            key={`${badge.tone}-${badge.label}-${index}`}
                            className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${BADGE_TONE_CLASS[badge.tone]}`}
                          >
                            {badge.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </label>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export interface SkillsImportSectionProps {
  analysis: AgentContextImportAnalysis;
  selection: AgentContextImportSelection;
  itemsTotal: number;
  onSetAllSelected: (checked: boolean) => void;
  onToggleFoundationalCraft: (checked: boolean) => void;
  onToggleBuiltInSkillOverride: (id: string) => void;
  onToggleCustomSkill: (id: string) => void;
}

export function SkillsImportSection({
  analysis,
  selection,
  itemsTotal,
  onSetAllSelected,
  onToggleFoundationalCraft,
  onToggleBuiltInSkillOverride,
  onToggleCustomSkill,
}: SkillsImportSectionProps) {
  const ctxLabels = UI_LABELS.ai.contextInspector;
  const labels = ctxLabels.exportImport;

  const groups: ImportChecklistGroup[] = [];

  if (analysis.foundationalCraft) {
    const craft = analysis.foundationalCraft;
    groups.push({
      key: 'foundational-craft',
      heading: labels.groupFoundationalCraft,
      items: [
        {
          key: 'foundational-craft',
          checked: selection.applySkills && selection.includeFoundationalCraft,
          onToggle: onToggleFoundationalCraft,
          title: ctxLabels.foundationalCraftHeading,
          meta: ctxLabels.charsCount(craft.charCount),
          badges: [
            {
              label: craft.willOverwrite ? labels.badgeOverwrites : labels.badgeNew,
              tone: craft.willOverwrite ? 'overwrite' : 'new',
            },
          ],
          subtitle: craft.preview,
          subtitleMono: true,
          bodySpacing: 'normal',
        },
      ],
    });
  }

  if (analysis.builtInSkillOverrides.length > 0) {
    groups.push({
      key: 'builtin-skill-overrides',
      heading: labels.groupBuiltInSkillOverrides(analysis.builtInSkillOverrides.length),
      items: analysis.builtInSkillOverrides.map((item) => {
        const badges: ImportChecklistBadge[] = [];
        if (item.pinMode) {
          badges.push({label: ctxLabels.pinModes[item.pinMode], tone: 'neutral'});
        }
        if (item.hasBodyOverride) {
          badges.push({label: labels.badgeEditedBody, tone: 'intent'});
        }
        if (item.willOverwrite) {
          badges.push({label: labels.badgeOverwrites, tone: 'overwrite'});
        }
        return {
          key: item.id,
          checked: selection.applySkills && selection.builtInSkillOverrideIds.includes(item.id),
          onToggle: () => onToggleBuiltInSkillOverride(item.id),
          title: item.name,
          meta: item.id,
          badges,
        };
      }),
    });
  }

  if (analysis.customSkills.length > 0) {
    groups.push({
      key: 'custom-skills',
      heading: labels.groupCustomSkills(analysis.customSkills.length),
      items: analysis.customSkills.map((item) => {
        const badges: ImportChecklistBadge[] = [];
        if (item.pinMode !== 'auto') {
          badges.push({label: ctxLabels.pinModes[item.pinMode], tone: 'neutral'});
        }
        badges.push({
          label: item.willOverwrite ? labels.badgeOverwrites : labels.badgeNew,
          tone: item.willOverwrite ? 'overwrite' : 'new',
        });
        return {
          key: item.skill.id,
          checked: selection.applySkills && selection.customSkillIds.includes(item.skill.id),
          onToggle: () => onToggleCustomSkill(item.skill.id),
          title: item.skill.name,
          meta: item.skill.id,
          badges,
          subtitle: item.skill.triggerHint,
        };
      }),
    });
  }

  return (
    <ImportSectionChecklist
      enabled={selection.applySkills}
      toggleAriaLabel={labels.domainSkillsToggleAria}
      icon={<Layers className="h-3.5 w-3.5 text-[var(--phase-continuity-text)]" />}
      title={labels.domainSkillsTitle}
      itemsTotal={itemsTotal}
      emptyNote={labels.domainSkillsEmptyNote}
      groups={groups}
      onSetAllSelected={onSetAllSelected}
    />
  );
}

export interface QuickScanImportSectionProps {
  analysis: AgentContextImportAnalysis;
  selection: AgentContextImportSelection;
  itemsTotal: number;
  onSetAllSelected: (checked: boolean) => void;
  onToggleBuiltInRuleOverride: (id: string) => void;
  onToggleCustomRule: (id: string) => void;
}

export function QuickScanImportSection({
  analysis,
  selection,
  itemsTotal,
  onSetAllSelected,
  onToggleBuiltInRuleOverride,
  onToggleCustomRule,
}: QuickScanImportSectionProps) {
  const labels = UI_LABELS.ai.contextInspector.exportImport;

  const groups: ImportChecklistGroup[] = [];

  if (analysis.builtInQuickScanOverrides.length > 0) {
    groups.push({
      key: 'builtin-quickscan-overrides',
      heading: labels.groupBuiltInRuleOverrides(analysis.builtInQuickScanOverrides.length),
      items: analysis.builtInQuickScanOverrides.map((item) => {
        const badges: ImportChecklistBadge[] = [];
        if (item.enabledOverride !== undefined) {
          badges.push({
            label: item.enabledOverride ? labels.badgeEnabled : labels.badgeDisabled,
            tone: 'neutral',
          });
        }
        if (item.hasTextOverride) {
          badges.push({label: labels.badgeEditedCriteria, tone: 'intent'});
        }
        if (item.willOverwrite) {
          badges.push({label: labels.badgeOverwrites, tone: 'overwrite'});
        }
        return {
          key: item.id,
          checked:
            selection.applyQuickScan && selection.builtInQuickScanOverrideIds.includes(item.id),
          onToggle: () => onToggleBuiltInRuleOverride(item.id),
          title: item.label,
          meta: item.id,
          badges,
        };
      }),
    });
  }

  if (analysis.customQuickScanRules.length > 0) {
    groups.push({
      key: 'custom-quickscan-rules',
      heading: labels.groupCustomRules(analysis.customQuickScanRules.length),
      items: analysis.customQuickScanRules.map((item) => {
        const scopeLabel =
          item.rule.scope === 'sub_state'
            ? labels.scopeShortSubState
            : item.rule.scope === 'macro_state'
              ? labels.scopeShortMacroState
              : labels.scopeShortDocument;
        const badges: ImportChecklistBadge[] = [{label: scopeLabel, tone: 'neutral'}];
        if (!item.enabled) {
          badges.push({label: labels.badgeDisabled, tone: 'faint'});
        }
        badges.push({
          label: item.willOverwrite ? labels.badgeOverwrites : labels.badgeNew,
          tone: item.willOverwrite ? 'overwrite' : 'new',
        });
        return {
          key: item.rule.id,
          checked:
            selection.applyQuickScan && selection.customQuickScanRuleIds.includes(item.rule.id),
          onToggle: () => onToggleCustomRule(item.rule.id),
          title: item.rule.label,
          meta: item.rule.id,
          badges,
          subtitle: item.rule.instructions,
        };
      }),
    });
  }

  return (
    <ImportSectionChecklist
      enabled={selection.applyQuickScan}
      toggleAriaLabel={labels.domainQuickScanToggleAria}
      icon={<ScanSearch className="h-3.5 w-3.5 text-[var(--phase-continuity-text)]" />}
      title={labels.domainQuickScanTitle}
      itemsTotal={itemsTotal}
      emptyNote={labels.domainQuickScanEmptyNote}
      groups={groups}
      onSetAllSelected={onSetAllSelected}
    />
  );
}
