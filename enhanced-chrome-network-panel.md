# Enhanced Chrome Network Panel - Development Plan

## 1. Goal

Build a Chrome DevTools extension that adds a custom enhanced network panel with richer request visibility, strong filtering and searching, color-coded analysis, GraphQL support, and export tools.

This extension will not replace Chrome's native Network tab. It will add a new DevTools panel, for example:

```text
DevTools > Enhanced Network
```

## 2. Product Scope

The tool should help developers inspect modern web application traffic faster than the default Network tab by adding:

- Better request coloring and visual classification.
- Richer request metadata.
- First-class filtering and searching.
- First-class GraphQL inspection.
- Export workflows for all, filtered, selected, or individual requests.
- Saved views and repeatable debugging filters.
- Local-only privacy-preserving behavior by default.

## 3. Modern Tooling And Best Practices

### Extension Platform

Use Chrome Extension Manifest V3.

Best practices:

- Use `chrome.devtools.panels` to create the custom DevTools panel.
- Use `chrome.devtools.network` for the MVP request capture path.
- Avoid `chrome.debugger` in the MVP unless advanced interception, replay, or response override features are required.
- Keep permissions minimal.
- Do not execute remote code.
- Avoid inline scripts because Manifest V3 has strict CSP expectations.
- Treat request and response bodies as sensitive data.
- Store settings locally with `chrome.storage.local`.
- Make body capture optional.
- Provide export redaction options.

### Recommended Build Tool

Prefer WXT with React and TypeScript for the first implementation.

Reasons:

- Built on Vite.
- Strong Manifest V3 support.
- Good developer experience for extension entrypoints.
- Easier long-term maintenance than hand-rolled extension wiring.
- Suitable for a React DevTools panel UI.

Alternative:

- Use CRXJS with Vite if full control over `manifest.json` is preferred.

### UI Stack

Recommended packages:

- React
- TypeScript
- WXT
- `@tanstack/react-table`
- `@tanstack/react-virtual`
- Zustand or Jotai for UI state
- CodeMirror 6 for JSON, GraphQL, headers, and body viewers
- CSS modules, Tailwind, or vanilla CSS with design tokens
- `zod` for validating persisted settings and saved filters
- `graphql` for parsing GraphQL operations
- Vitest for unit tests
- React Testing Library for UI behavior tests

## 4. Request Capture

Capture network requests from the inspected tab using:

- `chrome.devtools.network.onRequestFinished`
- `chrome.devtools.network.getHAR`
- `request.getContent()` where available

Track:

- URL
- Method
- Status code
- Status text
- Domain
- Path
- Query params
- Request headers
- Response headers
- Request body, when available
- Response body, when available
- MIME type
- Resource type
- Timing data
- Size data
- Cache information
- Error or failure state
- Initiator, where available
- Derived tags such as `slow`, `large`, `graphql`, `cached`, `failed`, and `preflight`

## 5. Data Model

Create a normalized internal request model.

```ts
type NetworkRequest = {
  id: string;
  url: string;
  method: string;
  status: number | null;
  statusText?: string;
  domain: string;
  path: string;
  queryParams: Record<string, string[]>;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  mimeType?: string;
  resourceType?: string;
  startTime: number;
  durationMs?: number;
  sizeBytes?: number;
  cached: boolean;
  failed: boolean;
  tags: string[];
  graphql?: GraphQLInfo;
};

type GraphQLInfo = {
  operationType?: 'query' | 'mutation' | 'subscription';
  operationName?: string;
  query?: string;
  variables?: unknown;
  errors?: unknown[];
  batched?: boolean;
  operations?: GraphQLInfo[];
};
```

Use structured parsing wherever possible:

- Use `URL` and `URLSearchParams` for URL and query parsing.
- Use JSON parsing for JSON request and response bodies.
- Use the `graphql` package to parse GraphQL queries instead of regex-only detection.
- Use schema validation for persisted settings and saved filter definitions.

## 6. Filtering And Searching

Filtering and searching are MVP-critical features.

### Basic Search

Support a global search box that searches across:

- URL
- Domain
- Path
- Method
- Status
- Request headers
- Response headers
- Request body
- Response body
- MIME type
- Query params
- GraphQL operation name
- GraphQL operation type
- GraphQL variables
- GraphQL errors

### Advanced Query Syntax

Support advanced queries such as:

```text
status:>=400 method:POST domain:api duration:>500ms -type:image
```

