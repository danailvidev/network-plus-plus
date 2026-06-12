# Contributing To Network++

Thanks for your interest in improving Network++. This project is a Chrome DevTools extension built with WXT, React, and TypeScript.

## Development Setup

Install dependencies:

```bash
npm install
```

Start the extension in development mode:

```bash
npm run dev
```

Load `.output/chrome-mv3` from `chrome://extensions`, then open DevTools and select the `Network++` panel.

## Quality Checks

Before opening a pull request, run:

```bash
npm run typecheck
npm run build
```

If your change affects user-facing docs or screenshots, check the README and GitHub Pages files under `docs/`.

## Pull Request Guidelines

- Keep pull requests focused and easy to review.
- Describe the user-facing behavior change and any privacy implications.
- Include screenshots for UI changes when practical.
- Avoid committing generated extension output from `.output/`.
- Do not include real request payloads, access tokens, cookies, private URLs, or customer data in issues, tests, fixtures, screenshots, or pull requests.

## Project Priorities

Network++ should stay:

- Local-first and privacy-conscious.
- Useful for real debugging workflows.
- Fast enough for request-heavy pages.
- Easy to run from source.
- Conservative with Chrome extension permissions.
