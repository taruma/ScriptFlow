import {BUNDLED_CRAFT_EXEMPLARS} from '../../src/data/knowledge/index.ts';
import type {InteractionStreamEventLike} from '../../src/services/geminiInteractions.ts';
import type {KeyValueStorageLike} from '../../src/ui/aiSettings.ts';

export function createMemoryStorage(): KeyValueStorageLike & {store: Map<string, string>} {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

export async function* asAsyncStream(
  events: InteractionStreamEventLike[]
): AsyncIterable<InteractionStreamEventLike> {
  for (const event of events) {
    yield event;
  }
}

export const SAMPLE_SCRIPT = BUNDLED_CRAFT_EXEMPLARS['interrogation-coverage'].content;
