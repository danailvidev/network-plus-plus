import { useRef, useState, type ReactNode } from 'react';

import type { NetworkInsights } from '../analysis/network-insights';
import { formatDuration } from '../utils/format';
import { CogIcon } from './icons';
import { useCloseMenuOnOutsideClick } from './useCloseMenuOnOutsideClick';

type InsightsPanelProps = {
  insights: NetworkInsights;
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

export const InsightsPanel = ({ insights }: InsightsPanelProps) => {
  const featureMenuRef = useRef<HTMLDivElement>(null);
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
  const hasVisibleInsights =
    duplicateGroups.length > 0 ||
    graphqlOperations.length > 0 ||
    errorClusters.length > 0 ||
    slowEndpoints.length > 0 ||
    sensitiveFindings.length > 0 ||
    cacheInsights.length > 0 ||
    schemaDrifts.length > 0;

  useCloseMenuOnOutsideClick(featureMenuRef, featureMenuOpen, () => setFeatureMenuOpen(false));

  if (!hasAvailableInsights) {
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

  return (
    <section className="insights-panel" aria-label="Network insights">
      <div className="insight-toolbar">
        <div className="insight-summary">
          {isEnabled('duplicates') ? (
            <>
              <span>{insights.duplicateGroups.length} duplicate groups</span>
              <span>{insights.duplicateRequestCount} repeated requests</span>
            </>
          ) : null}
          {isEnabled('graphql') ? (
            <>
              <span>{insights.graphqlOperations.length} GraphQL operations</span>
              <span>{insights.graphqlErrorOperationCount} with errors</span>
            </>
          ) : null}
          {isEnabled('errors') ? <span>{insights.errorClusters.length} error clusters</span> : null}
          {isEnabled('sensitive') ? <span>{insights.sensitiveFindings.length} sensitive hits</span> : null}
          {isEnabled('schema') ? <span>{insights.schemaDrifts.length} schema drifts</span> : null}
        </div>

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

      {hasVisibleInsights ? <div className="insight-lists">
        {duplicateGroups.length ? (
          <InsightCard title="Top Duplicates">
            {duplicateGroups.map((group) => (
              <div className="insight-row" key={group.key} title={`${group.method} ${group.domain}${group.path}`}>
                <strong>{group.count}x</strong>
                <span>{group.method}</span>
                <span className="insight-path">{group.path}</span>
                <em>{formatDuration(group.avgDurationMs)} avg</em>
              </div>
            ))}
          </InsightCard>
        ) : null}

        {graphqlOperations.length ? (
          <InsightCard title="GraphQL Operations">
            {graphqlOperations.map((operation) => (
              <div className="insight-row" key={operation.key} title={operation.operationName}>
                <strong>{operation.count}x</strong>
                <span className={`tag gql-${operation.operationType}`}>{operation.operationType}</span>
                <span className="insight-path">{operation.operationName}</span>
                {operation.errorCount ? <em className="danger-text">{operation.errorCount} errors</em> : <em>{formatDuration(operation.avgDurationMs)} avg</em>}
              </div>
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
    </section>
  );
};
