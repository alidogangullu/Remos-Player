import { useCallback, useEffect, useRef, useState } from 'react';
import { SonosUpnpClient, QueueItem } from '../../services/sonos/upnp/sonosUpnpClient';

const PAGE_SIZE = 50;
/** Already-played tracks kept to the left of the current one. */
const PREVIOUS_TRACKS_SHOWN = 10;

export interface UpNextQueue {
  items: QueueItem[];
  /** Length of the whole queue. */
  total: number;
  /**
   * The transport is playing the queue. When false (AirPlay, Spotify Connect,
   * a stream started directly) the queue is left over from earlier listening:
   * nothing in it is "current" or "next".
   */
  isFromQueue: boolean;
  isLoading: boolean;
  loadMore: () => void;
}

interface Options {
  speakerIp: string;
  /** 1-based queue position of the playing track (GetPositionInfo's Track). */
  trackNumber: number;
  /** Changes whenever the playing track does. */
  trackKey: string;
  enabled: boolean;
  /** Holds the loaded items still, e.g. while the user is browsing them. */
  frozen: boolean;
}

const EMPTY = { items: [] as QueueItem[], total: 0, isFromQueue: false };

export function useUpNextQueue({ speakerIp, trackNumber, trackKey, enabled, frozen }: Options): UpNextQueue {
  const [data, setData] = useState(EMPTY);
  const [isLoading, setIsLoading] = useState(false);
  const loadedKeyRef = useRef<string | null>(null);
  // Bumped per reload so a page requested for the previous track is dropped.
  const generationRef = useRef(0);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    if (!enabled || !speakerIp) {
      loadedKeyRef.current = null;
      setData(EMPTY);
      setIsLoading(false);
      return;
    }
    const key = `${speakerIp}|${trackKey}|${trackNumber}`;
    // Reloading would swap the items out from under D-pad focus.
    if (frozen || loadedKeyRef.current === key) return;

    const generation = ++generationRef.current;
    let cancelled = false;
    setIsLoading(true);
    const load = async () => {
      const currentUri = await SonosUpnpClient.getCurrentUri(speakerIp).catch(() => '');
      const isFromQueue = currentUri.startsWith('x-rincon-queue:');
      const start = isFromQueue ? Math.max(0, trackNumber - 1 - PREVIOUS_TRACKS_SHOWN) : 0;
      const page = await SonosUpnpClient.getQueuePage(speakerIp, start, PAGE_SIZE);
      if (cancelled || generation !== generationRef.current) return;
      loadedKeyRef.current = key;
      setData({ items: page.items, total: page.totalMatches, isFromQueue });
      setIsLoading(false);
    };
    load().catch(() => {
      if (!cancelled) setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [speakerIp, trackKey, trackNumber, enabled, frozen]);

  const loadMore = useCallback(() => {
    const last = data.items.at(-1);
    if (!last || last.trackNumber >= data.total || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    const generation = generationRef.current;
    // trackNumber is 1-based, StartingIndex 0-based: the last item's number is the next index.
    SonosUpnpClient.getQueuePage(speakerIp, last.trackNumber, PAGE_SIZE)
      .then((page) => {
        if (generation !== generationRef.current) return;
        setData((prev) => {
          const seen = new Set(prev.items.map((item) => item.id));
          const fresh = page.items.filter((item) => !seen.has(item.id));
          return fresh.length ? { ...prev, items: [...prev.items, ...fresh] } : prev;
        });
      })
      .catch(() => {
        // The next onEndReached retries.
      })
      .finally(() => {
        loadingMoreRef.current = false;
      });
  }, [data.items, data.total, speakerIp]);

  return { ...data, isLoading, loadMore };
}
