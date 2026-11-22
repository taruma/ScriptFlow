import {memo} from 'react';
import type {NodeProps} from '@xyflow/react';

export interface ZoneHeaderNodeData extends Record<string, unknown> {
  zone: 'staging' | 'objects' | 'execution';
  badge: string;
  subtitle: string;
}

export const ZoneHeaderNode = memo(function ZoneHeaderNode({data}: NodeProps) {
  const {zone, badge, subtitle} = data as ZoneHeaderNodeData;

  const badgeStyle =
    zone === 'objects'
      ? {
          color: 'var(--tok-continuity)',
          backgroundColor: 'color-mix(in srgb, var(--tok-continuity) 13%, transparent)',
        }
      : zone === 'execution'
        ? {
            color: 'var(--phase-execution-text)',
            backgroundColor: 'var(--phase-execution-bg)',
          }
        : undefined;

  return (
    <div className="pointer-events-none select-none flex items-center gap-2.5 whitespace-nowrap">
      <span
        style={badgeStyle}
        className={`rounded-md px-2 py-0.5 font-mono text-[10.5px] font-bold tracking-wider ${
          zone === 'staging' ? 'bg-surface-muted text-text-main border border-border-main' : ''
        }`}
      >
        {badge}
      </span>
      <span className="text-xs text-text-muted">{subtitle}</span>
    </div>
  );
});
