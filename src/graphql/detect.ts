import { getHeader } from '../network/har';
import type { HeaderRecord } from '../network/request-model';

type GraphQLCandidateInput = {
  url: string;
  requestHeaders: HeaderRecord;
  requestBody?: string;
};

const GRAPHQL_PATH_PATTERN = /\/(graphql|gql)(\/|$|\?)/i;

export const isGraphQLUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return GRAPHQL_PATH_PATTERN.test(`${parsed.pathname}${parsed.search}`);
  } catch {
    return GRAPHQL_PATH_PATTERN.test(url);
  }
};

export const hasGraphQLContentType = (headers: HeaderRecord): boolean => {
  const contentType = getHeader(headers, 'content-type')?.toLowerCase() ?? '';
  return contentType.includes('application/json') || contentType.includes('application/graphql') || contentType.includes('multipart/form-data');
};

export const bodyLooksLikeGraphQL = (body: string | undefined): boolean => {
  if (!body) {
    return false;
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    const operations = Array.isArray(parsed) ? parsed : [parsed];

    return operations.some((operation) => {
      if (!operation || typeof operation !== 'object') {
        return false;
      }

      const record = operation as Record<string, unknown>;
      return typeof record.query === 'string' || typeof record.operationName === 'string' || record.variables !== undefined;
    });
  } catch {
    return /\b(query|mutation|subscription)\b/.test(body);
  }
};

export const isGraphQLRequestCandidate = ({ url, requestHeaders, requestBody }: GraphQLCandidateInput): boolean =>
  isGraphQLUrl(url) || (hasGraphQLContentType(requestHeaders) && bodyLooksLikeGraphQL(requestBody));
