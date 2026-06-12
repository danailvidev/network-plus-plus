import React from 'react';
import { createRoot } from 'react-dom/client';

import { useRequestsStore } from '../state/requests-store';
import { App } from './App';
import { screenshotRequests } from './screenshot-fixtures';
import './styles.css';

const settingsKey = 'network-plus-plus-settings';
const screenshotView = new URLSearchParams(window.location.search).get('view') ?? 'hero';

type ScreenshotChromeApi = {
  storage?: {
    local: Pick<chrome.storage.StorageArea, 'get' | 'set'>;
  };
  devtools?: typeof chrome.devtools;
};

const mockChromeApis = () => {
  const settings = {
    bodyCaptureEnabled: true,
    preserveLogOnReload: true,
    redactExportsByDefault: true,
    sensitiveFieldNames: ['authorization', 'cookie', 'set-cookie', 'token', 'password', 'email'],
    savedFilters: [
      { id: 'errors-only', name: 'Errors only', query: 'status:>=400' },
      { id: 'graphql-traffic', name: 'GraphQL traffic', query: 'graphql:true' },
      { id: 'slow-api-calls', name: 'Slow API calls', query: 'status:>=400 method:POST' }
    ],
    recentSearches: ['status:>=400 method:POST graphql:true', 'domain:demo.networkpp.dev']
  };

  const chromeHost = globalThis as unknown as { chrome?: ScreenshotChromeApi };
  const chromeApi = (chromeHost.chrome ??= {});
  chromeApi.storage = {
    local: {
      get: async () => ({ [settingsKey]: settings }),
      set: async () => undefined
    }
  };
  chromeApi.devtools = {
    network: {
      getHAR: (callback: (log: { entries: unknown[] }) => void) => callback({ entries: [] }),
      onRequestFinished: {
        addListener: () => undefined,
        removeListener: () => undefined
      },
      onNavigated: {
        addListener: () => undefined,
        removeListener: () => undefined
      }
    }
  } as unknown as typeof chrome.devtools;
};

const clickButtonByText = (text: string) => {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((item) => item.textContent?.trim() === text);
  button?.click();
};

const setTopFilter = (value: string) => {
  const input = document.querySelector<HTMLInputElement>('.top-filter input');
  if (!input) return;

  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

const prepareView = () => {
  if (screenshotView === 'filters') {
    setTopFilter('status:>=400 method:POST');
    return;
  }

  if (screenshotView === 'graphql') {
    clickButtonByText('GraphQL');
    return;
  }

  if (screenshotView === 'exports') {
    clickButtonByText('Export');
  }
};

mockChromeApis();
document.documentElement.dataset.screenshotView = screenshotView;

useRequestsStore.setState({
  requests: screenshotRequests,
  activeRequestId: 'demo-graphql-checkout-error',
  selectedIds: new Set(['demo-graphql-checkout-error']),
  paused: false
});

const root = document.getElementById('root');

if (!root) {
  throw new Error('Network++ screenshot root element was not found.');
}

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

window.setTimeout(() => {
  prepareView();
  document.documentElement.dataset.screenshotReady = 'true';
}, 900);
