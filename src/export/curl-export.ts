import type { NetworkRequest } from '../network/request-model';
import { redactRequest, type RedactionOptions } from '../privacy/redact';

const shellEscape = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;

export const exportRequestAsCurl = (request: NetworkRequest, redaction: RedactionOptions): string => {
  const redacted = redactRequest(request, redaction);
  const parts = ['curl', '-X', shellEscape(redacted.method), shellEscape(redacted.url)];

  for (const [name, value] of Object.entries(redacted.requestHeaders)) {
    parts.push('-H', shellEscape(`${name}: ${value}`));
  }

  if (redacted.requestBody) {
    parts.push('--data-raw', shellEscape(redacted.requestBody));
  }

  return parts.join(' ');
};
