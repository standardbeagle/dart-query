/**
 * Tests for relationshipNormalizer — input alias rewriting.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeRelationshipInput,
  RELATIONSHIP_INPUT_SYNONYMS,
  assertNoPseudoEdgeTags,
} from './relationshipNormalizer.js';

class TestValidationError extends Error {
  constructor(public msg: string, public field: string) {
    super(msg);
    this.name = 'TestValidationError';
  }
}

describe('normalizeRelationshipInput', () => {
  it('rewrites canonical Jira/Linear-style names to legacy internals', () => {
    const out = normalizeRelationshipInput({
      title: 'x',
      parent: 'P',
      subtasks: ['A', 'B'],
      blocked_by: ['B1'],
      blocks: ['BL1'],
      duplicates: ['D1'],
      related: ['R1'],
    });

    expect(out).toEqual({
      title: 'x',
      parent_task: 'P',
      subtask_ids: ['A', 'B'],
      blocker_ids: ['B1'],
      blocking_ids: ['BL1'],
      duplicate_ids: ['D1'],
      related_ids: ['R1'],
    });
    expect(out).not.toHaveProperty('parent');
    expect(out).not.toHaveProperty('subtasks');
    expect(out).not.toHaveProperty('blocked_by');
  });

  it('accepts camelCase + alternate-spelling aliases', () => {
    const out = normalizeRelationshipInput({
      parentId: 'P',
      childIds: ['A'],
      blockedBy: ['B'],
      blocking: ['BL'],
      dependsOn: ['D1'],
      duplicateOf: ['D2'],
      relations: ['R'],
    });

    expect(out.parent_task).toBe('P');
    expect(out.subtask_ids).toEqual(['A']);
    // blockedBy and dependsOn both target blocker_ids; later wins via insertion
    expect(out.blocker_ids).toBeDefined();
    expect(out.blocking_ids).toEqual(['BL']);
    expect(out.duplicate_ids).toEqual(['D2']);
    expect(out.related_ids).toEqual(['R']);
  });

  it('passes through legacy snake_case names unchanged (identity)', () => {
    const input = {
      title: 't',
      parent_task: 'P',
      subtask_ids: ['A'],
      blocker_ids: ['B'],
      blocking_ids: ['BL'],
      duplicate_ids: ['D'],
      related_ids: ['R'],
    };
    expect(normalizeRelationshipInput(input)).toEqual(input);
  });

  it('drops alias when legacy key is also present (legacy wins)', () => {
    const out = normalizeRelationshipInput({
      parent: 'ALIAS',
      parent_task: 'LEGACY',
      subtasks: ['A'],
      subtask_ids: ['B'],
    });
    expect(out.parent_task).toBe('LEGACY');
    expect(out.subtask_ids).toEqual(['B']);
    expect(out).not.toHaveProperty('parent');
    expect(out).not.toHaveProperty('subtasks');
  });

  it('leaves non-relationship fields untouched', () => {
    const out = normalizeRelationshipInput({
      title: 'x',
      status: 'In Progress',
      priority: 3,
      assignees: ['me'],
      tags: ['x'],
    });
    expect(out).toEqual({
      title: 'x',
      status: 'In Progress',
      priority: 3,
      assignees: ['me'],
      tags: ['x'],
    });
  });

  it('handles empty / non-object input gracefully', () => {
    expect(normalizeRelationshipInput({})).toEqual({});
    // @ts-expect-error - exercising defensive guard
    expect(normalizeRelationshipInput(null)).toBe(null);
    // @ts-expect-error - exercising defensive guard
    expect(normalizeRelationshipInput(undefined)).toBe(undefined);
  });

  it('synonym map covers all 6 relationship dimensions', () => {
    const targets = new Set(Object.values(RELATIONSHIP_INPUT_SYNONYMS));
    expect(targets).toEqual(new Set([
      'parent_task',
      'subtask_ids',
      'blocker_ids',
      'blocking_ids',
      'duplicate_ids',
      'related_ids',
    ]));
  });
});

describe('assertNoPseudoEdgeTags', () => {
  it('passes through plain tags untouched', () => {
    expect(() =>
      assertNoPseudoEdgeTags(['backend', 'v2', 'p0'], TestValidationError)
    ).not.toThrow();
  });

  it('passes through non-array input (handled elsewhere)', () => {
    expect(() => assertNoPseudoEdgeTags(undefined, TestValidationError)).not.toThrow();
    expect(() => assertNoPseudoEdgeTags(null, TestValidationError)).not.toThrow();
    expect(() => assertNoPseudoEdgeTags('not-array' as any, TestValidationError)).not.toThrow();
  });

  it('rejects `needs:X` and points at blocked_by (GitHub Actions bleed-through)', () => {
    expect(() => assertNoPseudoEdgeTags(['needs:T-42'], TestValidationError))
      .toThrow(/blocked_by:.*T-42/);
  });

  it('rejects `blocks:X` and points at blocks', () => {
    expect(() => assertNoPseudoEdgeTags(['blocks:T-99'], TestValidationError))
      .toThrow(/blocks:.*T-99/);
  });

  it('rejects `blocked-by:X` (hyphen variant)', () => {
    expect(() => assertNoPseudoEdgeTags(['blocked-by:foo'], TestValidationError))
      .toThrow(/blocked_by/);
  });

  it('rejects `depends-on:X` and `depends_on:X`', () => {
    expect(() => assertNoPseudoEdgeTags(['depends-on:foo'], TestValidationError))
      .toThrow(/blocked_by/);
    expect(() => assertNoPseudoEdgeTags(['depends_on:bar'], TestValidationError))
      .toThrow(/blocked_by/);
  });

  it('rejects parent / child / subtask / duplicate / related prefixes', () => {
    for (const t of ['parent:P', 'child:C', 'subtask:S', 'duplicate:D', 'related:R']) {
      expect(() => assertNoPseudoEdgeTags([t], TestValidationError)).toThrow();
    }
  });

  it('is case-insensitive on prefix', () => {
    expect(() => assertNoPseudoEdgeTags(['NEEDS:X'], TestValidationError)).toThrow();
    expect(() => assertNoPseudoEdgeTags(['Blocked-By:X'], TestValidationError)).toThrow();
  });

  it('ignores non-string entries quietly (caught by other validators)', () => {
    expect(() =>
      assertNoPseudoEdgeTags(['ok', 42, null, undefined] as any, TestValidationError)
    ).not.toThrow();
  });

  it('reports first violation only (fail-fast)', () => {
    let caught: TestValidationError | undefined;
    try {
      assertNoPseudoEdgeTags(['needs:A', 'blocks:B'], TestValidationError);
    } catch (e) {
      caught = e as TestValidationError;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toContain('needs:A');
    expect(caught!.field).toBe('tags');
  });
});
