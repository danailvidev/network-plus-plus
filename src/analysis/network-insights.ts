import type { GraphQLInfo } from '../graphql/graphql-model';
import type { NetworkRequest } from '../network/request-model';

export type DuplicateRequestGroup = {
  key: string;
  method: string;
  path: string;
  domain: string;
  count: number;
  requestIds: string[];
  avgDurationMs?: number;
  latestStartTime: number;
};

export type GraphQLOperationStat = {
  key: string;
  operationName: string;
  operationType: string;
  count: number;
  errorCount: number;
  batchedCount: number;
  avgDurationMs?: number;
  maxDurationMs?: number;
};

export type ErrorCluster = {
  key: string;
  method: string;
  path: string;
  domain: string;
  status: string;
  message: string;
  count: number;
  requestIds: string[];
};

export type EndpointPerformanceStat = {
  key: string;
  method: string;
  path: string;
  domain: string;
  count: number;
  avgDurationMs: number;
  maxDurationMs: number;
};

export type SensitiveFinding = {
  key: string;
  requestId: string;
  path: string;
  kind: string;
  location: string;
};

export type CacheInsight = {
  key: string;
  requestId: string;
  path: string;
  message: string;
};

export type SchemaDriftInsight = {
  key: string;
  method: string;
  path: string;
  domain: string;
  variants: number;
  requestIds: string[];
};

export type NetworkInsights = {
  duplicateGroups: DuplicateRequestGroup[];
  duplicateRequestCounts: Map<string, number>;
  duplicateRequestCount: number;
  graphqlOperations: GraphQLOperationStat[];
  graphqlErrorOperationCount: number;
  errorClusters: ErrorCluster[];
  slowEndpoints: EndpointPerformanceStat[];
  sensitiveFindings: SensitiveFinding[];
  cacheInsights: CacheInsight[];
  schemaDrifts: SchemaDriftInsight[];
  requestInsightCounts: Map<string, number>;
};

type DuplicateAccumulator = {
  request: NetworkRequest;
  requestIds: string[];
  durationTotalMs: number;
  durationCount: number;
  latestStartTime: number;
};

type GraphQLAccumulator = {
  operationName: string;
  operationType: string;
  count: number;
  errorCount: number;
  batchedCount: number;
  durationTotalMs: number;
  durationCount: number;
  maxDurationMs?: number;
};

type ErrorAccumulator = {
  request: NetworkRequest;
  requestIds: string[];
};

type PerformanceAccumulator = {
  request: NetworkRequest;
  durations: number[];
};

type SchemaAccumulator = {
  request: NetworkRequest;
  variants: Map<string, string[]>;
};

const normalizeBody = (body: string | undefined): string => {
  if (!body) {
    return '';
  }

  try {
    return JSON.stringify(JSON.parse(body) as unknown);
  } catch {
    return body.trim();
  }
};

const duplicateKeyFor = (request: NetworkRequest): string =>
  [request.method.toUpperCase(), request.url, normalizeBody(request.requestBody)].join('\n');

const endpointPathFor = (request: NetworkRequest): string => {
  try {
    return new URL(request.url).pathname;
  } catch {
    return request.path.split('?')[0] ?? request.path;
  }
};

const endpointKeyFor = (request: NetworkRequest): string => [request.method.toUpperCase(), request.domain, endpointPathFor(request)].join('\n');

const averageDuration = (total: number, count: number): number | undefined => (count > 0 ? total / count : undefined);

const operationLabel = (operation: GraphQLInfo): string => operation.operationName || operation.operationType || 'anonymous';

const operationKeyFor = (operation: GraphQLInfo): string =>
  [operation.operationType ?? 'unknown', operation.operationName ?? 'anonymous', operation.query ?? ''].join('\n');

const operationsForRequest = (request: NetworkRequest): GraphQLInfo[] => {
  if (!request.graphql) {
    return [];
  }

  return request.graphql.batched && request.graphql.operations?.length ? request.graphql.operations : [request.graphql];
};

