import type { HeaderRecord, QueryParamsRecord, RequestTiming } from './request-model';

export type HarHeader = {
  name: string;
  value: string;
};

export type HarQueryString = {
  name: string;
  value: string;
};

export type HarPostData = {
  mimeType?: string;
  text?: string;
  params?: Array<{ name: string; value?: string; fileName?: string; contentType?: string }>;
};

export type HarRequest = {
  method: string;
  url: string;
  httpVersion?: string;
  headers?: HarHeader[];
  queryString?: HarQueryString[];
  postData?: HarPostData;
  headersSize?: number;
  bodySize?: number;
};

export type HarResponseContent = {
  size?: number;
  compression?: number;
  mimeType?: string;
  text?: string;
  encoding?: string;
};

export type HarResponse = {
  status: number;
  statusText?: string;
  httpVersion?: string;
  headers?: HarHeader[];
  content?: HarResponseContent;
  redirectURL?: string;
  headersSize?: number;
  bodySize?: number;
  _transferSize?: number | null;
  _error?: string;
};

export type HarTimings = {
  blocked?: number;
  dns?: number;
  connect?: number;
  ssl?: number;
  send?: number;
  wait?: number;
  receive?: number;
};

export type HarEntry = {
  startedDateTime: string;
  time?: number;
  request: HarRequest;
  response: HarResponse;
  cache?: unknown;
  timings?: HarTimings;
  serverIPAddress?: string;
  connection?: string;
  pageref?: string;
  _resourceType?: string;
  _initiator?: unknown;
  _priority?: string;
};

export type HarLog = {
  version: string;
  creator: {
    name: string;
    version: string;
  };
  entries: HarEntry[];
};

export type HarArchive = {
  log: HarLog;
};

export const headersToRecord = (headers: HarHeader[] | undefined): HeaderRecord =>
  (headers ?? []).reduce<HeaderRecord>((record, header) => {
    const key = header.name.toLowerCase();
    record[key] = record[key] ? `${record[key]}, ${header.value}` : header.value;
    return record;
  }, {});

export const recordToHeaders = (headers: HeaderRecord): HarHeader[] =>
  Object.entries(headers).map(([name, value]) => ({ name, value }));

export const getHeader = (headers: HeaderRecord, name: string): string | undefined => headers[name.toLowerCase()];

export const queryStringToRecord = (queryString: HarQueryString[] | undefined, url: string): QueryParamsRecord => {
  const params = new URL(url).searchParams;
  const result: QueryParamsRecord = {};

  for (const [name, value] of params.entries()) {
    result[name] = [...(result[name] ?? []), value];
  }

  for (const item of queryString ?? []) {
    if (!result[item.name]?.includes(item.value)) {
      result[item.name] = [...(result[item.name] ?? []), item.value];
    }
  }

  return result;
};

export const getPostDataText = (entry: HarEntry): string | undefined => entry.request.postData?.text;

export const getDurationMs = (entry: HarEntry): number | undefined => {
  if (typeof entry.time === 'number' && Number.isFinite(entry.time) && entry.time >= 0) {
    return entry.time;
  }

  const timingValues = Object.values(entry.timings ?? {}).filter((value): value is number => typeof value === 'number' && value > 0);
  if (timingValues.length === 0) {
    return undefined;
  }

  return timingValues.reduce((total, value) => total + value, 0);
};

export const getSizeBytes = (entry: HarEntry): number | undefined => {
  const candidates = [
    entry.response.content?.size,
    entry.response.bodySize,
    entry.response._transferSize,
    entry.request.bodySize
  ];

  return candidates.find((size): size is number => typeof size === 'number' && Number.isFinite(size) && size >= 0);
};

export const getTiming = (entry: HarEntry): RequestTiming | undefined => {
  if (!entry.timings) {
    return undefined;
  }

  return Object.entries(entry.timings).reduce<RequestTiming>((timing, [key, value]) => {
    if (typeof value === 'number' && value >= 0) {
      timing[key as keyof RequestTiming] = value;
    }

    return timing;
  }, {});
};

export const isCachedResponse = (entry: HarEntry): boolean =>
  entry.response.status === 304 ||
  entry.response._transferSize === 0 ||
  (entry.cache !== undefined && JSON.stringify(entry.cache) !== '{}');

export const inferResourceType = (entry: HarEntry, mimeType: string | undefined): string => {
  if (entry._resourceType) {
    return entry._resourceType;
  }

  const normalizedMime = mimeType?.toLowerCase() ?? '';
  if (normalizedMime.includes('json')) return 'json';
  if (normalizedMime.includes('javascript')) return 'script';
  if (normalizedMime.includes('css')) return 'stylesheet';
  if (normalizedMime.startsWith('image/')) return 'image';
  if (normalizedMime.includes('html')) return 'document';
  if (normalizedMime.includes('font')) return 'font';
  if (normalizedMime.includes('graphql')) return 'graphql';

  return 'other';
};
