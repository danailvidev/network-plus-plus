import { getOperationAST, parse, print } from 'graphql';

import { isGraphQLRequestCandidate } from './detect';
import type { GraphQLInfo, GraphQLOperationType } from './graphql-model';
import type { HeaderRecord } from '../network/request-model';

type GraphQLParseInput = {
  url: string;
  requestHeaders: HeaderRecord;
  requestBody?: string;
  responseBody?: string;
};

type OperationPayload = {
  query?: unknown;
  operationName?: unknown;
  variables?: unknown;
  extensions?: unknown;
};

const isOperationType = (value: string): value is GraphQLOperationType =>
  value === 'query' || value === 'mutation' || value === 'subscription';

const parseJson = (text: string | undefined): unknown => {
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
};

const toOperations = (body: unknown): OperationPayload[] => {
  if (Array.isArray(body)) {
    return body.filter((item): item is OperationPayload => Boolean(item) && typeof item === 'object');
  }

  if (body && typeof body === 'object') {
    return [body as OperationPayload];
  }

  return [];
};

const responseAt = (response: unknown, index: number): unknown => {
  if (Array.isArray(response)) {
    return response[index];
  }

  return response;
};

const extractOperationFromQuery = (query: string, operationName?: string): Pick<GraphQLInfo, 'operationName' | 'operationType' | 'query'> => {
  try {
    const document = parse(query);
    const operation = getOperationAST(document, operationName);
    return {
      operationType: operation && isOperationType(operation.operation) ? operation.operation : undefined,
      operationName: operation?.name?.value ?? operationName,
      query: print(document)
    };
  } catch {
    const match = query.match(/\b(query|mutation|subscription)\s+([_A-Za-z][_0-9A-Za-z]*)?/);
    return {
      operationType: match?.[1] && isOperationType(match[1]) ? match[1] : undefined,
      operationName: operationName ?? match?.[2],
      query
    };
  }
};

const buildOperationInfo = (payload: OperationPayload, response: unknown): GraphQLInfo => {
  const query = typeof payload.query === 'string' ? payload.query : undefined;
  const operationName = typeof payload.operationName === 'string' ? payload.operationName : undefined;
  const responseRecord = response && typeof response === 'object' ? (response as Record<string, unknown>) : {};
  const queryInfo = query ? extractOperationFromQuery(query, operationName) : { operationName };
  const errors = Array.isArray(responseRecord.errors) ? responseRecord.errors : undefined;

  return {
    ...queryInfo,
    variables: payload.variables,
    data: responseRecord.data,
    errors
  };
};

export const parseGraphQLInfo = ({ url, requestHeaders, requestBody, responseBody }: GraphQLParseInput): GraphQLInfo | undefined => {
  if (!isGraphQLRequestCandidate({ url, requestHeaders, requestBody })) {
    return undefined;
  }

  const requestJson = parseJson(requestBody);
  const responseJson = parseJson(responseBody);
  const operations = toOperations(requestJson);

  if (operations.length === 0) {
    return {
      query: requestBody,
      batched: false
    };
  }

  if (operations.length === 1) {
    return buildOperationInfo(operations[0]!, responseJson);
  }

  const nestedOperations = operations.map((operation, index) => buildOperationInfo(operation, responseAt(responseJson, index)));
  const firstOperation = nestedOperations[0];

  return {
    operationType: firstOperation?.operationType,
    operationName: firstOperation?.operationName,
    query: firstOperation?.query,
    variables: firstOperation?.variables,
    data: firstOperation?.data,
    errors: nestedOperations.flatMap((operation) => operation.errors ?? []),
    batched: true,
    operations: nestedOperations
  };
};
