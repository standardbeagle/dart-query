/**
 * Dart API Client
 *
 * Core HTTP client for interacting with Dart AI API.
 * Handles authentication, error mapping, and retry logic.
 */

import pRetry from 'p-retry';
import {
  DartAPIError,
  DartTask,
  DartConfig,
  DartDoc,
  CreateTaskInput,
  UpdateTaskInput,
  ListTasksInput,
} from '../types/index.js';

/**
 * Configuration for DartClient
 */
export interface DartClientConfig {
  token: string;
  baseUrl?: string;
}

/**
 * Raw API response types
 */
interface DartAPIResponse<T> {
  data?: T;
  error?: {
    message: string;
    code?: string;
  };
}

/**
 * DartClient - Core API client for Dart AI
 *
 * Features:
 * - Token-based authentication
 * - Automatic retry for rate limits (429)
 * - Structured error handling
 * - Type-safe request methods
 */
export class DartClient {
  private readonly token: string;
  private readonly baseUrl: string;

  constructor(config: DartClientConfig) {
    // Validate token format
    if (!config.token) {
      throw new DartAPIError(
        'DART_TOKEN is required. Get your token from: https://app.dartai.com/?settings=account',
        400
      );
    }

    // Trim whitespace from token (common copy-paste issue)
    const trimmedToken = config.token.trim();

    if (!trimmedToken.startsWith('dsa_')) {
      throw new DartAPIError(
        'DART_TOKEN must start with "dsa_". Check your token format at: https://app.dartai.com/?settings=account',
        400
      );
    }

    this.token = trimmedToken;
    this.baseUrl = config.baseUrl || 'https://app.dartai.com/api/v0/public';
  }

  /**
   * Private request method - handles authentication, errors, and retries
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    // Retry logic for rate limiting (429 errors)
    const executeRequest = async (): Promise<T> => {
      let response: Response;

      try {
        response = await fetch(url, {
          method,
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (error) {
        // Network errors, DNS failures, etc.
        throw new DartAPIError(
          `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          0
        );
      }

      // Handle HTTP errors
      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      // Handle empty responses (e.g., 204 No Content)
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        // For non-JSON responses, return empty object if successful
        return {} as T;
      }

      const text = await response.text();
      if (!text) {
        return {} as T;
      }

      // Parse successful response
      let data: DartAPIResponse<T>;
      try {
        data = JSON.parse(text) as DartAPIResponse<T>;
      } catch (error) {
        throw new DartAPIError(
          `Failed to parse JSON response: ${error instanceof Error ? error.message : 'Unknown error'}`,
          response.status
        );
      }

      // Check for API-level errors
      if (data.error) {
        throw new DartAPIError(
          data.error.message,
          response.status,
          data
        );
      }

      // Return data field if present, otherwise return entire response
      return (data.data !== undefined ? data.data : data) as T;
    };

    // Retry only on 429 (rate limit) errors
    return pRetry(executeRequest, {
      retries: 5,
      onFailedAttempt: (error) => {
        if (error instanceof DartAPIError && error.statusCode === 429) {
          // Rate limit hit - retry with exponential backoff
          const retryAfter = error.response && typeof error.response === 'object' && 'retry_after' in error.response
            ? (error.response as { retry_after?: number }).retry_after
            : undefined;

          console.error(
            `Rate limit hit (attempt ${error.attemptNumber}/6). ` +
            (retryAfter ? `Retrying after ${retryAfter}s` : 'Retrying with exponential backoff...')
          );
        } else {
          // Non-retryable error - throw immediately
          throw error;
        }
      },
      minTimeout: 1000,
      maxTimeout: 30000,
      factor: 2,
    });
  }

  /**
   * Map HTTP status codes to appropriate error messages
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorData: DartAPIResponse<unknown> = {};
    let errorMessage = response.statusText || 'Unknown error';

    // Try to extract error details from response body
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      try {
        const text = await response.text();
        if (text) {
          errorData = JSON.parse(text) as DartAPIResponse<unknown>;
          errorMessage = errorData.error?.message || errorMessage;
        }
      } catch {
        // Failed to parse error response - use status text
      }
    }

    switch (response.status) {
      case 400:
        throw new DartAPIError(
          `Bad Request: ${errorMessage}`,
          400,
          errorData
        );

      case 401:
        throw new DartAPIError(
          `Unauthorized: Invalid or expired token. ${errorMessage}`,
          401,
          errorData
        );

      case 403:
        throw new DartAPIError(
          `Forbidden: Insufficient permissions. ${errorMessage}`,
          403,
          errorData
        );

      case 404:
        throw new DartAPIError(
          `Not Found: ${errorMessage}`,
          404,
          errorData
        );

      case 429:
        throw new DartAPIError(
          `Rate Limit Exceeded: ${errorMessage}`,
          429,
          errorData
        );

      case 500:
        throw new DartAPIError(
          `Internal Server Error: ${errorMessage}`,
          500,
          errorData
        );

      case 502:
        throw new DartAPIError(
          `Bad Gateway: ${errorMessage}`,
          502,
          errorData
        );

      case 503:
        throw new DartAPIError(
          `Service Unavailable: ${errorMessage}`,
          503,
          errorData
        );

      default:
        throw new DartAPIError(
          `HTTP ${response.status}: ${errorMessage}`,
          response.status,
          errorData
        );
    }
  }

  /**
   * Get workspace configuration
   * Returns assignees, dartboards, statuses, tags, priorities, sizes, folders
   */
  async getConfig(): Promise<DartConfig> {
    return this.request<DartConfig>('GET', '/config');
  }

