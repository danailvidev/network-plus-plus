import { create } from 'zustand';

import type { NetworkRequest } from '../network/request-model';

const MAX_CAPTURED_REQUESTS = 2_000;

type RequestsStore = {
  requests: NetworkRequest[];
  activeRequestId?: string;
  addRequest: (request: NetworkRequest) => void;
  addRequests: (requests: NetworkRequest[]) => void;
  upsertRequest: (request: NetworkRequest) => void;
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
  upsertRequest: (request) => {
    set((state) => {
      const index = state.requests.findIndex((item) => item.id === request.id);
      if (index === -1) {
        const requests = [...state.requests, request].slice(-MAX_CAPTURED_REQUESTS);
        const requestIds = new Set(requests.map((item) => item.id));
        const activeRequestId = state.activeRequestId && requestIds.has(state.activeRequestId) ? state.activeRequestId : undefined;

        return { requests, activeRequestId };
      }

      const next = [...state.requests];
      next[index] = request;
      return { requests: next };
    });
  },
  clearRequests: () => set({ requests: [], activeRequestId: undefined }),
  setActiveRequestId: (id) => set({ activeRequestId: id })
}));
