import type {ReactNode} from 'react';
import {Plus} from 'lucide-react';

interface HoverInsertSeamProps {
  /** Grid template matching the parent pane's card columns */
  gridClass: string;
  /** Optional left-margin gutter content (e.g. Execution's vertical camera continuity rail) */
  leftGutter?: ReactNode;
  /** Seam vertical height class (e.g. `h-2` for tight HOLD/Staging gaps, `h-5` for CUT hairlines) */
  heightClass?: string;
  /** Optional dashed cut divider label (e.g. `cut` or `cut · recall`) */
  cutLabel?: string;
  /** Accessible title & aria-label for the hover `+` button */
  buttonLabel: string;
  onClick: () => void;
  /** Marks the button so outside-click listeners on floating pickers don't double-toggle */
  isPickerTrigger?: boolean;
  /** Quiets the hover button and cut label while a drag operation is actively in flight */
  quiet?: boolean;
  /** Subtle border opacity variant for between-card hairline hover */
  subtleHairline?: boolean;
}

/**
 * Shared hover-activated `+` insertion seam used before and between cards in both
 * Phase 1 Staging and Phase 2 Execution.
 */
export function HoverInsertSeam({
  gridClass,
  leftGutter,
  heightClass = 'h-2',
  cutLabel,
  buttonLabel,
  onClick,
  isPickerTrigger = false,
  quiet = false,
  subtleHairline = false,
}: HoverInsertSeamProps) {
  return (
    <div className={`group/seam relative grid ${gridClass} items-stretch gap-1.5`}>
      {leftGutter !== undefined && <div className="relative">{leftGutter}</div>}

      <div className={`relative flex items-center justify-center ${heightClass}`}>
        {cutLabel ? (
          <>
            <div
              className={`w-full border-t border-dashed border-border-main transition-opacity ${
                quiet ? 'opacity-30' : 'opacity-100'
              }`}
            />
            {!quiet && (
              <span className="absolute bg-app px-2 font-mono text-[9.5px] font-medium tracking-widest text-text-faint uppercase group-hover/seam:opacity-0 transition-opacity select-none">
                {cutLabel}
              </span>
            )}
          </>
        ) : (
          <div
            className={`w-full border-t border-transparent transition-colors ${
              quiet
                ? ''
                : subtleHairline
                  ? 'group-hover/seam:border-border-main/70'
                  : 'group-hover/seam:border-border-main'
            }`}
          />
        )}

        {!quiet && (
          <button
            type="button"
            data-staging-picker-trigger={isPickerTrigger ? 'true' : undefined}
            onClick={onClick}
            title={buttonLabel}
            aria-label={buttonLabel}
            className="absolute z-10 flex h-4 w-4 items-center justify-center rounded-full border border-border-main bg-surface text-text-faint opacity-0 group-hover/seam:opacity-100 hover:border-text-muted hover:text-text-main transition-all cursor-pointer shadow-2xs"
          >
            <Plus className="h-2.5 w-2.5" />
          </button>
        )}
      </div>

      <div />
    </div>
  );
}
