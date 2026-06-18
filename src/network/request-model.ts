import type { GraphQLInfo } from '../graphql/graphql-model';
import type { HarEntry } from './har';

export type HeaderRecord = Record<string, string>;

export type QueryParamsRecord = Record<string, string[]>;

export type NetworkTag =
  | 'pending'
  | 'slow'
  | 'large'
  | 'graphql'
  | 'cached'
  | 'failed'
  | 'preflight'
  | 'redirect'
  | 'client-error'
  | 'server-error'
  | 'success';

export type NetworkRequestState = 'pending' | 'complete' | 'failed';

export type RequestTiming = {
  blocked?: number;
  dns?: number;
  connect?: number;
  ssl?: number;
  send?: number;
  wait?: number;
  receive?: number;
};

export type NetworkRequest = {
  id: string;
  url: string;
  method: string;
  status: number | null;
  statusText?: string;
  state: NetworkRequestState;
  domain: string;
  path: string;
  queryParams: QueryParamsRecord;
  requestHeaders: HeaderRecord;
  responseHeaders: HeaderRecord;
  requestBody?: string;
  responseBody?: string;
  mimeType?: string;
  resourceType?: string;
  startTime: number;
  durationMs?: number;
  sizeBytes?: number;
  cached: boolean;
  failed: boolean;
  tags: NetworkTag[];
  graphql?: GraphQLInfo;
  timing?: RequestTiming;
  rawHarEntry?: HarEntry;
};

export type RequestViewMode = 'all' | 'filtered' | 'selected' | 'single';

const STATIC_ASSET_MIME_PREFIXES = ['image/', 'video/', 'audio/', 'font/'];
const STATIC_ASSET_MIME_TYPES = new Set([
  'application/javascript',
  'application/pdf',
  'application/wasm',
  'application/x-font-ttf',
  'application/x-javascript',
  'text/css',
  'text/html',
  'text/javascript'
]);
const STATIC_ASSET_EXTENSIONS = new Set([
  '.aac',
  '.avif',
  '.css',
  '.eot',
  '.flac',
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.js',
  '.m3u8',
  '.m4a',
  '.m4v',
  '.map',
  '.mjs',
  '.mov',
  '.mp3',
  '.mp4',
  '.ogg',
  '.otf',
  '.pdf',
  '.png',
  '.svg',
  '.ttf',
  '.wasm',
  '.wav',
  '.webm',
  '.webp',
  '.woff',
  '.woff2'
]);

const getRequestPathname = (request: NetworkRequest): string => {
  try {
    return new URL(request.url).pathname.toLowerCase();
  } catch {
    return request.path.toLowerCase();
  }
};

const isStaticAssetRequest = (request: NetworkRequest): boolean => {
  const rawMimeType = request.mimeType ?? request.responseHeaders['content-type'] ?? '';
  const mimeType = rawMimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const pathname = getRequestPathname(request);

  return (
    STATIC_ASSET_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix)) ||
    STATIC_ASSET_MIME_TYPES.has(mimeType) ||
    Array.from(STATIC_ASSET_EXTENSIONS).some((extension) => pathname.endsWith(extension))
  );
};

export const isFetchXhrRequest = (request: NetworkRequest): boolean => {
  const resourceType = request.resourceType?.toLowerCase();

  return (resourceType === 'fetch' || resourceType === 'xhr') && !isStaticAssetRequest(request);
};
