import type { HarArchive, HarEntry } from './har';
import { normalizeHarEntry } from './normalize';
import { isFetchXhrRequest, type NetworkRequest, type ResponseBodyStatus } from './request-model';

type DevtoolsRequest = chrome.devtools.network.Request;

type CaptureOptions = {
  onRequest: (request: NetworkRequest) => void;
  onNavigation?: (url: string) => void;
  onError?: (error: Error) => void;
  shouldCaptureResponseBodies?: () => boolean;
};

const RESPONSE_BODY_TIMEOUT_MS = 2_000;
const MAX_TRACKED_HAR_KEYS = 2_000;

const shouldKeepRequest = (request: NetworkRequest): boolean => {
  if (!isFetchXhrRequest(request) || request.method === 'OPTIONS') {
    return false;
  }

  if (request.state === 'pending' || request.failed || (request.status !== null && request.status >= 400) || request.graphql) {
    return true;
  }

  return Boolean(request.responseBody);
};

const getSkippedResponseBodyStatus = (entry: HarEntry): ResponseBodyStatus => {
  if (entry.request.method.toUpperCase() === 'OPTIONS') {
    return 'skipped-preflight';
  }

  if (entry.response.content?.size === 0 || entry.response.bodySize === 0) {
    return 'empty';
  }

  return 'skipped-non-json';
};

export class DevtoolsNetworkCapture {
  private requestCounter = 0;
  private knownRequestIds = new Map<string, string>();
  private completedHarEntryKeys = new Set<string>();
  private listener?: (request: DevtoolsRequest) => void;
  private navigationListener?: (url: string) => void;

  start(options: CaptureOptions): void {
    if (!this.isAvailable()) {
      options.onError?.(new Error('Chrome DevTools network API is not available.'));
      return;
    }

    this.stop();
    this.listener = (request) => {
      void this.handleFinishedRequest(request, options);
    };

    chrome.devtools.network.onRequestFinished.addListener(this.listener);
    this.navigationListener = (url) => options.onNavigation?.(url);
    chrome.devtools.network.onNavigated.addListener(this.navigationListener);
    void this.loadInitialHar(options);
  }

  stop(): void {
    if (this.listener && this.isAvailable()) {
      chrome.devtools.network.onRequestFinished.removeListener(this.listener);
    }

    if (this.navigationListener && this.isAvailable()) {
      chrome.devtools.network.onNavigated.removeListener(this.navigationListener);
    }

    this.listener = undefined;
    this.navigationListener = undefined;

    this.completedHarEntryKeys.clear();
    this.knownRequestIds.clear();
  }

  private isAvailable(): boolean {
    return typeof chrome !== 'undefined' && Boolean(chrome.devtools?.network);
  }

  private harEntryKey(entry: HarEntry): string {
    const chromeRequestId = (entry as HarEntry & { _requestId?: string; requestId?: string })._requestId ?? (entry as HarEntry & { requestId?: string }).requestId;
    if (chromeRequestId) {
      return chromeRequestId;
    }

    return [
      Date.parse(entry.startedDateTime) || entry.startedDateTime,
      entry.request.method.toUpperCase(),
      entry.request.url,
      entry.request.postData?.text ?? ''
    ].join('\n');
  }

  private idForEntry(entry: HarEntry): string {
    const key = this.harEntryKey(entry);
    const knownId = this.knownRequestIds.get(key);
    if (knownId) {
      return knownId;
    }

    this.requestCounter += 1;
    const id = `${Date.parse(entry.startedDateTime) || Date.now()}:${this.requestCounter}:${entry.request.method}:${entry.request.url}`;
    this.knownRequestIds.set(key, id);
    this.limitTrackedHarState();
    return id;
  }

  private rememberCompletedHarEntryKey(key: string): void {
    this.completedHarEntryKeys.add(key);
    this.limitTrackedHarState();
  }

