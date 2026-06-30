import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent, type PointerEvent } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnOrderState,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  useReactTable
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';

import type { NetworkRequest } from '../network/request-model';
import { useRequestsStore } from '../state/requests-store';
import { formatBytes, formatDuration, formatTime } from '../utils/format';
import { getRequestColorTone, type ColorTone } from './ColorLegend';
import { RequestContextMenu } from './ExportMenu';
import { CogIcon } from './icons';
import { useCloseMenuOnOutsideClick } from './useCloseMenuOnOutsideClick';

type NetworkTableProps = {
  requests: NetworkRequest[];
  colorEnabled: boolean;
  selectedColorTones: ReadonlySet<ColorTone>;
  duplicateRequestCounts: ReadonlyMap<string, number>;
  requestInsightCounts: ReadonlyMap<string, number>;
};

const INITIAL_COLUMN_ORDER = ['method', 'status', 'size', 'duration', 'url', 'domain', 'resourceType', 'started', 'cached', 'graphql', 'duplicates', 'insights', 'tags'];
const DEFAULT_COLUMN_VISIBILITY: VisibilityState = {
  domain: false,
  resourceType: false,
  started: false,
  cached: false,
  graphql: false,
  duplicates: true,
  insights: true,
  tags: false
};

const COLUMN_LABELS: Record<string, string> = {
  method: 'Method',
  status: 'Status',
  size: 'Size',
  duration: 'Time',
  url: 'URL',
  domain: 'Domain',
  resourceType: 'Type',
  started: 'Started',
  cached: 'Cached',
  graphql: 'GraphQL',
  duplicates: 'Repeats',
  insights: 'Insights',
  tags: 'Tags'
};

type RequestContextMenuState = {
  request: NetworkRequest;
  position: { x: number; y: number };
};

type ScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

type ScrollbarDragState = {
  pointerId: number;
  thumbOffsetY: number;
};

const StatusBadge = ({ request }: { request: NetworkRequest }) => {
  if (request.state === 'pending') {
    return <span className="status-badge status-pending">Pending</span>;
  }

  const status = request.status ?? 'ERR';
  return <span className={`status-badge status-${request.status ? Math.floor(request.status / 100) : 'err'}`}>{status}</span>;
};

const getGraphQLOperationLabel = (request: NetworkRequest) => {
  const operationType = request.graphql?.operationType;
  const operationName = request.graphql?.operationName ?? 'GraphQL';

  if (!operationType) {
    return {
      badge: 'G',
      title: operationName,
      className: 'gql-operation-unknown'
    };
  }

  return {
    badge: operationType[0]?.toUpperCase() ?? 'G',
    title: operationName,
    className: `gql-operation-${operationType}`
  };
};

const getTrailingPathLabel = (request: NetworkRequest) => {
  const pathname = (() => {
    try {
      return new URL(request.url).pathname;
    } catch {
      return request.path;
    }
  })();
  const segments = pathname
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .filter(Boolean);

  const pathLabel = segments.slice(-2).join('/') || '/';

  if (pathLabel !== '/' && pathLabel.length === 1 && request.domain) {
    return `${request.domain}/${pathLabel}`;
  }

  return pathLabel;
};

const MethodIcon = ({ request }: { request: NetworkRequest }) => {
  if (request.graphql) {
    const operation = getGraphQLOperationLabel(request);
    const operationType = request.graphql.operationType ?? 'operation';
    const title = `GraphQL ${operationType}: ${operation.title}`;

    return (
      <span className="graphql-method" title={title} aria-label={title}>
        <span className={`graphql-method-badge ${operation.className}`}>{operation.badge}</span>
        <span className="graphql-method-name">{operation.title}</span>
      </span>
    );
  }

  const method = request.method;
  const normalizedMethod = method.toUpperCase();
  const pathLabel = getTrailingPathLabel(request);
  const title = `${normalizedMethod} ${request.path}`;
  const path =
    normalizedMethod === 'POST'
      ? 'M12 5v14M5 12h14'
      : normalizedMethod === 'DELETE'
        ? 'M7 7l10 10M17 7L7 17'
        : normalizedMethod === 'PUT' || normalizedMethod === 'PATCH'
          ? 'M6 15.5V18h2.5L18 8.5 15.5 6 6 15.5z'
          : 'M7 12h10M13 8l4 4-4 4';

  return (
    <span className="rest-method" title={title} aria-label={title}>
      <span className={`method-icon method-${normalizedMethod.toLowerCase()}`} aria-hidden="true">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d={path} />
        </svg>
      </span>
      <span className="rest-method-name">{pathLabel}</span>
    </span>
  );
};