Recommended operators:

```text
status:200
status:>=400
method:POST
domain:api.example.com
url:/claims
type:json
duration:>300ms
size:>1mb
header:authorization
request-header:x-correlation-id
response-header:cache-control
body:claimId
response:"validation failed"
error:true
cached:false
preflight:false
-type:image
-domain:analytics.example.com
```

### Filter Chips

Add clickable filter chips for common categories:

- `All`
- `Fetch/XHR`
- `Document`
- `JS`
- `CSS`
- `Images`
- `JSON`
- `GraphQL`
- `2xx`
- `3xx`
- `4xx`
- `5xx`
- `Failed`
- `Slow`
- `Large`
- `Cached`
- `Preflight`

### Saved Filters

Allow users to save named filter presets:

- `Errors only`
- `Slow API calls`
- `Auth requests`
- `GraphQL traffic`
- `GraphQL errors`
- `Large responses`
- `Third-party requests`
- `Non-cached requests`

Persist saved filters with `chrome.storage.local`.

### Search UX

The UI should include:

- Debounced search input.
- Search result counts.
- Highlighting inside request details.
- Keyboard shortcut for focus search, such as `/` or `Ctrl+F`.
- Clear search button.
- Recent searches.
- Export filtered results only.

## 7. GraphQL Support

Treat GraphQL requests as a dedicated request type with custom parsing, display, filtering, coloring, and export behavior.

### Detection

Identify GraphQL requests by checking:

- URL patterns such as `/graphql`, `/gql`, or `/api/graphql`.
- `Content-Type: application/json`.
- Request body containing `query`, `operationName`, or `variables`.
- Batched requests where the body is an array of GraphQL operations.

### Captured GraphQL Fields

For GraphQL requests, extract:

- Operation type: `query`, `mutation`, or `subscription`.
- Operation name.
- Raw query document.
- Variables.
- Response `data`.
- Response `errors`.
- Batched operation count.
- Individual operations for batched requests.

### GraphQL Filters

Support GraphQL-specific filters:

```text
graphql
graphql:true
operation:query
operation:mutation
operation:subscription
operationName:GetClaims
gql.name:GetClaims
gql.type:mutation
gql.hasErrors:true
gql.batched:true
gql.variable:claimId
```

Examples:

```text
graphql operation:mutation
graphql gql.hasErrors:true
graphql operationName:GetUser
graphql gql.variable:claimId
```

### GraphQL UI

For GraphQL requests, show dedicated badges:

- `GraphQL`
- `Query`
- `Mutation`
- `Subscription`
- `Batched`
- `GraphQL Errors`

In the request detail panel, add a `GraphQL` tab with:

- Operation name.
- Operation type.
- Pretty-printed query.
- Variables viewer.
- Response data viewer.
- Errors viewer.
- Batched operation breakdown.

### GraphQL Edge Cases

Handle:

- Anonymous operations.
- Persisted queries.
- Batched operations.
- Multipart GraphQL uploads.
- Responses with HTTP `200` but GraphQL `errors`.
- Minified or whitespace-heavy query documents.
- Missing response bodies.

## 8. TanStack Table And Virtualization

Use TanStack for the request table and large-list rendering.

Recommended packages:

- `@tanstack/react-table`
- `@tanstack/react-virtual`

### Why TanStack Table

`@tanstack/react-table` should power the request grid logic while leaving the UI fully custom.

Use it for:

- Sortable columns.
- Column resizing.
- Column visibility.
- Row selection.
- Multi-select export.
- Typed column definitions.
- Controlled table state.
- Integration with custom filters and search.
- Future saved table layouts.

This is a good fit because the enhanced Network panel needs a highly customized UI with colored rows, status badges, icons, tags, and custom context menus.

### Why TanStack Virtual

`@tanstack/react-virtual` should render only visible request rows.

Use it for:

- Large captures with thousands of requests.
- Smooth scrolling.
- Lower DOM size.
- Better performance while filtering and sorting.
- Keeping the panel responsive during heavy debugging sessions.

### Data Flow

```text
Captured requests
  -> normalized NetworkRequest[]
  -> search/filter engine
  -> filtered requests
  -> TanStack Table
  -> TanStack Virtual
  -> custom network table UI
```

### Performance Guidance

- Memoize TanStack column definitions.
- Keep table state controlled.
- Use column resizing in `onEnd` mode initially for smoother performance.
- Calculate column widths once and pass them through CSS variables if resizing performance becomes an issue.
- Use fixed row heights for the MVP.
- Add dynamic row measurement only if needed.

