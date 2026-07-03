import { create } from 'zustand';

import type { NetworkRequest } from '../network/request-model';

const MAX_CAPTURED_REQUESTS = 2_000;
const MAX_CLEARED_REQUEST_IDS = MAX_CAPTURED_REQUESTS * 2;

const limitClearedRequestIds = (requestIds: Iterable<string>): Set<string> => new Set(Array.from(requestIds).slice(-MAX_CLEARED_REQUEST_IDS));

type RequestsStore = {
  requests: NetworkRequest[];
  activeRequestId?: string;
  clearedRequestIds: Set<string>;
  addRequest: (request: NetworkRequest) => void;
  addRequests: (requests: NetworkRequest[]) => void;
  upsertRequest: (request: NetworkRequest) => void;
  upsertRequests: (requests: NetworkRequest[]) => void;
  restoreRequests: (requests: NetworkRequest[]) => void;
  clearRequests: () => void;
  setActiveRequestId: (id: string | undefined) => void;
};

export const useRequestsStore = create<RequestsStore>((set, get) => ({
  requests: [],
  clearedRequestIds: new Set(),
  addRequest: (request) => get().addRequests([request]),
  addRequests: (newRequests) => {
    const requestsToAdd = newRequests.filter((request) => !get().clearedRequestIds.has(request.id));
    if (requestsToAdd.length === 0) return;

    set((state) => {
      const requests = [...state.requests, ...requestsToAdd].slice(-MAX_CAPTURED_REQUESTS);
      const requestIds = new Set(requests.map((item) => item.id));
      const activeRequestId = state.activeRequestId && requestIds.has(state.activeRequestId) ? state.activeRequestId : undefined;

      return { requests, activeRequestId };
    });
  },
  upsertRequest: (request) => get().upsertRequests([request]),
  upsertRequests: (newRequests) => {
    const requestsToUpsert = newRequests.filter((request) => !get().clearedRequestIds.has(request.id));
    if (requestsToUpsert.length === 0) return;

    set((state) => {
      const next = [...state.requests];
      const indexesById = new Map(next.map((item, index) => [item.id, index]));

      for (const request of requestsToUpsert) {
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
  restoreRequests: (restoredRequests) =>
    set({
      requests: restoredRequests.slice(-MAX_CAPTURED_REQUESTS),
      activeRequestId: undefined,
      clearedRequestIds: new Set()
    }),
  clearRequests: () =>
    set((state) => ({
      requests: [],
      activeRequestId: undefined,
      clearedRequestIds: limitClearedRequestIds([...state.clearedRequestIds, ...state.requests.map((request) => request.id)])
    })),
  setActiveRequestId: (id) => set({ activeRequestId: id })
}));
