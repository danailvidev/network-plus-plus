import { create } from 'zustand';
import { z } from 'zod';

import { DEFAULT_SENSITIVE_FIELD_NAMES } from '../privacy/sensitive-fields';

const savedFilterSchema = z.object({
  id: z.string(),
  name: z.string(),
  query: z.string()
});

const settingsSchema = z.object({
  preserveLogOnReload: z.boolean().default(false),
  redactExportsByDefault: z.boolean().default(true),
  sensitiveFieldNames: z.array(z.string()).default(DEFAULT_SENSITIVE_FIELD_NAMES),
  savedFilters: z.array(savedFilterSchema).default([
    { id: 'errors-only', name: 'Errors only', query: 'error:true' },
    { id: 'slow-api-calls', name: 'Slow API calls', query: 'duration:>500ms -type:image' },
    { id: 'auth-requests', name: 'Auth requests', query: 'url:auth header:authorization' },
    { id: 'graphql-traffic', name: 'GraphQL traffic', query: 'graphql:true' },
    { id: 'graphql-errors', name: 'GraphQL errors', query: 'graphql:true gql.hasErrors:true' },
    { id: 'large-responses', name: 'Large responses', query: 'size:>1mb' },
    { id: 'non-cached-requests', name: 'Non-cached requests', query: 'cached:false' }
  ]),
  recentSearches: z.array(z.string()).default([])
});

export type SavedFilter = z.infer<typeof savedFilterSchema>;
export type Settings = z.infer<typeof settingsSchema>;

type SettingsStore = Settings & {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  saveFilter: (name: string, query: string) => Promise<void>;
  deleteFilter: (id: string) => Promise<void>;
  rememberSearch: (query: string) => Promise<void>;
};

const STORAGE_KEY = 'network-plus-plus-settings';

const getChromeStorage = (): chrome.storage.StorageArea | undefined => {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return chrome.storage.local;
  }

  return undefined;
};

const readSettings = async (): Promise<Settings> => {
  const storage = getChromeStorage();

  if (storage) {
    const result = await storage.get(STORAGE_KEY);
    return settingsSchema.parse(result[STORAGE_KEY] ?? {});
  }

  const local = localStorage.getItem(STORAGE_KEY);
  return settingsSchema.parse(local ? JSON.parse(local) : {});
};

const writeSettings = async (settings: Settings): Promise<void> => {
  const storage = getChromeStorage();

  if (storage) {
    await storage.set({ [STORAGE_KEY]: settings });
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};

const makeFilterId = (name: string): string => `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;

const defaultSettings = settingsSchema.parse({});

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...defaultSettings,
  hydrated: false,
  hydrate: async () => {
    const settings = await readSettings();
    set({ ...settings, hydrated: true });
  },
  updateSettings: async (patch) => {
    const next = settingsSchema.parse({ ...get(), ...patch });
    await writeSettings(next);
    set(next);
  },
  saveFilter: async (name, query) => {
    const trimmedName = name.trim();
    const trimmedQuery = query.trim();
    if (!trimmedName || !trimmedQuery) return;

    const next = settingsSchema.parse({
      ...get(),
      savedFilters: [...get().savedFilters, { id: makeFilterId(trimmedName), name: trimmedName, query: trimmedQuery }]
    });
    await writeSettings(next);
    set(next);
  },
  deleteFilter: async (id) => {
    const next = settingsSchema.parse({
      ...get(),
      savedFilters: get().savedFilters.filter((filter) => filter.id !== id)
    });
    await writeSettings(next);
    set(next);
  },
  rememberSearch: async (query) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    const next = settingsSchema.parse({
      ...get(),
      recentSearches: [trimmed, ...get().recentSearches.filter((item) => item !== trimmed)].slice(0, 8)
    });
    await writeSettings(next);
    set(next);
  }
}));
