import { create } from 'zustand';
import { z } from 'zod';

import type { NetworkRequest } from '../network/request-model';

const MAX_SAVED_SESSIONS = 20;
const MAX_REQUESTS_PER_SESSION = 2_000;

const networkRequestSchema = z.custom<NetworkRequest>(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    typeof (value as NetworkRequest).id === 'string' &&
    typeof (value as NetworkRequest).url === 'string' &&
    typeof (value as NetworkRequest).method === 'string'
);

const savedDebugSessionSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  requestCount: z.number(),
  requests: z.array(networkRequestSchema)
});

const sessionsStorageSchema = z.object({
  sessions: z.array(savedDebugSessionSchema).default([])
});

export type SavedDebugSession = z.infer<typeof savedDebugSessionSchema>;

type SessionsStorage = z.infer<typeof sessionsStorageSchema>;

type SessionsStore = SessionsStorage & {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  saveSession: (name: string, requests: NetworkRequest[]) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
};

const STORAGE_KEY = 'network-plus-plus-debug-sessions';

const defaultSessions = sessionsStorageSchema.parse({});

const getChromeStorage = (): chrome.storage.StorageArea | undefined => {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return chrome.storage.local;
  }

  return undefined;
};

const readSessions = async (): Promise<SessionsStorage> => {
  const storage = getChromeStorage();

  if (storage) {
    const result = await storage.get(STORAGE_KEY);
    return sessionsStorageSchema.parse(result[STORAGE_KEY] ?? {});
  }

  const local = localStorage.getItem(STORAGE_KEY);
  return sessionsStorageSchema.parse(local ? JSON.parse(local) : {});
};

const writeSessions = async (sessions: SessionsStorage): Promise<void> => {
  const storage = getChromeStorage();

  if (storage) {
    await storage.set({ [STORAGE_KEY]: sessions });
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
};

const makeSessionId = (name: string): string => `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'debug-session'}-${Date.now()}`;

export const useSessionsStore = create<SessionsStore>((set, get) => ({
  ...defaultSessions,
  hydrated: false,
  hydrate: async () => {
    const storage = await readSessions();
    set({ ...storage, hydrated: true });
  },
  saveSession: async (name, requests) => {
    const trimmedName = name.trim();
    const sessionRequests = requests.slice(-MAX_REQUESTS_PER_SESSION);
    if (!trimmedName || sessionRequests.length === 0) return;

    const now = Date.now();
    const next = sessionsStorageSchema.parse({
      sessions: [
        {
          id: makeSessionId(trimmedName),
          name: trimmedName,
          createdAt: now,
          updatedAt: now,
          requestCount: sessionRequests.length,
          requests: sessionRequests
        },
        ...get().sessions
      ].slice(0, MAX_SAVED_SESSIONS)
    });

    await writeSessions(next);
    set(next);
  },
  deleteSession: async (id) => {
    const next = sessionsStorageSchema.parse({
      sessions: get().sessions.filter((session) => session.id !== id)
    });

    await writeSessions(next);
    set(next);
  }
}));
