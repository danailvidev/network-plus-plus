import { useMemo, useState, type ReactNode } from 'react';

import type { GraphQLInfo } from '../graphql/graphql-model';
import { copyText } from '../utils/download';
import { stringifyUnknown } from '../utils/format';
import { CopyIcon } from './icons';

type GraphQLDetailsProps = {
  graphql: GraphQLInfo | undefined;
};

type InspectorSection = 'query' | 'variables' | 'data' | 'errors';

const SECTION_LABELS: Record<InspectorSection, string> = {
  query: 'Query',
  variables: 'Variables',
  data: 'Response',
  errors: 'Errors'
};

const OperationSummary = ({ operation }: { operation: GraphQLInfo }) => (
  <div className="graphql-summary">
    <span>Type: {operation.operationType ?? 'unknown'}</span>
    <span>Name: {operation.operationName ?? 'anonymous'}</span>
    <span>Errors: {operation.errors?.length ?? 0}</span>
  </div>
);

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const highlightMatches = (text: string, query: string): ReactNode => {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return text;
  }

  const parts = text.split(new RegExp(`(${escapeRegExp(normalizedQuery)})`, 'ig'));
  return parts.map((part, index) =>
    part.toLowerCase() === normalizedQuery.toLowerCase() ? (
      <mark key={`${part}-${index}`}>{part}</mark>
    ) : (
      part
    )
  );
};

const countMatches = (text: string, query: string): number => {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return 0;
  }

  return text.match(new RegExp(escapeRegExp(normalizedQuery), 'gi'))?.length ?? 0;
};

const getSectionText = (operation: GraphQLInfo, section: InspectorSection): string => {
  if (section === 'query') {
    return operation.query || 'No query document captured.';
  }

  if (section === 'variables') {
    return stringifyUnknown(operation.variables) || 'No variables captured.';
  }

  if (section === 'data') {
    return stringifyUnknown(operation.data) || 'No response data captured.';
  }

  return stringifyUnknown(operation.errors) || 'No GraphQL errors detected.';
};

const GraphQLInspectorPane = ({
  operation,
  section,
  search,
  onSearchChange,
  didCopy,
  onCopy
}: {
  operation: GraphQLInfo;
  section: InspectorSection;
  search: string;
  onSearchChange: (section: InspectorSection, value: string) => void;
  didCopy: boolean;
  onCopy: (section: InspectorSection, text: string) => void;
}) => {
  const text = getSectionText(operation, section);
  const matchCount = countMatches(text, search);
  const label = SECTION_LABELS[section];

  return (
    <section className="graphql-inspector-pane" aria-label={`GraphQL ${label}`}>
      <div className="graphql-pane-header">
        <h3>{label}</h3>
        <div className="graphql-pane-search-wrap">
          <label className="graphql-pane-search">
            <span>Search {label.toLowerCase()}</span>
            <input
              type="search"
              value={search}
              placeholder="Search"
              onChange={(event) => onSearchChange(section, event.target.value)}
            />
          </label>
        </div>
      </div>
      <div className="graphql-pane-meta">{search.trim() ? `${matchCount} match${matchCount === 1 ? '' : 'es'}` : `${text.length.toLocaleString()} chars`}</div>
      <div className="graphql-pane-content">
        <button
          type="button"
          className="ghost-button body-toolbar-icon-button graphql-pane-copy-button"
          onClick={() => onCopy(section, text)}
          aria-label={`Copy GraphQL ${label.toLowerCase()}`}
          title={didCopy ? 'Copied' : `Copy ${label.toLowerCase()}`}
        >
          <CopyIcon />
        </button>
        <pre>{highlightMatches(text, search)}</pre>
      </div>
    </section>
  );
};

export const GraphQLDetails = ({ graphql }: GraphQLDetailsProps) => {
  const [selectedOperationIndex, setSelectedOperationIndex] = useState(0);
  const [sectionSearch, setSectionSearch] = useState<Record<InspectorSection, string>>({
    query: '',
    variables: '',
    data: '',
    errors: ''
  });
  const [copiedSection, setCopiedSection] = useState<InspectorSection | undefined>();

  const operations = useMemo(() => (graphql?.batched && graphql.operations?.length ? graphql.operations : graphql ? [graphql] : []), [graphql]);
  const activeOperationIndex = Math.min(selectedOperationIndex, Math.max(operations.length - 1, 0));
  const selectedOperation = operations[activeOperationIndex];

  if (!graphql) {
    return <div className="empty-state compact">This request was not detected as GraphQL.</div>;
  }

  if (!selectedOperation) {
    return <div className="empty-state compact">No GraphQL operation details were captured.</div>;
  }

  const updateSectionSearch = (section: InspectorSection, value: string) => {
    setSectionSearch((current) => ({ ...current, [section]: value }));
  };

  const copySection = async (section: InspectorSection, text: string) => {
    await copyText(text);
    setCopiedSection(section);
    window.setTimeout(() => {
      setCopiedSection((current) => (current === section ? undefined : current));
    }, 1400);
  };

  return (
    <div className="graphql-inspector">
      <section className="details-card graphql-operation-card">
        <div>
          <h3>Operation</h3>
          <OperationSummary operation={selectedOperation} />
        </div>
        {graphql.batched && operations.length > 1 ? (
          <div className="graphql-operation-switcher" aria-label="Batched GraphQL operations">
            {operations.map((operation, index) => (
              <button
                type="button"
                key={`${operation.operationName ?? 'anonymous'}-${index}`}
                className={index === activeOperationIndex ? 'active' : ''}
                onClick={() => setSelectedOperationIndex(index)}
              >
                {operation.operationName ?? `Operation ${index + 1}`}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {graphql.batched && operations.length > 1 ? (
        <div className="graphql-batch-summary">
          Showing {activeOperationIndex + 1} of {operations.length} batched operations
        </div>
      ) : null}

      <div className="graphql-inspector-grid">
        {(['query', 'variables', 'data', 'errors'] as InspectorSection[]).map((section) => (
          <GraphQLInspectorPane
            key={section}
            operation={selectedOperation}
            section={section}
            search={sectionSearch[section]}
            onSearchChange={updateSectionSearch}
            didCopy={copiedSection === section}
            onCopy={(sectionToCopy, text) => void copySection(sectionToCopy, text)}
          />
        ))}
      </div>
    </div>
  );
};
