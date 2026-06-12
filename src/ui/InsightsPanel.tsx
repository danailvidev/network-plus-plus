import { memo, useRef, useState, type ReactNode } from 'react';

import type { NetworkInsights } from '../analysis/network-insights';
import { formatDuration } from '../utils/format';
import { CogIcon } from './icons';
import { useCloseMenuOnOutsideClick } from './useCloseMenuOnOutsideClick';

type InsightsPanelProps = {
  insights: NetworkInsights;
  requestCount: number;
  activeSummaryFilters?: ReadonlySet<InsightSummaryFilterId>;
  onToggleSummaryFilter?: (filterId: InsightSummaryFilterId) => void;
  activeOperationFilters?: ReadonlySet<string>;
  onToggleOperationFilter?: (operationKey: string) => void;
  activeDuplicateFilters?: ReadonlySet<string>;
  onToggleDuplicateFilter?: (groupKey: string) => void;
};

const MAX_ITEMS = 3;

const INSIGHT_FEATURES = [
  { id: 'duplicates', label: 'Top duplicates' },
  { id: 'graphql', label: 'GraphQL operations' },
  { id: 'errors', label: 'Error clusters' },
  { id: 'slow', label: 'Slow endpoints' },
  { id: 'sensitive', label: 'Sensitive data' },
  { id: 'cache', label: 'Cache hints' },
  { id: 'schema', label: 'Schema drift' }
] as const;

type InsightFeatureId = (typeof INSIGHT_FEATURES)[number]['id'];
export type InsightSummaryFilterId = 'duplicate-groups' | 'repeated-requests' | 'graphql' | 'graphql-errors' | 'error-clusters' | 'sensitive' | 'schema';

type InsightCardProps = {
  title: string;
  children: ReactNode;
};

const InsightCard = ({ title, children }: InsightCardProps) => (
  <div className="insight-card">
    <h3>{title}</h3>
    {children}
  </div>
);

