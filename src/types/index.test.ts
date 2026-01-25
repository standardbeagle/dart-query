/**
 * Type Helper Functions Tests
 *
 * Tests for findDartboard, findStatus, findTag, findFolder
 * to ensure optional chaining handles undefined/null values safely
 */

import { describe, it, expect } from 'vitest';
import {
  findDartboard,
  findStatus,
  findTag,
  findFolder,
  type DartBoard,
  type DartStatus,
  type DartTag,
  type DartFolder,
} from './index.js';

describe('Type helper functions - optional chaining safety', () => {
  describe('findDartboard', () => {
    it('should find dartboard by name', () => {
      const dartboards: DartBoard[] = [
        { dart_id: 'db1', name: 'Engineering' },
        { dart_id: 'db2', name: 'Product' },
      ];

      const result = findDartboard(dartboards, 'Engineering');
      expect(result).toEqual({ dart_id: 'db1', name: 'Engineering' });
    });

    it('should handle undefined name gracefully', () => {
      const dartboards: DartBoard[] = [
        { dart_id: 'db1', name: undefined as any },
        { dart_id: 'db2', name: 'Product' },
      ];

      // Should not throw "Cannot read properties of undefined"
      const result = findDartboard(dartboards, 'Product');
      expect(result).toEqual({ dart_id: 'db2', name: 'Product' });
    });

    it('should handle null dart_id gracefully', () => {
      const dartboards: DartBoard[] = [
        { dart_id: null as any, name: 'Engineering' },
        { dart_id: 'db2', name: 'Product' },
      ];

      // Should not crash on null dart_id
      const result = findDartboard(dartboards, 'Product');
      expect(result).toEqual({ dart_id: 'db2', name: 'Product' });
    });

    it('should be case-insensitive', () => {
      const dartboards: DartBoard[] = [
        { dart_id: 'db1', name: 'Engineering' },
      ];

      const result = findDartboard(dartboards, 'ENGINEERING');
      expect(result).toBeDefined();
    });
  });

  describe('findStatus', () => {
    it('should find status by name', () => {
      const statuses: DartStatus[] = [
        { dart_id: 'st1', name: 'In Progress' },
        { dart_id: 'st2', name: 'Done' },
      ];

      const result = findStatus(statuses, 'In Progress');
      expect(result).toEqual({ dart_id: 'st1', name: 'In Progress' });
    });

    it('should handle undefined name gracefully', () => {
      const statuses: DartStatus[] = [
        { dart_id: 'st1', name: undefined as any },
        { dart_id: 'st2', name: 'Done' },
      ];

      const result = findStatus(statuses, 'Done');
      expect(result).toEqual({ dart_id: 'st2', name: 'Done' });
    });

    it('should handle null dart_id gracefully', () => {
      const statuses: DartStatus[] = [
        { dart_id: null as any, name: 'In Progress' },
        { dart_id: 'st2', name: 'Done' },
      ];

      const result = findStatus(statuses, 'Done');
      expect(result).toEqual({ dart_id: 'st2', name: 'Done' });
    });
  });

  describe('findTag', () => {
    it('should find tag by name', () => {
      const tags: DartTag[] = [
        { dart_id: 'tag1', name: 'urgent' },
        { dart_id: 'tag2', name: 'bug' },
      ];

      const result = findTag(tags, 'urgent');
      expect(result).toEqual({ dart_id: 'tag1', name: 'urgent' });
    });

    it('should handle undefined name gracefully', () => {
      const tags: DartTag[] = [
        { dart_id: 'tag1', name: undefined as any },
        { dart_id: 'tag2', name: 'bug' },
      ];

      const result = findTag(tags, 'bug');
      expect(result).toEqual({ dart_id: 'tag2', name: 'bug' });
    });

    it('should handle null dart_id gracefully', () => {
      const tags: DartTag[] = [
        { dart_id: null as any, name: 'urgent' },
        { dart_id: 'tag2', name: 'bug' },
      ];

      const result = findTag(tags, 'bug');
      expect(result).toEqual({ dart_id: 'tag2', name: 'bug' });
    });

    it('should be case-insensitive', () => {
      const tags: DartTag[] = [
        { dart_id: 'tag1', name: 'urgent' },
      ];

      const result = findTag(tags, 'URGENT');
      expect(result).toBeDefined();
    });
  });

  describe('findFolder', () => {
    it('should find folder by name', () => {
      const folders: DartFolder[] = [
        { dart_id: 'f1', name: 'Work' },
        { dart_id: 'f2', name: 'Personal' },
      ];

      const result = findFolder(folders, 'Work');
      expect(result).toEqual({ dart_id: 'f1', name: 'Work' });
    });

    it('should handle undefined name gracefully', () => {
      const folders: DartFolder[] = [
        { dart_id: 'f1', name: undefined as any },
        { dart_id: 'f2', name: 'Personal' },
      ];

      const result = findFolder(folders, 'Personal');
      expect(result).toEqual({ dart_id: 'f2', name: 'Personal' });
    });

    it('should handle null dart_id gracefully', () => {
      const folders: DartFolder[] = [
        { dart_id: null as any, name: 'Work' },
        { dart_id: 'f2', name: 'Personal' },
      ];

      const result = findFolder(folders, 'Personal');
      expect(result).toEqual({ dart_id: 'f2', name: 'Personal' });
    });
  });

  describe('Edge cases with all undefined/null', () => {
    it('should handle all fields undefined without crashing', () => {
      const dartboards: DartBoard[] = [
        { dart_id: undefined as any, name: undefined as any },
      ];

      // Should not throw error, just return undefined
      const result = findDartboard(dartboards, 'anything');
      expect(result).toBeUndefined();
    });

    it('should handle empty string comparison', () => {
      const tags: DartTag[] = [
        { dart_id: '', name: '' },
        { dart_id: 'tag1', name: 'valid' },
      ];

      const result = findTag(tags, '');
      expect(result).toBeDefined();
    });
  });

  // ==========================================================================
  // String array format tests (API compatibility)
  // ==========================================================================
  // The Dart API returns dartboards, statuses, and tags as plain strings
  // instead of objects with dart_id and name properties. These tests ensure
  // the helper functions handle both formats correctly.

  describe('String array format support (API compatibility)', () => {
    describe('findDartboard with string arrays', () => {
      it('should find dartboard from string array', () => {
        const dartboards: (DartBoard | string)[] = [
          'Personal/work-track',
          'Personal/fit-track',
          'SB Operations/Tasks',
        ];

        const result = findDartboard(dartboards, 'Personal/work-track');
        expect(result).toBe('Personal/work-track');
      });

      it('should find dartboard case-insensitively from string array', () => {
        const dartboards: (DartBoard | string)[] = [
          'Personal/Work-Track',
        ];

        const result = findDartboard(dartboards, 'personal/work-track');
        expect(result).toBe('Personal/Work-Track');
      });

      it('should handle mixed array of strings and objects', () => {
        const dartboards: (DartBoard | string)[] = [
          'Personal/work-track',
          { dart_id: 'db1', name: 'Engineering' },
        ];

        expect(findDartboard(dartboards, 'Personal/work-track')).toBe('Personal/work-track');
        expect(findDartboard(dartboards, 'Engineering')).toEqual({ dart_id: 'db1', name: 'Engineering' });
      });

      it('should return undefined for non-matching string', () => {
        const dartboards: (DartBoard | string)[] = [
          'Personal/work-track',
        ];

        const result = findDartboard(dartboards, 'nonexistent');
        expect(result).toBeUndefined();
      });
    });

    describe('findStatus with string arrays', () => {
      it('should find status from string array', () => {
        const statuses: (DartStatus | string)[] = [
          'To-do',
          'Doing',
          'Done',
        ];

        const result = findStatus(statuses, 'To-do');
        expect(result).toBe('To-do');
      });

      it('should find status case-insensitively from string array', () => {
        const statuses: (DartStatus | string)[] = [
          'In Progress',
        ];

        const result = findStatus(statuses, 'in progress');
        expect(result).toBe('In Progress');
      });

      it('should handle mixed array of strings and objects', () => {
        const statuses: (DartStatus | string)[] = [
          'To-do',
          { dart_id: 'st1', name: 'In Progress' },
        ];

        expect(findStatus(statuses, 'To-do')).toBe('To-do');
        expect(findStatus(statuses, 'In Progress')).toEqual({ dart_id: 'st1', name: 'In Progress' });
      });
    });

    describe('findTag with string arrays', () => {
      it('should find tag from string array', () => {
        const tags: (DartTag | string)[] = [
          'Go',
          'backend',
          'Phase 1',
        ];

        const result = findTag(tags, 'Go');
        expect(result).toBe('Go');
      });

      it('should find tag case-insensitively from string array', () => {
        const tags: (DartTag | string)[] = [
          'Backend',
        ];

        const result = findTag(tags, 'backend');
        expect(result).toBe('Backend');
      });

      it('should handle mixed array of strings and objects', () => {
        const tags: (DartTag | string)[] = [
          'Go',
          { dart_id: 'tag1', name: 'urgent' },
        ];

        expect(findTag(tags, 'Go')).toBe('Go');
        expect(findTag(tags, 'urgent')).toEqual({ dart_id: 'tag1', name: 'urgent' });
      });
    });
  });

  describe('getName helper functions with string arrays', () => {
    it('getDartboardNames should handle string arrays', async () => {
      const { getDartboardNames } = await import('./index.js');
      const dartboards: (DartBoard | string)[] = [
        'Personal/work-track',
        { dart_id: 'db1', name: 'Engineering' },
      ];

      const names = getDartboardNames(dartboards);
      expect(names).toEqual(['Personal/work-track', 'Engineering']);
    });

    it('getStatusNames should handle string arrays', async () => {
      const { getStatusNames } = await import('./index.js');
      const statuses: (DartStatus | string)[] = [
        'To-do',
        { dart_id: 'st1', name: 'In Progress' },
      ];

      const names = getStatusNames(statuses);
      expect(names).toEqual(['To-do', 'In Progress']);
    });

    it('getTagNames should handle string arrays', async () => {
      const { getTagNames } = await import('./index.js');
      const tags: (DartTag | string)[] = [
        'Go',
        { dart_id: 'tag1', name: 'urgent' },
      ];

      const names = getTagNames(tags);
      expect(names).toEqual(['Go', 'urgent']);
    });
  });
});