### Tradeoff

TanStack is headless, so it does not provide a finished visual table component. This is acceptable because the project needs a custom DevTools-like interface rather than a generic data grid.

## 9. Request Table

The main table should support:

- Sortable columns.
- Resizable columns.
- Sticky header.
- Virtualized rows.
- Multi-select.
- Right-click actions.
- Keyboard navigation.
- Column visibility settings.
- Saved table layout settings.

Recommended columns:

- Method
- Status
- URL
- Domain
- Type
- Size
- Duration
- Started
- Cached
- GraphQL operation
- Tags

## 10. Request Details Panel

Clicking a request opens a detail drawer or panel with tabs:

- Summary
- Headers
- Query Params
- Request Body
- Response Body
- GraphQL
- Timing
- Cookies
- Raw
- Export

Details panel requirements:

- Pretty-print JSON.
- Pretty-print GraphQL queries.
- Highlight search matches.
- Support copy buttons for common values.
- Support copy as cURL.
- Show warnings for truncated or unavailable bodies.
- Show GraphQL errors even when HTTP status is `200`.

## 11. Color System

Color-code rows and badges by request meaning.

Suggested rules:

- Green: successful `2xx`.
- Blue: redirects `3xx`.
- Orange: client errors `4xx`.
- Red: server errors `5xx`.
- Purple: GraphQL.
- Deep purple: GraphQL mutation.
- Blue-purple: GraphQL query.
- Red-purple: GraphQL response contains `errors`.
- Yellow: slow request.
- Gray: cached request.
- Pink or red highlight: failed or blocked request.

Allow users to customize colors later.

## 12. Export Functions

Support exporting:

- All requests.
- Filtered requests.
- Selected requests.
- Single request.

Formats:

- HAR
- JSON
- CSV
- Markdown summary
- cURL
- Postman-like collection, optional later

Export should reuse the currently filtered dataset and table selection state.

Example actions:

```text
Export All
Export Filtered
Export Selected
Export as HAR
Export as CSV
Export as JSON
Copy as cURL
Copy Summary
Export with Redaction
```

### GraphQL Export

Include GraphQL metadata in JSON and HAR-derived exports.

For Markdown export, include:

```md
### GraphQL Operation

- Type: mutation
- Name: UpdateClaim
- Has Errors: yes
- Variables: included
```

For cURL export, preserve request body exactly so GraphQL operations can be replayed.

## 13. Security And Privacy

Default behavior:

- Store all captured data locally only.
- Do not send captured traffic to external services.
- Do not enable remote analytics for captured request data.
- Add clear warnings before exporting sensitive data.
- Allow users to disable body capture.
- Allow users to clear all captured data.

Add optional redaction rules for headers and body fields:

- `authorization`
- `cookie`
- `set-cookie`
- `x-api-key`
- `token`
- `password`
- `secret`

Export should support:

- Raw export.
- Redacted export.
- Redaction preview.

## 14. Suggested Architecture

```text
Chrome DevTools Extension
  ├─ wxt.config.ts
  ├─ package.json
  ├─ entrypoints/
  │  ├─ devtools.html
  │  ├─ devtools.ts
  │  ├─ panel.html
  │  └─ panel.tsx
  └─ src/
     ├─ network/
     │  ├─ capture.ts
     │  ├─ normalize.ts
     │  ├─ request-model.ts
     │  └─ har.ts
     ├─ graphql/
     │  ├─ detect.ts
     │  ├─ parse.ts
     │  └─ graphql-model.ts
     ├─ search/
     │  ├─ parser.ts
     │  ├─ predicates.ts
     │  └─ search-index.ts
     ├─ export/
     │  ├─ json-export.ts
     │  ├─ csv-export.ts
     │  ├─ har-export.ts
     │  ├─ markdown-export.ts
     │  └─ curl-export.ts
     ├─ privacy/
     │  ├─ redact.ts
     │  └─ sensitive-fields.ts
     ├─ state/
     │  ├─ requests-store.ts
     │  └─ settings-store.ts
     └─ ui/
        ├─ NetworkTable.tsx
        ├─ FilterBar.tsx
        ├─ RequestDetails.tsx
        ├─ GraphQLDetails.tsx
        ├─ ExportMenu.tsx
        └─ ColorLegend.tsx
```

## 15. Milestones

### Phase 1 - Extension Shell

