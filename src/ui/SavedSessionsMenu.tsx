import { memo, useMemo, useRef, useState } from 'react';

import type { NetworkRequest } from '../network/request-model';
import { useRequestsStore } from '../state/requests-store';
import { useSessionsStore, type SavedDebugSession } from '../state/sessions-store';
import { FolderClockIcon } from './icons';
import { useCloseMenuOnOutsideClick } from './useCloseMenuOnOutsideClick';

type SavedSessionsMenuProps = {
  requests: NetworkRequest[];
};

const sessionDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});

const defaultSessionName = () => `Debug session ${new Date().toLocaleString()}`;

const getSessionTitle = (session: SavedDebugSession) =>
  `${session.name} - ${session.requestCount} request${session.requestCount === 1 ? '' : 's'}`;

export const SavedSessionsMenu = memo(function SavedSessionsMenu({ requests }: SavedSessionsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const sessions = useSessionsStore((state) => state.sessions);
  const saveSession = useSessionsStore((state) => state.saveSession);
  const deleteSession = useSessionsStore((state) => state.deleteSession);
  const restoreRequests = useRequestsStore((state) => state.restoreRequests);
  const sortedSessions = useMemo(() => [...sessions].sort((a, b) => b.updatedAt - a.updatedAt), [sessions]);

  useCloseMenuOnOutsideClick(menuRef, open, () => setOpen(false));

  const saveCurrentSession = async () => {
    const name = window.prompt('Save current requests as:', defaultSessionName());
    if (!name) return;

    await saveSession(name, requests);
    setOpen(false);
  };

  const restoreSession = (session: SavedDebugSession) => {
    restoreRequests(session.requests);
    setOpen(false);
  };

  const removeSession = async (session: SavedDebugSession) => {
    if (!window.confirm(`Delete "${session.name}"?`)) return;
    await deleteSession(session.id);
  };

  return (
    <div className="saved-sessions-menu" ref={menuRef}>
      <button
        type="button"
        className="column-menu-button"
        aria-label="Saved debug sessions"
        aria-expanded={open}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <FolderClockIcon />
      </button>
      {open ? (
        <div className="column-menu-popover saved-sessions-popover" role="menu" aria-label="Saved debug sessions">
          <div className="request-context-menu-header">
            <span>Sessions</span>
            <span className="redaction-pill">{sessions.length}/20</span>
          </div>
          <button type="button" className="request-context-menu-item" onClick={() => void saveCurrentSession()} disabled={requests.length === 0}>
            Save current capture
          </button>
          <div className="sessions-divider" />
          {sortedSessions.length > 0 ? (
            sortedSessions.map((session) => (
              <div className="saved-session-row" key={session.id}>
                <button type="button" className="saved-session-load" title={getSessionTitle(session)} onClick={() => restoreSession(session)}>
                  <strong>{session.name}</strong>
                  <span>
                    {session.requestCount} req - {sessionDateFormatter.format(new Date(session.updatedAt))}
                  </span>
                </button>
                <button type="button" className="saved-session-delete" aria-label={`Delete ${session.name}`} onClick={() => void removeSession(session)}>
                  Delete
                </button>
              </div>
            ))
          ) : (
            <p className="empty-sessions">No saved sessions yet.</p>
          )}
        </div>
      ) : null}
    </div>
  );
});
