import type { NetworkRequest } from '../network/request-model';

const baseTime = Date.UTC(2026, 5, 12, 9, 30, 0);

export const screenshotRequests: NetworkRequest[] = [
  {
    id: 'demo-graphql-checkout-error',
    url: 'https://demo.networkpp.dev/graphql',
    method: 'POST',
    status: 500,
    statusText: 'Internal Server Error',
    domain: 'demo.networkpp.dev',
    path: '/graphql',
    queryParams: {},
    requestHeaders: {
      'content-type': 'application/json',
      authorization: 'Bearer demo-token'
    },
    responseHeaders: {
      'content-type': 'application/json'
    },
    requestBody: JSON.stringify(
      {
        operationName: 'CheckoutSummary',
        query: 'mutation CheckoutSummary($cartId: ID!) { checkout(cartId: $cartId) { total items { sku quantity } } }',
        variables: { cartId: 'cart_demo_123' }
      },
      null,
      2
    ),
    responseBody: JSON.stringify(
      {
        errors: [{ message: 'Checkout service timed out after 800ms', path: ['checkout'] }],
        data: { checkout: null }
      },
      null,
      2
    ),
    mimeType: 'application/json',
    resourceType: 'fetch',
    startTime: baseTime,
    durationMs: 842,
    sizeBytes: 14820,
    cached: false,
    failed: true,
    tags: ['graphql', 'failed', 'server-error', 'slow'],
    graphql: {
      operationType: 'mutation',
      operationName: 'CheckoutSummary',
      query: 'mutation CheckoutSummary($cartId: ID!) { checkout(cartId: $cartId) { total items { sku quantity } } }',
      variables: { cartId: 'cart_demo_123' },
      errors: [{ message: 'Checkout service timed out after 800ms', path: ['checkout'] }]
    },
    timing: {
      blocked: 3,
      dns: 12,
      connect: 24,
      ssl: 18,
      send: 6,
      wait: 744,
      receive: 35
    }
  },
  {
    id: 'demo-products',
    url: 'https://demo.networkpp.dev/api/products?category=tools',
    method: 'GET',
    status: 200,
    statusText: 'OK',
    domain: 'demo.networkpp.dev',
    path: '/api/products',
    queryParams: { category: ['tools'] },
    requestHeaders: { accept: 'application/json' },
    responseHeaders: { 'content-type': 'application/json', 'cache-control': 'max-age=60' },
    responseBody: JSON.stringify({ products: [{ id: 'demo-product', name: 'Synthetic product' }] }, null, 2),
    mimeType: 'application/json',
    resourceType: 'fetch',
    startTime: baseTime + 120,
    durationMs: 118,
    sizeBytes: 9210,
    cached: false,
    failed: false,
    tags: ['success'],
    timing: { blocked: 1, dns: 4, connect: 8, ssl: 5, send: 2, wait: 88, receive: 10 }
  },
  {
    id: 'demo-recommendations',
    url: 'https://demo.networkpp.dev/graphql',
    method: 'POST',
    status: 200,
    statusText: 'OK',
    domain: 'demo.networkpp.dev',
    path: '/graphql',
    queryParams: {},
    requestHeaders: { 'content-type': 'application/json' },
    responseHeaders: { 'content-type': 'application/json' },
    requestBody: JSON.stringify(
      {
        operationName: 'ProductRecommendations',
        query: 'query ProductRecommendations($sku: ID!) { recommendations(sku: $sku) { sku name } }',
        variables: { sku: 'demo-sku' }
      },
      null,
      2
    ),
    responseBody: JSON.stringify({ data: { recommendations: [{ sku: 'demo-related', name: 'Related demo item' }] } }, null, 2),
    mimeType: 'application/json',
    resourceType: 'fetch',
    startTime: baseTime + 240,
    durationMs: 96,
    sizeBytes: 6240,
    cached: false,
    failed: false,
    tags: ['graphql', 'success'],
    graphql: {
      operationType: 'query',
      operationName: 'ProductRecommendations',
      query: 'query ProductRecommendations($sku: ID!) { recommendations(sku: $sku) { sku name } }',
      variables: { sku: 'demo-sku' },
      data: { recommendations: [{ sku: 'demo-related', name: 'Related demo item' }] }
    },
    timing: { blocked: 1, dns: 4, connect: 7, ssl: 6, send: 2, wait: 66, receive: 10 }
  },
  {
    id: 'demo-preferences-missing',
    url: 'https://demo.networkpp.dev/api/account/preferences',
    method: 'GET',
    status: 404,
    statusText: 'Not Found',
    domain: 'demo.networkpp.dev',
    path: '/api/account/preferences',
    queryParams: {},
    requestHeaders: { accept: 'application/json' },
    responseHeaders: { 'content-type': 'application/json' },
    responseBody: JSON.stringify({ error: 'Synthetic preferences record not found' }, null, 2),
    mimeType: 'application/json',
    resourceType: 'xhr',
    startTime: baseTime + 360,
    durationMs: 211,
    sizeBytes: 3120,
    cached: false,
    failed: false,
    tags: ['client-error'],
    timing: { blocked: 2, dns: 6, connect: 14, ssl: 8, send: 3, wait: 154, receive: 24 }
  },
  {
    id: 'demo-cart-1',
    url: 'https://demo.networkpp.dev/api/cart',
    method: 'GET',
    status: 200,
    statusText: 'OK',
    domain: 'demo.networkpp.dev',
    path: '/api/cart',
    queryParams: {},
    requestHeaders: { accept: 'application/json' },
    responseHeaders: { 'content-type': 'application/json' },
    responseBody: JSON.stringify({ id: 'cart_demo_123', itemCount: 3 }, null, 2),
    mimeType: 'application/json',
    resourceType: 'fetch',
    startTime: baseTime + 480,
    durationMs: 74,
    sizeBytes: 1680,
    cached: false,
    failed: false,
    tags: ['success'],
    timing: { blocked: 1, dns: 2, connect: 5, ssl: 4, send: 1, wait: 52, receive: 9 }
  },
  {
    id: 'demo-cart-2',
    url: 'https://demo.networkpp.dev/api/cart',
    method: 'GET',
    status: 200,
    statusText: 'OK',
    domain: 'demo.networkpp.dev',
    path: '/api/cart',
    queryParams: {},
    requestHeaders: { accept: 'application/json' },
    responseHeaders: { 'content-type': 'application/json' },
    responseBody: JSON.stringify({ id: 'cart_demo_123', itemCount: 3 }, null, 2),
    mimeType: 'application/json',
    resourceType: 'fetch',
    startTime: baseTime + 560,
    durationMs: 69,
    sizeBytes: 1680,
    cached: true,
    failed: false,
    tags: ['success', 'cached'],
    timing: { blocked: 1, send: 1, wait: 57, receive: 10 }
  }
];
