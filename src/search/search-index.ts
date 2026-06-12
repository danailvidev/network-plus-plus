import type { NetworkRequest } from '../network/request-model';

const stringify = (value: unknown): string => {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export const buildRequestSearchText = (request: NetworkRequest): string =>
  [
    request.url,
    request.domain,
    request.path,
    request.method,
    request.status,
    request.statusText,
    request.mimeType,
    request.resourceType,
    request.requestBody,
    request.responseBody,
    Object.entries(request.queryParams)
      .map(([key, values]) => `${key} ${values.join(' ')}`)
      .join(' '),
    Object.entries(request.requestHeaders)
      .map(([key, value]) => `${key} ${value}`)
      .join(' '),
    Object.entries(request.responseHeaders)
      .map(([key, value]) => `${key} ${value}`)
      .join(' '),
    request.tags.join(' '),
    request.graphql?.operationName,
    request.graphql?.operationType,
    stringify(request.graphql?.variables),
    stringify(request.graphql?.errors)
  ]
    .filter((value) => value !== undefined && value !== null && value !== '')
    .join(' ')
    .toLowerCase();
