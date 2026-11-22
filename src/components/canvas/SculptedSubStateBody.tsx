import {memo} from 'react';
import {Music2} from 'lucide-react';
import type {GraphSubStateItem} from '../../ui/canvas/index.ts';
import {UI_LABELS} from '../../ui/labels.ts';
import {AnnotatedProse} from './AnnotatedProse.tsx';
import {getDimensionColorVar, getObjectColorVar, useGraphInteraction} from './graphContext.tsx';

interface SculptedSubStateBodyProps {
  subState: GraphSubStateItem;
}

export const SculptedSubStateBody = memo(function SculptedSubStateBody({
  subState,
}: SculptedSubStateBodyProps) {
  const {objectById, activeObjectId, onSelectObject, onHoverObject} = useGraphInteraction();
  const dimColor = getDimensionColorVar(subState.dimension);

  // 1. DIALOGUE — Screenplay Centered Micro-Block
  if (subState.dimension === 'dialogue' && subState.dialogue) {
    const {speaker, language, extensions, delivery, line} = subState.dialogue;
    const speakerObjId = `obj-char-${speaker}`;
    const speakerObj = objectById[speakerObjId];
    const speakerColor = getObjectColorVar('character');
    const isSpeakerActive = activeObjectId === speakerObjId;

    return (
      <div className="w-full text-center py-0.5 px-1">
        <div className="flex items-center justify-center flex-wrap gap-1.5">
          {speakerObj ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectObject(speakerObjId);
              }}
              onMouseEnter={() => onHoverObject(speakerObjId)}
              onMouseLeave={() => onHoverObject(null)}
              style={{
                color: speakerColor,
                backgroundColor: `color-mix(in srgb, ${speakerColor} 12%, transparent)`,
                borderBottom: `1px solid color-mix(in srgb, ${speakerColor} 45%, transparent)`,
                boxShadow: isSpeakerActive ? `0 0 0 1.5px ${speakerColor}` : undefined,
              }}
              className="nodrag nopan rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider cursor-pointer transition-shadow"
            >
              {speaker}
            </button>
          ) : (
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-main">
              {speaker}
            </span>
          )}

          {language && (
            <span className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-text-body">
              [{language}]
            </span>
          )}

          {extensions.length > 0 && (
            <span className="font-mono text-[10px] font-medium text-text-muted">
              ({extensions.join(', ')})
            </span>
          )}
        </div>

        {delivery.length > 0 && (
          <div className="mt-0.5 text-[11px] italic text-text-muted">
            ({delivery.join(', ')})
          </div>
        )}

        <div className="mt-1.5 text-[12.5px] leading-snug font-medium text-text-main">
          “<AnnotatedProse text={line} />”
        </div>
      </div>
    );
  }

  // 2. FOLEY — Acoustic Waveform Strip
  if (subState.dimension === 'foley') {
    return (
      <div className="flex items-center gap-2.5 py-0.5">
        <div className="auteur-graph-foley-wave shrink-0" aria-hidden="true">
          <span style={{height: 5, opacity: 0.55}} />
          <span style={{height: 11}} />
          <span style={{height: 7, opacity: 0.78}} />
          <span style={{height: 12}} />
          <span style={{height: 6, opacity: 0.62}} />
        </div>
        <div className="text-xs italic leading-relaxed text-text-body">
          <AnnotatedProse text={subState.cleanBody} />
        </div>
      </div>
    );
  }

  // 3. SCORE — Musical Cue Accent
  if (subState.dimension === 'score') {
    return (
      <div className="flex items-center gap-2 py-0.5">
        <Music2
          className="h-3.5 w-3.5 shrink-0"
          style={{color: dimColor}}
          aria-hidden="true"
        />
        <div className="text-xs italic leading-relaxed text-text-body">
          <AnnotatedProse text={subState.cleanBody} />
        </div>
      </div>
    );
  }

  // 4. ON-SCREEN TEXT — Framed Serif Title Card Micro-Slate
  if (subState.dimension === 'onscreen_text') {
    return (
      <div className="auteur-graph-title-frame rounded-lg px-3 py-2 text-center my-0.5">
        <div
          className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] mb-0.5"
          style={{color: dimColor}}
        >
          {UI_LABELS.graph.titleCardKicker}
        </div>
        <div className="font-serif text-[13px] font-bold tracking-[0.12em] text-text-main">
          {subState.cleanBody}
        </div>
      </div>
    );
  }

  // 5. CAMERA — Clean Single-Line Optical Slate (clickable CAM ## slot when numbered)
  if (subState.dimension === 'camera') {
    const camObjId = subState.cameraSlot
      ? `obj-cam-${subState.cameraSlot.replace(/\s+/g, '-')}`
      : null;
    const hasCamObj = Boolean(camObjId && objectById[camObjId]);
    const isCamActive = Boolean(camObjId && activeObjectId === camObjId);

    return (
      <div className="flex items-baseline gap-2">
        {hasCamObj && camObjId ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectObject(camObjId);
            }}
            onMouseEnter={() => onHoverObject(camObjId)}
            onMouseLeave={() => onHoverObject(null)}
            style={{
              color: dimColor,
              backgroundColor: `color-mix(in srgb, ${dimColor} 12%, transparent)`,
              boxShadow: isCamActive ? `0 0 0 1.5px ${dimColor}` : undefined,
            }}
            className="nodrag nopan rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider shrink-0 cursor-pointer transition-shadow"
          >
            {subState.tag}
          </button>
        ) : (
          <span
            className="font-mono text-[10px] font-bold uppercase tracking-wider shrink-0"
            style={{color: dimColor}}
          >
            {subState.tag}
          </span>
        )}
        <span className="text-xs font-medium leading-relaxed text-text-main">
          {subState.cleanBody ? (
            <AnnotatedProse text={subState.cleanBody} />
          ) : (
            <span className="italic text-text-muted">{UI_LABELS.execution.holdFraming}</span>
          )}
        </span>
      </div>
    );
  }

  // 6. BLOCKING / LIGHTING / STATE BOUNDARY / TIER-2 — Subtle Tag Prefix + Prose
  if (
    subState.kind === 'block' ||
    subState.kind === 'light' ||
    subState.kind === 'state_boundary' ||
    subState.kind === 'tier2'
  ) {
    return (
      <div className="text-xs leading-relaxed text-text-body">
        <span
          className="mr-1.5 font-mono text-[10px] font-bold uppercase tracking-wider"
          style={{color: dimColor}}
        >
          {subState.tag}
        </span>
        <AnnotatedProse text={subState.cleanBody} />
      </div>
    );
  }

  // 7. ACTION — Clean Choreography Prose (zero repeated [ACT])
  return (
    <div className="text-xs leading-relaxed text-text-body">
      <AnnotatedProse text={subState.cleanBody} />
    </div>
  );
});
