import { log } from '../../../utils/logger';
import { SmapiContext } from './smapiClient';
import { MediaCollection, MediaMetadata } from './smapiTypes';

const TAG = 'ContainerPlaybackUri';

/**
 * Builds the pseudo-URI + DIDL-Lite metadata pair needed to play a whole
 * SMAPI container (album/playlist/etc.) on a Sonos speaker.
 *
 * Containers are NOT resolvable via SMAPI's `getMediaURI` SOAP call — that
 * only resolves a single track/stream id, and faults on a container id
 * (confirmed live: "There was an error processing your request"). Real
 * Sonos control points instead construct this URI client-side and hand it
 * straight to `SetAVTransportURI`; the speaker resolves and queues the
 * container itself via SMAPI on its own. Ported from
 * `references/tvonos/decompiled/sources/defpackage/xq0.java`'s `k()`/`h()`
 * (the abstract "MusicServiceItem" base every browse-result item extends).
 */

/** `xq0.m()` — a 4-hex-digit type code + literal "008c" suffix, prefixed onto the item id in the pseudo-URI/DIDL id. */
function itemTypeHex(itemType: string | undefined): string {
  const type = itemType?.toLowerCase();
  if (type === 'audiobook') return '101340c8';

  const codes: Record<string, number> = {
    artist: 5,
    album: 4,
    genre: 7,
    playlist: 6,
    favorites: 10,
    albumlist: 13,
    tracklist: 14,
    artisttracklist: 15,
    program: 12,
  };

  if (type === undefined || type === '' || type === 'container' || type === 'collection' || type === 'search') {
    return `${(8).toString(16).padStart(4, '0')}008c`;
  }
  if (type in codes) {
    return `${codes[type].toString(16).padStart(4, '0')}008c`;
  }
  return '';
}

function escapeXml(value: string): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/** `xq0.k(serviceId)` — the container's own play URI, e.g. `x-rincon-cpcontainer:0006008ctypeAndIdHere?sid=204` (no `flags` for a plain container — matches the decompiled `k()` literally). */
function buildContainerUri(item: MediaCollection, serviceId: string): string {
  const encodedId = encodeURIComponent(item.id);
  return `x-rincon-cpcontainer:${itemTypeHex(item.itemType)}${encodedId}?sid=${serviceId}`;
}

/** `xq0.h(cdudn, serviceName)` — the DIDL-Lite `<item>` sent as `CurrentURIMetaData`. Literal port — no `<upnp:class>`, matching the decompiled source exactly. */
function buildContainerDidl(item: MediaCollection, cdudn: string, serviceName: string): string {
  const idAttr = escapeXml(`${itemTypeHex(item.itemType)}${encodeURIComponent(item.id)}`);
  let xml =
    '<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" ' +
    'xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">' +
    `<item id="${idAttr}">`;

  if (item.title) xml += `<dc:title>${escapeXml(item.title)}</dc:title>`;
  if (item.albumArtUri) xml += `<upnp:albumArtURI>${escapeXml(item.albumArtUri)}</upnp:albumArtURI>`;
  xml += `<r:albumArtist>${escapeXml(serviceName)}</r:albumArtist><r:description>${escapeXml(serviceName)}</r:description>`;
  xml += `<desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">${escapeXml(cdudn)}</desc></item></DIDL-Lite>`;

  return xml;
}

export interface ContainerPlaybackTarget {
  uri: string;
  metadata: string;
}

/**
 * `xq0.k()`'s track branch — a completely different scheme table than
 * containers, keyed by `mimeType` (not `itemType`), and every track gets
 * `&flags=0` unconditionally (the decompiled source sets a per-mimeType
 * flags value inside each branch, then unconditionally overwrites it to
 * "0" right after the if/else chain — dead code left over from whatever
 * that logic used to be, but the final behavior is flags=0 for all tracks).
 */
function trackScheme(mimeType: string | undefined): { scheme: string; ext: string } {
  switch (mimeType?.toLowerCase()) {
    case 'audio/x-spotify':
      return { scheme: 'x-sonos-spotify', ext: '' };
    case 'audio/x-ms-wma':
      return { scheme: 'x-sonos-mms', ext: '' };
    case 'audio/vnd.radiotime':
      return { scheme: 'x-sonosapi-rtrecent', ext: '' };
    case 'audio/flac':
      return { scheme: 'x-sonos-http', ext: '.flac' };
    case 'audio/mp4':
      return { scheme: 'x-sonos-http', ext: '.mp4' };
    default:
      return { scheme: 'x-sonos-http', ext: '.mp3' };
  }
}

/** `xq0.j()`'s track branch — the DIDL id-attribute type code (distinct from the URI, which uses no prefix for tracks — `m()` returns "" for itemType "track"). */
function trackIdHex(mimeType: string | undefined): string {
  switch (mimeType?.toLowerCase()) {
    case 'audio/x-spotify':
      return '00030000';
    case 'audio/x-ms-wma':
      return '00030030';
    case 'audio/vnd.radiotime':
      return 'F00032020';
    default:
      return '10030020';
  }
}

/** Sonos Radio's browse API items often carry no `itemType`; everything it lists outside a container is a station. */
const RADIO_ONLY_SERVICE_IDS = new Set(['303']);

