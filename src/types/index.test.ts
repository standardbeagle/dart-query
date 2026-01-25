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
});