  /**
   * Create a new task
   */
  async createTask(input: CreateTaskInput): Promise<DartTask> {
    if (!input.title || typeof input.title !== 'string' || input.title.trim() === '') {
      throw new DartAPIError('title is required and must be a non-empty string', 400);
    }
    if (!input.dartboard || typeof input.dartboard !== 'string' || input.dartboard.trim() === '') {
      throw new DartAPIError('dartboard is required and must be a non-empty string', 400);
    }

    // Convert field names to match API: snake_case → camelCase
    const apiInput: Record<string, unknown> = {
      title: input.title,
      dartboard: input.dartboard,
    };

    if (input.description) apiInput.description = input.description;
    if (input.status) apiInput.status = input.status;
    if (input.priority !== undefined) apiInput.priority = input.priority;
    if (input.size !== undefined) apiInput.size = input.size;
    if (input.assignees) apiInput.assignees = input.assignees;
    if (input.tags) apiInput.tags = input.tags;
    if (input.due_at) apiInput.dueAt = input.due_at;
    if (input.start_at) apiInput.startAt = input.start_at;
    if (input.parent_task) apiInput.parentId = input.parent_task;

    // Relationship fields: snake_case → camelCase
    if (input.subtask_ids !== undefined) apiInput.subtaskIds = input.subtask_ids;
    if (input.blocker_ids !== undefined) apiInput.blockerIds = input.blocker_ids;
    if (input.blocking_ids !== undefined) apiInput.blockingIds = input.blocking_ids;
    if (input.duplicate_ids !== undefined) apiInput.duplicateIds = input.duplicate_ids;
    if (input.related_ids !== undefined) apiInput.relatedIds = input.related_ids;

    // Wrap in item object as required by API
    const response = await this.request<{ item: any }>('POST', '/tasks', { item: apiInput });
    return this.mapTaskResponse(response.item);
  }

  /**
   * List tasks with optional filters
   */
  async listTasks(input?: ListTasksInput): Promise<{ tasks: DartTask[]; total: number }> {
    const queryParams = new URLSearchParams();

    if (input) {
      if (input.assignee) queryParams.append('assignee', input.assignee);
      if (input.status) queryParams.append('status', input.status);
      if (input.dartboard) queryParams.append('dartboard', input.dartboard);
      if (input.priority !== undefined) queryParams.append('priority', input.priority.toString());
      if (input.tags) input.tags.forEach(tag => queryParams.append('tags', tag));
      if (input.due_before) queryParams.append('due_before', input.due_before);
      if (input.due_after) queryParams.append('due_after', input.due_after);
      if (input.limit !== undefined) queryParams.append('limit', input.limit.toString());
      if (input.offset !== undefined) queryParams.append('offset', input.offset.toString());
      if (input.detail_level) queryParams.append('detail_level', input.detail_level);
    }

    const query = queryParams.toString();
    const endpoint = query ? `/tasks/list?${query}` : '/tasks/list';

    const response = await this.request<{ count: number; results: any[] }>('GET', endpoint);

    // Map API response using helper function
    const tasks = (response.results || []).map((task: any) => this.mapTaskResponse(task));

    return {
      tasks,
      total: response.count || 0
    };
  }