const hasHeader = (headers: Record<string, string>, name: string): boolean => Object.keys(headers).some((headerName) => headerName.toLowerCase() === name);

const headerValue = (headers: Record<string, string>, name: string): string | undefined => {
  const match = Object.entries(headers).find(([headerName]) => headerName.toLowerCase() === name);
  return match?.[1];
};

const SENSITIVE_PATTERNS: Array<{ kind: string; pattern: RegExp }> = [
  { kind: 'email', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { kind: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/ },
  { kind: 'api key', pattern: /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|secret|password)["'=:\s]+[^"',\s]{8,}/i },
  { kind: 'bearer token', pattern: /\bbearer\s+[A-Za-z0-9._~+/=-]{12,}/i }
];

const inspectSensitiveText = (request: NetworkRequest, location: string, text: string | undefined): SensitiveFinding[] => {
  if (!text) {
    return [];
  }

  return SENSITIVE_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ kind }) => ({
    key: `${request.id}:${location}:${kind}`,
    requestId: request.id,
    path: request.path,
    kind,
    location
  }));
};

const sensitiveFindingsFor = (request: NetworkRequest): SensitiveFinding[] => [
  ...inspectSensitiveText(request, 'url', request.url),
  ...inspectSensitiveText(request, 'request headers', JSON.stringify(request.requestHeaders)),
  ...inspectSensitiveText(request, 'request body', request.requestBody),
  ...inspectSensitiveText(request, 'response body', request.responseBody)
];

const cacheInsightFor = (request: NetworkRequest): CacheInsight | undefined => {
  if (request.method !== 'GET' || request.status === null || request.status >= 400 || request.cached) {
    return undefined;
  }

  const cacheControl = headerValue(request.responseHeaders, 'cache-control')?.toLowerCase();
  const hasExplicitCachePolicy = Boolean(cacheControl) || hasHeader(request.responseHeaders, 'etag') || hasHeader(request.responseHeaders, 'expires');
  const isLikelyApiResponse = request.resourceType === 'fetch' || request.resourceType === 'xhr' || request.mimeType?.includes('json');
  const isLarge = (request.sizeBytes ?? 0) > 100 * 1024;

  if (isLarge && cacheControl?.includes('no-store')) {
    return {
      key: `${request.id}:large-no-store`,
      requestId: request.id,
      path: request.path,
      message: 'Large GET response is explicitly not stored'
    };
  }

  if ((isLikelyApiResponse || isLarge) && !hasExplicitCachePolicy) {
    return {
      key: `${request.id}:missing-cache-policy`,
      requestId: request.id,
      path: request.path,
      message: isLarge ? 'Large GET response has no cache policy' : 'API GET response has no cache policy'
    };
  }

  return undefined;
};

const schemaSignatureFor = (body: string | undefined): string | undefined => {
  if (!body) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    return JSON.stringify(schemaShapeFor(parsed));
  } catch {
    return undefined;
  }
};

const schemaShapeFor = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.length ? [schemaShapeFor(value[0])] : [];
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, schemaShapeFor(nestedValue)])
    );
  }

  return value === null ? 'null' : typeof value;
};

