import { memo, useMemo } from 'react';

import { exportRequestsAsCsv } from '../export/csv-export';
import { exportRequestAsCurl } from '../export/curl-export';
import { exportRequestsAsHar } from '../export/har-export';
import { exportRequestsAsJson } from '../export/json-export';
import { exportRequestsAsMarkdown } from '../export/markdown-export';
import { exportRequestsAsMsw } from '../export/msw-export';
import { exportRequestsAsPlaywrightRoutes } from '../export/playwright-export';
import type { NetworkRequest } from '../network/request-model';
import { useSettingsStore, type Settings } from '../state/settings-store';
import { copyText, downloadTextFile } from '../utils/download';

type ExportMenuProps = {
  allRequests: NetworkRequest[];
  filteredRequests: NetworkRequest[];
  activeRequest: NetworkRequest | undefined;
};

type RequestContextMenuProps = {
  request: NetworkRequest;
  position: { x: number; y: number };
  onClose: () => void;
};

type ExportScope = 'all' | 'filtered';
type ExportFormat = 'json' | 'csv' | 'har' | 'md' | 'msw.ts' | 'playwright.ts';

const filename = (scope: ExportScope, extension: string): string =>
  `network-plus-plus-${scope}-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;

const requestFilename = (request: NetworkRequest, extension: string): string =>
  `network-plus-plus-request-${request.id}-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;

const getRedactionOptions = (settings: Pick<Settings, 'redactExportsByDefault' | 'sensitiveFieldNames'>) => ({
  enabled: settings.redactExportsByDefault,
  sensitiveFieldNames: settings.sensitiveFieldNames
});

const getRequestsForScope = (scope: ExportScope, allRequests: NetworkRequest[], filteredRequests: NetworkRequest[]): NetworkRequest[] => {
  if (scope === 'filtered') return filteredRequests;
  return allRequests;
};

const getExportContent = (
  requests: NetworkRequest[],
  redaction: ReturnType<typeof getRedactionOptions>,
  format: ExportFormat
) =>
  format === 'json'
    ? exportRequestsAsJson(requests, redaction)
    : format === 'csv'
      ? exportRequestsAsCsv(requests, redaction)
      : format === 'har'
        ? exportRequestsAsHar(requests, redaction)
        : format === 'md'
          ? exportRequestsAsMarkdown(requests, redaction)
          : format === 'msw.ts'
            ? exportRequestsAsMsw(requests, redaction)
            : exportRequestsAsPlaywrightRoutes(requests, redaction);

const getMimeType = (format: ExportFormat) =>
  format === 'json' || format === 'har'
    ? 'application/json'
    : format === 'csv'
      ? 'text/csv'
      : format === 'md'
        ? 'text/markdown'
        : 'text/typescript';

export const ExportMenu = memo(function ExportMenu({ allRequests, filteredRequests, activeRequest }: ExportMenuProps) {
  const redactExportsByDefault = useSettingsStore((state) => state.redactExportsByDefault);
  const sensitiveFieldNames = useSettingsStore((state) => state.sensitiveFieldNames);
  const redaction = useMemo(
    () => getRedactionOptions({ redactExportsByDefault, sensitiveFieldNames }),
    [redactExportsByDefault, sensitiveFieldNames]
  );

  const download = (scope: ExportScope, format: ExportFormat) => {
    const requests = getRequestsForScope(scope, allRequests, filteredRequests);
    downloadTextFile(filename(scope, format), getExportContent(requests, redaction, format), getMimeType(format));
  };

  const copyActiveCurl = async () => {
    if (!activeRequest) return;
    await copyText(exportRequestAsCurl(activeRequest, redaction));
  };

  return (
    <div className="export-menu">
      <span>Export</span>
      <button type="button" className="secondary-button" onClick={() => download('filtered', 'json')} disabled={filteredRequests.length === 0}>
        Filtered JSON
      </button>
      <button type="button" className="secondary-button" onClick={() => download('filtered', 'csv')} disabled={filteredRequests.length === 0}>
        CSV
      </button>
      <button type="button" className="secondary-button" onClick={() => download('filtered', 'har')} disabled={filteredRequests.length === 0}>
        HAR
      </button>
      <button type="button" className="secondary-button" onClick={() => download('all', 'md')} disabled={allRequests.length === 0}>
        Markdown
      </button>
      <button type="button" className="secondary-button" onClick={() => download('filtered', 'msw.ts')} disabled={filteredRequests.length === 0}>
        MSW
      </button>
      <button type="button" className="secondary-button" onClick={() => download('filtered', 'playwright.ts')} disabled={filteredRequests.length === 0}>
        Playwright
      </button>
      <button type="button" className="secondary-button" onClick={() => void copyActiveCurl()} disabled={!activeRequest}>
        Copy cURL
      </button>
      {redactExportsByDefault ? <span className="redaction-pill">Redacted</span> : <span className="redaction-pill raw">Raw</span>}
    </div>
  );
});

export const RequestContextMenu = memo(function RequestContextMenu({ request, position, onClose }: RequestContextMenuProps) {
  const redactExportsByDefault = useSettingsStore((state) => state.redactExportsByDefault);
  const sensitiveFieldNames = useSettingsStore((state) => state.sensitiveFieldNames);
  const redaction = useMemo(
    () => getRedactionOptions({ redactExportsByDefault, sensitiveFieldNames }),
    [redactExportsByDefault, sensitiveFieldNames]
  );

  const download = (format: ExportFormat) => {
    downloadTextFile(requestFilename(request, format), getExportContent([request], redaction, format), getMimeType(format));
    onClose();
  };

  const copyRequestCurl = async () => {
    await copyText(exportRequestAsCurl(request, redaction));
    onClose();
  };

  return (
    <div className="request-context-menu" style={{ left: position.x, top: position.y }} role="menu" aria-label="Request options">
      <div className="request-context-menu-header">
        <span>Request options</span>
        {redactExportsByDefault ? <span className="redaction-pill">Redacted</span> : <span className="redaction-pill raw">Raw</span>}
      </div>
      <button type="button" className="request-context-menu-item" onClick={() => download('json')}>
        JSON
      </button>
      <button type="button" className="request-context-menu-item" onClick={() => download('csv')}>
        CSV
      </button>
      <button type="button" className="request-context-menu-item" onClick={() => download('har')}>
        HAR
      </button>
      <button type="button" className="request-context-menu-item" onClick={() => download('md')}>
        Markdown
      </button>
      <button type="button" className="request-context-menu-item" onClick={() => download('msw.ts')}>
        MSW
      </button>
      <button type="button" className="request-context-menu-item" onClick={() => download('playwright.ts')}>
        Playwright
      </button>
      <button type="button" className="request-context-menu-item" onClick={() => void copyRequestCurl()}>
        Copy cURL
      </button>
    </div>
  );
});
