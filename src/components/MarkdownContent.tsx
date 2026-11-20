import {Fragment, memo, useMemo} from 'react';
import {
  parseMarkdownBlocks,
  type MarkdownBlock,
  type MarkdownInline,
  type MarkdownListBlock,
} from '../ui/markdown.ts';

interface MarkdownContentProps {
  content: string;
  compact?: boolean;
}

function renderInlineNodes(nodes: readonly MarkdownInline[], keyPrefix: string) {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (node.type) {
      case 'text':
        return <Fragment key={key}>{node.text}</Fragment>;
      case 'code':
        return (
          <code
            key={key}
            className="rounded border border-border-subtle bg-surface-muted px-1 py-0.5 font-mono text-[0.9em] text-text-main break-words"
          >
            {node.code}
          </code>
        );
      case 'strong':
        return (
          <strong key={key} className="font-semibold text-text-main">
            {renderInlineNodes(node.children, key)}
          </strong>
        );
      case 'em':
        return (
          <em key={key} className="italic">
            {renderInlineNodes(node.children, key)}
          </em>
        );
      case 'strike':
        return (
          <del key={key} className="line-through opacity-75">
            {renderInlineNodes(node.children, key)}
          </del>
        );
      case 'link':
        return (
          <a
            key={key}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-border-main underline-offset-2 text-text-main hover:decoration-text-main transition-colors"
          >
            {renderInlineNodes(node.label, key)}
          </a>
        );
    }
  });
}

function renderList(block: MarkdownListBlock, keyPrefix: string, depth = 0) {
  const ListTag = block.ordered ? 'ol' : 'ul';
  const listStyleClass = block.ordered
    ? 'list-decimal pl-4 space-y-1.5'
    : depth > 0
      ? 'list-[circle] pl-4 space-y-1 mt-1'
      : 'list-disc pl-4 space-y-1';

  return (
    <ListTag
      key={keyPrefix}
      start={block.ordered && block.start !== 1 ? block.start : undefined}
      className={`${listStyleClass} marker:text-text-faint`}
    >
      {block.items.map((item, idx) => {
        const itemKey = `${keyPrefix}-li-${idx}`;
        return (
          <li key={itemKey} className="leading-relaxed break-words">
            <span>{renderInlineNodes(item.children, itemKey)}</span>
            {item.nestedLists.map((nested, nestedIdx) =>
              renderList(nested, `${itemKey}-sub-${nestedIdx}`, depth + 1)
            )}
          </li>
        );
      })}
    </ListTag>
  );
}

function renderBlock(block: MarkdownBlock, index: number, compact: boolean) {
  const key = `md-b-${index}`;
  switch (block.type) {
    case 'heading': {
      const headingClass =
        block.level === 1
          ? 'font-serif text-[13.5px] font-bold text-text-main pt-1'
          : block.level === 2
            ? 'font-serif text-[13px] font-bold text-text-main pt-1'
            : 'text-xs font-bold tracking-tight text-text-main pt-1';
      return (
        <div key={key} role="heading" aria-level={block.level + 2} className={headingClass}>
          {renderInlineNodes(block.children, key)}
        </div>
      );
    }
    case 'paragraph':
      return (
        <p key={key} className="leading-relaxed whitespace-pre-line break-words">
          {renderInlineNodes(block.children, key)}
        </p>
      );
    case 'list':
      return renderList(block, key, 0);
    case 'code_block':
      return (
        <pre
          key={key}
          className="rounded-lg border border-border-subtle bg-app px-2.5 py-2 font-mono text-[11px] leading-relaxed text-text-body overflow-x-auto auteur-pane-scroll"
        >
          <code>{block.code}</code>
        </pre>
      );
    case 'blockquote':
      return (
        <blockquote
          key={key}
          className="border-l-2 border-border-main pl-2.5 text-text-muted space-y-1.5"
        >
          {block.blocks.map((child, childIdx) => renderBlock(child, childIdx, compact))}
        </blockquote>
      );
    case 'hr':
      return <hr key={key} className="border-border-subtle my-1" />;
  }
}

/**
 * Renders safe, theme-aware Markdown for AI Assistant replies and thought summaries
 * without HTML injection or third-party dependencies.
 */
export const MarkdownContent = memo(function MarkdownContent({
  content,
  compact = false,
}: MarkdownContentProps) {
  const blocks = useMemo(() => parseMarkdownBlocks(content), [content]);

  if (blocks.length === 0) return null;

  return (
    <div
      className={
        compact
          ? 'space-y-1.5 text-[11px] text-text-muted'
          : 'space-y-2 text-xs text-text-body'
      }
    >
      {blocks.map((block, index) => renderBlock(block, index, compact))}
    </div>
  );
});
