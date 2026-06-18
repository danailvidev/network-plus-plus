import type { NetworkRequest } from '../network/request-model';
import { parseSearchQuery, type ParsedSearchQuery, type SearchToken } from './parser';
import { buildRequestSearchText } from './search-index';

export type FilterChipId =
  | 'all'
  | 'fetch-xhr'
  | 'document'
  | 'script'
  | 'css'
  | 'image'
  | 'json'
  | 'graphql'
  | '2xx'
  | '3xx'
  | '4xx'
  | '5xx'
  | 'pending'
  | 'failed'
  | 'slow'
  | 'large'
  | 'cached'
  | 'preflight';

export type FilterChip = {
  id: FilterChipId;
  label: string;
};

export const FILTER_CHIPS: FilterChip[] = [
  { id: 'all', label: 'All' },
  { id: 'fetch-xhr', label: 'Fetch/XHR' },
  { id: 'document', label: 'Document' },
  { id: 'script', label: 'JS' },
  { id: 'css', label: 'CSS' },
  { id: 'image', label: 'Images' },
  { id: 'json', label: 'JSON' },
  { id: 'graphql', label: 'GraphQL' },
  { id: '2xx', label: '2xx' },
  { id: '3xx', label: '3xx' },
  { id: '4xx', label: '4xx' },
  { id: '5xx', label: '5xx' },
  { id: 'pending', label: 'Pending' },
  { id: 'failed', label: 'Failed' },
  { id: 'slow', label: 'Slow' },
  { id: 'large', label: 'Large' },
  { id: 'cached', label: 'Cached' },
  { id: 'preflight', label: 'Preflight' }
];

const TRUE_VALUES = new Set(['true', 'yes', '1']);
const FALSE_VALUES = new Set(['false', 'no', '0']);

const contains = (source: unknown, value: string): boolean => String(source ?? '').toLowerCase().includes(value.toLowerCase());

const parseDuration = (value: string): number => {
  const normalized = value.trim().toLowerCase();
  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount)) return Number.NaN;
  if (normalized.endsWith('s') && !normalized.endsWith('ms')) return amount * 1000;
  return amount;
};

const parseSize = (value: string): number => {
  const normalized = value.trim().toLowerCase();
  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount)) return Number.NaN;
  if (normalized.endsWith('gb')) return amount * 1024 * 1024 * 1024;
  if (normalized.endsWith('mb')) return amount * 1024 * 1024;
  if (normalized.endsWith('kb')) return amount * 1024;
  return amount;
};

const compareNumber = (actual: number | null | undefined, operator: SearchToken['operator'], expected: number): boolean => {
  if (actual === null || actual === undefined || !Number.isFinite(expected)) {
    return false;
  }

  switch (operator) {
    case '>':
      return actual > expected;
    case '>=':
      return actual >= expected;
    case '<':
      return actual < expected;
    case '<=':
      return actual <= expected;
    case '=':
    case ':':
    default:
      return actual === expected;
  }
};

const compareBoolean = (actual: boolean, value: string): boolean => {
  const normalized = value.toLowerCase();
  if (TRUE_VALUES.has(normalized)) return actual;
  if (FALSE_VALUES.has(normalized)) return !actual;
  return actual;
};

const hasHeader = (headers: Record<string, string>, value: string): boolean =>
  Object.entries(headers).some(([key, headerValue]) => contains(key, value) || contains(headerValue, value));

const hasBodyField = (request: NetworkRequest, value: string): boolean => contains(request.requestBody, value) || contains(request.responseBody, value);

