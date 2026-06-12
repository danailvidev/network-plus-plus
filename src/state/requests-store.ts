import { create } from 'zustand';

import type { NetworkRequest } from '../network/request-model';
import type { FilterChipId } from '../search/predicates';

const MAX_CAPTURED_REQUESTS = 2_000;

type RequestsStore = {
  requests: NetworkRequest[];
  selectedIds: Set<string>;
  activeRequestId?: string;
  searchQuery: string;
  activeChip: FilterChipId;
  paused: boolean;
  addRequest: (request: NetworkRequest) => void;
  addRequests: (requests: NetworkRequest[]) => void;
  upsertRequest: (request: NetworkRequest) => void;
  clearRequests: () => void;
  setActiveRequestId: (id: string | undefined) => void;
  toggleSelected: (id: string) => void;
  setSelectedIds: (ids: string[]) => void;
  clearSelection: () => void;
  setSearchQuery: (query: string) => void;
  setActiveChip: (chip: FilterChipId) => void;
  setPaused: (paused: boolean) => void;
};

export const useRequestsStore = create<RequestsStore>((set, get) => ({
  requests: [],
  selectedIds: new Set(),
  searchQuery: '',
  activeChip: 'all',
  paused: false,
  addRequest: (request) => get().addRequests([request]),
  addRequests: (newRequests) => {
    if (get().paused) return;
    if (newRequests.length === 0) return;
    set((state) => {
      const requests = [...state.requests, ...newRequests].slice(-MAX_CAPTURED_REQUESTS);
      const requestIds = new Set(requests.map((item) => item.id));
      const selectedIds = new Set(Array.from(state.selectedIds).filter((id) => requestIds.has(id)));
      const activeRequestId = state.activeRequestId && requestIds.has(state.activeRequestId) ? state.activeRequestId : undefined;

      return { requests, selectedIds, activeRequestId };
    });
  },
  upsertRequest: (request) => {
    if (get().paused) return;
    set((state) => {
      const index = state.requests.findIndex((item) => item.id === request.id);
      if (index === -1) {
        const requests = [...state.requests, request].slice(-MAX_CAPTURED_REQUESTS);
        const requestIds = new Set(requests.map((item) => item.id));
        const selectedIds = new Set(Array.from(state.selectedIds).filter((id) => requestIds.has(id)));
        const activeRequestId = state.activeRequestId && requestIds.has(state.activeRequestId) ? state.activeRequestId : undefined;

        return { requests, selectedIds, activeRequestId };
      }

      const next = [...state.requests];
      next[index] = request;
      return { requests: next };
    });
  },
  clearRequests: () => set({ requests: [], selectedIds: new Set(), activeRequestId: undefined }),
  setActiveRequestId: (id) => set({ activeRequestId: id }),
  toggleSelected: (id) =>
    set((state) => {
      const selectedIds = new Set(state.selectedIds);
      if (selectedIds.has(id)) {
        selectedIds.delete(id);
      } else {
        selectedIds.add(id);
      }

      return { selectedIds };
    }),
  setSelectedIds: (ids) => set({ selectedIds: new Set(ids) }),
  clearSelection: () => set({ selectedIds: new Set() }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setActiveChip: (chip) => set({ activeChip: chip }),
  setPaused: (paused) => set({ paused })
}));
