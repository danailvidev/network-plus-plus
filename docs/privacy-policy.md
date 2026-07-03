# Network++ Privacy Policy

Last updated: July 3, 2026

Network++ is a Chrome DevTools extension for inspecting Fetch/XHR traffic from the tab you are debugging. The extension is designed to keep debugging data local to your browser.

## Data Network++ Handles

Network++ may display and store the following data while DevTools is open:

- Request metadata such as URL, method, status, timing, size, resource type, and headers.
- Request bodies when they are available in the browser's HAR data.
- Response bodies when they are exposed by the Chrome DevTools network API.
- GraphQL operation metadata, variables, and errors when present in captured requests.
- Extension settings, saved filters, recent searches, and saved debug sessions.

Network++ does not intentionally collect credentials, tokens, cookies, or personal data. Network traffic can contain sensitive data, so treat captured requests and exports carefully.

## Local Storage

Network++ stores settings, saved filters, recent searches, and saved debug sessions in `chrome.storage.local`. This data stays in your browser profile unless you export it, clear it, remove the extension, or Chrome sync/profile behavior moves it outside the extension's control.

## No Remote Transfer

Network++ does not send captured request data, response bodies, saved sessions, settings, analytics, telemetry, or usage data to a remote server.

## Response Body Capture

Network++ reads response bodies exposed by the Chrome DevTools network API so you can inspect, search, compare, and export them locally. Some response bodies may be unavailable because of browser restrictions or request characteristics.

Use synthetic or non-sensitive traffic for screenshots and review exports carefully before sharing them.

## Exports

Network++ can export captured requests as JSON, CSV, HAR, Markdown, MSW handlers, Playwright route fixtures, and cURL commands. Exports are redacted by default using sensitive field names such as `authorization`, `cookie`, `set-cookie`, `token`, `password`, and `secret`.

Redaction is best-effort. Review exported files before sharing them.

## Permissions

Network++ requests the `storage` permission so it can save local extension settings, filters, and debug sessions. It does not request host permissions.

## Data Deletion

You can clear captured requests in the panel with `Clear`. You can delete saved debug sessions from the saved sessions menu. You can remove all extension-local data by removing Network++ from Chrome or clearing extension storage from Chrome's extension tools.

## Contact

For security or privacy concerns, follow the reporting guidance in `SECURITY.md`.
