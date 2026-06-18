import { create } from 'zustand';

import type { NetworkRequest } from '../network/request-model';

const MAX_CAPTURED_REQUESTS = 2_000;

type RequestsStore = {
  requests: NetworkRequest[];
  activeRequestId?: string;
  addRequest: (request: NetworkRequest) => void;
  addRequests: (requests: NetworkRequest[]) => void;
  upsertRequest: (request: NetworkRequest) => void;
  upsertRequests: (requests: NetworkRequest[]) => void;
  clearRequests: () => void;
  setActiveRequestId: (id: string | undefined) => void;
};

export const useRequestsStore = create<RequestsStore>((set, get) => ({
  requests: [],
  addRequest: (request) => get().addRequests([request]),
  addRequests: (newRequests) => {
    if (newRequests.length === 0) return;
    set((state) => {
      const requests = [...state.requests, ...newRequests].slice(-MAX_CAPTURED_REQUESTS);
      const requestIds = new Set(requests.map((item) => item.id));
      const activeRequestId = state.activeRequestId && requestIds.has(state.activeRequestId) ? state.activeRequestId : undefined;

      return { requests, activeRequestId };
    });
  },
  upsertRequest: (request) => get().upsertRequests([request]),
  upsertRequests: (newRequests) => {
    if (newRequests.length === 0) return;
    set((state) => {
      const next = [...state.requests];
      const indexesById = new Map(next.map((item, index) => [item.id, index]));

      for (const request of newRequests) {
        const index = indexesById.get(request.id);
        if (index === undefined) {
          indexesById.set(request.id, next.length);
          next.push(request);
        } else {
          const currentRequest = next[index]!;
          next[index] = {
            ...request,
            responseBody: request.responseBody ?? currentRequest.responseBody
          };
        }
      }

      const requests = next.slice(-MAX_CAPTURED_REQUESTS);
      const requestIds = new Set(requests.map((item) => item.id));
      const activeRequestId = state.activeRequestId && requestIds.has(state.activeRequestId) ? state.activeRequestId : undefined;

      return { requests, activeRequestId };
    });
  },
  clearRequests: () => set({ requests: [], activeRequestId: undefined }),
  setActiveRequestId: (id) => set({ activeRequestId: id })
}));
