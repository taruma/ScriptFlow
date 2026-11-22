import {memo, useMemo} from 'react';
import {tokenizeAnnotatedText, type InferredObjectKind} from '../../ui/canvas/index.ts';
import {getObjectColorVar, useGraphInteraction} from './graphContext.tsx';

interface AnnotatedProseProps {
  text: string;
  className?: string;
}

function isMonospaceEntity(kind: InferredObjectKind, isRefToken: boolean): boolean {
  return isRefToken || kind === 'location' || kind === 'wardrobe' || kind === 'prop' || kind === 'camera_slot';
}

export const AnnotatedProse = memo(function AnnotatedProse({
  text,
  className,
}: AnnotatedProseProps) {
  const {inlineEntities, activeObjectId, onSelectObject, onHoverObject} = useGraphInteraction();

  const segments = useMemo(
    () => tokenizeAnnotatedText(text, inlineEntities),
    [text, inlineEntities]
  );

  return (
    <span className={className}>
      {segments.map((seg, idx) => {
        if (!seg.entity) {
          return <span key={idx}>{seg.text}</span>;
        }

        const {objectId, kind, isRefToken} = seg.entity;
        const colorVar = isRefToken ? 'var(--graph-obj-staging_ref)' : getObjectColorVar(kind);
        const isActive = activeObjectId === objectId;
        const useMono = isMonospaceEntity(kind, isRefToken);

        return (
          <button
            key={`${objectId}-${idx}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectObject(objectId);
            }}
            onMouseEnter={() => onHoverObject(objectId)}
            onMouseLeave={() => onHoverObject(null)}
            style={{
              color: colorVar,
              backgroundColor: `color-mix(in srgb, ${colorVar} 12%, transparent)`,
              borderBottom: isRefToken
                ? undefined
                : `1px solid color-mix(in srgb, ${colorVar} 44%, transparent)`,
              boxShadow: isActive ? `0 0 0 1.5px ${colorVar}` : undefined,
            }}
            className={`nodrag nopan inline rounded px-1 py-0 font-semibold transition-shadow cursor-pointer align-baseline ${
              useMono ? 'font-mono text-[0.92em]' : ''
            }`}
          >
            {seg.text}
          </button>
        );
      })}
    </span>
  );
});
