import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

import { buildNetworkInsights, type NetworkInsights } from '../analysis/network-insights';
import { DevtoolsNetworkCapture } from '../network/capture';
import { isFetchXhrRequest, type NetworkRequest } from '../network/request-model';
import { parseSearchQuery, type ComparisonOperator, type SearchToken } from '../search/parser';
import { useRequestsStore } from '../state/requests-store';
import { useSettingsStore } from '../state/settings-store';
import { COLOR_TONES, ColorLegend, getRequestColorFilterTones, type ColorTone } from './ColorLegend';
import { ExportMenu } from './ExportMenu';
import { PaletteIcon } from './icons';
import { InsightsPanel, type InsightSummaryFilterId } from './InsightsPanel';
import { NetworkTable } from './NetworkTable';
import { RequestDetails } from './RequestDetails';
import { useCloseMenuOnOutsideClick } from './useCloseMenuOnOutsideClick';

const DETAILS_MIN_PERCENT = 22;
const DETAILS_MAX_PERCENT = 70;
const FILTER_DEBOUNCE_MS = 300;

type FilterMode = 'filter' | 'search';
export type DetailsLayout = 'side' | 'bottom';
type WorkspaceResizeState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startDetailsSize: number;
  workspaceWidth: number;
  workspaceHeight: number;
  isBottomLayout: boolean;
  previousCursor: string;
  previousUserSelect: string;
};

const FILTER_MODE_OPTIONS: Array<{ id: FilterMode; label: string; iconPath: string }> = [
  { id: 'filter', label: 'Filter', iconPath: 'M5 7h14M5 12h10M5 17h14' },
  { id: 'search', label: 'Search', iconPath: 'M11 18a7 7 0 1 1 4.95-2.05L20 20' }
];

const clampDetailsSize = (value: number) => Math.min(DETAILS_MAX_PERCENT, Math.max(DETAILS_MIN_PERCENT, value));

