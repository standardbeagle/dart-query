/**
 * dartai_loop_snapshot Tool Handler
 *
 * Single-call snapshot of a dartboard's loop-relevant state:
 * - Resolved dartboard_id and minimal config (statuses, runner assignee)
 * - Queue (Todo, unblocked, unclaimed)
 * - Runner-claimed tasks (tag `claimed:<runner_dart_id>`)
 * - Blocked tasks (tag `loop-blocked`)
 *
 * Task 4 (TDD red): stub only. Task 5 implements the body.
 */

import { DartClient } from '../api/dartClient.js';
import { configCache } from '../cache/configCache.js';
import type {
  LoopSnapshotInput,
  LoopSnapshotOutput,
} from '../types/index.js';

// References kept so tree-shaking does not drop the import in stub form
// and so Task 5 can build on the same module-level imports.
void DartClient;
void configCache;

export async function handleDartaiLoopSnapshot(
  _input: LoopSnapshotInput,
): Promise<LoopSnapshotOutput> {
  // Stub — Task 5 implements body. Tests should fail in this state.
  throw new Error('handleDartaiLoopSnapshot not yet implemented');
}