const matchesFieldToken = (request: NetworkRequest, token: SearchToken): boolean => {
  const value = token.value;

  switch (token.field) {
    case 'status':
      if (value.toLowerCase() === 'pending') return request.state === 'pending';
      return compareNumber(request.status, token.operator, Number.parseInt(value, 10));
    case 'method':
      return request.method.toLowerCase() === value.toLowerCase();
    case 'domain':
      return contains(request.domain, value);
    case 'url':
      return contains(request.url, value);
    case 'type':
      return contains(request.resourceType, value) || contains(request.mimeType, value);
    case 'duration':
      return compareNumber(request.durationMs, token.operator, parseDuration(value));
    case 'size':
      return compareNumber(request.sizeBytes, token.operator, parseSize(value));
    case 'header':
      return hasHeader(request.requestHeaders, value) || hasHeader(request.responseHeaders, value);
    case 'request-header':
      return hasHeader(request.requestHeaders, value);
    case 'response-header':
      return hasHeader(request.responseHeaders, value);
    case 'body':
      return hasBodyField(request, value);
    case 'request':
      return contains(request.requestBody, value);
    case 'response':
      return contains(request.responseBody, value);
    case 'error':
      return compareBoolean(request.failed || Boolean(request.graphql?.errors?.length), value);
    case 'cached':
      return compareBoolean(request.cached, value);
    case 'preflight':
      return compareBoolean(request.tags.includes('preflight'), value);
    case 'graphql':
      return compareBoolean(Boolean(request.graphql), value);
    case 'operation':
    case 'gql.type':
      return request.graphql?.operationType === value.toLowerCase();
    case 'operationname':
    case 'gql.name':
      return contains(request.graphql?.operationName, value);
    case 'gql.haserrors':
      return compareBoolean(Boolean(request.graphql?.errors?.length), value);
    case 'gql.batched':
      return compareBoolean(Boolean(request.graphql?.batched), value);
    case 'gql.variable':
      return contains(request.graphql?.variables, value);
    default:
      return buildRequestSearchText(request).includes(value.toLowerCase());
  }
};

const matchesToken = (request: NetworkRequest, token: SearchToken): boolean => {
  const result = token.field ? matchesFieldToken(request, token) : buildRequestSearchText(request).includes(token.value.toLowerCase());
  return token.negated ? !result : result;
};

export const matchesParsedQuery = (request: NetworkRequest, query: ParsedSearchQuery): boolean =>
  query.tokens.every((token) => matchesToken(request, token));

export const matchesSearchQuery = (request: NetworkRequest, rawQuery: string): boolean =>
  matchesParsedQuery(request, parseSearchQuery(rawQuery));

export const matchesFilterChip = (request: NetworkRequest, chip: FilterChipId): boolean => {
  switch (chip) {
    case 'all':
      return true;
    case 'fetch-xhr':
      return ['fetch', 'xhr', 'xmlhttprequest'].includes(request.resourceType?.toLowerCase() ?? '');
    case 'document':
      return request.resourceType === 'document';
    case 'script':
      return request.resourceType === 'script';
    case 'css':
      return request.resourceType === 'stylesheet';
    case 'image':
      return request.resourceType === 'image';
    case 'json':
      return contains(request.mimeType, 'json') || request.resourceType === 'json';
    case 'graphql':
      return Boolean(request.graphql);
    case '2xx':
      return request.status !== null && request.status >= 200 && request.status < 300;
    case '3xx':
      return request.status !== null && request.status >= 300 && request.status < 400;
    case '4xx':
      return request.status !== null && request.status >= 400 && request.status < 500;
    case '5xx':
      return request.status !== null && request.status >= 500;
    case 'pending':
      return request.state === 'pending';
    case 'failed':
      return request.failed;
    case 'slow':
      return request.tags.includes('slow');
    case 'large':
      return request.tags.includes('large');
    case 'cached':
      return request.cached;
    case 'preflight':
      return request.tags.includes('preflight');
    default:
      return true;
  }
};

export const filterRequests = (requests: NetworkRequest[], rawQuery: string, chip: FilterChipId): NetworkRequest[] => {
  const parsedQuery = parseSearchQuery(rawQuery);
  return requests.filter((request) => matchesFilterChip(request, chip) && matchesParsedQuery(request, parsedQuery));
};
