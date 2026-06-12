# Screenshot Capture Guide

Use this guide when refreshing the real product screenshots in `docs/assets/screenshots/`.

## Files To Capture

- `hero.png`: full DevTools window with the Network++ panel, populated request table, insights panel, and selected request details.
- `filters.png`: filter bar with a structured query such as `status:>=400 method:POST`, active chips, saved filters, and recent searches.
- `details.png`: regular request details with headers, request body, response body, timing, and export tabs.
- `exports.png`: right-click request context menu showing JSON, CSV, HAR, Markdown, MSW, Playwright, Copy cURL, and the redaction state.
- Current screenshots are captured from the screenshot harness at `entrypoints/screenshot.html`, which renders the real app with safe synthetic request data from `src/ui/screenshot-fixtures.ts`.

## Sample Traffic

Use non-sensitive local or demo traffic. Good sources:

- A local demo API.
- A public test API with no credentials.
- A small app fixture that triggers successful, failed, slow, cached, and duplicate regular API requests.

Avoid production domains, real tokens, real customer data, private URLs, cookies, email addresses, and internal service names.

## Capture Settings

Recommended screenshot settings:

- Browser: Chrome stable.
- Window size: 1440x900 or wider.
- Theme: dark mode, if possible, to match the current extension styling.
- DevTools layout: undocked or docked to a size where the panel is readable.
- Export redaction: enabled.
- Response body capture: enabled only for synthetic data.

## Replacement Steps

1. Run `npm run dev`.
2. Load `.output/chrome-mv3` from `chrome://extensions`.
3. Open a page that generates the sample traffic.
4. Open DevTools and select `Network++`.
5. Capture each view listed above.
6. Save the files in `docs/assets/screenshots/`.
7. Update `README.md` and `docs/index.html` if the filenames change.

If you replace the current synthetic captures with manual Chrome screenshots, keep the filenames stable so `README.md` and `docs/index.html` do not need link changes.
