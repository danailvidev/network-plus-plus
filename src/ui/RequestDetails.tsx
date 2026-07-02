import { memo, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { foldAll, HighlightStyle, syntaxHighlighting, unfoldAll } from '@codemirror/language';
import { highlightSelectionMatches, openSearchPanel, search, searchKeymap, SearchQuery, setSearchQuery } from '@codemirror/search';
import { EditorSelection, Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { tags } from '@lezer/highlight';

import { exportRequestAsCurl } from '../export/curl-export';
import type { HeaderRecord, NetworkRequest } from '../network/request-model';
import { useRequestsStore } from '../state/requests-store';
import { useSettingsStore } from '../state/settings-store';
import { copyText } from '../utils/download';
import { formatBytes, formatDuration, formatTime, prettyJson } from '../utils/format';
import type { DetailsLayout } from './App';
import { GraphQLDetails } from './GraphQLDetails';
import { CopyIcon, PanelBottomIcon, PanelRightIcon, XIcon } from './icons';

type RequestDetailsProps = {
  request: NetworkRequest | undefined;
  searchQuery: string;
  insightCount?: number;
  layout: DetailsLayout;
  onToggleLayout: () => void;
};

type DetailsTab = 'summary' | 'headers' | 'query' | 'request' | 'response' | 'graphql' | 'timing' | 'raw' | 'export';
type ParsedBody = {
  text: string;
  type: 'json' | 'form' | 'text';
  label: string;
};

type BodyViewerProps = {
  value: string | undefined;
  mimeType?: string;
  searchQuery?: string;
  showScrollOverview?: boolean;
  showJsonFoldingControls?: boolean;
};

type ScrollOverviewState = {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
};

const TABS: Array<{ id: DetailsTab; label: string }> = [
  { id: 'summary', label: 'Summary' },
  { id: 'headers', label: 'Headers' },
  { id: 'query', label: 'Query Params' },
  { id: 'request', label: 'Request Body' },
  { id: 'response', label: 'Response Body' },
  { id: 'graphql', label: 'GraphQL' },
  { id: 'timing', label: 'Timing' },
  { id: 'raw', label: 'Raw' },
  { id: 'export', label: 'Export' }
];

const getVisibleTabs = (request: NetworkRequest): Array<{ id: DetailsTab; label: string }> =>
  TABS.filter((tab) => tab.id !== 'graphql' || Boolean(request.graphql));

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const codeHighlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: 'var(--code-property)' },
  { tag: tags.string, color: 'var(--code-string)' },
  { tag: tags.number, color: 'var(--code-number)' },
  { tag: [tags.bool, tags.null], color: 'var(--code-literal)' },
  { tag: tags.punctuation, color: 'var(--code-punctuation)' },
  { tag: tags.invalid, color: 'var(--failed)' }
]);

const selectEntireDocument = (view: EditorView): boolean => {
  view.focus();
  view.dispatch({
    selection: EditorSelection.range(0, view.state.doc.length),
    scrollIntoView: true
  });

  return true;
};

