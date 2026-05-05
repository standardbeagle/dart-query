/**
 * dartai_loop_snapshot Tool Handler
 *
 * Single-call snapshot of a dartboard's loop-relevant state:
 * - Resolved dartboard_id and minimal config (statuses, runner assignee)
 * - Queue (Todo, unblocked, unclaimed)
 * - Runner-claimed tasks (status In Progress, assigned to runner_dart_id)
 * - Blocked tasks (tag `loop-blocked`)
 *
 * Performs exactly one outbound `listTasks` call and one cached config read.
 */

import { DartClient } from '../api/dartClient.js';
import { configCache } from '../cache/configCache.js';
import type {
  DartBoard,
  DartStatus,
  DartTask,
  DartUser,
  LoopSnapshotInput,
  LoopSnapshotOutput,
  TaskSummary,
} from '../types/index.js';

function resolveDartboardId(
  dartboards: (DartBoard | string)[],
  input: string,
): string | undefined {
  for (const d of dartboards) {
    if (typeof d === 'string') {
      if (d === input) return d;
    } else if (d.name === input) {
      return d.dart_id;
    }
  }
  // Second pass: dart_id match on objects
  for (const d of dartboards) {
    if (typeof d !== 'string' && d.dart_id === input) {
      return d.dart_id;
    }
  }
  return undefined;
}

function toSummary(task: DartTask): TaskSummary {
  return {
    dart_id: task.dart_id,
    title: task.title,
    status: task.status ?? '',
    tags: task.tags ?? [],
    assignees: task.assignees ?? [],
  };
}

export async function handleDartaiLoopSnapshot(
  input: LoopSnapshotInput,
): Promise<LoopSnapshotOutput> {
  const queueLimit = input.queue_limit ?? 20;

  // 1. Resolve config + dartboard
  const config = configCache.get();
  if (!config) {
    throw new Error('Config cache is empty; run get_config first');
  }
  const dartboardId = resolveDartboardId(config.dartboards, input.dartboard);
  if (!dartboardId) {
    throw new Error(`dartboard "${input.dartboard}" not found`);
  }

  // 2. Single outbound call — fetch up to 3x queue_limit so partition has headroom
  const client = new DartClient({ token: process.env.DART_TOKEN ?? '' });
  const apiResponse = await client.listTasks({
    dartboard: dartboardId,
    limit: queueLimit * 3,
  });
  const tasks = apiResponse.tasks ?? [];

  // 3. Partition (first-match-wins per spec: blocked → runner_claimed → queue)
  const blocked: TaskSummary[] = [];
  const runnerClaimed: TaskSummary[] = [];
  const queue: TaskSummary[] = [];

  for (const task of tasks) {
    if (task.tags?.includes('loop-blocked')) {
      blocked.push(toSummary(task));
      continue;
    }
    if (
      input.runner_dart_id &&
      task.assignees?.includes(input.runner_dart_id) &&
      task.status === 'In Progress'
    ) {
      runnerClaimed.push(toSummary(task));
      continue;
    }
    if (
      task.status === 'Todo' &&
      !task.tags?.some((t) => t.startsWith('claimed:'))
    ) {
      queue.push(toSummary(task));
      continue;
    }
    // else: dropped
  }

  // 4. Shape config response
  const statuses = (config.statuses ?? []).map((s: DartStatus | string) =>
    typeof s === 'string' ? s : s.name,
  );
  const assignees = (config.assignees ?? []).map((a: DartUser) => ({
    dart_id: a.dart_id ?? '',
    email: a.email ?? '',
  }));

  return {
    dartboard_id: dartboardId,
    config: { statuses, assignees },
    queue: queue.slice(0, queueLimit),
    runner_claimed: runnerClaimed,
    blocked,
    fetched_at: new Date().toISOString(),
  };
}
