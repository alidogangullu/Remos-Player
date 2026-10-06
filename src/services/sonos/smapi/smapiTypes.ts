/**
 * Types shared across the SMAPI service layer (registry, client, category
 * resolution, credential sync). See `docs/tvonos-sonos-integration-guide.md`
 * for the protocol this models.
 */

/** One entry from `MusicServices:1#ListAvailableServices`. */
export interface MusicService {
  /** Numeric service id, e.g. "204" for Apple Music. */
  serviceId: string;
  name: string;
  /** "AppLink" | "DeviceLink" | "Anonymous" | ... (from <Policy Auth="...">). */
  auth: string;
  /** The actual SOAP endpoint used for search/getMetadata/getMediaURI — the
   * `Uri` attribute, NOT `SecureUri` (both are often equal, but `Uri` is
   * what tvonos posts to). */
  uri: string;
  secureUri: string;
  /** Raw `Capabilities` bitmask. */
  capabilities: number;
  /** `<Manifest Uri="...">` — presentation map + endpoint list. */
  manifestUri?: string;
  containerType?: string;
  /** serviceId * 256 + 7 — used to build a fresh account UDN during linking. */
  typeId: number;
}

/** A decrypted account entry from `ThirdPartyMediaServersX`. */
export interface MusicServiceAccount {
  serviceId: string;
  udn: string;
  authToken: string;
  privateKey: string;
  nickname?: string;
  username?: string;
}

export interface SearchCategory {
  /** Display label shown to the user, e.g. "Tracks" or "Library albums". */
  label: string;
  /** The value sent in `<search><id>` / `<getMetadata><id>` — NOT the same
   * as the display id from the presentation map ("tracks" displays, but
   * Apple Music expects "song" on the wire). */
  mappedId: string;
}

export interface MediaCollection {
  id: string;
  itemType?: string;
  title: string;
  summary?: string;
  albumArtUri?: string;
  canPlay?: boolean;
  displayType?: string;
}

export interface MediaMetadata {
  id: string;
  itemType?: string;
  title: string;
  summary?: string;
  mimeType?: string;
  albumArtUri?: string;
  artist?: string;
  artistId?: string;
  album?: string;
  albumId?: string;
  durationMs?: number;
}

export interface GetMetadataResult {
  index: number;
  count: number;
  total: number;
  mediaCollection: MediaCollection[];
  mediaMetadata: MediaMetadata[];
}

export interface HttpHeader {
  header: string;
  value: string;
}

export interface GetMediaUriResult {
  uri: string;
  httpHeaders: HttpHeader[];
}