const isFindShortcut = (event: KeyboardEvent): boolean => (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f';

const focusSearchPanelInput = (view: EditorView) => {
  view.focus();
  openSearchPanel(view);
  window.requestAnimationFrame(() => {
    const searchInput = view.dom.querySelector<HTMLInputElement>('.cm-search input');
    searchInput?.focus();
    searchInput?.select();
  });

  return true;
};

const useBodyViewerFindShortcut = () => {
  const editorViewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    const handleFindShortcut = (event: KeyboardEvent) => {
      const view = editorViewRef.current;
      if (!view || !isFindShortcut(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      focusSearchPanelInput(view);
    };

    window.addEventListener('keydown', handleFindShortcut, { capture: true });
    return () => window.removeEventListener('keydown', handleFindShortcut, { capture: true });
  }, []);

  return editorViewRef;
};

const bodyViewerKeymap = Prec.highest(
  keymap.of([
    { key: 'Ctrl-a', run: selectEntireDocument },
    { key: 'Mod-a', run: selectEntireDocument },
    { key: 'Mod-f', run: focusSearchPanelInput },
    ...searchKeymap
  ])
);

const bodyViewerBasicSetup = {
  lineNumbers: true,
  foldGutter: true,
  searchKeymap: false,
  highlightSelectionMatches: false
};

const createBodyViewerTheme = (prefersDarkTheme: boolean) => [
  EditorView.theme(
    {
      '&': {
        backgroundColor: 'var(--code-bg)',
        color: 'var(--code-text)',
        fontSize: '12px'
      },
      '&.cm-focused': {
        outline: 'none'
      },
      '&.cm-focused .cm-cursor': {
        borderLeftColor: 'var(--accent)'
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: 'var(--code-selection)'
      },
      '.cm-content': {
        caretColor: 'var(--accent)'
      },
      '.cm-scroller': {
        fontFamily: 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace',
        lineHeight: '1.5'
      },
      '.cm-gutters': {
        backgroundColor: 'var(--code-bg)',
        borderRight: '1px solid var(--border)',
        color: 'var(--code-line)'
      },
      '.cm-activeLine, .cm-activeLineGutter': {
        backgroundColor: 'transparent'
      },
      '.cm-foldGutter span': {
        color: 'var(--muted)'
      },
      '.cm-selectionMatch': {
        backgroundColor: 'var(--code-selection-match)'
      },
      '.cm-searchMatch': {
        backgroundColor: 'var(--code-search-match)',
        outline: '1px solid var(--code-search-match-border)'
      },
      '.cm-searchMatch-selected': {
        backgroundColor: 'var(--code-search-match-selected)',
        outline: '1px solid var(--accent)'
      },
      '.cm-panels': {
        backgroundColor: 'var(--panel-strong)',
        color: 'var(--text)'
      },
      '.cm-panels-top': {
        borderBottom: '1px solid var(--border)'
      },
      '.cm-search': {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: '7px',
        padding: '8px 10px'
      },
      '.cm-search input': {
        height: '28px',
        border: '1px solid var(--accent-border)',
        borderRadius: '7px',
        backgroundColor: 'var(--field-bg)',
        color: 'var(--code-text)',
        padding: '4px 8px'
      },
      '.cm-search input[name="search"]': {
        width: 'clamp(150px, 28vw, 260px)'
      },
      '.cm-search input[type="checkbox"]': {
        width: '14px',
        height: '14px',
        margin: '0',
        accentColor: 'var(--accent)'
      },
      '.cm-search input:focus-visible': {
        borderColor: 'var(--accent)',
        outline: '2px solid var(--accent-bg-strong)',
        outlineOffset: '1px'
      },
      '.cm-search button, .cm-search label': {
        minHeight: '28px',
        color: 'var(--text)',
        fontSize: '12px'
      },
      '.cm-search button': {
        cursor: 'pointer',
        border: '1px solid var(--accent-border)',
        borderRadius: '7px',
        backgroundColor: 'var(--panel-soft)',
        padding: '4px 9px'
      },
      '.cm-search button:hover, .cm-search button:focus-visible': {
        borderColor: 'var(--accent)',
        backgroundColor: 'var(--accent-bg-strong)'
      },
      '.cm-panel.cm-search button[name="close"]': {
        position: 'static',
        flex: '0 0 auto',
        margin: '0'
      },
      '.cm-search button[name="close"]': {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: '28px',
        padding: '0'
      },
      '.cm-search label': {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        whiteSpace: 'nowrap'
      }
    },
    { dark: prefersDarkTheme }
  ),
  search({ top: true }),
  syntaxHighlighting(codeHighlightStyle),
  highlightSelectionMatches({ minSelectionLength: 1, maxMatches: 500, wholeWords: false }),
  EditorView.lineWrapping,
  bodyViewerKeymap
];

const usePrefersDarkTheme = (): boolean => {
  const [prefersDarkTheme, setPrefersDarkTheme] = useState(() => globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true);

  useEffect(() => {
    const mediaQuery = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mediaQuery) return undefined;

    const updateTheme = () => setPrefersDarkTheme(mediaQuery.matches);
    updateTheme();
    mediaQuery.addEventListener('change', updateTheme);

    return () => mediaQuery.removeEventListener('change', updateTheme);
  }, []);

  return prefersDarkTheme;
};

