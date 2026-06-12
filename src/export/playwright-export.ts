import type { NetworkRequest } from '../network/request-model';
import { redactRequests, type RedactionOptions } from '../privacy/redact';

const jsString = (value: string): string => JSON.stringify(value);

const routeFor = (request: NetworkRequest): string => {
  const status = request.status ?? 500;
  const headers = JSON.stringify(request.responseHeaders, null, 4);
  const body = request.responseBody ?? '';

  return [
    `  await page.route(${jsString(request.url)}, async (route) => {`,
    '    await route.fulfill({',
    `      status: ${status},`,
    `      headers: ${headers},`,
    `      body: ${jsString(body)}`,
    '    });',
    '  });'
  ].join('\n');
};

export const exportRequestsAsPlaywrightRoutes = (requests: NetworkRequest[], redaction: RedactionOptions): string => {
  const seen = new Set<string>();
  const routes = redactRequests(requests, redaction)
    .filter((request) => {
      const key = `${request.method}:${request.url}`;
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .map(routeFor);

  return [
    `import type { Page } from '@playwright/test';`,
    '',
    'export const installNetworkMocks = async (page: Page) => {',
    routes.join('\n\n'),
    '};',
    ''
  ].join('\n');
};