const DuplicateBadge = ({ count }: { count: number | undefined }) => (count && count > 1 ? <span className="tag duplicate-tag">{count}x repeat</span> : '-');

const InsightBadge = ({ count }: { count: number | undefined }) => (count ? <span className="tag insight-tag">{count} insight{count === 1 ? '' : 's'}</span> : '-');

const TagList = ({ request, duplicateCount }: { request: NetworkRequest; duplicateCount: number | undefined }) => (
  <div className="tag-list">
    {request.graphql ? <span className="tag graphql-tag">GraphQL</span> : null}
    {request.graphql?.operationType ? <span className={`tag gql-${request.graphql.operationType}`}>{request.graphql.operationType}</span> : null}
    {request.graphql?.batched ? <span className="tag">Batched</span> : null}
    {request.graphql?.errors?.length ? <span className="tag danger">GraphQL Errors</span> : null}
    {duplicateCount && duplicateCount > 1 ? <span className="tag duplicate-tag">{duplicateCount}x repeat</span> : null}
    {request.tags.filter((tag) => tag !== 'graphql').map((tag) => (
      <span className="tag" key={tag}>
        {tag}
      </span>
    ))}
  </div>
);

export const NetworkTable = memo(function NetworkTable({ requests, colorEnabled, selectedColorTones, duplicateRequestCounts, requestInsightCounts }: NetworkTableProps) {
  const tableRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const verticalScrollbarRef = useRef<HTMLDivElement>(null);
  const verticalScrollbarThumbRef = useRef<HTMLDivElement>(null);
  const scrollbarDragRef = useRef<ScrollbarDragState | undefined>(undefined);
  const columnMenuRef = useRef<HTMLDivElement>(null);
  const requestContextMenuRef = useRef<HTMLDivElement>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(INITIAL_COLUMN_ORDER);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(DEFAULT_COLUMN_VISIBILITY);
  const [draggedColumnId, setDraggedColumnId] = useState<string | undefined>();
  const [dragOverColumnId, setDragOverColumnId] = useState<string | undefined>();
  const activeRequestId = useRequestsStore((state) => state.activeRequestId);
  const setActiveRequestId = useRequestsStore((state) => state.setActiveRequestId);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [requestContextMenu, setRequestContextMenu] = useState<RequestContextMenuState | undefined>();
  const [bodyScrollMetrics, setBodyScrollMetrics] = useState<ScrollMetrics>({
    scrollTop: 0,
    scrollHeight: 0,
    clientHeight: 0
  });

  useCloseMenuOnOutsideClick(columnMenuRef, columnMenuOpen, () => setColumnMenuOpen(false));
  useCloseMenuOnOutsideClick(requestContextMenuRef, Boolean(requestContextMenu), () => setRequestContextMenu(undefined));

  const columns = useMemo<ColumnDef<NetworkRequest>[]>(
    () => [
      {
        accessorKey: 'method',
        header: 'Method',
        size: 150,
        cell: ({ row }) => <MethodIcon request={row.original} />
      },
      {
        id: 'status',
        accessorFn: (request) => request.status ?? 0,
        header: 'Status',
        size: 82,
        cell: ({ row }) => <StatusBadge request={row.original} />
      },
      {
        accessorKey: 'url',
        header: 'URL',
        size: 560,
        cell: ({ row }) => (
          <div className="url-cell" title={row.original.url}>
            <strong>{row.original.url}</strong>
          </div>
        )
      },
      {
        accessorKey: 'domain',
        header: 'Domain',
        size: 200
      },
      {
        accessorKey: 'resourceType',
        header: 'Type',
        size: 110
      },
      {
        id: 'size',
        accessorFn: (request) => request.sizeBytes ?? 0,
        header: 'Size',
        size: 92,
        cell: ({ row }) => formatBytes(row.original.sizeBytes)
      },
      {
        id: 'duration',
        accessorFn: (request) => request.durationMs ?? 0,
        header: 'Time',
        size: 104,
        cell: ({ row }) => formatDuration(row.original.durationMs)
      },
      {
        id: 'started',
        accessorFn: (request) => request.startTime,
        header: 'Started',
        size: 118,
        cell: ({ row }) => formatTime(row.original.startTime)
      },
      {
        id: 'cached',
        accessorFn: (request) => request.cached,
        header: 'Cached',
        size: 86,
        cell: ({ row }) => (row.original.cached ? 'Yes' : 'No')
      },
      {
        id: 'graphql',
        accessorFn: (request) => request.graphql?.operationName ?? '',
        header: 'GraphQL',
        size: 160,
        cell: ({ row }) => row.original.graphql?.operationName ?? row.original.graphql?.operationType ?? '-'
      },
      {
        id: 'duplicates',
        accessorFn: (request) => duplicateRequestCounts.get(request.id) ?? 0,
        header: 'Repeats',
        size: 100,
        cell: ({ row }) => <DuplicateBadge count={duplicateRequestCounts.get(row.original.id)} />
      },
      {
        id: 'insights',
        accessorFn: (request) => requestInsightCounts.get(request.id) ?? 0,
        header: 'Insights',
        size: 108,
        cell: ({ row }) => <InsightBadge count={requestInsightCounts.get(row.original.id)} />
      },
      {
        id: 'tags',
        header: 'Tags',
        size: 280,
        cell: ({ row }) => (
          <TagList
            request={row.original}
            duplicateCount={duplicateRequestCounts.get(row.original.id)}
          />
        )
      }
    ],
    [duplicateRequestCounts, requestInsightCounts]
  );

  const table = useReactTable({
    data: requests,
    columns,
    state: { sorting, columnOrder, columnVisibility },
    onSortingChange: setSorting,
    onColumnOrderChange: setColumnOrder,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    columnResizeMode: 'onChange',
    enableColumnResizing: true,
    defaultColumn: {
      minSize: 44,
      maxSize: 960
    }
  });

  const reorderColumn = (sourceColumnId: string, targetColumnId: string) => {
    if (sourceColumnId === targetColumnId) {
      return;
    }

    setColumnOrder((currentOrder) => {
      const sourceIndex = currentOrder.indexOf(sourceColumnId);
      const targetIndex = currentOrder.indexOf(targetColumnId);

      if (sourceIndex === -1 || targetIndex === -1) {
        return currentOrder;
      }

      const nextOrder = [...currentOrder];
      const [movedColumn] = nextOrder.splice(sourceIndex, 1);
      if (!movedColumn) {
        return currentOrder;
      }

      nextOrder.splice(targetIndex, 0, movedColumn);

      return nextOrder;
    });
  };

  const startColumnDrag = (event: DragEvent<HTMLButtonElement>, columnId: string) => {
    setDraggedColumnId(columnId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', columnId);
  };

  const handleColumnDragOver = (event: DragEvent<HTMLDivElement>, columnId: string) => {
    if (!draggedColumnId || draggedColumnId === columnId) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverColumnId(columnId);
  };

  const handleColumnDrop = (event: DragEvent<HTMLDivElement>, columnId: string) => {
    event.preventDefault();
    const sourceColumnId = event.dataTransfer.getData('text/plain') || draggedColumnId;

    if (sourceColumnId) {
      reorderColumn(sourceColumnId, columnId);
    }

    setDraggedColumnId(undefined);
    setDragOverColumnId(undefined);
  };

  const endColumnDrag = () => {
    setDraggedColumnId(undefined);
    setDragOverColumnId(undefined);
  };

  const openRequestContextMenu = (event: MouseEvent<HTMLDivElement>, request: NetworkRequest) => {
    event.preventDefault();
    setActiveRequestId(request.id);
    setRequestContextMenu({
      request,
      position: { x: event.clientX, y: event.clientY }
    });
  };

  const getAutosizeWidth = (element: HTMLElement) => {
    const clone = element.cloneNode(true) as HTMLElement;
    clone.style.position = 'absolute';
    clone.style.inset = '0 auto auto 0';
    clone.style.width = 'max-content';
    clone.style.maxWidth = 'none';
    clone.style.height = 'auto';
    clone.style.visibility = 'hidden';
    clone.style.pointerEvents = 'none';
    clone.style.overflow = 'visible';
    clone.style.whiteSpace = 'nowrap';

    clone.querySelectorAll<HTMLElement>('*').forEach((child) => {
      child.style.width = 'max-content';
      child.style.maxWidth = 'none';
      child.style.overflow = 'visible';
    });

    document.body.appendChild(clone);
    const width = Math.ceil(clone.getBoundingClientRect().width);
    clone.remove();

    return width;
  };

  const compactColumnToContent = (columnId: string) => {
    const rootElement = tableRef.current;
    const column = table.getColumn(columnId);
    if (!rootElement || !column) {
      return;
    }

    const measuredWidth = Array.from(rootElement.querySelectorAll<HTMLElement>('[data-column-id]')).reduce((largestWidth, element) => {
      if (element.dataset.columnId !== columnId) {
        return largestWidth;
      }

      return Math.max(largestWidth, getAutosizeWidth(element));
    }, 0);

    const minSize = column.columnDef.minSize ?? table.options.defaultColumn?.minSize ?? 44;
    const maxSize = column.columnDef.maxSize ?? table.options.defaultColumn?.maxSize ?? 960;
    const nextSize = Math.min(maxSize, Math.max(minSize, measuredWidth));

    table.setColumnSizing((currentSizing) => ({
      ...currentSizing,
      [columnId]: nextSize
    }));
  };

  const rows = table.getRowModel().rows;
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 16
  });
  const totalWidth = table.getTotalSize();
  const latestRequestId = requests.at(-1)?.id;
  const hasVerticalOverflow = bodyScrollMetrics.scrollHeight - bodyScrollMetrics.clientHeight > 1;
  const scrollbarTrackHeight = Math.max(0, bodyScrollMetrics.clientHeight);
  const scrollbarThumbHeight = hasVerticalOverflow
    ? Math.max(24, Math.min(scrollbarTrackHeight, (bodyScrollMetrics.clientHeight / bodyScrollMetrics.scrollHeight) * scrollbarTrackHeight))
    : scrollbarTrackHeight;
  const scrollbarMaxThumbOffset = Math.max(0, scrollbarTrackHeight - scrollbarThumbHeight);
  const scrollbarMaxScrollTop = Math.max(0, bodyScrollMetrics.scrollHeight - bodyScrollMetrics.clientHeight);
  const scrollbarThumbTop = scrollbarMaxScrollTop > 0 ? (bodyScrollMetrics.scrollTop / scrollbarMaxScrollTop) * scrollbarMaxThumbOffset : 0;
  const verticalScrollbarStyle = {
    '--table-scrollbar-thumb-height': `${scrollbarThumbHeight}px`,
    '--table-scrollbar-thumb-top': `${scrollbarThumbTop}px`
  } as CSSProperties;

  const updateBodyScrollMetrics = useCallback(() => {
    const scrollElement = parentRef.current;
    if (!scrollElement) {
      return;
    }

    const nextMetrics: ScrollMetrics = {
      scrollTop: scrollElement.scrollTop,
      scrollHeight: scrollElement.scrollHeight,
      clientHeight: scrollElement.clientHeight
    };

    setBodyScrollMetrics((currentMetrics) =>
      currentMetrics.scrollTop === nextMetrics.scrollTop &&
      currentMetrics.scrollHeight === nextMetrics.scrollHeight &&
      currentMetrics.clientHeight === nextMetrics.clientHeight
        ? currentMetrics
        : nextMetrics
    );
  }, []);

  const scrollToScrollbarPointer = useCallback(
    (clientY: number, thumbOffsetY: number) => {
      const scrollElement = parentRef.current;
      const scrollbarElement = verticalScrollbarRef.current;
      if (!scrollElement || !scrollbarElement || !hasVerticalOverflow || scrollbarMaxThumbOffset === 0) {
        return;
      }

      const scrollbarRect = scrollbarElement.getBoundingClientRect();
      const nextThumbTop = Math.min(scrollbarMaxThumbOffset, Math.max(0, clientY - scrollbarRect.top - thumbOffsetY));
      scrollElement.scrollTop = (nextThumbTop / scrollbarMaxThumbOffset) * scrollbarMaxScrollTop;
      updateBodyScrollMetrics();
    },
    [hasVerticalOverflow, scrollbarMaxScrollTop, scrollbarMaxThumbOffset, updateBodyScrollMetrics]
  );

  const startVerticalScrollbarDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!hasVerticalOverflow) {
      return;
    }

    event.preventDefault();
    const thumbRect = verticalScrollbarThumbRef.current?.getBoundingClientRect();
    const clickedThumb = event.target === verticalScrollbarThumbRef.current;
    const thumbOffsetY = clickedThumb && thumbRect ? event.clientY - thumbRect.top : scrollbarThumbHeight / 2;

    scrollbarDragRef.current = {
      pointerId: event.pointerId,
      thumbOffsetY
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    scrollToScrollbarPointer(event.clientY, thumbOffsetY);
  };

  const moveVerticalScrollbarDrag = (event: PointerEvent<HTMLDivElement>) => {
    const dragState = scrollbarDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    scrollToScrollbarPointer(event.clientY, dragState.thumbOffsetY);
  };

  const endVerticalScrollbarDrag = (event: PointerEvent<HTMLDivElement>) => {
    const dragState = scrollbarDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    scrollbarDragRef.current = undefined;
  };

  useLayoutEffect(() => {
    if (activeRequestId || !latestRequestId || rows.length === 0) {
      return undefined;
    }

    const latestRowIndex = rows.findIndex((row) => row.original.id === latestRequestId);
    if (latestRowIndex === -1) {
      return undefined;
    }

    rowVirtualizer.scrollToIndex(latestRowIndex, { align: 'end' });
    const frameId = window.requestAnimationFrame(() => {
      const scrollElement = parentRef.current;
      if (!scrollElement) {
        return;
      }

      scrollElement.scrollTop = scrollElement.scrollHeight;
      updateBodyScrollMetrics();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeRequestId, latestRequestId, rowVirtualizer, rows, updateBodyScrollMetrics]);

  useLayoutEffect(() => {
    updateBodyScrollMetrics();

    const scrollElement = parentRef.current;
    if (!scrollElement) {
      return undefined;
    }

    const resizeObserver = new ResizeObserver(updateBodyScrollMetrics);
    resizeObserver.observe(scrollElement);

    if (scrollElement.firstElementChild) {
      resizeObserver.observe(scrollElement.firstElementChild);
    }

    return () => resizeObserver.disconnect();
  }, [rowVirtualizer, rows.length, totalWidth, updateBodyScrollMetrics]);

  return (
    <div className={`network-table ${colorEnabled ? 'coloring-enabled' : ''}`} ref={tableRef}>
      <div className="table-column-menu" ref={columnMenuRef}>
        <button
          type="button"
          className="column-menu-button"
          aria-label="Show or hide columns"
          aria-expanded={columnMenuOpen}
          onClick={() => setColumnMenuOpen((open) => !open)}
        >
          <CogIcon />
        </button>
        {columnMenuOpen ? (
          <div className="column-menu-popover">
            {table.getAllLeafColumns().map((column) => (
              <label key={column.id} className="column-menu-item">
                <input type="checkbox" checked={column.getIsVisible()} onChange={column.getToggleVisibilityHandler()} />
                <span>{COLUMN_LABELS[column.id] ?? column.id}</span>
              </label>
            ))}
          </div>
        ) : null}
      </div>
      <div className="table-horizontal-scroll">
        <div className="table-header" style={{ minWidth: totalWidth }}>
          {table.getHeaderGroups().map((headerGroup) => (
            <div className="table-row header-row" key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <div
                  key={header.id}
                  className={`table-cell header-cell ${header.column.id === dragOverColumnId ? 'drag-over' : ''} ${
                    header.column.id === draggedColumnId ? 'is-dragging' : ''
                  }`}
                  style={{ width: header.getSize() }}
                  data-column-id={header.column.id}
                  onDragOver={(event) => handleColumnDragOver(event, header.column.id)}
                  onDrop={(event) => handleColumnDrop(event, header.column.id)}
                >
                  <button
                    type="button"
                    className="header-sort-button"
                    draggable
                    aria-label={`Sort and move ${COLUMN_LABELS[header.column.id] ?? header.column.id} column`}
                    onClick={header.column.getToggleSortingHandler()}
                    onDragStart={(event) => startColumnDrag(event, header.column.id)}
                    onDragEnd={endColumnDrag}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    <span className="sort-indicator">
                      {header.column.getIsSorted() === 'asc' ? '▲' : header.column.getIsSorted() === 'desc' ? '▼' : ''}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`column-resizer ${header.column.getIsResizing() ? 'is-resizing' : ''}`}
                    aria-label={`Resize ${header.column.id} column. Double-click to fit content.`}
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                    onDoubleClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      compactColumnToContent(header.column.id);
                    }}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className={`table-body ${hasVerticalOverflow ? 'is-vertically-scrollable' : ''}`} ref={parentRef} onScroll={updateBodyScrollMetrics} style={{ minWidth: totalWidth }}>
          {rows.length === 0 ? (
            <div className="empty-state">No requests match the current filters.</div>
          ) : (
            <div className="virtual-spacer" style={{ height: rowVirtualizer.getTotalSize() }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index];
                if (!row) return null;
                const request = row.original;
                const rowTone = getRequestColorTone(request);
                const toneClass = colorEnabled && rowTone && selectedColorTones.has(rowTone) ? `tone-${rowTone}` : '';

                return (
                  <div
                    key={row.id}
                    className={`table-row request-row ${toneClass} ${request.id === activeRequestId ? 'active' : ''}`}
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                    onClick={() => setActiveRequestId(request.id)}
                    onContextMenu={(event) => openRequestContextMenu(event, request)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <div className="table-cell" key={cell.id} style={{ width: cell.column.getSize() }} data-column-id={cell.column.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <div
        className={`table-vertical-scrollbar ${hasVerticalOverflow ? 'is-scrollable' : ''}`}
        ref={verticalScrollbarRef}
        aria-hidden="true"
        style={verticalScrollbarStyle}
        onPointerDown={startVerticalScrollbarDrag}
        onPointerMove={moveVerticalScrollbarDrag}
        onPointerUp={endVerticalScrollbarDrag}
        onPointerCancel={endVerticalScrollbarDrag}
        onLostPointerCapture={() => {
          scrollbarDragRef.current = undefined;
        }}
      >
        <div className="table-vertical-scrollbar-thumb" ref={verticalScrollbarThumbRef} />
      </div>
      {requestContextMenu ? (
        <div ref={requestContextMenuRef}>
          <RequestContextMenu
            request={requestContextMenu.request}
            position={requestContextMenu.position}
            onClose={() => setRequestContextMenu(undefined)}
          />
        </div>
      ) : null}
    </div>
  );
});
