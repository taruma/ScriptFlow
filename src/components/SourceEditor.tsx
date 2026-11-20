import {memo} from 'react';
import type {AestheticToken} from '../core/types.ts';
import {UI_LABELS} from '../ui/labels.ts';
import {LiveHighlightedEditor} from './LiveHighlightedEditor.tsx';

interface SourceEditorProps {
  rawText: string;
  aestheticTokens: AestheticToken[];
  readOnly?: boolean;
  onChange: (nextRawText: string) => void;
}

export const SourceEditor = memo(function SourceEditor({
  rawText,
  aestheticTokens,
  readOnly = false,
  onChange,
}: SourceEditorProps) {
  const lineCount = rawText.length === 0 ? 0 : rawText.split('\n').length;
  const charCount = rawText.length;

  return (
    <main className="mx-auto w-full max-w-[820px] px-4 sm:px-6 pt-5 pb-20">
      <div className="mb-2.5 flex items-center justify-between px-1">
        <span className="font-serif text-sm text-text-muted">{UI_LABELS.source.heading}</span>
        <div className="flex items-center gap-2 font-mono text-[11px] text-text-faint tabular-nums">
          <span>{UI_LABELS.source.linesCount(lineCount)}</span>
          <span aria-hidden="true">·</span>
          <span>{UI_LABELS.source.charsCount(charCount)}</span>
        </div>
      </div>

      <div className="rounded-lg border border-border-main bg-surface p-4 shadow-2xs">
        <LiveHighlightedEditor
          value={rawText}
          onChange={onChange}
          mode="source"
          aestheticTokens={aestheticTokens}
          readOnly={readOnly}
          minHeightClass="min-h-[540px]"
          ariaLabel={UI_LABELS.source.ariaLabel}
          placeholder={UI_LABELS.source.placeholder}
        />
      </div>
    </main>
  );
});