const highlighted = (text: string, query: string) => {
  const terms = query
    .split(/\s+/)
    .map((term) => term.replace(/^-[^:]+:/, '').replace(/^[^:]+:/, ''))
    .filter((term) => term.length >= 3);
  const term = terms[0];

  if (!term) return text;

  const parts = text.split(new RegExp(`(${escapeRegExp(term)})`, 'ig'));
  return parts.map((part, index) =>
    part.toLowerCase() === term.toLowerCase() ? (
      <mark key={`${part}-${index}`}>{part}</mark>
    ) : (
      part
    )
  );
};

const HeadersTable = ({ headers, searchQuery }: { headers: HeaderRecord; searchQuery: string }) => (
  <table className="kv-table">
    <tbody>
      {Object.entries(headers).map(([name, value]) => (
        <tr key={name}>
          <th>{highlighted(name, searchQuery)}</th>
          <td>{highlighted(value, searchQuery)}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

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

const looksLikeJson = (value: string): boolean => {
  const trimmed = value.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
};

const parseBody = (value: string | undefined, mimeType: string | undefined): ParsedBody => {
  if (!value) {
    return { text: 'No body captured.', type: 'text', label: 'Empty' };
  }

  const normalizedMime = mimeType?.toLowerCase() ?? '';
  if (normalizedMime.includes('json') || looksLikeJson(value)) {
    return { text: prettyJson(value) || value, type: 'json', label: 'JSON' };
  }

  if (normalizedMime.includes('x-www-form-urlencoded')) {
    const parsed = new URLSearchParams(value);
    return {
      text: Array.from(parsed.entries())
        .map(([key, fieldValue]) => `${key}: ${fieldValue}`)
        .join('\n'),
      type: 'form',
      label: 'Form'
    };
  }

  return { text: value, type: 'text', label: normalizedMime || 'Text' };
};

const findCaseInsensitiveMatch = (text: string, query: string): { from: number; to: number } | undefined => {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return undefined;
  }

  const from = text.toLowerCase().indexOf(normalizedQuery.toLowerCase());
  return from === -1 ? undefined : { from, to: from + normalizedQuery.length };
};

const getResponseBody = (request: NetworkRequest): string | undefined =>
  request.responseBody ?? decodeHarText(request.rawHarEntry?.response.content?.text, request.rawHarEntry?.response.content?.encoding);

const sampleOverviewLines = (text: string, maxLines = 240): string[] => {
  const lines = text.split('\n');
  if (lines.length <= maxLines) {
    return lines;
  }

  const sampleStep = lines.length / maxLines;
  return Array.from({ length: maxLines }, (_, index) => lines[Math.floor(index * sampleStep)] ?? '');
};

const BodyScrollOverview = ({ text, editorView }: { text: string; editorView: EditorView | null }) => {
  const [scrollState, setScrollState] = useState<ScrollOverviewState>({ clientHeight: 1, scrollHeight: 1, scrollTop: 0 });
  const lines = useMemo(() => sampleOverviewLines(text), [text]);

  useEffect(() => {
    if (!editorView) {
      return undefined;
    }

    const scrollElement = editorView.scrollDOM;
    const updateScrollState = () => {
      setScrollState({
        clientHeight: scrollElement.clientHeight,
        scrollHeight: scrollElement.scrollHeight,
        scrollTop: scrollElement.scrollTop
      });
    };

    updateScrollState();
    scrollElement.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);
    const resizeObserver = globalThis.ResizeObserver ? new ResizeObserver(updateScrollState) : undefined;
    resizeObserver?.observe(scrollElement);
    if (scrollElement.firstElementChild) {
      resizeObserver?.observe(scrollElement.firstElementChild);
    }

    return () => {
      scrollElement.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
      resizeObserver?.disconnect();
    };
  }, [editorView, text]);

  const canScroll = scrollState.scrollHeight > scrollState.clientHeight;
  const viewportHeight = canScroll ? Math.max(12, (scrollState.clientHeight / scrollState.scrollHeight) * 100) : 100;
  const viewportTop = canScroll
    ? Math.min(100 - viewportHeight, (scrollState.scrollTop / (scrollState.scrollHeight - scrollState.clientHeight)) * (100 - viewportHeight))
    : 0;

  const scrollToOverviewPosition = (clientY: number, element: HTMLButtonElement) => {
    if (!editorView || !canScroll) {
      return;
    }

    const bounds = element.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientY - bounds.top) / bounds.height));
    editorView.scrollDOM.scrollTop = ratio * (scrollState.scrollHeight - scrollState.clientHeight);
    editorView.focus();
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    scrollToOverviewPosition(event.clientY, event.currentTarget);
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      scrollToOverviewPosition(event.clientY, event.currentTarget);
    }
  };

  return (
    <button
      type="button"
      className="body-scroll-overview"
      aria-label="Response body scroll overview"
      title="Scroll overview"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
    >
      <span className="body-scroll-overview-lines" aria-hidden="true">
        {lines.map((line, index) => {
          const trimmedLength = line.trim().length;
          const indent = Math.min(28, Math.max(0, line.length - line.trimStart().length) * 2);
          const width = Math.min(100 - indent, Math.max(14, trimmedLength * 2.2));

          return <span key={`${index}-${line}`} style={{ marginLeft: `${indent}%`, width: `${width}%` }} />;
        })}
      </span>
      <span className="body-scroll-overview-viewport" style={{ height: `${viewportHeight}%`, top: `${viewportTop}%` }} aria-hidden="true" />
    </button>
  );
};