  /**
   * Map API task response to DartTask with snake_case field names
   * Converts camelCase API fields to snake_case for consistency
   */
  private mapTaskResponse(task: any): DartTask {
    return {
      ...task,
      dart_id: task.id || task.dart_id,
      created_at: task.createdAt || task.created_at,
      updated_at: task.updatedAt || task.updated_at,
      due_at: task.dueAt ?? task.due_at,
      start_at: task.startAt ?? task.start_at,
      completed_at: task.completedAt ?? task.completed_at,
      // Relationship fields: camelCase → snake_case
      parent_task: task.parentId ?? task.parent_task,
      subtask_ids: task.subtaskIds ?? task.subtask_ids ?? [],
      blocker_ids: task.blockerIds ?? task.blocker_ids ?? [],
      blocking_ids: task.blockingIds ?? task.blocking_ids ?? [],
      duplicate_ids: task.duplicateIds ?? task.duplicate_ids ?? [],
      related_ids: task.relatedIds ?? task.related_ids ?? [],
    };
  }

  /**
   * Get a specific task by ID
   */
  async getTask(dartId: string): Promise<DartTask> {
    if (!dartId || typeof dartId !== 'string' || dartId.trim() === '') {
      throw new DartAPIError('dart_id is required and must be a non-empty string', 400);
    }
    const response = await this.request<{ item: any }>('GET', `/tasks/${encodeURIComponent(dartId.trim())}`);
    return this.mapTaskResponse(response.item);
  }

  /**
   * Update a task
   */
  async updateTask(input: UpdateTaskInput): Promise<DartTask> {
    if (!input.dart_id || typeof input.dart_id !== 'string' || input.dart_id.trim() === '') {
      throw new DartAPIError('dart_id is required and must be a non-empty string', 400);
    }
    if (!input.updates || typeof input.updates !== 'object' || Object.keys(input.updates).length === 0) {
      throw new DartAPIError('updates is required and must be a non-empty object', 400);
    }
    const { dart_id, updates } = input;

    // Convert field names: snake_case → camelCase
    const apiUpdates: Record<string, unknown> = {
      id: dart_id.trim(), // Required by API
    };

    if (updates.title !== undefined) apiUpdates.title = updates.title;
    if (updates.description !== undefined) apiUpdates.description = updates.description;
    if (updates.dartboard !== undefined) apiUpdates.dartboard = updates.dartboard;
    if (updates.status !== undefined) apiUpdates.status = updates.status;
    if (updates.priority !== undefined) apiUpdates.priority = updates.priority;
    if (updates.size !== undefined) apiUpdates.size = updates.size;
    if (updates.assignees !== undefined) apiUpdates.assignees = updates.assignees;
    if (updates.tags !== undefined) apiUpdates.tags = updates.tags;
    if (updates.due_at !== undefined) apiUpdates.dueAt = updates.due_at;
    if (updates.start_at !== undefined) apiUpdates.startAt = updates.start_at;
    if (updates.parent_task !== undefined) apiUpdates.parentId = updates.parent_task;

    // Relationship fields: snake_case → camelCase
    if (updates.subtask_ids !== undefined) apiUpdates.subtaskIds = updates.subtask_ids;
    if (updates.blocker_ids !== undefined) apiUpdates.blockerIds = updates.blocker_ids;
    if (updates.blocking_ids !== undefined) apiUpdates.blockingIds = updates.blocking_ids;
    if (updates.duplicate_ids !== undefined) apiUpdates.duplicateIds = updates.duplicate_ids;
    if (updates.related_ids !== undefined) apiUpdates.relatedIds = updates.related_ids;

    // Wrap updates in item object as required by API
    const response = await this.request<{ item: any }>('PUT', `/tasks/${encodeURIComponent(dart_id.trim())}`, { item: apiUpdates });
    return this.mapTaskResponse(response.item);
  }

  /**
   * Delete a task
   */
  async deleteTask(dartId: string): Promise<{ success: boolean; dart_id: string }> {
    if (!dartId || typeof dartId !== 'string' || dartId.trim() === '') {
      throw new DartAPIError('dart_id is required and must be a non-empty string', 400);
    }
    const response = await this.request<{ item: DartTask }>('DELETE', `/tasks/${encodeURIComponent(dartId.trim())}`);
    // API returns the deleted task wrapped in item, we return success confirmation
    return {
      success: true,
      dart_id: (response.item as any).id || dartId
    };
  }

