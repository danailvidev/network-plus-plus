import type { HarArchive, HarEntry } from '../network/har';
import { recordToHeaders } from '../network/har';
import type { NetworkRequest } from '../network/request-model';
import { redactRequests, type RedactionOptions } from '../privacy/redact';

const requestToHarEntry = (request: NetworkRequest): HarEntry => ({
  startedDateTime: new Date(request.startTime).toISOString(),
  time: request.durationMs ?? 0,
  request: {
    method: request.method,
    url: request.url,
    httpVersion: 'HTTP/1.1',
    headers: recordToHeaders(request.requestHeaders),
    queryString: Object.entries(request.queryParams).flatMap(([name, values]) => values.map((value) => ({ name, value }))),
    postData: request.requestBody
      ? {
          mimeType: request.requestHeaders['content-type'],
          text: request.requestBody
        }
      : undefined,
    headersSize: -1,
    bodySize: request.requestBody?.length ?? 0
  },
  response: {
    status: request.status ?? 0,
    statusText: request.statusText ?? '',
    httpVersion: 'HTTP/1.1',
    headers: recordToHeaders(request.responseHeaders),
    content: {
      size: request.sizeBytes ?? request.responseBody?.length ?? 0,
      mimeType: request.mimeType ?? 'application/octet-stream',
      text: request.responseBody
    },
    redirectURL: '',
    headersSize: -1,
    bodySize: request.sizeBytes ?? request.responseBody?.length ?? 0
  },
  cache: {},
  timings: request.timing ?? {},
  _resourceType: request.resourceType
});

export const exportRequestsAsHar = (requests: NetworkRequest[], redaction: RedactionOptions): string => {
  const archive: HarArchive = {
    log: {
      version: '1.2',
      creator: {
        name: 'Network++',
        version: '0.1.0'
      },
      entries: redactRequests(requests, redaction).map(requestToHarEntry)
    }
  };

  return JSON.stringify(archive, null, 2);
};