- Create WXT React TypeScript project.
- Configure Manifest V3.
- Add DevTools panel entrypoint.
- Render basic panel UI.
- Confirm the panel opens in Chrome DevTools.

### Phase 2 - Request Capture

- Listen to finished network requests.
- Load initial HAR data when the panel opens.
- Normalize HAR entries into internal request objects.
- Display requests in a basic table.
- Add clear/reset button.

### Phase 3 - Request Table Foundation

- Add TanStack Table.
- Define typed columns for `NetworkRequest`.
- Add sorting for method, status, URL, domain, type, size, and duration.
- Add row selection.
- Add basic column visibility controls.
- Add TanStack Virtual for large request lists.

### Phase 4 - Filtering And Search

- Add global search.
- Add filter chips.
- Add advanced query parser.
- Support negative filters.
- Support numeric filters for status, duration, and size.
- Connect the custom filter/search engine before TanStack Table receives rows.
- Ensure table sorting and selection work on the filtered dataset.
- Add saved filters.

### Phase 5 - GraphQL Support

- Detect GraphQL requests.
- Parse operation type, operation name, query, variables, and errors.
- Add GraphQL badges.
- Add GraphQL filters.
- Add GraphQL tab in request details.
- Handle batched requests and GraphQL errors with HTTP `200`.

### Phase 6 - Detail View

- Add request details drawer.
- Show headers, body, timing, raw request data, and GraphQL metadata.
- Add highlighting for search matches.
- Add copy helpers.

### Phase 7 - Colors And Insights

- Add row color rules.
- Add status, method, type, and GraphQL badges.
- Add automatic tags such as `slow`, `large`, `cached`, `graphql`, and `failed`.
- Add color legend.

### Phase 8 - Export

- Export all requests.
- Export filtered requests.
- Export selected requests.
- Export single request.
- Add JSON, CSV, HAR, Markdown, and cURL support.
- Add redacted export mode.

### Phase 9 - Polish

- Add keyboard shortcuts.
- Add column resizing polish.
- Add settings page.
- Add theme support.
- Improve performance for thousands of requests.
- Add import/export for saved filters and settings.

## 16. Testing Plan

Manual testing should cover:

- Normal page loads.
- API-heavy web apps.
- GraphQL apps.
- Batched GraphQL requests.
- GraphQL responses with HTTP `200` and `errors`.
- Failed requests.
- Redirects.
- Cached requests.
- Large responses.
- Requests with no response body.
- CORS preflight requests.

Automated tests should cover:

- Query parser.
- Filter predicates.
- Export formatting.
- HAR normalization.
- GraphQL detection.
- GraphQL parsing.
- Search matching.
- Color and tag classification.
- Redaction behavior.

Recommended test tools:

- Vitest for parser, filter, export, and redaction unit tests.
- React Testing Library for UI behavior.
- Playwright for extension smoke tests if practical.
- Fixture-based tests for HAR files, GraphQL requests, failed requests, redirects, and large responses.

## 17. Known Limitations

- The native Chrome Network tab cannot be directly replaced.
- Request and response body access may be limited.
- Capture generally requires DevTools to be open.
- Some headers or payloads may be unavailable depending on Chrome restrictions.
- WebSocket support may need separate handling.
- Very large response bodies should be truncated or lazily loaded.
- `chrome.debugger` can conflict with existing DevTools debugger attachments and should be treated as an advanced optional feature.

## 18. MVP Definition

The first useful version should include:

- Custom DevTools panel.
- Request capture.
- Request table.
- TanStack Table and TanStack Virtual.
- Global search.
- Advanced filters.
- Filter chips.
- First-class GraphQL detection and filtering.
- Color-coded rows.
- Request detail panel.
- Export filtered, selected, and all requests as JSON, CSV, and HAR.
- Local-only storage.
- Basic redacted export.

## 19. Future Enhancements

- Request comparison.
- Request replay.
- Response override rules.
- AI-generated request summaries.
- Performance anomaly detection.
- Auth and header warnings.
- Timeline visualization.
- Waterfall view.
- Team-shared filter presets.
- Import/export settings.
- Postman collection export.
- WebSocket message inspector.
- Chrome Debugger Protocol capture mode for advanced users.

## 20. Development Principle

The MVP should use stable browser APIs and avoid experimental interception features. Advanced capabilities like request replay, response overrides, or Chrome DevTools Protocol based capture can be added later as optional power-user features.