/**
 * Live radio, per `xq0.k()`'s non-track branches: a `stream` (e.g. a TuneIn
 * station) or a `program` (a service-curated station). Neither can be queued
 * — the speaker skips such a queue entry — so they're started directly.
 */
export function radioKind(item: MediaMetadata, serviceId: string): 'stream' | 'program' | null {
  const type = item.itemType?.toLowerCase();
  if (type === 'stream' || type === 'station') return 'stream';
  if (type === 'program') return 'program';
  if (!type && RADIO_ONLY_SERVICE_IDS.has(serviceId)) return 'stream';
  return null;
}

function buildTrackUri(item: MediaMetadata, serviceId: string): string {
  const encodedRadioId = encodeURIComponent(item.id);
  const radio = radioKind(item, serviceId);
  // `xq0.k()`: streams use flags 8224 for AAC else 32; programs carry the
  // container type code ("%04x008c" of 12) and flags 104.
  if (radio === 'stream') {
    const flags = item.mimeType?.toLowerCase() === 'audio/aac' ? 8224 : 32;
    return `x-sonosapi-stream:${encodedRadioId}?sid=${serviceId}&flags=${flags}`;
  }
  if (radio === 'program') return `x-sonosapi-radio:000c008c${encodedRadioId}?sid=${serviceId}&flags=104`;

  const { scheme, ext } = trackScheme(item.mimeType);
  const encodedId = encodeURIComponent(item.id);
  return `${scheme}:${encodedId}${ext}?sid=${serviceId}&flags=0`;
}

function buildTrackDidl(item: MediaMetadata, cdudn: string, serviceName: string, serviceId: string): string {
  const radio = radioKind(item, serviceId);
  // `xq0.j()`: programs use "000c0068"; streams fall through to `m()`, which has no code for them.
  let idPrefix = trackIdHex(item.mimeType);
  if (radio === 'program') idPrefix = '000c0068';
  else if (radio === 'stream') idPrefix = '';
  const idAttr = escapeXml(`${idPrefix}${encodeURIComponent(item.id)}`);
  let xml =
    '<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" ' +
    'xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">' +
    `<item id="${idAttr}">`;

  if (item.title) xml += `<dc:title>${escapeXml(item.title)}</dc:title>`;
  if (item.album) xml += `<upnp:album>${escapeXml(item.album)}</upnp:album>`;
  if (item.artist) xml += `<dc:creator>${escapeXml(item.artist)}</dc:creator>`;
  if (item.albumArtUri) xml += `<upnp:albumArtURI>${escapeXml(item.albumArtUri)}</upnp:albumArtURI>`;
  if (radio) xml += '<upnp:class>object.item.audioItem.audioBroadcast</upnp:class>';
  const albumArtist = item.artist ?? serviceName;
  xml += `<r:albumArtist>${escapeXml(albumArtist)}</r:albumArtist><r:description>${escapeXml(albumArtist)}</r:description>`;
  xml += `<desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">${escapeXml(cdudn)}</desc></item></DIDL-Lite>`;

  return xml;
}

/** Same `cdudn` derivation as `buildContainerPlaybackTarget` — see its comment. */
export function buildTrackPlaybackTarget(ctx: SmapiContext, item: MediaMetadata): ContainerPlaybackTarget {
  const cdudn = ctx.account ? ctx.account.udn : ctx.householdId;
  const target = {
    uri: buildTrackUri(item, ctx.service.serviceId),
    metadata: buildTrackDidl(item, cdudn, ctx.service.name, ctx.service.serviceId),
  };
  log.debug(
    TAG,
    `Built track target for "${item.title}" (itemType=${item.itemType ?? '<none>'}, mimeType=${item.mimeType ?? '<none>'}, id=${item.id})`,
    target,
  );
  return target;
}

/**
 * `cdudn` = `<desc id="cdudn">` — the account's raw UDN itself (e.g.
 * `SA_RINCON52231_X_#Svc52231-aa0461a8-Token`), NOT the account-suffixed
 * household id. Confirmed via a live mitm capture of tvonos's actual
 * `AddURIToQueue` request — `c.java`'s `this.d.e()` is `cv.e()` (the
 * account-credentials class), a different `e()` than `b.java`'s
 * household-suffix method of the same name; conflating the two was the bug
 * behind every earlier attempt's UPnPError. Anonymous services (no linked
 * account) fall back to the household id, unverified — no live capture for
 * that case.
 */
export function buildContainerPlaybackTarget(ctx: SmapiContext, item: MediaCollection): ContainerPlaybackTarget {
  const cdudn = ctx.account ? ctx.account.udn : ctx.householdId;
  const target = {
    uri: buildContainerUri(item, ctx.service.serviceId),
    metadata: buildContainerDidl(item, cdudn, ctx.service.name),
  };
  // The type-code prefix (itemTypeHex) is a guess when the source item's
  // itemType is missing/unrecognized (browse-API items especially don't
  // always carry one) — logging the raw inputs here so a UPnPError on the
  // resulting URI can be diagnosed against the item's real shape.
  log.debug(TAG, `Built container target for "${item.title}" (itemType=${item.itemType ?? '<none>'}, id=${item.id})`, target);
  return target;
}