  private limitTrackedHarState(): void {
    while (this.knownRequestIds.size > MAX_TRACKED_HAR_KEYS) {
      const oldestKey = this.knownRequestIds.keys().next().value;
      if (!oldestKey) {
        break;
      }

      this.knownRequestIds.delete(oldestKey);
    }

    while (this.completedHarEntryKeys.size > MAX_TRACKED_HAR_KEYS) {
      const oldestKey = this.completedHarEntryKeys.keys().next().value;
      if (!oldestKey) {
        break;
      }

      this.completedHarEntryKeys.delete(oldestKey);
    }
  }

  private async loadInitialHar(options: CaptureOptions): Promise<void> {
    try {
      const har = await new Promise<HarArchive['log']>((resolve) => chrome.devtools.network.getHAR((log) => resolve(log as HarArchive['log'])));
      for (const entry of har.entries ?? []) {
        const key = this.harEntryKey(entry);
        if (this.completedHarEntryKeys.has(key)) {
          continue;
        }

        const shouldCaptureResponseBody = (options.shouldCaptureResponseBodies?.() ?? false) && this.isJsonResponse(entry);
        const normalized = normalizeHarEntry(entry, {
          id: this.idForEntry(entry),
          includeResponseBody: shouldCaptureResponseBody,
          responseBody: shouldCaptureResponseBody ? entry.response.content?.text : undefined,
          responseBodyStatus: shouldCaptureResponseBody ? undefined : getSkippedResponseBodyStatus(entry)
        });
        if (normalized.state !== 'pending') {
          this.rememberCompletedHarEntryKey(key);
        }

        if (shouldKeepRequest(normalized)) {
          options.onRequest(normalized);
        }
      }
    } catch (error) {
      options.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async handleFinishedRequest(request: DevtoolsRequest, options: CaptureOptions): Promise<void> {
    try {
      const entry = request as unknown as HarEntry;
      const shouldCaptureResponseBody = (options.shouldCaptureResponseBodies?.() ?? false) && this.isJsonResponse(entry);
      const normalizedEntry = normalizeHarEntry(entry, {
        id: this.idForEntry(entry),
        includeResponseBody: shouldCaptureResponseBody,
        responseBodyStatus: shouldCaptureResponseBody ? undefined : getSkippedResponseBodyStatus(entry)
      });

      if (!isFetchXhrRequest(normalizedEntry) || normalizedEntry.method === 'OPTIONS') {
        return;
      }

      if (!shouldCaptureResponseBody || !request.getContent) {
        if (shouldKeepRequest(normalizedEntry)) {
          options.onRequest(normalizedEntry);
        }
        return;
      }

      const responseBody = await this.getResponseBodyWithTimeout(request);

      const normalizedRequest = normalizeHarEntry(entry, {
        id: normalizedEntry.id,
        responseBody,
        responseBodyStatus: responseBody ? 'captured' : 'empty'
      });
      if (shouldKeepRequest(normalizedRequest)) {
        options.onRequest(normalizedRequest);
      }
    } catch (error) {
      options.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private isJsonResponse(entry: HarEntry): boolean {
    const contentType =
      entry.response.content?.mimeType ??
      entry.response.headers?.find((header) => header.name.toLowerCase() === 'content-type')?.value ??
      '';
    const normalizedContentType = contentType.split(';')[0]?.trim().toLowerCase() ?? '';

    return (
      normalizedContentType === 'application/json' ||
      normalizedContentType.endsWith('+json') ||
      normalizedContentType === 'application/graphql-response+json'
    );
  }

  private async getResponseBodyWithTimeout(request: DevtoolsRequest): Promise<string | undefined> {
    return new Promise((resolve) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        settled = true;
        resolve(undefined);
      }, RESPONSE_BODY_TIMEOUT_MS);

      request.getContent?.((content) => {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timeoutId);
        resolve(content || undefined);
      });
    });
  }
}