  /**
   * List documents with optional filters
   */
  async listDocs(input?: {
    folder?: string;
    title_contains?: string;
    text_contains?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ docs: DartDoc[]; total: number }> {
    const queryParams = new URLSearchParams();

    if (input) {
      if (input.folder) queryParams.append('folder', input.folder);
      if (input.title_contains) queryParams.append('title_contains', input.title_contains);
      if (input.text_contains) queryParams.append('text_contains', input.text_contains);
      if (input.limit !== undefined) queryParams.append('limit', input.limit.toString());
      if (input.offset !== undefined) queryParams.append('offset', input.offset.toString());
    }

    const query = queryParams.toString();
    const endpoint = query ? `/docs?${query}` : '/docs';

    return this.request<{ docs: DartDoc[]; total: number }>('GET', endpoint);
  }

  /**
   * Create a new document
   */
  async createDoc(input: { title: string; text: string; folder?: string }): Promise<DartDoc> {
    if (!input.title || typeof input.title !== 'string' || input.title.trim() === '') {
      throw new DartAPIError('title is required and must be a non-empty string', 400);
    }
    if (!input.text || typeof input.text !== 'string') {
      throw new DartAPIError('text is required and must be a string', 400);
    }
    return this.request<DartDoc>('POST', '/docs', input);
  }

  /**
   * Get a specific document by ID
   */
  async getDoc(docId: string): Promise<DartDoc> {
    if (!docId || typeof docId !== 'string' || docId.trim() === '') {
      throw new DartAPIError('doc_id is required and must be a non-empty string', 400);
    }
    return this.request<DartDoc>('GET', `/docs/${encodeURIComponent(docId.trim())}`);
  }

  /**
   * Update a document
   */
  async updateDoc(input: {
    doc_id: string;
    updates: { title?: string; text?: string; folder?: string };
  }): Promise<DartDoc> {
    if (!input.doc_id || typeof input.doc_id !== 'string' || input.doc_id.trim() === '') {
      throw new DartAPIError('doc_id is required and must be a non-empty string', 400);
    }
    if (!input.updates || typeof input.updates !== 'object' || Object.keys(input.updates).length === 0) {
      throw new DartAPIError('updates is required and must be a non-empty object', 400);
    }
    const { doc_id, updates } = input;
    return this.request<DartDoc>('PATCH', `/docs/${encodeURIComponent(doc_id.trim())}`, updates);
  }

  /**
   * Delete a document
   */
  async deleteDoc(docId: string): Promise<{ success: boolean; doc_id: string }> {
    if (!docId || typeof docId !== 'string' || docId.trim() === '') {
      throw new DartAPIError('doc_id is required and must be a non-empty string', 400);
    }
    return this.request<{ success: boolean; doc_id: string }>('DELETE', `/docs/${encodeURIComponent(docId.trim())}`);
  }

  /**
   * Add a comment to a task
   */
  async addComment(dartId: string, text: string): Promise<{
    comment_id: string;
    dart_id: string;
    text: string;
    author: { dart_id: string; name: string };
    created_at: string;
  }> {
    if (!dartId || typeof dartId !== 'string' || dartId.trim() === '') {
      throw new DartAPIError('dart_id is required and must be a non-empty string', 400);
    }
    if (!text || typeof text !== 'string' || text.trim() === '') {
      throw new DartAPIError('text is required and must be a non-empty string', 400);
    }
    return this.request<{
      comment_id: string;
      dart_id: string;
      text: string;
      author: { dart_id: string; name: string };
      created_at: string;
    }>('POST', `/tasks/${encodeURIComponent(dartId.trim())}/comments`, { text });
  }

  /**
   * List comments on a task
   */
  async listComments(input: {
    task_id: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    comments: Array<{
      comment_id: string;
      text: string;
      author: { dart_id: string; name: string };
      created_at: string;
      parent_id?: string;
    }>;
    total: number;
  }> {
    if (!input.task_id || typeof input.task_id !== 'string' || input.task_id.trim() === '') {
      throw new DartAPIError('task_id is required and must be a non-empty string', 400);
    }

    const queryParams = new URLSearchParams();
    queryParams.append('task', input.task_id.trim());
    if (input.limit !== undefined) queryParams.append('limit', input.limit.toString());
    if (input.offset !== undefined) queryParams.append('offset', input.offset.toString());

    const response = await this.request<{ count: number; results: any[] }>(
      'GET',
      `/comments/list?${queryParams.toString()}`
    );

    return {
      comments: (response.results || []).map((c: any) => ({
        comment_id: c.id || c.comment_id,
        text: c.text,
        author: c.author || { dart_id: '', name: 'Unknown' },
        created_at: c.publishedAt || c.created_at,
        parent_id: c.parentId || c.parent_id,
      })),
      total: response.count || 0,
    };
  }

  /**
   * Move/reposition a task within a dartboard
   */
  async moveTask(input: {
    dart_id: string;
    dartboard?: string;
    order?: number;
    after_id?: string;
    before_id?: string;
  }): Promise<DartTask> {
    if (!input.dart_id || typeof input.dart_id !== 'string' || input.dart_id.trim() === '') {
      throw new DartAPIError('dart_id is required and must be a non-empty string', 400);
    }

    const apiInput: Record<string, unknown> = {};
    if (input.dartboard !== undefined) apiInput.dartboard = input.dartboard;
    if (input.order !== undefined) apiInput.order = input.order;
    if (input.after_id !== undefined) apiInput.afterId = input.after_id;
    if (input.before_id !== undefined) apiInput.beforeId = input.before_id;

    const response = await this.request<{ item: any }>(
      'POST',
      `/tasks/${encodeURIComponent(input.dart_id.trim())}/move`,
      apiInput
    );
    return this.mapTaskResponse(response.item);
  }

  /**
   * Add time tracking entry to a task
   */
  async addTimeTracking(input: {
    dart_id: string;
    started_at: string;
    finished_at?: string;
    duration_minutes?: number;
    note?: string;
  }): Promise<{
    entry_id: string;
    dart_id: string;
    started_at: string;
    finished_at?: string;
    duration_minutes: number;
    note?: string;
  }> {
    if (!input.dart_id || typeof input.dart_id !== 'string' || input.dart_id.trim() === '') {
      throw new DartAPIError('dart_id is required and must be a non-empty string', 400);
    }
    if (!input.started_at || typeof input.started_at !== 'string') {
      throw new DartAPIError('started_at is required and must be an ISO8601 string', 400);
    }

    const apiInput: Record<string, unknown> = {
      startedAt: input.started_at,
    };
    if (input.finished_at !== undefined) apiInput.finishedAt = input.finished_at;
    if (input.duration_minutes !== undefined) apiInput.durationMinutes = input.duration_minutes;
    if (input.note !== undefined) apiInput.note = input.note;

    const response = await this.request<{ item: any }>(
      'POST',
      `/tasks/${encodeURIComponent(input.dart_id.trim())}/time-tracking`,
      apiInput
    );

    return {
      entry_id: response.item?.id || '',
      dart_id: input.dart_id,
      started_at: response.item?.startedAt || input.started_at,
      finished_at: response.item?.finishedAt,
      duration_minutes: response.item?.durationMinutes || input.duration_minutes || 0,
      note: response.item?.note,
    };
  }

  /**
   * Attach a file from URL to a task
   */
  async attachUrl(input: {
    dart_id: string;
    url: string;
    filename?: string;
  }): Promise<{
    attachment_id: string;
    dart_id: string;
    url: string;
    filename: string;
  }> {
    if (!input.dart_id || typeof input.dart_id !== 'string' || input.dart_id.trim() === '') {
      throw new DartAPIError('dart_id is required and must be a non-empty string', 400);
    }
    if (!input.url || typeof input.url !== 'string' || input.url.trim() === '') {
      throw new DartAPIError('url is required and must be a non-empty string', 400);
    }

    const apiInput: Record<string, unknown> = {
      url: input.url,
    };
    if (input.filename !== undefined) apiInput.filename = input.filename;

    const response = await this.request<{ item: any }>(
      'POST',
      `/tasks/${encodeURIComponent(input.dart_id.trim())}/attachments/from-url`,
      apiInput
    );

    return {
      attachment_id: response.item?.id || '',
      dart_id: input.dart_id,
      url: response.item?.url || input.url,
      filename: response.item?.filename || input.filename || '',
    };
  }

  /**
   * Get dartboard details
   */
  async getDartboard(dartboardId: string): Promise<{
    dart_id: string;
    name: string;
    description?: string;
    task_count?: number;
  }> {
    if (!dartboardId || typeof dartboardId !== 'string' || dartboardId.trim() === '') {
      throw new DartAPIError('dartboard_id is required and must be a non-empty string', 400);
    }

    const response = await this.request<{ item: any }>(
      'GET',
      `/dartboards/${encodeURIComponent(dartboardId.trim())}`
    );

    return {
      dart_id: response.item?.id || dartboardId,
      name: response.item?.title || response.item?.name || '',
      description: response.item?.description,
      task_count: response.item?.taskCount,
    };
  }

  /**
   * Get folder with contained docs
   */
  async getFolder(folderId: string): Promise<{
    dart_id: string;
    name: string;
    doc_count?: number;
  }> {
    if (!folderId || typeof folderId !== 'string' || folderId.trim() === '') {
      throw new DartAPIError('folder_id is required and must be a non-empty string', 400);
    }

    const response = await this.request<{ item: any }>(
      'GET',
      `/folders/${encodeURIComponent(folderId.trim())}`
    );

    return {
      dart_id: response.item?.id || folderId,
      name: response.item?.title || response.item?.name || '',
      doc_count: response.item?.docCount,
    };
  }
}