export const InsightsPanel = memo(function InsightsPanel({
  insights,
  requestCount,
  activeSummaryFilters,
  onToggleSummaryFilter,
  activeOperationFilters,
  onToggleOperationFilter,
  activeDuplicateFilters,
  onToggleDuplicateFilter
}: InsightsPanelProps) {
  const featureMenuRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [featureMenuOpen, setFeatureMenuOpen] = useState(false);
  const [enabledFeatures, setEnabledFeatures] = useState<ReadonlySet<InsightFeatureId>>(() => new Set(INSIGHT_FEATURES.map((feature) => feature.id)));
  const isEnabled = (feature: InsightFeatureId): boolean => enabledFeatures.has(feature);
  const duplicateGroups = isEnabled('duplicates') ? insights.duplicateGroups.slice(0, MAX_ITEMS) : [];
  const graphqlOperations = isEnabled('graphql') ? insights.graphqlOperations.slice(0, MAX_ITEMS) : [];
  const errorClusters = isEnabled('errors') ? insights.errorClusters.slice(0, MAX_ITEMS) : [];
  const slowEndpoints = isEnabled('slow') ? insights.slowEndpoints.slice(0, MAX_ITEMS) : [];
  const sensitiveFindings = isEnabled('sensitive') ? insights.sensitiveFindings.slice(0, MAX_ITEMS) : [];
  const cacheInsights = isEnabled('cache') ? insights.cacheInsights.slice(0, MAX_ITEMS) : [];
  const schemaDrifts = isEnabled('schema') ? insights.schemaDrifts.slice(0, MAX_ITEMS) : [];
  const hasAvailableInsights =
    insights.duplicateGroups.length > 0 ||
    insights.graphqlOperations.length > 0 ||
    insights.errorClusters.length > 0 ||
    insights.slowEndpoints.length > 0 ||
    insights.sensitiveFindings.length > 0 ||
    insights.cacheInsights.length > 0 ||
    insights.schemaDrifts.length > 0;
  const isInitialEmpty = requestCount === 0 && !hasAvailableInsights;
  const hasVisibleInsights =
    duplicateGroups.length > 0 ||
    graphqlOperations.length > 0 ||
    errorClusters.length > 0 ||
    slowEndpoints.length > 0 ||
    sensitiveFindings.length > 0 ||
    cacheInsights.length > 0 ||
    schemaDrifts.length > 0;

  useCloseMenuOnOutsideClick(featureMenuRef, featureMenuOpen, () => setFeatureMenuOpen(false));

  if (!hasAvailableInsights && !isInitialEmpty) {
    return null;
  }

  const toggleFeature = (feature: InsightFeatureId) => {
    setEnabledFeatures((currentFeatures) => {
      const nextFeatures = new Set(currentFeatures);
      if (nextFeatures.has(feature)) {
        nextFeatures.delete(feature);
      } else {
        nextFeatures.add(feature);
      }

      return nextFeatures;
    });
  };
  const summaryChipClassName = (filterId: InsightSummaryFilterId) =>
    activeSummaryFilters?.has(filterId) ? 'insight-summary-chip active' : 'insight-summary-chip';
  const renderSummaryChip = (filterId: InsightSummaryFilterId, label: string) => (
    <button
      type="button"
      className={summaryChipClassName(filterId)}
      role="checkbox"
      aria-checked={activeSummaryFilters?.has(filterId) ?? false}
      onClick={() => onToggleSummaryFilter?.(filterId)}
    >
      {label}
    </button>
  );

  return (
    <section className={`insights-panel ${collapsed ? 'collapsed' : ''} ${isInitialEmpty ? 'initial-empty' : ''}`} aria-label="Network insights">
      <div className="insight-toolbar">
        <div className="insight-summary">
          {isInitialEmpty ? <span>Waiting for requests</span> : null}
          {!isInitialEmpty && isEnabled('duplicates') ? (
            <>
              {renderSummaryChip('duplicate-groups', `${insights.duplicateGroups.length} duplicate groups`)}
              {renderSummaryChip('repeated-requests', `${insights.duplicateRequestCount} repeated requests`)}
            </>
          ) : null}
          {!isInitialEmpty && isEnabled('graphql') && insights.graphqlOperations.length > 0 ? (
            <>
              {renderSummaryChip('graphql', `${insights.graphqlOperations.length} GraphQL operations`)}
              {renderSummaryChip('graphql-errors', `${insights.graphqlErrorOperationCount} with errors`)}
            </>
          ) : null}
          {!isInitialEmpty && isEnabled('errors') ? renderSummaryChip('error-clusters', `${insights.errorClusters.length} error clusters`) : null}
          {!isInitialEmpty && isEnabled('sensitive') ? renderSummaryChip('sensitive', `${insights.sensitiveFindings.length} sensitive hits`) : null}
          {!isInitialEmpty && isEnabled('schema') ? renderSummaryChip('schema', `${insights.schemaDrifts.length} schema drifts`) : null}
        </div>

        <div className="insight-toolbar-actions">
          <button
            type="button"
            className="column-menu-button insight-collapse-button"
            aria-label={collapsed ? 'Expand insight widgets' : 'Collapse insight widgets'}
            aria-expanded={!isInitialEmpty && !collapsed}
            aria-controls={isInitialEmpty ? undefined : 'insight-lists'}
            onClick={() => {
              if (!isInitialEmpty) {
                setCollapsed((isCollapsed) => !isCollapsed);
              }
            }}
          >
            <svg className="insight-collapse-icon" viewBox="0 0 24 24" aria-hidden="true">
              <rect className="insight-collapse-frame" x="4" y="5" width="16" height="14" rx="3" />
              <path className="insight-collapse-lid" d="M7 9h10" />
              <path className="insight-collapse-card insight-collapse-card-primary" d="M7 13h4" />
              <path className="insight-collapse-card insight-collapse-card-secondary" d="M13 13h4" />
              <path className="insight-collapse-arrow" d="M8 17h8m-3-3 3 3-3 3" />
            </svg>
            <span>Widgets</span>
          </button>

          <div className="insight-feature-menu" ref={featureMenuRef}>
            <button
              type="button"
              className="column-menu-button"
              aria-label="Show or hide insight features"
              aria-expanded={featureMenuOpen}
              onClick={() => setFeatureMenuOpen((open) => !open)}
            >
              <CogIcon />
            </button>
            {featureMenuOpen ? (
              <div className="column-menu-popover insight-feature-popover">
                {INSIGHT_FEATURES.map((feature) => (
                  <label key={feature.id} className="column-menu-item">
                    <input type="checkbox" checked={enabledFeatures.has(feature.id)} onChange={() => toggleFeature(feature.id)} />
                    <span>{feature.label}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {!isInitialEmpty ? <div id="insight-lists" className="insight-body" aria-hidden={collapsed}>
        {hasVisibleInsights ? <div className="insight-lists">
          {duplicateGroups.length ? (
            <InsightCard title="Top Duplicates">
              {duplicateGroups.map((group) => {
                const duplicateLabel = group.graphqlOperationName ?? group.path;
                const title = group.graphqlOperationName ? `${group.method} ${duplicateLabel} (${group.domain}${group.path})` : `${group.method} ${group.domain}${group.path}`;

                return (
                  <button
                    type="button"
                    className={activeDuplicateFilters?.has(group.key) ? 'insight-row insight-filter-row active' : 'insight-row insight-filter-row'}
                    key={group.key}
                    role="checkbox"
                    aria-checked={activeDuplicateFilters?.has(group.key) ?? false}
                    title={`Filter by repeated request ${title}`}
                    onClick={() => onToggleDuplicateFilter?.(group.key)}
                  >
                    <strong>{group.count}x</strong>
                    <span>{group.method}</span>
                    <span className="insight-path">{duplicateLabel}</span>
                    <em>{formatDuration(group.avgDurationMs)} avg</em>
                  </button>
                );
              })}
            </InsightCard>
          ) : null}

          {graphqlOperations.length ? (
            <InsightCard title="GraphQL Operations">
              {graphqlOperations.map((operation) => (
                <button
                  type="button"
                  className={activeOperationFilters?.has(operation.key) ? 'insight-row insight-filter-row active' : 'insight-row insight-filter-row'}
                  key={operation.key}
                  role="checkbox"
                  aria-checked={activeOperationFilters?.has(operation.key) ?? false}
                  title={`Filter by ${operation.operationName}`}
                  onClick={() => onToggleOperationFilter?.(operation.key)}
                >
                  <strong>{operation.count}x</strong>
                  <span className={`tag gql-${operation.operationType}`}>{operation.operationType}</span>
                  <span className="insight-path">{operation.operationName}</span>
                  {operation.errorCount ? <em className="danger-text">{operation.errorCount} errors</em> : <em>{formatDuration(operation.avgDurationMs)} avg</em>}
                </button>
              ))}
            </InsightCard>
          ) : null}

          {errorClusters.length ? (
            <InsightCard title="Error Clusters">
              {errorClusters.map((cluster) => (
                <div className="insight-row" key={cluster.key} title={`${cluster.method} ${cluster.domain}${cluster.path}`}>
                  <strong>{cluster.count}x</strong>
                  <span className="tag danger">{cluster.status}</span>
                  <span className="insight-path">{cluster.path}</span>
                  <em className="danger-text">{cluster.message}</em>
                </div>
              ))}
            </InsightCard>
          ) : null}

          {slowEndpoints.length ? (
            <InsightCard title="Slow Endpoints">
              {slowEndpoints.map((endpoint) => (
                <div className="insight-row" key={endpoint.key} title={`${endpoint.method} ${endpoint.domain}${endpoint.path}`}>
                  <strong>{formatDuration(endpoint.avgDurationMs)}</strong>
                  <span>{endpoint.method}</span>
                  <span className="insight-path">{endpoint.path}</span>
                  <em>{formatDuration(endpoint.maxDurationMs)} max</em>
                </div>
              ))}
            </InsightCard>
          ) : null}

          {sensitiveFindings.length ? (
            <InsightCard title="Sensitive Data">
              {sensitiveFindings.map((finding) => (
                <div className="insight-row" key={finding.key} title={finding.path}>
                  <strong>{finding.kind}</strong>
                  <span className="tag danger">privacy</span>
                  <span className="insight-path">{finding.path}</span>
                  <em>{finding.location}</em>
                </div>
              ))}
            </InsightCard>
          ) : null}

          {cacheInsights.length ? (
            <InsightCard title="Cache Hints">
              {cacheInsights.map((insight) => (
                <div className="insight-row" key={insight.key} title={insight.path}>
                  <strong>GET</strong>
                  <span className="tag duplicate-tag">cache</span>
                  <span className="insight-path">{insight.path}</span>
                  <em>{insight.message}</em>
                </div>
              ))}
            </InsightCard>
          ) : null}

          {schemaDrifts.length ? (
            <InsightCard title="Schema Drift">
              {schemaDrifts.map((drift) => (
                <div className="insight-row" key={drift.key} title={`${drift.method} ${drift.domain}${drift.path}`}>
                  <strong>{drift.variants} shapes</strong>
                  <span>{drift.method}</span>
                  <span className="insight-path">{drift.path}</span>
                  <em>{drift.requestIds.length} calls</em>
                </div>
              ))}
            </InsightCard>
          ) : null}
        </div> : <div className="empty-state compact">All insight features are hidden.</div>}
      </div> : null}
    </section>
  );
});
