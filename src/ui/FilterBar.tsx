import { useEffect, useRef, useState } from 'react';

import { FILTER_CHIPS, type FilterChipId } from '../search/predicates';
import { useRequestsStore } from '../state/requests-store';
import { useSettingsStore } from '../state/settings-store';

type FilterBarProps = {
  requestCount: number;
  filteredCount: number;
  paused: boolean;
  onPausedChange: (paused: boolean) => void;
  onClear: () => void;
};

export const FilterBar = ({ requestCount, filteredCount, paused, onPausedChange, onClear }: FilterBarProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const searchQuery = useRequestsStore((state) => state.searchQuery);
  const activeChip = useRequestsStore((state) => state.activeChip);
  const setSearchQuery = useRequestsStore((state) => state.setSearchQuery);
  const setActiveChip = useRequestsStore((state) => state.setActiveChip);
  const settings = useSettingsStore();
  const [draftQuery, setDraftQuery] = useState(searchQuery);

  useEffect(() => {
    setDraftQuery(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearchQuery(draftQuery);
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [draftQuery, setSearchQuery]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;

      if ((event.key === '/' && !isTyping) || (event.key.toLowerCase() === 'f' && event.ctrlKey)) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const applySavedFilter = (query: string) => {
    setDraftQuery(query);
    setSearchQuery(query);
    void settings.rememberSearch(query);
  };

  const saveCurrentFilter = () => {
    const name = window.prompt('Name this filter');
    if (!name) return;
    void settings.saveFilter(name, searchQuery);
  };

  const selectChip = (chip: FilterChipId) => {
    setActiveChip(chip);
  };

  return (
    <section className="filter-bar" aria-label="Request filters">
      <div className="search-row">
        <div className="search-box">
          <input
            ref={inputRef}
            value={draftQuery}
            onBlur={() => void settings.rememberSearch(draftQuery)}
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder='Search or filter, e.g. status:>=400 method:POST graphql:true'
            aria-label="Search requests"
          />
          {draftQuery ? (
            <button type="button" className="ghost-button" onClick={() => setDraftQuery('')}>
              Clear
            </button>
          ) : null}
        </div>

        <div className="toolbar-buttons">
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.bodyCaptureEnabled}
              onChange={(event) => void settings.updateSettings({ bodyCaptureEnabled: event.target.checked })}
            />
            Capture bodies
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.preserveLogOnReload}
              onChange={(event) => void settings.updateSettings({ preserveLogOnReload: event.target.checked })}
            />
            Preserve log
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.redactExportsByDefault}
              onChange={(event) => void settings.updateSettings({ redactExportsByDefault: event.target.checked })}
            />
            Redact exports
          </label>
          <button type="button" className="secondary-button" onClick={() => onPausedChange(!paused)}>
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button type="button" className="danger-button" onClick={onClear}>
            Clear
          </button>
        </div>
      </div>

      <div className="chips-row">
        {FILTER_CHIPS.map((chip) => (
          <button
            type="button"
            key={chip.id}
            className={chip.id === activeChip ? 'chip active' : 'chip'}
            onClick={() => selectChip(chip.id)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="saved-filter-row">
        <span>
          Showing {filteredCount} of {requestCount}
        </span>
        {settings.savedFilters.map((filter) => (
          <button type="button" key={filter.id} className="saved-filter" onClick={() => applySavedFilter(filter.query)}>
            {filter.name}
          </button>
        ))}
        {settings.recentSearches.map((query) => (
          <button type="button" key={query} className="recent-filter" onClick={() => applySavedFilter(query)}>
            {query}
          </button>
        ))}
        <button type="button" className="secondary-button" disabled={!searchQuery.trim()} onClick={saveCurrentFilter}>
          Save Filter
        </button>
      </div>
    </section>
  );
};
