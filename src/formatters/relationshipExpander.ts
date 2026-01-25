/**
 * Relationship Expander for DartQL
 *
 * Fetches titles for related tasks (subtasks, blockers, etc.)
 * to enable expanded output without requiring separate queries.
 *
 * Depth-limited to prevent token explosion.
 */

import { DartTask } from '../types/index.js';

// ============================================================================
// Types
// ============================================================================

export interface RelatedTaskSummary {
  dart_id: string;
  title: string;
}

export interface ExpandedTask extends DartTask {
  /** Expanded subtask summaries */
  _subtasks?: RelatedTaskSummary[];
  /** Expanded blocker summaries */
  _blockers?: RelatedTaskSummary[];
  /** Expanded blocking summaries */
  _blocking?: RelatedTaskSummary[];
  /** Expanded duplicate summaries */
  _duplicates?: RelatedTaskSummary[];
  /** Expanded related summaries */
  _related?: RelatedTaskSummary[];
}

export type RelationshipType = 'subtasks' | 'blockers' | 'blocking' | 'duplicates' | 'related';

export interface ExpandOptions {
  /** Which relationships to expand */
  expand: RelationshipType[];
  /** Max depth for nested expansion (default: 1) */
  maxDepth?: number;
  /** Task fetcher function */
  fetchTask: (dartId: string) => Promise<DartTask | null>;
  /** Batch task fetcher function (more efficient) */
  fetchTasks?: (dartIds: string[]) => Promise<Map<string, DartTask>>;
}

// ============================================================================
// Mapping from RelationshipType to task field
// ============================================================================

const RELATIONSHIP_FIELD_MAP: Record<RelationshipType, keyof DartTask> = {
  subtasks: 'subtask_ids',
  blockers: 'blocker_ids',
  blocking: 'blocking_ids',
  duplicates: 'duplicate_ids',
  related: 'related_ids',
};

// ============================================================================
// Expansion Functions
// ============================================================================

/**
 * Collect all dart_ids that need to be fetched for expansion
 */
export function collectIdsToExpand(
  tasks: DartTask[],
  expand: RelationshipType[]
): Set<string> {
  const ids = new Set<string>();

  for (const task of tasks) {
    for (const rel of expand) {
      const fieldKey = RELATIONSHIP_FIELD_MAP[rel];
      const relatedIds = task[fieldKey] as string[] | undefined;
      if (relatedIds && Array.isArray(relatedIds)) {
        for (const id of relatedIds) {
          ids.add(id);
        }
      }
    }
  }

  return ids;
}

/**
 * Expand relationships for a list of tasks
 *
 * Uses batch fetching when available for efficiency.
 */
export async function expandRelationships(
  tasks: DartTask[],
  options: ExpandOptions
): Promise<ExpandedTask[]> {
  if (options.expand.length === 0) {
    return tasks;
  }

  // Collect all IDs to fetch
  const idsToFetch = collectIdsToExpand(tasks, options.expand);

  if (idsToFetch.size === 0) {
    return tasks;
  }

  // Fetch all related tasks
  let relatedTaskMap: Map<string, DartTask>;

  if (options.fetchTasks) {
    // Use batch fetcher
    relatedTaskMap = await options.fetchTasks(Array.from(idsToFetch));
  } else {
    // Fall back to individual fetches
    relatedTaskMap = new Map();
    const fetchPromises = Array.from(idsToFetch).map(async (id) => {
      const task = await options.fetchTask(id);
      if (task) {
        relatedTaskMap.set(id, task);
      }
    });
    await Promise.all(fetchPromises);
  }

  // Expand each task
  const expandedTasks: ExpandedTask[] = tasks.map(task => {
    const expanded: ExpandedTask = { ...task };

    for (const rel of options.expand) {
      const fieldKey = RELATIONSHIP_FIELD_MAP[rel];
      const relatedIds = task[fieldKey] as string[] | undefined;

      if (relatedIds && Array.isArray(relatedIds)) {
        const summaries: RelatedTaskSummary[] = relatedIds
          .map(id => {
            const relatedTask = relatedTaskMap.get(id);
            return relatedTask
              ? { dart_id: id, title: relatedTask.title }
              : { dart_id: id, title: '(not found)' };
          });

        // Store in underscore-prefixed field
        switch (rel) {
          case 'subtasks':
            expanded._subtasks = summaries;
            break;
          case 'blockers':
            expanded._blockers = summaries;
            break;
          case 'blocking':
            expanded._blocking = summaries;
            break;
          case 'duplicates':
            expanded._duplicates = summaries;
            break;
          case 'related':
            expanded._related = summaries;
            break;
        }
      }
    }

    return expanded;
  });

  return expandedTasks;
}

/**
 * Format expanded relationships for compact display
 *
 * Example: "..abc:Auth, ..def:Login, ..ghi:Logout"
 */
export function formatExpandedRelationship(
  summaries: RelatedTaskSummary[] | undefined,
  maxItems: number = 3,
  maxTitleLen: number = 15
): string {
  if (!summaries || summaries.length === 0) {
    return '-';
  }

  const items = summaries.slice(0, maxItems).map(s => {
    const shortId = s.dart_id.length > 6 ? '..' + s.dart_id.slice(-4) : s.dart_id;
    const shortTitle = s.title.length > maxTitleLen
      ? s.title.slice(0, maxTitleLen - 2) + '..'
      : s.title;
    return `${shortId}:${shortTitle}`;
  });

  const result = items.join(', ');
  if (summaries.length > maxItems) {
    return result + ` (+${summaries.length - maxItems})`;
  }
  return result;
}

/**
 * Format expanded relationships as nested indented list
 *
 * Example:
 *   └─ ..abc Auth module (Todo, H)
 *   └─ ..def Login form (Doing, M)
 */
export function formatExpandedAsNested(
  summaries: RelatedTaskSummary[] | undefined,
  indent: string = '  ',
  maxItems: number = 5
): string[] {
  if (!summaries || summaries.length === 0) {
    return [];
  }

  const lines = summaries.slice(0, maxItems).map(s => {
    const shortId = s.dart_id.length > 6 ? '..' + s.dart_id.slice(-4) : s.dart_id;
    return `${indent}└─ ${shortId} ${s.title}`;
  });

  if (summaries.length > maxItems) {
    lines.push(`${indent}   ... and ${summaries.length - maxItems} more`);
  }

  return lines;
}

/**
 * Get the total count of all relationships for a task
 */
export function getTotalRelationshipCount(task: DartTask): number {
  let count = 0;
  count += task.subtask_ids?.length || 0;
  count += task.blocker_ids?.length || 0;
  count += task.blocking_ids?.length || 0;
  count += task.duplicate_ids?.length || 0;
  count += task.related_ids?.length || 0;
  return count;
}

/**
 * Check if a task has any relationships
 */
export function hasRelationships(task: DartTask): boolean {
  return getTotalRelationshipCount(task) > 0;
}
