/**
 * Fetch Recorder for Snapshot Testing
 *
 * RECORD mode (DART_RECORD=true + DART_TOKEN set):
 *   Intercepts fetch, makes real API calls, saves request/response pairs to cassette files.
 *
 * REPLAY mode (default / CI):
 *   Intercepts fetch, matches requests against saved cassettes, returns recorded responses.
 *
 * Cassettes are JSON files stored in src/api/__cassettes__/ and committed to git.
 * Tokens and sensitive headers are stripped before saving.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CASSETTE_DIR = join(__dirname, '..', '__cassettes__');

export interface RecordedExchange {
  request: {
    method: string;
    /** Path + query string (no host/scheme) */
    endpoint: string;
    body?: unknown;
  };
  response: {
    status: number;
    headers: Record<string, string>;
    body: unknown;
  };
}

export interface Cassette {
  name: string;
  recorded_at: string;
  exchanges: RecordedExchange[];
}

/** Normalize a full URL to just the path+query for matching */
function toEndpoint(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

/** Strip sensitive data from headers */
function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized = { ...headers };
  delete sanitized['authorization'];
  delete sanitized['Authorization'];
  // Keep content-type and other non-sensitive headers
  return sanitized;
}

export function isRecordMode(): boolean {
  return process.env.DART_RECORD === 'true' && !!process.env.DART_TOKEN;
}

/**
 * Load a cassette from disk. Returns null if not found.
 */
function loadCassette(name: string): Cassette | null {
  const path = join(CASSETTE_DIR, `${name}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

/**
 * Save a cassette to disk.
 */
function saveCassette(cassette: Cassette): void {
  if (!existsSync(CASSETTE_DIR)) {
    mkdirSync(CASSETTE_DIR, { recursive: true });
  }
  const path = join(CASSETTE_DIR, `${cassette.name}.json`);
  writeFileSync(path, JSON.stringify(cassette, null, 2) + '\n');
}

/**
 * Create a fetch recorder for a named cassette.
 *
 * Usage in tests:
 * ```ts
 * const recorder = createFetchRecorder('listTasks-with-dartboard');
 * beforeEach(() => recorder.install());
 * afterEach(() => recorder.uninstall());
 * // ... tests run against recorded or live API
 * afterAll(() => recorder.save()); // only writes in RECORD mode
 * ```
 */
export function createFetchRecorder(cassetteName: string) {
  const recording = isRecordMode();
  const cassette: Cassette = recording
    ? { name: cassetteName, recorded_at: new Date().toISOString(), exchanges: [] }
    : loadCassette(cassetteName) ?? { name: cassetteName, recorded_at: '', exchanges: [] };

  let replayIndex = 0;
  let originalFetch: typeof globalThis.fetch | null = null;

  function install() {
    replayIndex = 0;
    originalFetch = globalThis.fetch;

    if (recording) {
      // RECORD: proxy through real fetch, capture response
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as any).url;
        const method = init?.method || 'GET';
        const body = init?.body ? JSON.parse(init.body as string) : undefined;

        // Make the real call
        const response = await originalFetch!(input, init);
        const responseBody = await response.clone().text();
        let parsedBody: unknown;
        try {
          parsedBody = JSON.parse(responseBody);
        } catch {
          parsedBody = responseBody;
        }

        // Collect response headers
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        cassette.exchanges.push({
          request: {
            method,
            endpoint: toEndpoint(url),
            body,
          },
          response: {
            status: response.status,
            headers: sanitizeHeaders(responseHeaders),
            body: parsedBody,
          },
        });

        // Return a fresh response since we consumed the original
        return new Response(responseBody, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      };
    } else {
      // REPLAY: match against cassette exchanges
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as any).url;
        const method = init?.method || 'GET';
        const endpoint = toEndpoint(url);

        // Find matching exchange — try sequential first, then by method+endpoint
        let exchange: RecordedExchange | undefined;
        if (replayIndex < cassette.exchanges.length) {
          const candidate = cassette.exchanges[replayIndex];
          if (candidate.request.method === method && candidate.request.endpoint === endpoint) {
            exchange = candidate;
            replayIndex++;
          }
        }

        if (!exchange) {
          // Fallback: search all exchanges for method+endpoint match
          exchange = cassette.exchanges.find(
            (e) => e.request.method === method && e.request.endpoint === endpoint
          );
        }

        if (!exchange) {
          throw new Error(
            `[fetchRecorder] No cassette match for ${method} ${endpoint} in "${cassetteName}". ` +
            `Available: ${cassette.exchanges.map((e) => `${e.request.method} ${e.request.endpoint}`).join(', ') || '(empty cassette)'}\n` +
            `Run with DART_RECORD=true to record new cassettes.`
          );
        }

        const body = typeof exchange.response.body === 'string'
          ? exchange.response.body
          : JSON.stringify(exchange.response.body);

        return new Response(body, {
          status: exchange.response.status,
          headers: new Headers(exchange.response.headers),
        });
      };
    }
  }

  function uninstall() {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
      originalFetch = null;
    }
  }

  function save() {
    if (recording && cassette.exchanges.length > 0) {
      saveCassette(cassette);
    }
  }

  /** Get the loaded/recorded cassette (for assertions) */
  function getCassette(): Cassette {
    return cassette;
  }

  return { install, uninstall, save, getCassette, isRecording: recording };
}
