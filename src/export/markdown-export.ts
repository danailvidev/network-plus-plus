import type { NetworkRequest } from '../network/request-model';
import { redactRequests, type RedactionOptions } from '../privacy/redact';

const formatRequest = (request: NetworkRequest): string => {
  const statusLabel = request.state === 'pending' ? 'pending' : (request.status ?? 'n/a');
  const lines = [
    `### ${request.method} ${request.url}`,
    '',
    `- Status: ${statusLabel} ${request.statusText ?? ''}`.trim(),
    `- Type: ${request.resourceType ?? request.mimeType ?? 'unknown'}`,
    `- Duration: ${request.durationMs?.toFixed(0) ?? 'n/a'} ms`,
    `- Size: ${request.sizeBytes ?? 'n/a'} bytes`,
    `- Tags: ${request.tags.join(', ') || 'none'}`
  ];

  if (request.graphql) {
    lines.push(
      '',
      '#### GraphQL Operation',
      '',
      `- Type: ${request.graphql.operationType ?? 'unknown'}`,
      `- Name: ${request.graphql.operationName ?? 'anonymous'}`,
      `- Has Errors: ${request.graphql.errors?.length ? 'yes' : 'no'}`,
      `- Batched: ${request.graphql.batched ? 'yes' : 'no'}`
    );
  }

  return lines.join('\n');
};

export const exportRequestsAsMarkdown = (requests: NetworkRequest[], redaction: RedactionOptions): string =>
  [`# Network++ Export`, '', `Exported: ${new Date().toISOString()}`, `Requests: ${requests.length}`, '', ...redactRequests(requests, redaction).map(formatRequest)].join(
    '\n'
  );