const getStatusLabel = (request: NetworkRequest): string => {
  if (request.state === 'pending') return 'Pending';
  return String(request.status ?? 'Failed');
};

const formatRawResponse = (request: NetworkRequest): string => {
  const statusLine = request.state === 'pending' ? 'HTTP Pending' : `HTTP ${request.status ?? 'ERR'}${request.statusText ? ` ${request.statusText}` : ''}`;
  const headers = Object.entries(request.responseHeaders).map(([name, value]) => `${name}: ${value}`);
  const body = getResponseBody(request) ?? '';

  return [statusLine, ...headers, '', body || 'No body captured.'].join('\n');
};

const BodyViewer = ({ value, mimeType, searchQuery = '', showScrollOverview = false, showJsonFoldingControls = false }: BodyViewerProps) => {
  const parsedBody = parseBody(value, mimeType);
  const prefersDarkTheme = usePrefersDarkTheme();
  const editorViewRef = useBodyViewerFindShortcut();
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const [isJsonCollapsed, setIsJsonCollapsed] = useState(false);
  const isJsonCollapsedRef = useRef(false);
  const [didCopyJson, setDidCopyJson] = useState(false);
  const canFoldJson = showJsonFoldingControls && parsedBody.type === 'json' && Boolean(editorView);
  const canCopyResponse = showJsonFoldingControls && Boolean(value);
  const editorExtensions = useMemo(
    () => [...createBodyViewerTheme(prefersDarkTheme), ...(parsedBody.type === 'json' ? [json()] : [])],
    [parsedBody.type, prefersDarkTheme]
  );

  useEffect(() => {
    isJsonCollapsedRef.current = false;
    setIsJsonCollapsed(false);
    setDidCopyJson(false);
  }, [parsedBody.text]);

  useEffect(() => {
    if (!editorView || searchQuery.trim()) {
      return;
    }

    window.requestAnimationFrame(() => {
      editorView.scrollDOM.scrollTo({ top: 0, left: 0 });
    });
  }, [editorView, parsedBody.text, searchQuery]);

  useEffect(() => {
    if (!editorView) {
      return;
    }

    const normalizedQuery = searchQuery.trim();
    const match = findCaseInsensitiveMatch(parsedBody.text, normalizedQuery);
    const searchEffect = setSearchQuery.of(
      new SearchQuery({
        search: normalizedQuery,
        caseSensitive: false,
        regexp: false
      })
    );

    if (!match) {
      editorView.dispatch({ effects: searchEffect });
      return;
    }

    const selection = EditorSelection.range(match.from, match.to);
    editorView.dispatch({
      effects: [searchEffect, EditorView.scrollIntoView(selection, { y: 'center' })],
      selection
    });
  }, [editorView, parsedBody.text, searchQuery]);

  const toggleJsonFolding = () => {
    if (!editorView) {
      return;
    }

    const nextCollapsedState = !isJsonCollapsedRef.current;
    isJsonCollapsedRef.current = nextCollapsedState;
    (nextCollapsedState ? foldAll : unfoldAll)(editorView);
    setIsJsonCollapsed(nextCollapsedState);
    window.requestAnimationFrame(() => editorView.scrollDOM.dispatchEvent(new Event('scroll')));
  };

  const copyResponseBody = async () => {
    await copyText(parsedBody.text);
    setDidCopyJson(true);
    window.setTimeout(() => setDidCopyJson(false), 1400);
  };

  return (
    <div className={`body-viewer${showScrollOverview ? ' has-scroll-overview' : ''}`}>
      <div className="body-viewer-toolbar">
        <div className="body-viewer-toolbar-meta">
          <span>{parsedBody.label}</span>
          {mimeType ? <span>{mimeType}</span> : null}
        </div>
        {showJsonFoldingControls ? (
          <div className="body-viewer-toolbar-actions" aria-label="JSON response folding controls">
            <button
              type="button"
              className="ghost-button compact-button"
              disabled={!canFoldJson}
              onClick={toggleJsonFolding}
              aria-pressed={isJsonCollapsed}
            >
              {isJsonCollapsed ? 'Expand' : 'Collapse'}
            </button>
            <button
              type="button"
              className="ghost-button body-toolbar-icon-button"
              disabled={!canCopyResponse}
              onClick={() => void copyResponseBody()}
              aria-label="Copy response body"
              title={didCopyJson ? 'Copied' : 'Copy response body'}
            >
              <CopyIcon />
            </button>
          </div>
        ) : null}
      </div>
      <div className="body-viewer-editor">
        <CodeMirror
          value={parsedBody.text}
          readOnly
          basicSetup={bodyViewerBasicSetup}
          extensions={editorExtensions}
          onCreateEditor={(view) => {
            editorViewRef.current = view;
            setEditorView(view);
          }}
        />
        {showScrollOverview ? <BodyScrollOverview text={parsedBody.text} editorView={editorView} /> : null}
      </div>
    </div>
  );
};

