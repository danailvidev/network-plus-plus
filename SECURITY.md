# Security Policy

Network++ handles network request metadata, request bodies, and response bodies exposed by the Chrome DevTools network API. Treat all captured traffic as potentially sensitive.

## Reporting A Vulnerability

Please do not open a public issue for vulnerabilities or reports that include secrets, tokens, cookies, private URLs, production payloads, or customer data.

Until a dedicated security contact is published, open a private advisory on GitHub if available, or contact the repository maintainer directly.

Helpful reports include:

- A short description of the issue.
- Steps to reproduce with synthetic data.
- Impact and affected versions or commits.
- Any suggested fix or mitigation.

## Privacy Expectations

Network++ is designed around local-first defaults:

- Captured request data stays in the browser.
- Request and response data is used locally for inspection, search, comparison, and export workflows.
- Settings and saved filters are stored in `chrome.storage.local`.
- Exports are redacted by default.

Please preserve these expectations when contributing changes.
