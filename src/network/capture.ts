import type { HarArchive, HarEntry } from './har';
import { normalizeHarEntry } from './normalize';
import { isFetchXhrRequest, type NetworkRequest } from './request-model';

type DevtoolsRequest = chrome.devtools.network.Request;

type CaptureOptions = {
  onRequest: (request: NetworkRequest) => void;
  onNavigation?: (url: string) => void;
  onError?: (error: Error) => void;
  shouldCaptureResponseBodies?: () => boolean;
};

const RESPONSE_BODY_TIMEOUT_MS = 2_000;

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
    return id;
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
          responseBody: shouldCaptureResponseBody ? entry.response.content?.text : undefined
        });
        if (normalized.state !== 'pending') {
          this.completedHarEntryKeys.add(key);
        }

        if (isFetchXhrRequest(normalized)) {
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
      const normalizedEntry = normalizeHarEntry(entry, { id: this.idForEntry(entry), includeResponseBody: shouldCaptureResponseBody });

      if (!isFetchXhrRequest(normalizedEntry)) {
        return;
      }

      if (!shouldCaptureResponseBody || !request.getContent) {
        options.onRequest(normalizedEntry);
        return;
      }

      const responseBody = await this.getResponseBodyWithTimeout(request);

      options.onRequest(normalizeHarEntry(entry, { id: normalizedEntry.id, responseBody }));
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
