import { HocuspocusProvider } from '@hocuspocus/provider';
import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { ARCHIVIUM_URL } from './App';

// Archivium's collaboration server (Hocuspocus). Document names decide what is being
// synced and who may join: `room/<universe>` for table-wide state and
// `scene/<universe>/<item>` for a single scene's contents.
function syncUrl() {
  return `${ARCHIVIUM_URL.replace(/^http/, 'ws')}/ws`;
}

async function fetchSessionToken(): Promise<string> {
  const response = await fetch(`${ARCHIVIUM_URL}/api/session-token`, { credentials: 'include' });
  if (!response.ok) throw new Error('Could not get a session token');
  return await response.json();
}

// 'offline' means the server refused the document or never answered; callers should
// fall back to the last saved state.
export type SyncStatus = 'connecting' | 'synced' | 'offline';

export type SyncedDoc = {
  ydoc: Y.Doc;
  provider: HocuspocusProvider;
  status: SyncStatus;
  readOnly: boolean;
};

const CONNECT_TIMEOUT = 8000;

export function useSyncedDoc(name: string | null): SyncedDoc | null {
  const [conn, setConn] = useState<{ ydoc: Y.Doc, provider: HocuspocusProvider } | null>(null);
  const [status, setStatus] = useState<SyncStatus>('connecting');
  const [readOnly, setReadOnly] = useState(false);

  useEffect(() => {
    if (!name) {
      setConn(null);
      return;
    }

    setStatus('connecting');
    setReadOnly(false);

    const ydoc = new Y.Doc();
    let synced = false;
    const provider = new HocuspocusProvider({
      url: syncUrl(),
      name,
      document: ydoc,
      token: fetchSessionToken,
      onAuthenticated: ({ scope }) => setReadOnly(scope === 'readonly'),
      onAuthenticationFailed: () => setStatus('offline'),
      onSynced: ({ state }) => {
        if (!state) return;
        synced = true;
        setStatus('synced');
      },
    });
    const timeout = setTimeout(() => {
      if (!synced) setStatus('offline');
    }, CONNECT_TIMEOUT);

    setConn({ ydoc, provider });

    return () => {
      clearTimeout(timeout);
      provider.destroy();
      ydoc.destroy();
    };
  }, [name]);

  return conn && { ...conn, status, readOnly };
}
