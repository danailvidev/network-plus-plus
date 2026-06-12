import type { NetworkRequest } from '../network/request-model';
import { redactRequests, type RedactionOptions } from '../privacy/redact';

export const exportRequestsAsJson = (requests: NetworkRequest[], redaction: RedactionOptions): string =>
  JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      count: requests.length,
      redacted: redaction.enabled,
      requests: redactRequests(requests, redaction)
    },
    null,
    2
  );
