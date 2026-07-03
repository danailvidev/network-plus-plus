import { memo, useMemo } from 'react';

import type { HeaderRecord, NetworkRequest, QueryParamsRecord, RequestTiming } from '../network/request-model';
import { formatBytes, formatDuration, prettyJson, stringifyUnknown } from '../utils/format';

type RequestDiffProps = {
  baseRequest: NetworkRequest;
  compareRequest: NetworkRequest;
};

type DiffStatus = 'same' | 'changed' | 'added' | 'removed';

type FieldDiff = {
  name: string;
  baseValue: string;
  compareValue: string;
  status: DiffStatus;
};

type TextDiffRow = {
  key: string;
  lineNumber: number;
  baseLine: string;
  compareLine: string;
  status: DiffStatus;
};

const EMPTY_VALUE = '-';
const MAX_TEXT_DIFF_ROWS = 360;

const normalizeValue = (value: unknown): string => {
  if (value === undefined || value === null || value === '') {
    return EMPTY_VALUE;
  }

  return String(value);
};

const getDiffStatus = (baseValue: string, compareValue: string): DiffStatus => {
  if (baseValue === compareValue) return 'same';
  if (baseValue === EMPTY_VALUE) return 'added';
  if (compareValue === EMPTY_VALUE) return 'removed';
  return 'changed';
};

const createFieldDiff = (name: string, baseValue: unknown, compareValue: unknown): FieldDiff => {
  const normalizedBaseValue = normalizeValue(baseValue);
  const normalizedCompareValue = normalizeValue(compareValue);

  return {
    name,
    baseValue: normalizedBaseValue,
    compareValue: normalizedCompareValue,
    status: getDiffStatus(normalizedBaseValue, normalizedCompareValue)
  };
};

const createRecordDiffs = (baseRecord: Record<string, string>, compareRecord: Record<string, string>): FieldDiff[] => {
  const keys = Array.from(new Set([...Object.keys(baseRecord), ...Object.keys(compareRecord)])).sort((left, right) => left.localeCompare(right));
  return keys.map((key) => createFieldDiff(key, baseRecord[key], compareRecord[key]));
};

const normalizeQueryParams = (queryParams: QueryParamsRecord): Record<string, string> =>
  Object.fromEntries(Object.entries(queryParams).map(([key, values]) => [key, values.join(', ')]));

const normalizeTiming = (timing: RequestTiming | undefined): Record<string, string> =>
  Object.fromEntries(Object.entries(timing ?? {}).map(([key, value]) => [key, formatDuration(value)]));

const normalizeBodyText = (value: string | undefined): string => {
  if (!value) {
    return '';
  }

  const prettyValue = prettyJson(value);
  return prettyValue || value;
};

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

const getResponseBody = (request: NetworkRequest): string | undefined =>
  request.responseBody ?? decodeHarText(request.rawHarEntry?.response.content?.text, request.rawHarEntry?.response.content?.encoding);

const createTextDiffRows = (baseText: string, compareText: string): TextDiffRow[] => {
  const baseLines = baseText ? baseText.split('\n') : [];
  const compareLines = compareText ? compareText.split('\n') : [];
  const rowCount = Math.max(baseLines.length, compareLines.length);
  const rows: TextDiffRow[] = [];

  for (let index = 0; index < rowCount && rows.length < MAX_TEXT_DIFF_ROWS; index += 1) {
    const baseLine = baseLines[index] ?? '';
    const compareLine = compareLines[index] ?? '';
    const baseValue = baseLine || EMPTY_VALUE;
    const compareValue = compareLine || EMPTY_VALUE;
    const status = getDiffStatus(baseValue, compareValue);

    if (status !== 'same') {
      rows.push({
        key: `${index}-${baseLine}-${compareLine}`,
        lineNumber: index + 1,
        baseLine,
        compareLine,
        status
      });
    }
  }

  return rows;
};

const getGraphQLVariablesText = (request: NetworkRequest): string => {
  if (!request.graphql) {
    return '';
  }

  if (request.graphql.operations?.length) {
    return stringifyUnknown(request.graphql.operations.map((operation) => operation.variables));
  }

  return stringifyUnknown(request.graphql.variables);
};

const getChangedCount = (diffs: FieldDiff[]): number => diffs.filter((diff) => diff.status !== 'same').length;

const DiffBadge = ({ status }: { status: DiffStatus }) => (
  <span className={`diff-badge diff-${status}`}>{status === 'same' ? 'Same' : status === 'added' ? 'Added' : status === 'removed' ? 'Removed' : 'Changed'}</span>
);

