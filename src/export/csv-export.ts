import type { NetworkRequest } from '../network/request-model';
import { redactRequests, type RedactionOptions } from '../privacy/redact';

const COLUMNS = [
  'method',
  'status',
  'url',
  'domain',
  'type',
  'sizeBytes',
  'durationMs',
  'cached',
  'failed',
  'graphqlOperationType',
  'graphqlOperationName',
  'tags'
];

const escapeCsvValue = (value: unknown): string => {
  const text = Array.isArray(value) ? value.join('|') : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const requestToRow = (request: NetworkRequest): unknown[] => [
  request.method,
  request.status,
  request.url,
  request.domain,
  request.resourceType,
  request.sizeBytes,
  request.durationMs,
  request.cached,
  request.failed,
  request.graphql?.operationType,
  request.graphql?.operationName,
  request.tags
];

export const exportRequestsAsCsv = (requests: NetworkRequest[], redaction: RedactionOptions): string => {
  const redactedRequests = redactRequests(requests, redaction);
  return [COLUMNS, ...redactedRequests.map(requestToRow)].map((row) => row.map(escapeCsvValue).join(',')).join('\n');
};
