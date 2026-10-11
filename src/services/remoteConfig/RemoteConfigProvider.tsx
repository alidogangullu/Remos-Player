import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { Announcement, RemoteConfig, RemoteConfigService } from './remoteConfigService';
import { getUpdateInfo, UpdateInfo } from './versionCheck';
import { AnnouncementReadStore } from './announcementReadStore';

/** TV apps stay resident for days; re-check when brought back, at most this often. */
const FOREGROUND_REFRESH_MS = 15 * 60 * 1000;

interface RemoteConfigContextValue {
  /** Null until a cached or fetched config is available. */
  updateInfo: UpdateInfo | null;
  announcements: Announcement[];
  readAnnouncementIds: string[];
  hasUnreadAnnouncements: boolean;
  markAnnouncementsRead: (ids: string[]) => void;
  /** Re-fetches the Gist; resolves to false when the fetch failed. */
  refresh: () => Promise<boolean>;
  isRefreshing: boolean;
  lastCheckedAt: number | null;
}

const RemoteConfigContext = createContext<RemoteConfigContextValue | undefined>(undefined);

export function RemoteConfigProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [config, setConfig] = useState<RemoteConfig | null>(null);
  const [readAnnouncementIds, setReadAnnouncementIds] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const lastFetchRef = useRef(0);
  const inFlightRef = useRef<Promise<boolean> | null>(null);

  const refresh = useCallback((): Promise<boolean> => {
    if (inFlightRef.current) return inFlightRef.current;
    setIsRefreshing(true);
    lastFetchRef.current = Date.now();
    const run = RemoteConfigService.fetch()
      .then(fresh => {
        // A failed fetch keeps the last known config instead of lifting a force update.
        if (fresh) {
          setConfig(fresh);
          setLastCheckedAt(Date.now());
        }
        return fresh !== null;
      })
      .finally(() => {
        inFlightRef.current = null;
        setIsRefreshing(false);
      });
    inFlightRef.current = run;
    return run;
  }, []);

  useEffect(() => {
    let isMounted = true;
    AnnouncementReadStore.getReadIds().then(ids => {
      if (isMounted) setReadAnnouncementIds(ids);
    });
    RemoteConfigService.getCached().then(cached => {
      // Only fill in if the network fetch hasn't already landed.
      if (isMounted && cached) setConfig(prev => prev ?? cached);
    });
    refresh();
    return () => {
      isMounted = false;
    };
  }, [refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && Date.now() - lastFetchRef.current > FOREGROUND_REFRESH_MS) {
        refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  const markAnnouncementsRead = useCallback((ids: string[]) => {
    setReadAnnouncementIds(prev => {
      const missing = ids.filter(id => !prev.includes(id));
      if (missing.length === 0) return prev;
      const next = [...prev, ...missing];
      AnnouncementReadStore.saveReadIds(next);
      return next;
    });
  }, []);

  const updateInfo = useMemo(() => (config ? getUpdateInfo(config) : null), [config]);
  const announcements = useMemo(() => config?.announcements ?? [], [config]);
  const hasUnreadAnnouncements = announcements.some(a => !readAnnouncementIds.includes(a.id));

  const value = useMemo(
    () => ({
      updateInfo,
      announcements,
      readAnnouncementIds,
      hasUnreadAnnouncements,
      markAnnouncementsRead,
      refresh,
      isRefreshing,
      lastCheckedAt,
    }),
    [
      updateInfo,
      announcements,
      readAnnouncementIds,
      hasUnreadAnnouncements,
      markAnnouncementsRead,
      refresh,
      isRefreshing,
      lastCheckedAt,
    ],
  );

  return <RemoteConfigContext.Provider value={value}>{children}</RemoteConfigContext.Provider>;
}

export function useRemoteConfig(): RemoteConfigContextValue {
  const context = useContext(RemoteConfigContext);
  if (!context) throw new Error('useRemoteConfig must be used within a RemoteConfigProvider');
  return context;
}
