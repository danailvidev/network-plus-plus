import type { NetworkRequest } from '../network/request-model';
import { redactRequests, type RedactionOptions } from '../privacy/redact';

const methodFor = (method: string): string => {
  const normalized = method.toLowerCase();
  return ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(normalized) ? normalized : 'all';
};

const jsString = (value: string): string => JSON.stringify(value);

const responseBodyFor = (request: NetworkRequest): string => {
  if (!request.responseBody) {
    return 'null';
  }

  try {
    return JSON.stringify(JSON.parse(request.responseBody) as unknown, null, 2);
  } catch {
    return jsString(request.responseBody);
  }
};

const responseFactoryFor = (request: NetworkRequest): string => {
  const status = request.status ?? 500;
  const headers = JSON.stringify(request.responseHeaders, null, 2);
  const body = responseBodyFor(request);
  const isJson = request.mimeType?.includes('json') || request.responseHeaders['content-type']?.includes('json');

  if (isJson) {
    return `HttpResponse.json(${body}, { status: ${status}, headers: ${headers} })`;
  }

  return `new HttpResponse(${body}, { status: ${status}, headers: ${headers} })`;
};

export const exportRequestsAsMsw = (requests: NetworkRequest[], redaction: RedactionOptions): string => {
  const seen = new Set<string>();
  const handlers = redactRequests(requests, redaction)
    .filter((request) => {
      const key = `${request.method}:${request.url}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .map((request) => `  http.${methodFor(request.method)}(${jsString(request.url)}, () => ${responseFactoryFor(request)})`);

  return [
    `import { http, HttpResponse } from 'msw';`,
    '',
    'export const handlers = [',
    handlers.join(',\n'),
    '];',
    ''
  ].join('\n');
};