const decodeHarText = (text: string | undefined, encoding: string | undefined): string | undefined => {
  if (!text || encoding?.toLowerCase() !== 'base64') {
    return text;
  }

  try {
    return decodeURIComponent(
      Array.from(globalThis.atob(text), (char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')
    );
  } catch {
    return text;
  }
};

const getResponseBodyText = (request: NetworkRequest): string =>
  request.responseBody ?? decodeHarText(request.rawHarEntry?.response.content?.text, request.rawHarEntry?.response.content?.encoding) ?? '';

const TRUE_VALUES = new Set(['true', 'yes', '1']);
const FALSE_VALUES = new Set(['false', 'no', '0']);

const includesValue = (source: unknown, query: string): boolean => String(source ?? '').toLowerCase().includes(query.toLowerCase());

const includesGraphQLValue = (request: NetworkRequest, query: string): boolean =>
  [
    request.graphql?.operationName,
    request.graphql?.operationType,
    request.graphql ? 'graphql gql' : undefined,
    request.graphql?.errors?.length ? 'graphql errors' : undefined
  ].some((source) => includesValue(source, query));

const matchesGraphQLToken = (request: NetworkRequest, query: string): boolean => {
  if (TRUE_VALUES.has(query)) {
    return Boolean(request.graphql);
  }

  if (FALSE_VALUES.has(query)) {
    return !request.graphql;
  }

  return includesGraphQLValue(request, query);
};

const compareStatus = (status: number | null, operator: ComparisonOperator | undefined, expected: number): boolean => {
  if (status === null || !Number.isFinite(expected)) {
    return false;
  }

  switch (operator) {
    case '>':
      return status > expected;
    case '>=':
      return status >= expected;
    case '<':
      return status < expected;
    case '<=':
      return status <= expected;
    case '=':
    case ':':
    default:
      return status === expected;
  }
};

const normalizeStatusToken = (operator: ComparisonOperator | undefined, value: string) => {
  const trimmedValue = value.trim();
  const comparison = trimmedValue.match(/^(>=|>|<=|<|=)(\d+)$/);

  if (operator === ':' && comparison) {
    return {
      operator: comparison[1] as ComparisonOperator,
      value: Number.parseInt(comparison[2] ?? '', 10)
    };
  }

  return {
    operator,
    value: Number.parseInt(trimmedValue, 10)
  };
};

const matchesStatusToken = (request: NetworkRequest, token: SearchToken): boolean => {
  const normalizedValue = token.value.trim().toLowerCase();

  if (normalizedValue === 'pending') {
    return request.state === 'pending';
  }

  if (/^[1-5]xx$/.test(normalizedValue)) {
    return request.status !== null && Math.floor(request.status / 100) === Number.parseInt(normalizedValue[0] ?? '', 10);
  }

  if (normalizedValue === 'err' || normalizedValue === 'error' || normalizedValue === 'failed') {
    return request.state === 'failed' || request.failed;
  }

  const { operator, value } = normalizeStatusToken(token.operator, token.value);
  return compareStatus(request.status, operator, value);
};

const matchesFilterToken = (request: NetworkRequest, token: SearchToken): boolean => {
  const value = token.value.trim();
  const normalizedValue = value.toLowerCase();

  if (!value) {
    return true;
  }

  let matched = false;
  switch (token.field) {
    case undefined:
      matched = [
        request.url,
        request.path,
        request.domain,
        request.method,
        request.status,
        request.statusText,
        request.state,
        request.graphql?.operationName,
        request.graphql?.operationType,
        request.state === 'pending' ? 'pending' : undefined,
        request.graphql ? 'graphql gql' : undefined,
        request.state === 'failed' || request.failed ? 'failed error err' : undefined
      ].some((source) => includesValue(source, normalizedValue));
      break;
    case 'url':
    case 'path':
      matched = includesValue(request.url, normalizedValue) || includesValue(request.path, normalizedValue);
      break;
    case 'domain':
      matched = includesValue(request.domain, normalizedValue);
      break;
    case 'method':
      matched = request.method.toLowerCase() === normalizedValue;
      break;
    case 'status':
      matched = matchesStatusToken(request, token);
      break;
    case 'graphql':
    case 'gql':
      matched = matchesGraphQLToken(request, normalizedValue);
      break;
    case 'operation':
    case 'operationname':
    case 'operation-name':
    case 'gql.name':
      matched = includesValue(request.graphql?.operationName, normalizedValue);
      break;
    case 'operationtype':
    case 'operation-type':
    case 'gql.type':
      matched = includesValue(request.graphql?.operationType, normalizedValue);
      break;
    default:
      matched = false;
  }

  return token.negated ? !matched : matched;
};

const matchesRequestFilter = (request: NetworkRequest, tokens: SearchToken[]): boolean => tokens.every((token) => matchesFilterToken(request, token));

const addInsightSummaryFilterRequestIds = (filterId: InsightSummaryFilterId, insights: NetworkInsights, requestIds: Set<string>) => {
  switch (filterId) {
    case 'duplicate-groups':
    case 'repeated-requests':
      insights.duplicateRequestCounts.forEach((_, requestId) => requestIds.add(requestId));
      return;
    case 'graphql':
      insights.graphqlOperations.forEach((operation) => operation.requestIds.forEach((requestId) => requestIds.add(requestId)));
      return;
    case 'graphql-errors':
      insights.graphqlOperations.forEach((operation) => operation.errorRequestIds.forEach((requestId) => requestIds.add(requestId)));
      return;
    case 'error-clusters':
      insights.errorClusters.forEach((cluster) => cluster.requestIds.forEach((requestId) => requestIds.add(requestId)));
      return;
    case 'sensitive':
      insights.sensitiveFindings.forEach((finding) => requestIds.add(finding.requestId));
      return;
    case 'schema':
      insights.schemaDrifts.forEach((drift) => drift.requestIds.forEach((requestId) => requestIds.add(requestId)));
      return;
  }
};

export const App = () => {
  const workspaceRef = useRef<HTMLElement>(null);
  const workspaceResizeRef = useRef<WorkspaceResizeState | null>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const coloringMenuRef = useRef<HTMLDivElement>(null);
  const [captureError, setCaptureError] = useState<string | undefined>();
  const [detailsSizePercent, setDetailsSizePercent] = useState(33);
  const [detailsLayout, setDetailsLayout] = useState<DetailsLayout>(() =>
    window.matchMedia('(max-width: 1100px)').matches ? 'bottom' : 'side'
  );
  const [hasCustomDetailsLayout, setHasCustomDetailsLayout] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>('filter');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [debouncedFilterQuery, setDebouncedFilterQuery] = useState('');
  const [coloringEnabled, setColoringEnabled] = useState(false);
  const [coloringMenuOpen, setColoringMenuOpen] = useState(false);
  const [selectedColorTones, setSelectedColorTones] = useState<ReadonlySet<ColorTone>>(() => new Set(COLOR_TONES.map(([tone]) => tone)));
  const [activeInsightFilters, setActiveInsightFilters] = useState<ReadonlySet<InsightSummaryFilterId>>(() => new Set());
  const [activeOperationFilters, setActiveOperationFilters] = useState<ReadonlySet<string>>(() => new Set());
  const [activeDuplicateFilters, setActiveDuplicateFilters] = useState<ReadonlySet<string>>(() => new Set());
  const requests = useRequestsStore((state) => state.requests);
  const activeRequestId = useRequestsStore((state) => state.activeRequestId);
  const clearRequests = useRequestsStore((state) => state.clearRequests);
  const settingsHydrated = useSettingsStore((state) => state.hydrated);
  const hydrateSettings = useSettingsStore((state) => state.hydrate);
  const preserveLogOnReload = useSettingsStore((state) => state.preserveLogOnReload);
  const insightWidgetsCollapsed = useSettingsStore((state) => state.insightWidgetsCollapsed);
  const updateSettings = useSettingsStore((state) => state.updateSettings);

  useEffect(() => {
    void hydrateSettings();
  }, [hydrateSettings]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1100px)');
    const updateWorkspaceDirection = () => {
      if (!hasCustomDetailsLayout) {
        setDetailsLayout(mediaQuery.matches ? 'bottom' : 'side');
      }
    };

    updateWorkspaceDirection();
    mediaQuery.addEventListener('change', updateWorkspaceDirection);

    return () => mediaQuery.removeEventListener('change', updateWorkspaceDirection);
  }, [hasCustomDetailsLayout]);

  useEffect(() => {
    if (!settingsHydrated) {
      return undefined;
    }

    const capture = new DevtoolsNetworkCapture();
    const queuedRequests: NetworkRequest[] = [];
    let flushFrameId: number | undefined;
    const flushQueuedRequests = () => {
      flushFrameId = undefined;
      const nextRequests = queuedRequests.splice(0);
      useRequestsStore.getState().upsertRequests(nextRequests);
    };
    const enqueueRequest = (request: NetworkRequest) => {
      queuedRequests.push(request);
      flushFrameId ??= window.requestAnimationFrame(flushQueuedRequests);
    };

    capture.start({
      onRequest: enqueueRequest,
      onNavigation: () => {
        queuedRequests.length = 0;
        if (!useSettingsStore.getState().preserveLogOnReload) {
          useRequestsStore.getState().clearRequests();
        }
      },
      onError: (error) => setCaptureError(error.message),
      shouldCaptureResponseBodies: () => true
    });

    return () => {
      capture.stop();
      if (flushFrameId !== undefined) {
        window.cancelAnimationFrame(flushFrameId);
      }
    };
  }, [settingsHydrated]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedFilterQuery(filterQuery), FILTER_DEBOUNCE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [filterQuery]);

  const closeFilterMenu = useCallback(() => setFilterMenuOpen(false), []);
  const closeColoringMenu = useCallback(() => setColoringMenuOpen(false), []);

  useCloseMenuOnOutsideClick(filterMenuRef, filterMenuOpen, closeFilterMenu);
  useCloseMenuOnOutsideClick(coloringMenuRef, coloringMenuOpen, closeColoringMenu);

  const fetchXhrRequests = useMemo(() => requests.filter(isFetchXhrRequest), [requests]);
  const textFilteredRequests = useMemo(() => {
    const normalizedFilter = debouncedFilterQuery.trim().toLowerCase();
    if (!normalizedFilter) {
      return fetchXhrRequests;
    }

    const filterTokens = filterMode === 'filter' ? parseSearchQuery(debouncedFilterQuery).tokens : [];

    return fetchXhrRequests.filter((request) => {
      if (filterMode === 'search') {
        return getResponseBodyText(request).toLowerCase().includes(normalizedFilter);
      }

      return matchesRequestFilter(request, filterTokens);
    });
  }, [debouncedFilterQuery, fetchXhrRequests, filterMode]);
  const baseVisibleRequests = useMemo(() => {
    if (!coloringEnabled || selectedColorTones.size === COLOR_TONES.length) {
      return textFilteredRequests;
    }

    return textFilteredRequests.filter((request) => {
      const tones = getRequestColorFilterTones(request);
      return tones.length > 0 && tones.every((tone) => selectedColorTones.has(tone));
    });
  }, [coloringEnabled, selectedColorTones, textFilteredRequests]);
  const insights = useMemo(() => buildNetworkInsights(baseVisibleRequests), [baseVisibleRequests]);
  const activeInsightRequestIds = useMemo(() => {
    if (activeInsightFilters.size === 0 && activeOperationFilters.size === 0 && activeDuplicateFilters.size === 0) {
      return undefined;
    }

    const requestIds = new Set<string>();
    activeInsightFilters.forEach((filterId) => addInsightSummaryFilterRequestIds(filterId, insights, requestIds));
    insights.duplicateGroups
      .filter((group) => activeDuplicateFilters.has(group.key))
      .forEach((group) => group.requestIds.forEach((requestId) => requestIds.add(requestId)));
    insights.graphqlOperations
      .filter((operation) => activeOperationFilters.has(operation.key))
      .forEach((operation) => operation.requestIds.forEach((requestId) => requestIds.add(requestId)));
    return requestIds;
  }, [activeDuplicateFilters, activeInsightFilters, activeOperationFilters, insights]);
  const visibleRequests = useMemo(
    () => (activeInsightRequestIds ? baseVisibleRequests.filter((request) => activeInsightRequestIds.has(request.id)) : baseVisibleRequests),
    [activeInsightRequestIds, baseVisibleRequests]
  );
  const activeRequest = useMemo(() => fetchXhrRequests.find((request) => request.id === activeRequestId), [activeRequestId, fetchXhrRequests]);

  const failedCount = useMemo(
    () =>
      baseVisibleRequests.filter(
        (request) => request.failed || (request.status !== null && request.status >= 400) || request.graphql?.errors?.length
      ).length,
    [baseVisibleRequests]
  );
  const pendingCount = useMemo(() => visibleRequests.filter((request) => request.state === 'pending').length, [visibleRequests]);
  const graphqlCount = useMemo(() => baseVisibleRequests.filter((request) => request.graphql).length, [baseVisibleRequests]);
  const isErrorsFilterActive = activeInsightFilters.has('error-clusters');
  const isGraphQLFilterActive = activeInsightFilters.has('graphql');
  const hasDetailsPanel = activeRequest !== undefined;
  const isBottomDetailsLayout = detailsLayout === 'bottom';
  const activeFilterMode = FILTER_MODE_OPTIONS.find((option) => option.id === filterMode) ?? FILTER_MODE_OPTIONS[0]!;
  const workspaceStyle = useMemo<CSSProperties>(
    () => {
      if (!hasDetailsPanel) {
        return {};
      }

      return isBottomDetailsLayout
        ? {
            gridTemplateColumns: 'minmax(0, 1fr)',
            gridTemplateRows: `minmax(220px, 1fr) 12px minmax(220px, ${detailsSizePercent}%)`,
            gridTemplateAreas: '"table" "resizer" "details"'
          }
        : {
            gridTemplateColumns: `minmax(360px, 1fr) 12px minmax(280px, ${detailsSizePercent}%)`,
            gridTemplateRows: 'minmax(0, 1fr)',
            gridTemplateAreas: '"table resizer details"'
          };
    },
    [detailsSizePercent, hasDetailsPanel, isBottomDetailsLayout]
  );

  const updateWorkspaceResize = (clientX: number, clientY: number) => {
    const resize = workspaceResizeRef.current;
    if (!resize) {
      return;
    }

    const nextSize = resize.isBottomLayout
      ? ((resize.startDetailsSize + resize.startClientY - clientY) / resize.workspaceHeight) * 100
      : ((resize.startDetailsSize + resize.startClientX - clientX) / resize.workspaceWidth) * 100;
    setDetailsSizePercent(clampDetailsSize(nextSize));
  };

  const stopWorkspaceResize = (resizer?: HTMLButtonElement) => {
    const resize = workspaceResizeRef.current;
    if (!resize) {
      return;
    }

    document.body.style.cursor = resize.previousCursor;
    document.body.style.userSelect = resize.previousUserSelect;
    if (resizer?.hasPointerCapture(resize.pointerId)) {
      resizer.releasePointerCapture(resize.pointerId);
    }
    workspaceResizeRef.current = null;
  };

  const startWorkspaceResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const workspace = workspaceRef.current;
    if (!workspace) {
      return;
    }

    event.preventDefault();
    const rect = workspace.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }

    const detailsPanel = workspace.querySelector<HTMLElement>('.details-panel');
    const detailsRect = detailsPanel?.getBoundingClientRect();
    const startDetailsSize = isBottomDetailsLayout ? detailsRect?.height : detailsRect?.width;
    if (!startDetailsSize) {
      return;
    }

    stopWorkspaceResize(event.currentTarget);
    workspaceResizeRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startDetailsSize,
      workspaceWidth: rect.width,
      workspaceHeight: rect.height,
      isBottomLayout: isBottomDetailsLayout,
      previousCursor: document.body.style.cursor,
      previousUserSelect: document.body.style.userSelect
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.cursor = isBottomDetailsLayout ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';
    updateWorkspaceResize(event.clientX, event.clientY);
  };

  const moveWorkspaceResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const resize = workspaceResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    updateWorkspaceResize(event.clientX, event.clientY);
  };

  const endWorkspaceResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const resize = workspaceResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) {
      return;
    }

    stopWorkspaceResize(event.currentTarget);
  };

  const resizeWorkspaceWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 10 : 4;
    const deltas: Record<string, number> = isBottomDetailsLayout
      ? { ArrowUp: step, ArrowDown: -step, Home: DETAILS_MIN_PERCENT - detailsSizePercent, End: DETAILS_MAX_PERCENT - detailsSizePercent }
      : { ArrowLeft: step, ArrowRight: -step, Home: DETAILS_MIN_PERCENT - detailsSizePercent, End: DETAILS_MAX_PERCENT - detailsSizePercent };
    const delta = deltas[event.key];

    if (delta === undefined) {
      return;
    }

    event.preventDefault();
    setDetailsSizePercent((size) => clampDetailsSize(size + delta));
  };

  const toggleDetailsLayout = useCallback(() => {
    setHasCustomDetailsLayout(true);
    setDetailsLayout((currentLayout) => (currentLayout === 'bottom' ? 'side' : 'bottom'));
  }, []);

  const toggleColorTone = useCallback((tone: ColorTone) => {
    setSelectedColorTones((currentTones) => {
      const nextTones = new Set(currentTones);
      if (nextTones.has(tone)) {
        nextTones.delete(tone);
      } else {
        nextTones.add(tone);
      }

      return nextTones;
    });
  }, []);
  const toggleInsightFilter = useCallback((filterId: InsightSummaryFilterId) => {
    setActiveInsightFilters((currentFilters) => {
      const nextFilters = new Set(currentFilters);
      if (nextFilters.has(filterId)) {
        nextFilters.delete(filterId);
      } else {
        nextFilters.add(filterId);
      }

      return nextFilters;
    });
  }, []);
  const toggleOperationFilter = useCallback((operationKey: string) => {
    setActiveOperationFilters((currentFilters) => {
      const nextFilters = new Set(currentFilters);
      if (nextFilters.has(operationKey)) {
        nextFilters.delete(operationKey);
      } else {
        nextFilters.add(operationKey);
      }

      return nextFilters;
    });
  }, []);
  const toggleDuplicateFilter = useCallback((groupKey: string) => {
    setActiveDuplicateFilters((currentFilters) => {
      const nextFilters = new Set(currentFilters);
      if (nextFilters.has(groupKey)) {
        nextFilters.delete(groupKey);
      } else {
        nextFilters.add(groupKey);
      }

      return nextFilters;
    });
  }, []);

  return (
    <main className="app-shell">
      <header className="app-header compact">
        <div className="top-filter" aria-label="Filter or search requests">
          <div className="top-filter-prefix" ref={filterMenuRef}>
            <button type="button" className="top-filter-prefix-button" aria-expanded={filterMenuOpen} onClick={() => setFilterMenuOpen((open) => !open)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={activeFilterMode.iconPath} />
              </svg>
              <span>{activeFilterMode.label}</span>
              <svg viewBox="0 0 24 24" aria-hidden="true" className="dropdown-chevron">
                <path d="M7 10l5 5 5-5" />
              </svg>
            </button>
            {filterMenuOpen ? (
              <div className="top-filter-menu">
                {FILTER_MODE_OPTIONS.map((option) => (
                  <button
                    type="button"
                    key={option.id}
                    className={option.id === filterMode ? 'active' : ''}
                    onClick={() => {
                      setFilterMode(option.id);
                      setFilterMenuOpen(false);
                    }}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d={option.iconPath} />
                    </svg>
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <input
            type="search"
            value={filterQuery}
            placeholder={filterMode === 'search' ? 'Search response bodies...' : 'Filter by URL, method, status, or operation...'}
            onChange={(event) => setFilterQuery(event.target.value)}
          />
        </div>
        <div className="capture-metrics" aria-label="Capture metrics">
          <span>{visibleRequests.length} / {fetchXhrRequests.length} Fetch/XHR</span>
          {pendingCount > 0 ? <span>{pendingCount} pending</span> : null}
          <button
            type="button"
            className={`metric-filter-button ${isErrorsFilterActive ? 'active' : ''}`}
            aria-pressed={isErrorsFilterActive}
            onClick={() => toggleInsightFilter('error-clusters')}
          >
            {failedCount} errors
          </button>
          {graphqlCount > 0 || isGraphQLFilterActive ? (
            <button
              type="button"
              className={`metric-filter-button ${isGraphQLFilterActive ? 'active' : ''}`}
              aria-pressed={isGraphQLFilterActive}
              onClick={() => toggleInsightFilter('graphql')}
            >
              {graphqlCount} GraphQL
            </button>
          ) : null}
          <label className="toggle compact-toggle" title="Keep captured requests when the inspected page reloads">
            <input
              type="checkbox"
              checked={preserveLogOnReload}
              onChange={(event) => void updateSettings({ preserveLogOnReload: event.target.checked })}
            />
            Preserve log
          </label>
          <button type="button" className="secondary-button compact-button" onClick={clearRequests}>
            Clear
          </button>
        </div>
      </header>

      {captureError ? <div className="notice warning">{captureError}</div> : null}

      <section
        className={`workspace ${hasDetailsPanel ? 'details-open' : ''} layout-${detailsLayout}`}
        ref={workspaceRef}
        style={workspaceStyle}
      >
        <div className={`table-region ${coloringEnabled ? 'has-color-legend' : ''}`}>
          <InsightsPanel
            insights={insights}
            requestCount={visibleRequests.length}
            activeSummaryFilters={activeInsightFilters}
            onToggleSummaryFilter={toggleInsightFilter}
            collapsed={insightWidgetsCollapsed}
            onCollapsedChange={(collapsed) => void updateSettings({ insightWidgetsCollapsed: collapsed })}
            activeOperationFilters={activeOperationFilters}
            onToggleOperationFilter={toggleOperationFilter}
            activeDuplicateFilters={activeDuplicateFilters}
            onToggleDuplicateFilter={toggleDuplicateFilter}
          />
          {coloringEnabled ? (
            <div className="table-legend-row">
              <ColorLegend selectedTones={selectedColorTones} onToggleTone={toggleColorTone} />
            </div>
          ) : null}
          <NetworkTable
            requests={visibleRequests}
            colorEnabled={coloringEnabled}
            selectedColorTones={selectedColorTones}
            duplicateRequestCounts={insights.duplicateRequestCounts}
            requestInsightCounts={insights.requestInsightCounts}
            headerControls={
              <>
                <ExportMenu allRequests={fetchXhrRequests} filteredRequests={visibleRequests} activeRequest={activeRequest} />
                <div className="coloring-menu" ref={coloringMenuRef}>
                  <button
                    type="button"
                    className="column-menu-button"
                    aria-label="Coloring options"
                    aria-expanded={coloringMenuOpen}
                    onClick={() => setColoringMenuOpen((open) => !open)}
                  >
                  <PaletteIcon />
                  </button>
                  {coloringMenuOpen ? (
                    <div className="column-menu-popover coloring-menu-popover">
                      <label className="column-menu-item">
                        <input
                          type="checkbox"
                          checked={coloringEnabled}
                          onChange={(event) => setColoringEnabled(event.target.checked)}
                        />
                        <span>Enable coloring</span>
                      </label>
                    </div>
                  ) : null}
                </div>
              </>
            }
          />
        </div>

        {hasDetailsPanel ? (
          <button
            type="button"
            className="panel-resizer"
            aria-label={isBottomDetailsLayout ? 'Resize request details height' : 'Resize request details width'}
            aria-orientation={isBottomDetailsLayout ? 'horizontal' : 'vertical'}
            onPointerDown={startWorkspaceResize}
            onPointerMove={moveWorkspaceResize}
            onPointerUp={endWorkspaceResize}
            onPointerCancel={endWorkspaceResize}
            onLostPointerCapture={() => stopWorkspaceResize()}
            onKeyDown={resizeWorkspaceWithKeyboard}
          />
        ) : null}

        {hasDetailsPanel ? (
          <RequestDetails
            request={activeRequest}
            searchQuery={filterMode === 'search' ? debouncedFilterQuery : ''}
            insightCount={activeRequest ? insights.requestInsightCounts.get(activeRequest.id) : undefined}
            layout={detailsLayout}
            onToggleLayout={toggleDetailsLayout}
          />
        ) : null}
      </section>
    </main>
  );
};