const RawResponseViewer = ({ request }: { request: NetworkRequest }) => {
  const prefersDarkTheme = usePrefersDarkTheme();
  const editorViewRef = useBodyViewerFindShortcut();
  const editorExtensions = useMemo(() => createBodyViewerTheme(prefersDarkTheme), [prefersDarkTheme]);

  return (
    <div className="body-viewer">
      <div className="body-viewer-toolbar">
        <span>Raw Response</span>
        {request.mimeType ? <span>{request.mimeType}</span> : null}
      </div>
      <CodeMirror
        value={formatRawResponse(request)}
        readOnly
        basicSetup={bodyViewerBasicSetup}
        extensions={editorExtensions}
        onCreateEditor={(view) => {
          editorViewRef.current = view;
        }}
      />
    </div>
  );
};

export const RequestDetails = memo(function RequestDetails({ request, searchQuery, insightCount, layout, onToggleLayout }: RequestDetailsProps) {
  const [activeTab, setActiveTab] = useState<DetailsTab>('response');
  const setActiveRequestId = useRequestsStore((state) => state.setActiveRequestId);
  const redactExportsByDefault = useSettingsStore((state) => state.redactExportsByDefault);
  const sensitiveFieldNames = useSettingsStore((state) => state.sensitiveFieldNames);

  useEffect(() => {
    setActiveTab('response');
  }, [request?.id]);

  const redaction = useMemo(
    () => ({
      enabled: redactExportsByDefault,
      sensitiveFieldNames
    }),
    [redactExportsByDefault, sensitiveFieldNames]
  );

  if (!request) {
    return (
      <aside className="details-panel">
        <div className="empty-state">Select a request to inspect headers, bodies, GraphQL metadata, timing, and export options.</div>
      </aside>
    );
  }

  const copyCurl = async () => {
    await copyText(exportRequestAsCurl(request, redaction));
  };
  const nextLayoutLabel = layout === 'bottom' ? 'Move details to right side' : 'Move details to bottom';
  const visibleTabs = getVisibleTabs(request);

  return (
    <aside className="details-panel">
      <header className="details-header">
        <div>
          <span className="eyebrow">{request.method}</span>
          <h2>{request.path}</h2>
          <p>{request.domain}</p>
        </div>
        <div className="details-header-actions">
          <button
            type="button"
            className="ghost-button icon-button details-header-button"
            onClick={onToggleLayout}
            aria-label={nextLayoutLabel}
            title={nextLayoutLabel}
          >
            {layout === 'bottom' ? <PanelRightIcon /> : <PanelBottomIcon />}
          </button>
          <button
            type="button"
            className="ghost-button icon-button details-header-button"
            onClick={() => setActiveRequestId(undefined)}
            aria-label="Close details"
            title="Close details"
          >
            <XIcon />
          </button>
        </div>
      </header>

      <nav className="details-tabs" aria-label="Request detail tabs">
        {visibleTabs.map((tab) => (
          <button type="button" key={tab.id} className={tab.id === activeTab ? 'active' : ''} onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="details-content">
        {activeTab === 'summary' ? (
          <div className="details-stack">
            <section className="details-card">
              <h3>Overview</h3>
              <table className="kv-table">
                <tbody>
                  <tr>
                    <th>URL</th>
                    <td>{highlighted(request.url, searchQuery)}</td>
                  </tr>
                  <tr>
                    <th>Status</th>
                    <td>
                      {getStatusLabel(request)} {request.statusText}
                    </td>
                  </tr>
                  <tr>
                    <th>Type</th>
                    <td>{request.resourceType ?? request.mimeType ?? 'unknown'}</td>
                  </tr>
                  <tr>
                    <th>Duration</th>
                    <td>{formatDuration(request.durationMs)}</td>
                  </tr>
                  <tr>
                    <th>Size</th>
                    <td>{formatBytes(request.sizeBytes)}</td>
                  </tr>
                  <tr>
                    <th>Started</th>
                    <td>{formatTime(request.startTime)}</td>
                  </tr>
                  <tr>
                    <th>Tags</th>
                    <td>{request.tags.join(', ') || 'none'}</td>
                  </tr>
                  <tr>
                    <th>Insights</th>
                    <td>{insightCount ? `${insightCount} finding${insightCount === 1 ? '' : 's'}` : 'none'}</td>
                  </tr>
                </tbody>
              </table>
            </section>
          </div>
        ) : null}

        {activeTab === 'headers' ? (
          <div className="details-stack">
            <section className="details-card">
              <h3>Request Headers</h3>
              <HeadersTable headers={request.requestHeaders} searchQuery={searchQuery} />
            </section>
            <section className="details-card">
              <h3>Response Headers</h3>
              <HeadersTable headers={request.responseHeaders} searchQuery={searchQuery} />
            </section>
          </div>
        ) : null}

        {activeTab === 'query' ? (
          <section className="details-card">
            <h3>Query Parameters</h3>
            <table className="kv-table">
              <tbody>
                {Object.entries(request.queryParams).map(([name, values]) => (
                  <tr key={name}>
                    <th>{highlighted(name, searchQuery)}</th>
                    <td>{highlighted(values.join(', '), searchQuery)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {activeTab === 'request' ? <BodyViewer value={request.requestBody} mimeType={request.rawHarEntry?.request.postData?.mimeType} /> : null}
        {activeTab === 'response' ? (
          <BodyViewer value={getResponseBody(request)} mimeType={request.mimeType} searchQuery={searchQuery} showJsonFoldingControls />
        ) : null}
        {activeTab === 'graphql' ? <GraphQLDetails graphql={request.graphql} /> : null}

        {activeTab === 'timing' ? (
          <section className="details-card">
            <h3>Timing</h3>
            <table className="kv-table">
              <tbody>
                {Object.entries(request.timing ?? {}).map(([name, value]) => (
                  <tr key={name}>
                    <th>{name}</th>
                    <td>{formatDuration(value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {activeTab === 'raw' ? <RawResponseViewer request={request} /> : null}

        {activeTab === 'export' ? (
          <section className="details-card">
            <h3>Single Request Export</h3>
            <p>Copy this request as cURL. Request bodies are preserved, and redaction follows the current export setting.</p>
            <button type="button" className="primary-button" onClick={() => void copyCurl()}>
              Copy as cURL
            </button>
          </section>
        ) : null}
      </div>
    </aside>
  );
});
