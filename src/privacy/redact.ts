import type { HeaderRecord, NetworkRequest } from '../network/request-model';
import { DEFAULT_SENSITIVE_FIELD_NAMES, REDACTION_PLACEHOLDER } from './sensitive-fields';

export type RedactionOptions = {
  enabled: boolean;
  sensitiveFieldNames?: string[];
};

const normalizeSensitiveNames = (names: string[] = DEFAULT_SENSITIVE_FIELD_NAMES): Set<string> =>
  new Set(names.map((name) => name.toLowerCase()));

const isSensitiveName = (name: string, sensitiveNames: Set<string>): boolean => {
  const normalized = name.toLowerCase();
  return sensitiveNames.has(normalized) || Array.from(sensitiveNames).some((sensitiveName) => normalized.includes(sensitiveName));
};

const redactHeaders = (headers: HeaderRecord, sensitiveNames: Set<string>): HeaderRecord =>
  Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name, isSensitiveName(name, sensitiveNames) ? REDACTION_PLACEHOLDER : value])
  );

const redactJsonValue = (value: unknown, sensitiveNames: Set<string>): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => redactJsonValue(item, sensitiveNames));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        isSensitiveName(key, sensitiveNames) ? REDACTION_PLACEHOLDER : redactJsonValue(item, sensitiveNames)
      ])
    );
  }

  return value;
};

const redactBody = (body: string | undefined, sensitiveNames: Set<string>): string | undefined => {
  if (!body) {
    return body;
  }

  try {
    return JSON.stringify(redactJsonValue(JSON.parse(body) as unknown, sensitiveNames), null, 2);
  } catch {
    return Array.from(sensitiveNames).reduce((redacted, fieldName) => {
      const pattern = new RegExp(`(${fieldName}\\s*[:=]\\s*)([^&\\s,;]+)`, 'gi');
      return redacted.replace(pattern, `$1${REDACTION_PLACEHOLDER}`);
    }, body);
  }
};

export const redactRequest = (request: NetworkRequest, options: RedactionOptions): NetworkRequest => {
  if (!options.enabled) {
    return request;
  }

  const sensitiveNames = normalizeSensitiveNames(options.sensitiveFieldNames);

  return {
    ...request,
    requestHeaders: redactHeaders(request.requestHeaders, sensitiveNames),
    responseHeaders: redactHeaders(request.responseHeaders, sensitiveNames),
    requestBody: redactBody(request.requestBody, sensitiveNames),
    responseBody: redactBody(request.responseBody, sensitiveNames),
    graphql: request.graphql
      ? {
          ...request.graphql,
          variables: redactJsonValue(request.graphql.variables, sensitiveNames)
        }
      : undefined
  };
};

export const redactRequests = (requests: NetworkRequest[], options: RedactionOptions): NetworkRequest[] =>
  requests.map((request) => redactRequest(request, options));