export const buildNetworkInsights = (requests: NetworkRequest[]): NetworkInsights => {
  const duplicateAccumulators = new Map<string, DuplicateAccumulator>();
  const graphqlAccumulators = new Map<string, GraphQLAccumulator>();
  const errorAccumulators = new Map<string, ErrorAccumulator>();
  const performanceAccumulators = new Map<string, PerformanceAccumulator>();
  const schemaAccumulators = new Map<string, SchemaAccumulator>();
  const sensitiveFindings: SensitiveFinding[] = [];
  const cacheInsights: CacheInsight[] = [];

  for (const request of requests) {
    const duplicateKey = duplicateKeyFor(request);
    const existingDuplicate = duplicateAccumulators.get(duplicateKey);
    const duration = request.durationMs;
    const endpointKey = endpointKeyFor(request);
    const endpointPath = endpointPathFor(request);

    if (existingDuplicate) {
      existingDuplicate.requestIds.push(request.id);
      existingDuplicate.latestStartTime = Math.max(existingDuplicate.latestStartTime, request.startTime);
      if (duration !== undefined) {
        existingDuplicate.durationTotalMs += duration;
        existingDuplicate.durationCount += 1;
      }
    } else {
      duplicateAccumulators.set(duplicateKey, {
        request,
        requestIds: [request.id],
        durationTotalMs: duration ?? 0,
        durationCount: duration === undefined ? 0 : 1,
        latestStartTime: request.startTime
      });
    }

    if (request.failed || (request.status !== null && request.status >= 400) || request.graphql?.errors?.length) {
      const status = request.graphql?.errors?.length ? 'GraphQL' : String(request.status ?? 'ERR');
      const message = request.graphql?.errors?.length ? 'GraphQL errors' : request.statusText || 'Request failed';
      const errorKey = [status, message, endpointKey].join('\n');
      const existingError = errorAccumulators.get(errorKey);

      if (existingError) {
        existingError.requestIds.push(request.id);
      } else {
        errorAccumulators.set(errorKey, {
          request,
          requestIds: [request.id]
        });
      }
    }

    if (duration !== undefined) {
      const existingPerformance = performanceAccumulators.get(endpointKey);

      if (existingPerformance) {
        existingPerformance.durations.push(duration);
      } else {
        performanceAccumulators.set(endpointKey, {
          request,
          durations: [duration]
        });
      }
    }

    sensitiveFindings.push(...sensitiveFindingsFor(request));

    const cacheInsight = cacheInsightFor(request);
    if (cacheInsight) {
      cacheInsights.push(cacheInsight);
    }

    const schemaSignature = schemaSignatureFor(request.responseBody);
    if (schemaSignature) {
      const existingSchema = schemaAccumulators.get(endpointKey);

      if (existingSchema) {
        const requestIds = existingSchema.variants.get(schemaSignature) ?? [];
        requestIds.push(request.id);
        existingSchema.variants.set(schemaSignature, requestIds);
      } else {
        schemaAccumulators.set(endpointKey, {
          request: {
            ...request,
            path: endpointPath
          },
          variants: new Map([[schemaSignature, [request.id]]])
        });
      }
    }

    for (const operation of operationsForRequest(request)) {
      const operationKey = operationKeyFor(operation);
      const existingOperation = graphqlAccumulators.get(operationKey);
      const errorCount = operation.errors?.length ?? 0;

      if (existingOperation) {
        existingOperation.count += 1;
        existingOperation.errorCount += errorCount;
        if (request.graphql?.batched) {
          existingOperation.batchedCount += 1;
        }
        if (duration !== undefined) {
          existingOperation.durationTotalMs += duration;
          existingOperation.durationCount += 1;
          existingOperation.maxDurationMs = Math.max(existingOperation.maxDurationMs ?? duration, duration);
        }
      } else {
        graphqlAccumulators.set(operationKey, {
          operationName: operationLabel(operation),
          operationType: operation.operationType ?? 'unknown',
          count: 1,
          errorCount,
          batchedCount: request.graphql?.batched ? 1 : 0,
          durationTotalMs: duration ?? 0,
          durationCount: duration === undefined ? 0 : 1,
          maxDurationMs: duration
        });
      }
    }
  }

  const duplicateRequestCounts = new Map<string, number>();
  const duplicateGroups = Array.from(duplicateAccumulators.entries())
    .filter(([, accumulator]) => accumulator.requestIds.length > 1)
    .map(([key, accumulator]) => {
      for (const requestId of accumulator.requestIds) {
        duplicateRequestCounts.set(requestId, accumulator.requestIds.length);
      }

      return {
        key,
        method: accumulator.request.method,
        path: accumulator.request.path,
        domain: accumulator.request.domain,
        count: accumulator.requestIds.length,
        requestIds: accumulator.requestIds,
        avgDurationMs: averageDuration(accumulator.durationTotalMs, accumulator.durationCount),
        latestStartTime: accumulator.latestStartTime
      };
    })
    .sort((left, right) => right.count - left.count || right.latestStartTime - left.latestStartTime);

  const graphqlOperations = Array.from(graphqlAccumulators.entries())
    .map(([key, accumulator]) => ({
      key,
      operationName: accumulator.operationName,
      operationType: accumulator.operationType,
      count: accumulator.count,
      errorCount: accumulator.errorCount,
      batchedCount: accumulator.batchedCount,
      avgDurationMs: averageDuration(accumulator.durationTotalMs, accumulator.durationCount),
      maxDurationMs: accumulator.maxDurationMs
    }))
    .sort((left, right) => right.errorCount - left.errorCount || right.count - left.count || (right.avgDurationMs ?? 0) - (left.avgDurationMs ?? 0));

  const errorClusters = Array.from(errorAccumulators.entries())
    .map(([key, accumulator]) => ({
      key,
      method: accumulator.request.method,
      path: endpointPathFor(accumulator.request),
      domain: accumulator.request.domain,
      status: accumulator.request.graphql?.errors?.length ? 'GraphQL' : String(accumulator.request.status ?? 'ERR'),
      message: accumulator.request.graphql?.errors?.length ? 'GraphQL errors' : accumulator.request.statusText || 'Request failed',
      count: accumulator.requestIds.length,
      requestIds: accumulator.requestIds
    }))
    .sort((left, right) => right.count - left.count || left.status.localeCompare(right.status));

  const slowEndpoints = Array.from(performanceAccumulators.entries())
    .map(([key, accumulator]) => {
      const total = accumulator.durations.reduce((sum, item) => sum + item, 0);

      return {
        key,
        method: accumulator.request.method,
        path: endpointPathFor(accumulator.request),
        domain: accumulator.request.domain,
        count: accumulator.durations.length,
        avgDurationMs: total / accumulator.durations.length,
        maxDurationMs: Math.max(...accumulator.durations)
      };
    })
    .filter((endpoint) => endpoint.avgDurationMs >= 500 || endpoint.maxDurationMs >= 1000)
    .sort((left, right) => right.avgDurationMs - left.avgDurationMs || right.maxDurationMs - left.maxDurationMs);

  const schemaDrifts = Array.from(schemaAccumulators.entries())
    .filter(([, accumulator]) => accumulator.variants.size > 1)
    .map(([key, accumulator]) => ({
      key,
      method: accumulator.request.method,
      path: accumulator.request.path,
      domain: accumulator.request.domain,
      variants: accumulator.variants.size,
      requestIds: Array.from(accumulator.variants.values()).flat()
    }))
    .sort((left, right) => right.variants - left.variants || right.requestIds.length - left.requestIds.length);

  const requestInsightCounts = new Map<string, number>();
  const addRequestInsight = (requestId: string) => {
    requestInsightCounts.set(requestId, (requestInsightCounts.get(requestId) ?? 0) + 1);
  };

  for (const requestId of duplicateRequestCounts.keys()) {
    addRequestInsight(requestId);
  }
  for (const cluster of errorClusters) {
    cluster.requestIds.forEach(addRequestInsight);
  }
  for (const finding of sensitiveFindings) {
    addRequestInsight(finding.requestId);
  }
  for (const insight of cacheInsights) {
    addRequestInsight(insight.requestId);
  }
  for (const drift of schemaDrifts) {
    drift.requestIds.forEach(addRequestInsight);
  }

  return {
    duplicateGroups,
    duplicateRequestCounts,
    duplicateRequestCount: duplicateRequestCounts.size,
    graphqlOperations,
    graphqlErrorOperationCount: graphqlOperations.filter((operation) => operation.errorCount > 0).length,
    errorClusters,
    slowEndpoints,
    sensitiveFindings,
    cacheInsights,
    schemaDrifts,
    requestInsightCounts
  };
};