const DiffTable = ({ title, diffs, emptyLabel = 'No differences.' }: { title: string; diffs: FieldDiff[]; emptyLabel?: string }) => {
  const changedDiffs = diffs.filter((diff) => diff.status !== 'same');

  return (
    <section className="details-card diff-section">
      <div className="diff-section-header">
        <h3>{title}</h3>
        <span>{changedDiffs.length} changed</span>
      </div>
      {changedDiffs.length === 0 ? (
        <p>{emptyLabel}</p>
      ) : (
        <table className="diff-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Base</th>
              <th>Compare</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {changedDiffs.map((diff) => (
              <tr key={diff.name} className={`diff-row diff-${diff.status}`}>
                <th>{diff.name}</th>
                <td>{diff.baseValue}</td>
                <td>{diff.compareValue}</td>
                <td>
                  <DiffBadge status={diff.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
};

const BodyDiff = ({ title, baseText, compareText }: { title: string; baseText: string; compareText: string }) => {
  const rows = useMemo(() => createTextDiffRows(baseText, compareText), [baseText, compareText]);
  const hasMoreRows = rows.length === MAX_TEXT_DIFF_ROWS;

  return (
    <section className="details-card diff-section">
      <div className="diff-section-header">
        <h3>{title}</h3>
        <span>{rows.length} changed lines</span>
      </div>
      {rows.length === 0 ? (
        <p>No body differences.</p>
      ) : (
        <>
          <div className="diff-body-table" role="table" aria-label={`${title} line differences`}>
            <div className="diff-body-row diff-body-heading" role="row">
              <span role="columnheader">Line</span>
              <span role="columnheader">Base</span>
              <span role="columnheader">Compare</span>
            </div>
            {rows.map((row) => (
              <div className={`diff-body-row diff-${row.status}`} role="row" key={row.key}>
                <span role="cell">{row.lineNumber}</span>
                <code role="cell">{row.baseLine || EMPTY_VALUE}</code>
                <code role="cell">{row.compareLine || EMPTY_VALUE}</code>
              </div>
            ))}
          </div>
          {hasMoreRows ? <p>Showing the first {MAX_TEXT_DIFF_ROWS} changed lines.</p> : null}
        </>
      )}
    </section>
  );
};

export const RequestDiff = memo(function RequestDiff({ baseRequest, compareRequest }: RequestDiffProps) {
  const overviewDiffs = useMemo(
    () => [
      createFieldDiff('Method', baseRequest.method, compareRequest.method),
      createFieldDiff('URL', baseRequest.url, compareRequest.url),
      createFieldDiff('Path', baseRequest.path, compareRequest.path),
      createFieldDiff('Domain', baseRequest.domain, compareRequest.domain),
      createFieldDiff('Status', baseRequest.status ?? baseRequest.state, compareRequest.status ?? compareRequest.state),
      createFieldDiff('Status Text', baseRequest.statusText, compareRequest.statusText),
      createFieldDiff('Duration', formatDuration(baseRequest.durationMs), formatDuration(compareRequest.durationMs)),
      createFieldDiff('Size', formatBytes(baseRequest.sizeBytes), formatBytes(compareRequest.sizeBytes)),
      createFieldDiff('MIME Type', baseRequest.mimeType, compareRequest.mimeType),
      createFieldDiff('GraphQL Operation', baseRequest.graphql?.operationName, compareRequest.graphql?.operationName),
      createFieldDiff('GraphQL Type', baseRequest.graphql?.operationType, compareRequest.graphql?.operationType)
    ],
    [baseRequest, compareRequest]
  );
  const queryDiffs = useMemo(
    () => createRecordDiffs(normalizeQueryParams(baseRequest.queryParams), normalizeQueryParams(compareRequest.queryParams)),
    [baseRequest.queryParams, compareRequest.queryParams]
  );
  const requestHeaderDiffs = useMemo(
    () => createRecordDiffs(baseRequest.requestHeaders as HeaderRecord, compareRequest.requestHeaders as HeaderRecord),
    [baseRequest.requestHeaders, compareRequest.requestHeaders]
  );
  const responseHeaderDiffs = useMemo(
    () => createRecordDiffs(baseRequest.responseHeaders as HeaderRecord, compareRequest.responseHeaders as HeaderRecord),
    [baseRequest.responseHeaders, compareRequest.responseHeaders]
  );
  const timingDiffs = useMemo(
    () => createRecordDiffs(normalizeTiming(baseRequest.timing), normalizeTiming(compareRequest.timing)),
    [baseRequest.timing, compareRequest.timing]
  );
  const graphqlVariableDiffs = useMemo(
    () => createTextDiffRows(getGraphQLVariablesText(baseRequest), getGraphQLVariablesText(compareRequest)),
    [baseRequest, compareRequest]
  );
  const requestBodyText = useMemo(() => normalizeBodyText(baseRequest.requestBody), [baseRequest.requestBody]);
  const compareRequestBodyText = useMemo(() => normalizeBodyText(compareRequest.requestBody), [compareRequest.requestBody]);
  const responseBodyText = useMemo(() => normalizeBodyText(getResponseBody(baseRequest)), [baseRequest]);
  const compareResponseBodyText = useMemo(() => normalizeBodyText(getResponseBody(compareRequest)), [compareRequest]);
  const totalChanged =
    getChangedCount(overviewDiffs) +
    getChangedCount(queryDiffs) +
    getChangedCount(requestHeaderDiffs) +
    getChangedCount(responseHeaderDiffs) +
    getChangedCount(timingDiffs) +
    createTextDiffRows(requestBodyText, compareRequestBodyText).length +
    createTextDiffRows(responseBodyText, compareResponseBodyText).length +
    graphqlVariableDiffs.length;

  return (
    <div className="details-stack request-diff">
      <section className="details-card diff-summary-card">
        <div>
          <span className="eyebrow">Diff</span>
          <h3>{totalChanged} differences</h3>
        </div>
        <div className="diff-request-pair">
          <span title={baseRequest.url}>Base: {baseRequest.method} {baseRequest.path}</span>
          <span title={compareRequest.url}>Compare: {compareRequest.method} {compareRequest.path}</span>
        </div>
      </section>
      <DiffTable title="Summary" diffs={overviewDiffs} />
      <DiffTable title="Query Parameters" diffs={queryDiffs} />
      <DiffTable title="Request Headers" diffs={requestHeaderDiffs} />
      <DiffTable title="Response Headers" diffs={responseHeaderDiffs} />
      <DiffTable title="Timing" diffs={timingDiffs} />
      <BodyDiff title="Request Body" baseText={requestBodyText} compareText={compareRequestBodyText} />
      <BodyDiff title="Response Body" baseText={responseBodyText} compareText={compareResponseBodyText} />
      <BodyDiff title="GraphQL Variables" baseText={getGraphQLVariablesText(baseRequest)} compareText={getGraphQLVariablesText(compareRequest)} />
    </div>
  );
});
