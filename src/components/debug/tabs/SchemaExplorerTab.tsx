import {useMemo} from 'react';
import {Check, Copy} from 'lucide-react';
import {
  getAuteurJsonSchemas,
  type AuteurJsonSchemaRegistry,
} from '../../../core/index.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';

export type SchemaKey = keyof AuteurJsonSchemaRegistry;

const SCHEMA_KEYS: SchemaKey[] = ['draft', 'ir', 'envelope', 'patch', 'review'];

export interface SchemaExplorerTabProps {
  activeSchemaKey: SchemaKey;
  onChangeSchemaKey: (key: SchemaKey) => void;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
}

export function SchemaExplorerTab({
  activeSchemaKey,
  onChangeSchemaKey,
  copiedId,
  onCopy,
}: SchemaExplorerTabProps) {
  const schemas = useMemo(() => getAuteurJsonSchemas(), []);
  const activeSchemaString = useMemo(
    () => JSON.stringify(schemas[activeSchemaKey], null, 2),
    [schemas, activeSchemaKey]
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 border-b border-border-subtle bg-surface-subtle shrink-0">
        <div className="flex items-center gap-3">
          <span className={UI_TOKENS.layout.sectionTitleMini}>
            {UI_LABELS.debug.schemas.heading}
          </span>
          <div className={UI_TOKENS.button.segmentedGroup}>
            {SCHEMA_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => onChangeSchemaKey(key)}
                className={
                  activeSchemaKey === key
                    ? UI_TOKENS.button.segmentedItemActive
                    : UI_TOKENS.button.segmentedItem
                }
              >
                {UI_LABELS.debug.schemas.keys[key]}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onCopy(`schema-${activeSchemaKey}`, activeSchemaString)}
          className={
            copiedId === `schema-${activeSchemaKey}`
              ? UI_TOKENS.button.actionPillActive
              : UI_TOKENS.button.actionPill
          }
        >
          {copiedId === `schema-${activeSchemaKey}` ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          <span>
            {copiedId === `schema-${activeSchemaKey}`
              ? UI_LABELS.debug.copiedJson
              : UI_LABELS.debug.copyJson}
          </span>
        </button>
      </div>

      <pre className="flex-1 overflow-auto p-5 font-mono text-xs leading-relaxed text-text-body select-text whitespace-pre">
        {activeSchemaString}
      </pre>
    </div>
  );
}
