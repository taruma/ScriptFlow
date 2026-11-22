import type {BundledExample} from '../../data/examples/index.ts';
import type {ScriptRecord} from './dbTypes.ts';

export interface ScriptOriginExample {
  id: string;
  title: string;
}

export interface ScriptLineageNode {
  record: ScriptRecord;
  id: string;
  rootId: string;
  parentId: string | null;
  parentTitle: string | null;
  childIds: string[];
  depth: number;
  /** Number of descendants beneath this node */
  descendantCount: number;
  /** For each ancestor depth level (0..depth-1), true if that ancestor has a following sibling */
  ancestorHasNextSibling: boolean[];
  /** True if this node is the last child among its siblings */
  isLastChild: boolean;
  /** Bundled example origin if this script was directly forked from a bundled example */
  originExample: ScriptOriginExample | null;
}

export interface ScriptLineageFamily {
  rootId: string;
  rootRecord: ScriptRecord;
  /** Pre-order depth-first list starting with the root node at depth 0 */
  nodes: ScriptLineageNode[];
  /** Maximum updatedAt across the root and all descendants */
  familyMaxUpdatedAt: number;
  /** Total descendant count under the root (nodes.length - 1) */
  branchCount: number;
  /** Origin bundled example of the root script, if forked from a bundled example */
  originExample: ScriptOriginExample | null;
}

export interface ScriptLineageIndex {
  families: ScriptLineageFamily[];
  familyByRootId: Map<string, ScriptLineageFamily>;
  nodeById: Map<string, ScriptLineageNode>;
  descendantCountByRootId: Map<string, number>;
  /** Custom scripts whose forkedFromId points directly to a bundled example ID */
  customForksByExampleId: Map<string, ScriptRecord[]>;
}

export interface ScriptFamilyTree {
  kind: 'custom' | 'example';
  targetId: string;
  root: ScriptRecord | null;
  nodes: ScriptLineageNode[];
  parentRecord: ScriptRecord | null;
  originExample: ScriptOriginExample | null;
  totalMembers: number;
  /** Direct custom root forks when inspecting a bundled example */
  exampleForks: ScriptRecord[];
}

function compareSiblingRecords(a: ScriptRecord, b: ScriptRecord): number {
  return a.createdAt - b.createdAt || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}

/**
 * Pure lineage & family-tree resolver for custom scripts and bundled examples:
 * - Custom parent links (`forkedFromId` matching another custom script) build connected trees.
 * - Bundled example forks (`forkedFromId` matching a bundled example ID) start independent
 *   custom root families while recording `originExample` so unrelated projects never merge.
 * - Unknown/deleted `forkedFromId` values fall back to root custom scripts.
 * - Any cyclic parent chain is broken deterministically at its earliest-created member.
 */
