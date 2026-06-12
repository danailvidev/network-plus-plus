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
      { id: 'slow-posts', name: 'Slow POSTs', query: 'status:>=400 method:POST' },
      { id: 'cart-requests', name: 'Cart requests', query: 'path:/api/cart' }
    ],
    recentSearches: ['status:>=400 method:POST', 'domain:demo.networkpp.dev']
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

const openRequestContextMenu = () => {
  const row = document.querySelector<HTMLElement>('.request-row.active') ?? document.querySelector<HTMLElement>('.request-row');
  if (!row) return;

  row.dispatchEvent(
    new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 520,
      clientY: 352,
      button: 2
    })
  );
};

const prepareView = () => {
  if (screenshotView === 'filters') {
    setTopFilter('status:>=400 method:POST');
    return;
  }

  if (screenshotView === 'details') {
    clickButtonByText('Headers');
    return;
  }

  if (screenshotView === 'exports') {
    clickButtonByText('Export');
    window.setTimeout(openRequestContextMenu, 100);
  }
};

mockChromeApis();
document.documentElement.dataset.screenshotView = screenshotView;

useRequestsStore.setState({
  requests: screenshotRequests,
  activeRequestId: 'demo-checkout-timeout',
  selectedIds: new Set(['demo-checkout-timeout']),
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
