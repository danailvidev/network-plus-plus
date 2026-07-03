# Chrome Web Store Preparation

Use this checklist before submitting Network++ for Chrome Web Store review or requesting Featured consideration.

Google's extension quality guidance emphasizes compliance, Manifest V3, security, privacy disclosure, performance, user experience, and complete store listing assets. See the Chrome Web Store best-practices documentation: https://developer.chrome.com/docs/webstore/best-practices

## Featured-Readiness Checklist

- Manifest uses Manifest V3.
- Permissions stay minimal. Network++ currently requests only `storage` and no host permissions.
- No remote code, analytics, telemetry, or third-party data transfer.
- Response bodies are captured only through Chrome DevTools APIs, kept local, and covered by the privacy disclosure.
- Export redaction is enabled by default.
- Privacy policy is published and matches actual behavior.
- Store listing explains what the extension does, when it captures data, and how data is handled.
- Screenshots use real product UI with synthetic, non-sensitive traffic.
- Promotional images are present and readable.
- Manual QA covers Chrome stable, multiple operating systems where possible, slow networks, large captures, GraphQL traffic, and export flows.
- No `unload` handlers, content-script WebSockets, or other known back/forward cache pitfalls.

## Recommended Listing Details

Category: Developer Tools

Short description:

> Privacy-first DevTools network panel with faster filtering, GraphQL insight, request comparison, and redacted exports.

Detailed description:

> Network++ adds a dedicated Chrome DevTools panel for developers debugging API-heavy applications. It helps you filter noisy Fetch/XHR traffic, inspect request and response details, understand GraphQL operations, compare similar requests, identify duplicate or slow calls, and export debugging artifacts.
>
> Network++ is local-first. It does not send captured traffic to remote services, and exports are redacted by default.
>
> Key features:
>
> - Structured filtering by URL, method, status, domain, path, duration, cache state, and GraphQL fields.
> - GraphQL operation detection with variables, errors, batched requests, and repeated operation insight.
> - Request details for headers, query params, request body, response body, timing, raw HAR data, and generated exports.
> - Request diff for comparing headers, payloads, responses, timing, and GraphQL variables.
> - Local saved filters and saved debug sessions.
> - Exports for JSON, CSV, HAR, Markdown, MSW handlers, Playwright routes, and cURL.

## Privacy Disclosure Draft

Use the Chrome Web Store privacy tab values that match the current implementation:

- Data collected: website content only as needed to display inspected network requests inside DevTools. This can include URLs, headers, payloads, and responses from the inspected page.
- Data use: extension functionality only.
- Data transfer: not sold, not used for unrelated purposes, not used for creditworthiness, and not transferred to remote servers by Network++.
- Storage: local browser storage via `chrome.storage.local`.

Publish `docs/privacy-policy.md` as the public privacy policy URL.

## Reviewer Test Instructions

1. Install the extension and open any page that makes Fetch/XHR requests.
2. Open Chrome DevTools and select the `Network++` panel.
3. Reload the inspected page.
4. Confirm Fetch/XHR requests appear in the table.
5. Try filters such as `status:>=400`, `method:POST`, and `graphql:true` on a compatible page.
6. Select a request and inspect details, headers, timing, GraphQL data, and exports.
7. Confirm request details can display response bodies when Chrome exposes them through the DevTools network API.
8. Export a selected or filtered request and confirm the export is redacted by default.
9. Save and reload a debug session to verify local storage behavior.

## Required Assets

- Icon: `public/icons/icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png`.
- Small promo tile: `public/promotional/small-promo-tile-440x280.jpg`.
- Marquee promo tile: `public/promotional/marquee-promo-tile-1400x560.png`.
- Screenshots: capture `hero.png`, `filters.png`, `details.png`, and `exports.png` into `docs/assets/screenshots/` before launch.

Keep all screenshots free of tokens, cookies, real user data, private URLs, and production payloads.