export function resolveScriptLineage(
  customScripts: readonly ScriptRecord[],
  examples: readonly Pick<BundledExample, 'id' | 'title'>[] = []
): ScriptLineageIndex {
  const customById = new Map<string, ScriptRecord>();
  for (const record of customScripts) {
    customById.set(record.id, record);
  }

  const exampleById = new Map<string, ScriptOriginExample>();
  for (const example of examples) {
    exampleById.set(example.id, {id: example.id, title: example.title});
  }

  // Initial parent resolution (custom parents only) + bundled example origin map
  const parentById = new Map<string, string | null>();
  const originExampleById = new Map<string, ScriptOriginExample | null>();
  const customForksByExampleId = new Map<string, ScriptRecord[]>();

  for (const record of customScripts) {
    const rawParentId = record.forkedFromId?.trim() || null;
    if (rawParentId && rawParentId !== record.id && customById.has(rawParentId)) {
      parentById.set(record.id, rawParentId);
      originExampleById.set(record.id, null);
    } else {
      parentById.set(record.id, null);
      const originExample = rawParentId ? (exampleById.get(rawParentId) ?? null) : null;
      originExampleById.set(record.id, originExample);
      if (originExample) {
        const list = customForksByExampleId.get(originExample.id) ?? [];
        list.push(record);
        customForksByExampleId.set(originExample.id, list);
      }
    }
  }

  for (const [exampleId, forks] of customForksByExampleId.entries()) {
    forks.sort(compareSiblingRecords);
    customForksByExampleId.set(exampleId, forks);
  }

  // Cycle protection: break any cycle deterministically by promoting its earliest-created node to root
  const visitState = new Map<string, 'visiting' | 'done'>();
  for (const record of customScripts) {
    if (visitState.get(record.id) === 'done') continue;

    const path: string[] = [];
    const pathIndex = new Map<string, number>();
    let cursor: string | null = record.id;

    while (cursor !== null && visitState.get(cursor) !== 'done') {
      const cycleStart = pathIndex.get(cursor);
      if (cycleStart !== undefined) {
        const cycleIds = path.slice(cycleStart);
        let rootCandidateId = cycleIds[0];
        let rootCandidate = customById.get(rootCandidateId)!;
        for (let i = 1; i < cycleIds.length; i += 1) {
          const id = cycleIds[i];
          const candidate = customById.get(id)!;
          if (compareSiblingRecords(candidate, rootCandidate) < 0) {
            rootCandidateId = id;
            rootCandidate = candidate;
          }
        }
        parentById.set(rootCandidateId, null);
        break;
      }

      pathIndex.set(cursor, path.length);
      path.push(cursor);
      visitState.set(cursor, 'visiting');
      cursor = parentById.get(cursor) ?? null;
    }

    for (const visitedId of path) {
      visitState.set(visitedId, 'done');
    }
  }

  // Build sorted child adjacency lists
  const childrenByParentId = new Map<string, ScriptRecord[]>();
  const roots: ScriptRecord[] = [];

  for (const record of customScripts) {
    const parentId = parentById.get(record.id) ?? null;
    if (parentId === null) {
      roots.push(record);
    } else {
      const siblings = childrenByParentId.get(parentId) ?? [];
      siblings.push(record);
      childrenByParentId.set(parentId, siblings);
    }
  }

  roots.sort(compareSiblingRecords);
  for (const siblings of childrenByParentId.values()) {
    siblings.sort(compareSiblingRecords);
  }

  const families: ScriptLineageFamily[] = [];
  const familyByRootId = new Map<string, ScriptLineageFamily>();
  const nodeById = new Map<string, ScriptLineageNode>();
  const descendantCountByRootId = new Map<string, number>();

  for (const rootRecord of roots) {
    const nodes: ScriptLineageNode[] = [];
    let familyMaxUpdatedAt = rootRecord.updatedAt;
    const rootOriginExample = originExampleById.get(rootRecord.id) ?? null;

    const visit = (
      current: ScriptRecord,
      parentRecord: ScriptRecord | null,
      depth: number,
      ancestorHasNextSibling: boolean[],
      isLastChild: boolean
    ): number => {
      if (current.updatedAt > familyMaxUpdatedAt) {
        familyMaxUpdatedAt = current.updatedAt;
      }

      const children = childrenByParentId.get(current.id) ?? [];
      const node: ScriptLineageNode = {
        record: current,
        id: current.id,
        rootId: rootRecord.id,
        parentId: parentRecord?.id ?? null,
        parentTitle: parentRecord?.title ?? null,
        childIds: children.map((child) => child.id),
        depth,
        descendantCount: 0,
        ancestorHasNextSibling,
        isLastChild,
        originExample: originExampleById.get(current.id) ?? null,
      };
      nodes.push(node);
      nodeById.set(current.id, node);

      let totalDescendants = 0;
      const nextAncestorGuides = depth === 0 ? [] : [...ancestorHasNextSibling, !isLastChild];
      for (let idx = 0; idx < children.length; idx += 1) {
        const child = children[idx];
        const childIsLast = idx === children.length - 1;
        totalDescendants += 1 + visit(child, current, depth + 1, nextAncestorGuides, childIsLast);
      }

      node.descendantCount = totalDescendants;
      return totalDescendants;
    };

    const branchCount = visit(rootRecord, null, 0, [], true);
    const family: ScriptLineageFamily = {
      rootId: rootRecord.id,
      rootRecord,
      nodes,
      familyMaxUpdatedAt,
      branchCount,
      originExample: rootOriginExample,
    };

    families.push(family);
    familyByRootId.set(rootRecord.id, family);
    descendantCountByRootId.set(rootRecord.id, branchCount);
  }

  return {
    families,
    familyByRootId,
    nodeById,
    descendantCountByRootId,
    customForksByExampleId,
  };
}

/**
 * Returns the full connected family tree for a given custom script ID or bundled example ID.
 */
export function getScriptFamilyTree(
  scriptId: string,
  customScripts: readonly ScriptRecord[],
  examples: readonly Pick<BundledExample, 'id' | 'title'>[] = []
): ScriptFamilyTree | null {
  const index = resolveScriptLineage(customScripts, examples);
  const customNode = index.nodeById.get(scriptId);

  if (customNode) {
    const family = index.familyByRootId.get(customNode.rootId);
    if (!family) return null;

    const parentRecord = customNode.parentId
      ? (index.nodeById.get(customNode.parentId)?.record ?? null)
      : null;

    return {
      kind: 'custom',
      targetId: scriptId,
      root: family.rootRecord,
      nodes: family.nodes,
      parentRecord,
      originExample: customNode.originExample ?? family.originExample,
      totalMembers: family.nodes.length,
      exampleForks: [],
    };
  }

  const matchedExample = examples.find((example) => example.id === scriptId);
  if (matchedExample) {
    const exampleForks = index.customForksByExampleId.get(matchedExample.id) ?? [];
    const forkNodes: ScriptLineageNode[] = [];
    for (const forkRoot of exampleForks) {
      const family = index.familyByRootId.get(forkRoot.id);
      if (family) {
        forkNodes.push(...family.nodes);
      }
    }

    return {
      kind: 'example',
      targetId: matchedExample.id,
      root: null,
      nodes: forkNodes,
      parentRecord: null,
      originExample: {id: matchedExample.id, title: matchedExample.title},
      totalMembers: 1 + forkNodes.length,
      exampleForks,
    };
  }

  return null;
}

