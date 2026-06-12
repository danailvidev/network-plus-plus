import { parseGraphQLInfo } from '../graphql/parse';
import {
  getDurationMs,
  getPostDataText,
  getSizeBytes,
  getTiming,
  headersToRecord,
  inferResourceType,
  isCachedResponse,
  queryStringToRecord,
  type HarEntry
} from './har';
import type { NetworkRequest, NetworkTag } from './request-model';

const SLOW_REQUEST_MS = 500;
const LARGE_RESPONSE_BYTES = 1024 * 1024;

type NormalizeOptions = {
  id?: string;
  responseBody?: string;
  includeResponseBody?: boolean;
};

const createFallbackUrl = (url: string): URL => {
  try {
    return new URL(url);
  } catch {
    return new URL(url, 'https://invalid.local');
  }
};

const deriveStatusTags = (status: number | null): NetworkTag[] => {
  if (status === null) return [];
  if (status >= 200 && status < 300) return ['success'];
  if (status >= 300 && status < 400) return ['redirect'];
  if (status >= 400 && status < 500) return ['client-error'];
  if (status >= 500) return ['server-error'];
  return [];
};

const deriveTags = (request: Omit<NetworkRequest, 'tags'>): NetworkTag[] => {
  const tags = new Set<NetworkTag>(deriveStatusTags(request.status));

  if (request.durationMs !== undefined && request.durationMs > SLOW_REQUEST_MS) tags.add('slow');
  if (request.sizeBytes !== undefined && request.sizeBytes > LARGE_RESPONSE_BYTES) tags.add('large');
  if (request.graphql) tags.add('graphql');
  if (request.cached) tags.add('cached');
  if (request.failed) tags.add('failed');
  if (request.method.toUpperCase() === 'OPTIONS') tags.add('preflight');

  return Array.from(tags);
};

const buildRequestId = (entry: HarEntry): string => {
  const method = entry.request.method.toUpperCase();
  const started = Date.parse(entry.startedDateTime) || Date.now();
  return `${started}:${method}:${entry.request.url}:${entry.time ?? 0}`;
};

export const normalizeHarEntry = (entry: HarEntry, options: NormalizeOptions = {}): NetworkRequest => {
  const parsedUrl = createFallbackUrl(entry.request.url);
  const requestHeaders = headersToRecord(entry.request.headers);
  const responseHeaders = headersToRecord(entry.response.headers);
  const requestBody = getPostDataText(entry);
  const responseBody = options.includeResponseBody === false ? undefined : options.responseBody ?? entry.response.content?.text;
  const mimeType = entry.response.content?.mimeType ?? entry.request.postData?.mimeType;
  const durationMs = getDurationMs(entry);
  const sizeBytes = getSizeBytes(entry);
  const status = Number.isFinite(entry.response.status) && entry.response.status > 0 ? entry.response.status : null;
  const failed = status === null || Boolean(entry.response._error);
  const graphql = parseGraphQLInfo({
    url: entry.request.url,
    requestHeaders,
    requestBody,
    responseBody
  });

  const withoutTags: Omit<NetworkRequest, 'tags'> = {
    id: options.id ?? buildRequestId(entry),
    url: entry.request.url,
    method: entry.request.method.toUpperCase(),
    status,
    statusText: entry.response.statusText,
    domain: parsedUrl.hostname,
    path: `${parsedUrl.pathname}${parsedUrl.search}`,
    queryParams: queryStringToRecord(entry.request.queryString, parsedUrl.href),
    requestHeaders,
    responseHeaders,
    requestBody,
    responseBody,
    mimeType,
    resourceType: inferResourceType(entry, mimeType),
    startTime: Date.parse(entry.startedDateTime) || Date.now(),
    durationMs,
    sizeBytes,
    cached: isCachedResponse(entry),
    failed,
    graphql,
    timing: getTiming(entry),
    rawHarEntry: entry
  };

  return {
    ...withoutTags,
    tags: deriveTags(withoutTags)
  };
};