/**
 * Repairs `forkedFromId` pointers on surviving custom scripts after one or more scripts are deleted:
 * - If a deleted intermediate script had a surviving custom ancestor, re-parent its surviving children
 *   to the nearest surviving custom ancestor.
 * - If a family root was deleted (no surviving custom ancestor), promote the earliest-created surviving
 *   child to the new root (inheriting any bundled-example origin if present) and re-parent its siblings to it.
 * - Returns ONLY the updated `ScriptRecord` items whose `forkedFromId` changed so callers can bulkPut them.
 */
export function repairLineageOnDelete(
  remainingScripts: readonly ScriptRecord[],
  deletedIds: ReadonlySet<string> | readonly string[],
  allBeforeDelete: readonly ScriptRecord[]
): ScriptRecord[] {
  const deletedSet = deletedIds instanceof Set ? deletedIds : new Set(deletedIds);
  if (deletedSet.size === 0 || remainingScripts.length === 0) return [];

  const beforeById = new Map<string, ScriptRecord>();
  for (const record of allBeforeDelete) {
    beforeById.set(record.id, record);
  }

  const remainingById = new Map<string, ScriptRecord>();
  for (const record of remainingScripts) {
    remainingById.set(record.id, record);
  }

  const nextParentById = new Map<string, string | undefined>();
  // Surviving orphans grouped by their topmost deleted ancestor ID (the deleted root of that subtree)
  const orphansByDeletedRootId = new Map<string, ScriptRecord[]>();
  const inheritedOriginByDeletedRootId = new Map<string, string | undefined>();

  for (const record of remainingScripts) {
    const currentParentId = record.forkedFromId?.trim();
    if (!currentParentId || !deletedSet.has(currentParentId)) {
      continue;
    }

    // Walk up the pre-delete ancestor chain looking for the nearest surviving custom script
    const visited = new Set<string>([record.id]);
    let cursorId: string | undefined = currentParentId;
    let lastDeletedId = currentParentId;
    let survivingAncestorId: string | null = null;
    let externalOriginId: string | undefined;

    while (cursorId) {
      if (visited.has(cursorId)) break;
      visited.add(cursorId);

      if (remainingById.has(cursorId)) {
        survivingAncestorId = cursorId;
        break;
      }

      if (deletedSet.has(cursorId)) {
        lastDeletedId = cursorId;
        const deletedRecord = beforeById.get(cursorId);
        cursorId = deletedRecord?.forkedFromId?.trim() || undefined;
        continue;
      }

      // Reached a non-deleted external origin (e.g., a bundled example ID)
      externalOriginId = cursorId;
      break;
    }

    if (survivingAncestorId) {
      nextParentById.set(record.id, survivingAncestorId);
    } else {
      const group = orphansByDeletedRootId.get(lastDeletedId) ?? [];
      group.push(record);
      orphansByDeletedRootId.set(lastDeletedId, group);
      if (externalOriginId && !inheritedOriginByDeletedRootId.has(lastDeletedId)) {
        inheritedOriginByDeletedRootId.set(lastDeletedId, externalOriginId);
      }
    }
  }

  // Promote earliest-created orphan in each deleted-root group and re-parent its siblings to it
  for (const [deletedRootId, orphans] of orphansByDeletedRootId.entries()) {
    const sorted = [...orphans].sort(compareSiblingRecords);
    const promotedRoot = sorted[0];
    const inheritedOrigin = inheritedOriginByDeletedRootId.get(deletedRootId);
    nextParentById.set(promotedRoot.id, inheritedOrigin);

    for (let i = 1; i < sorted.length; i += 1) {
      nextParentById.set(sorted[i].id, promotedRoot.id);
    }
  }

  const repaired: ScriptRecord[] = [];
  for (const record of remainingScripts) {
    if (!nextParentById.has(record.id)) continue;
    const nextForkedFromId = nextParentById.get(record.id);
    const prevForkedFromId = record.forkedFromId?.trim() || undefined;
    if (nextForkedFromId === prevForkedFromId) continue;

    const updated: ScriptRecord = {...record};
    if (nextForkedFromId) {
      updated.forkedFromId = nextForkedFromId;
    } else {
      delete updated.forkedFromId;
    }
    repaired.push(updated);
  }

  return repaired;
}
