import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { SONOS_DEFAULTS, UPNP_SERVICES } from '../../../constants';
import { TrackMetadata } from '../../../types/sonos';
import { FavoriteItem } from '../../../features/favorites/FavoriteCard';
import { log } from '../../../utils/logger';

const TAG = 'SonosUPnP';

// DeviceProperties Autoplay* actions are keyed per source. The soundbar's TV input
// is 'TV'; the device accepts any other string silently and stores it under an
// unused key, so a wrong value here makes reads and writes no-ops.
const AUTOPLAY_SOURCE_TV = 'TV';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: true,
});

function parseDurationToMs(durationStr: string | number | undefined): number {
  if (!durationStr || typeof durationStr !== 'string' || durationStr === 'NOT_IMPLEMENTED') {
    return 0;
  }
  const parts = durationStr.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return (hours * 3600 + minutes * 60 + seconds) * 1000;
  }
  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return (minutes * 60 + seconds) * 1000;
  }
  return 0;
}

/** Audio quality the speaker reports for the current track (local Control API). */
export interface TrackQuality {
  bitDepth?: number;
  sampleRate?: number;
  lossless: boolean;
  /** Spatial audio, i.e. Dolby Atmos. */
  immersive: boolean;
}

/** "Dolby Atmos", "Hi-Res Lossless · 24-Bit/96 kHz", "Lossless · 24-Bit/48 kHz", or null. */
export function describeTrackQuality(quality: TrackQuality | null | undefined): string | null {
  if (!quality) return null;
  if (quality.immersive) return 'Dolby Atmos';
  if (!quality.lossless) return null;
  const { bitDepth, sampleRate } = quality;
  const label = sampleRate && sampleRate > 48000 ? 'Hi-Res Lossless' : 'Lossless';
  if (!bitDepth || !sampleRate) return label;
  return `${label} · ${bitDepth}-Bit/${Number((sampleRate / 1000).toFixed(1))} kHz`;
}

/**
 * `DeviceProperties#GetZoneInfo` → `HTAudioIn`: the format arriving on the TV input.
 * Codes from SoCo's `AUDIO_INPUT_FORMATS`; Clic ships the same labels.
 */
const TV_AUDIO_FORMATS: Record<number, string> = {
  0: 'No input connected',
  2: 'Stereo',
  7: 'Dolby 2.0',
  18: 'Dolby 5.1',
  21: 'No input',
  22: 'No audio',
  59: 'Dolby Atmos (DD+)',
  61: 'Dolby Atmos (TrueHD)',
  63: 'Dolby Atmos (MAT 2.0)',
  33554434: 'PCM 2.0',
  33554454: 'PCM 2.0 no audio',
  33554488: 'Dolby 2.0',
  33554490: 'Dolby Digital Plus 2.0',
  33554492: 'Dolby TrueHD 2.0',
  33554494: 'Dolby Multichannel PCM 2.0',
  84934658: 'Multichannel PCM 5.1',
  84934713: 'Dolby 5.1',
  84934714: 'Dolby Digital Plus 5.1',
  84934716: 'Dolby TrueHD 5.1',
  84934718: 'Dolby Multichannel PCM 5.1',
  84934721: 'DTS 5.1',
  118489090: 'Multichannel PCM 7.1',
  118489146: 'Dolby Digital Plus 7.1',
  118489148: 'Dolby TrueHD 7.1',
};

// No signal on the input: nothing useful to show instead of the generic label.
const TV_NO_INPUT_CODES = new Set([0, 21]);

// Group ids change whenever rooms are regrouped, so they're re-resolved on failure.
const groupIdCache = new Map<string, string>();

/** Service name shown when the speaker reports no quality info. */
function parseServiceFormat(uri: string): string {
  if (!uri) return '';
  if (uri.includes('x-sonos-htastream')) return 'OPTICAL / EARC';
  if (uri.includes('sid=204')) return 'Apple Music';
  if (uri.includes('sid=9') || uri.includes('sid=12')) return 'Spotify';
  if (uri.includes('sid=201')) return 'Amazon Music';
  if (uri.includes('sid=303')) return 'Sonos Radio';
  if (uri.includes('sid=325')) return 'BBC Sounds';
  if (uri.includes('sid=254')) return 'TuneIn';
  if (uri.includes('x-sonosapi-stream')) return 'Radio Stream';
  return '';
}

export interface PositionInfo {
  track: number;
  trackDurationMs: number;
  trackDuration: string;
  positionMs: number;
  relTime: string;
  trackUri: string;
  metadata: TrackMetadata & { format?: string };
}

function escapeXml(value: string | number): string {
  if (typeof value === 'number') {
    return String(value);
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSoapEnvelope(
  serviceUrn: string,
  action: string,
  bodyArgs: Record<string, string | number> = {}
): string {
  const argsXml = Object.entries(bodyArgs)
    .map(([key, value]) => `<${key}>${escapeXml(value)}</${key}>`)
    .join('');

  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:${action} xmlns:u="${serviceUrn}">
      ${argsXml}
    </u:${action}>
  </s:Body>
</s:Envelope>`;
}

function parseSoapResponse<T>(xmlResponse: string, resultTag: string): T {
  const parsed = xmlParser.parse(xmlResponse);
  const body = parsed?.Envelope?.Body || parsed?.envelope?.body || parsed?.Body || {};
  return (body[resultTag] || body) as T;
}

/**
 * AVTransport actions the speaker only answers once it has started (or failed
 * to start) the new source. Starting a radio stream can take several seconds;
 * under the normal timeout the app reported a failure while the speaker went
 * on to play.
 */
const MEDIA_START_ACTIONS = new Set(['Play', 'SetAVTransportURI', 'Seek', 'AddURIToQueue']);

/**
 * A radio stream's TrackMetaData title is often just the stream's file/URL
 * (`wnycfm-tunein.aac?source=TuneIn&gdpr=0`). Same rule as tvonos's
 * `TrackMetadata.setTitle()`: such titles are dropped so the station name is
 * shown instead.
 */
export function isStreamUrlTitle(title: string): boolean {
  return (
    title.length > 100 ||
    title.startsWith('x-sonosapi-hls') ||
    title.includes('partnerId=SonosRadio') ||
    title.includes('source=TuneIn') ||
    (title.includes('?') && title.includes('=') && (title.includes('&') || title.includes(';'))) ||
    title.includes('stream?client=')
  );
}

/** The source of a live radio stream: its title is the station, its track info comes from the stream itself. */
const RADIO_SOURCE_URI = /^(x-sonosapi-stream|x-sonosapi-radio|x-sonosapi-hls|x-rincon-mp3radio|aac|hls-radio):/;

/** Subtitle when the source names no artist: a station with no "now playing" info is simply live radio. */
function fallbackArtist(trackUri: string): string {
  if (trackUri.includes('x-sonos-htastream')) return 'Home Theater';
  return isRadioStreamUri(trackUri) ? 'Live Radio' : 'Unknown Artist';
}

/**
 * A favorite's kind, from the UPnP class of the item it points at (in its
 * `r:resMD` DIDL) — e.g. a saved song is `object.item.audioItem.musicTrack`.
 * Browse shortcuts (no class of their own) fall back to the service: Sonos
 * Radio's are radio sections.
 */
function favoriteType(metadata: string | undefined, uri: string | undefined, description: string): string {
  const upnpClass = /<upnp:class>([^<]+)<\/upnp:class>/.exec(metadata ?? '')?.[1] ?? '';
  if (upnpClass.includes('audioBroadcast') || (uri && isRadioStreamUri(uri))) return 'radio';
  if (upnpClass.includes('musicTrack') || upnpClass.endsWith('audioItem')) return 'track';
  if (upnpClass.includes('album')) return 'album';
  if (upnpClass.includes('musicArtist') || upnpClass.includes('person')) return 'artist';
  if (upnpClass.includes('playlistContainer')) return 'playlist';
  if (description.toLowerCase().includes('radio')) return 'radio';
  return 'playlist';
}

/** Whether a track URI is a live radio stream (as opposed to a song). */
export function isRadioStreamUri(uri: string): boolean {
  return RADIO_SOURCE_URI.test(uri) || /^https?:/.test(uri);
}

/**
 * Whether two transport URIs point at the same service item. Services can
 * swap the scheme once playback starts — an Apple Music favorite set as
 * `x-sonos-http:song%3A123.mp4?sid=204…` plays as
 * `x-sonosapi-hls-static:song%3a123?sid=204…` — so this compares the service
 * id and the item id (case-insensitive, file extension dropped).
 */
function isSameStreamUri(a: string, b: string): boolean {
  if (a === b) return true;
  const key = (uri: string): string | null => {
    const match = /^[^:]+:([^?]+)\?(?:.*&)?sid=(\d+)/.exec(uri);
    if (!match) return null;
    return `${match[2]}|${match[1].toLowerCase().replace(/\.(mp4|mp3|flac)$/, '')}`;
  };
  const keyA = key(a);
  return keyA !== null && keyA === key(b);
}

export class SonosUpnpClient {
  public static async executeSoap(
    ip: string,
    controlPath: string,
    serviceUrn: string,
    action: string,
    args: Record<string, string | number> = {}
  ): Promise<string> {
    const envelope = buildSoapEnvelope(serviceUrn, action, args);
    const url = `http://${ip}:${SONOS_DEFAULTS.UPNP_PORT}${controlPath}`;

    try {
      const response = await axios.post(url, envelope, {
        headers: {
          'Content-Type': 'text/xml; charset="utf-8"',
          SOAPACTION: `"${serviceUrn}#${action}"`,
          'User-Agent': SONOS_DEFAULTS.USER_AGENT,
        },
        timeout: MEDIA_START_ACTIONS.has(action)
          ? SONOS_DEFAULTS.SOAP_MEDIA_START_TIMEOUT_MS
          : SONOS_DEFAULTS.SOAP_TIMEOUT_MS,
      });
      return response.data;
    } catch (error) {
      log.error(TAG, `${action} failed on ${url}`, error);
      throw error;
    }
  }

  static async play(ip: string): Promise<void> {
    await this.executeSoap(
      ip,
      UPNP_SERVICES.AV_TRANSPORT.CONTROL,
      UPNP_SERVICES.AV_TRANSPORT.SERVICE,
      'Play',
      { InstanceID: '0', Speed: '1' }
    );
  }

  static async pause(ip: string): Promise<void> {
    await this.executeSoap(
      ip,
      UPNP_SERVICES.AV_TRANSPORT.CONTROL,
      UPNP_SERVICES.AV_TRANSPORT.SERVICE,
      'Pause',
      { InstanceID: '0' }
    );
  }

  static async next(ip: string): Promise<void> {
    await this.executeSoap(
      ip,
      UPNP_SERVICES.AV_TRANSPORT.CONTROL,
      UPNP_SERVICES.AV_TRANSPORT.SERVICE,
      'Next',
      { InstanceID: '0' }
    );
  }

  static async previous(ip: string): Promise<void> {
    await this.executeSoap(
      ip,
      UPNP_SERVICES.AV_TRANSPORT.CONTROL,
      UPNP_SERVICES.AV_TRANSPORT.SERVICE,
      'Previous',
      { InstanceID: '0' }
    );
  }

  static async seek(ip: string, targetTime: string): Promise<void> {
    await this.executeSoap(
      ip,
      UPNP_SERVICES.AV_TRANSPORT.CONTROL,
      UPNP_SERVICES.AV_TRANSPORT.SERVICE,
      'Seek',
      { InstanceID: '0', Unit: 'REL_TIME', Target: targetTime }
    );
  }

  static async setAVTransportURI(
    ip: string,
    uri: string,
    metadata: string = ''
  ): Promise<void> {
    await this.executeSoap(
      ip,
      UPNP_SERVICES.AV_TRANSPORT.CONTROL,
      UPNP_SERVICES.AV_TRANSPORT.SERVICE,
      'SetAVTransportURI',
      {
        InstanceID: '0',
        CurrentURI: uri,
        CurrentURIMetaData: metadata,
      }
    );
  }

  static async setPlayMode(ip: string, mode: 'NORMAL' | 'SHUFFLE_NOREPEAT'): Promise<void> {
    await this.executeSoap(
      ip,
      UPNP_SERVICES.AV_TRANSPORT.CONTROL,
      UPNP_SERVICES.AV_TRANSPORT.SERVICE,
      'SetPlayMode',
      { InstanceID: '0', NewPlayMode: mode }
    );
  }

  /**
   * `AddURIToQueue` — enqueues one URI (a track, or a whole container's
   * pseudo-URI, e.g. `x-rincon-cpcontainer:...`) without touching what's
   * currently playing. `desiredFirstTrackNumberEnqueued: 0` appends to the
   * end of the queue; `enqueueAsNext: true` inserts right after the
   * currently-playing track instead. Ported from
   * `references/tvonos/decompiled/sources/defpackage/pb1.java` (`e()`/`f()`).
   */
  static async addURIToQueue(
    ip: string,
    uri: string,
    metadata: string = '',
    desiredFirstTrackNumberEnqueued: number = 0,
    enqueueAsNext: boolean = false
  ): Promise<{ firstTrackNumberEnqueued: number; numTracksAdded: number; newQueueLength: number }> {
    const res = await this.executeSoap(
      ip,
      UPNP_SERVICES.AV_TRANSPORT.CONTROL,
      UPNP_SERVICES.AV_TRANSPORT.SERVICE,
      'AddURIToQueue',
      {
        InstanceID: '0',
        EnqueuedURI: uri,
        EnqueuedURIMetaData: metadata,
        DesiredFirstTrackNumberEnqueued: String(desiredFirstTrackNumberEnqueued),
        EnqueueAsNext: enqueueAsNext ? '1' : '0',
      }
    );
    const parsed = parseSoapResponse<{
      FirstTrackNumberEnqueued?: string;
      NumTracksAdded?: string;
      NewQueueLength?: string;
    }>(res, 'AddURIToQueueResponse');
    return {
      firstTrackNumberEnqueued: Number(parsed.FirstTrackNumberEnqueued) || 0,
      numTracksAdded: Number(parsed.NumTracksAdded) || 0,
      newQueueLength: Number(parsed.NewQueueLength) || 0,
    };
  }

  static async removeAllTracksFromQueue(ip: string): Promise<void> {
    await this.executeSoap(
      ip,
      UPNP_SERVICES.AV_TRANSPORT.CONTROL,
      UPNP_SERVICES.AV_TRANSPORT.SERVICE,
      'RemoveAllTracksFromQueue',
      { InstanceID: '0' }
    );
  }

  static async getVolume(ip: string): Promise<number> {
    const res = await this.executeSoap(
      ip,
      UPNP_SERVICES.RENDERING_CONTROL.CONTROL,
      UPNP_SERVICES.RENDERING_CONTROL.SERVICE,
      'GetVolume',
      { InstanceID: '0', Channel: 'Master' }
    );
    const parsed = parseSoapResponse<{ CurrentVolume: number }>(res, 'GetVolumeResponse');
    return Number(parsed.CurrentVolume) || 0;
  }

  static async setEQ(
    ip: string,
    eqType: string,
    value: string | number
  ): Promise<void> {
    await this.executeSoap(
      ip,
      UPNP_SERVICES.RENDERING_CONTROL.CONTROL,
      UPNP_SERVICES.RENDERING_CONTROL.SERVICE,
      'SetEQ',
      {
        InstanceID: '0',
        EQType: eqType,
        DesiredValue: value,
      }
    );
  }

  static async getEQ(ip: string, eqType: string): Promise<string> {
    const res = await this.executeSoap(
      ip,
      UPNP_SERVICES.RENDERING_CONTROL.CONTROL,
      UPNP_SERVICES.RENDERING_CONTROL.SERVICE,
      'GetEQ',
      {
        InstanceID: '0',
        EQType: eqType,
      }
    );
    const parsed = parseSoapResponse<{ CurrentValue?: string | number }>(
      res,
      'GetEQResponse'
    );
    return String(parsed?.CurrentValue ?? '0');
  }

  static async getBass(ip: string): Promise<number> {
    const res = await this.executeSoap(
      ip,
      UPNP_SERVICES.RENDERING_CONTROL.CONTROL,
      UPNP_SERVICES.RENDERING_CONTROL.SERVICE,
      'GetBass',
      { InstanceID: '0', Channel: 'Master' }
    );
    const parsed = parseSoapResponse<{ CurrentBass?: number | string }>(
      res,
      'GetBassResponse'
    );
    return Number(parsed?.CurrentBass) || 0;
  }

  static async setBass(ip: string, bass: number): Promise<void> {
    const clamped = Math.max(-10, Math.min(10, Math.round(bass)));
    await this.executeSoap(
      ip,
      UPNP_SERVICES.RENDERING_CONTROL.CONTROL,
      UPNP_SERVICES.RENDERING_CONTROL.SERVICE,
      'SetBass',
      {
        InstanceID: '0',
        DesiredBass: clamped,
      }
    );
  }

  static async getTreble(ip: string): Promise<number> {
    const res = await this.executeSoap(
      ip,
      UPNP_SERVICES.RENDERING_CONTROL.CONTROL,
      UPNP_SERVICES.RENDERING_CONTROL.SERVICE,
      'GetTreble',
      { InstanceID: '0', Channel: 'Master' }
    );
    const parsed = parseSoapResponse<{ CurrentTreble?: number | string }>(
      res,
      'GetTrebleResponse'
    );
    return Number(parsed?.CurrentTreble) || 0;
  }

  static async setTreble(ip: string, treble: number): Promise<void> {
    const clamped = Math.max(-10, Math.min(10, Math.round(treble)));
    await this.executeSoap(
      ip,
      UPNP_SERVICES.RENDERING_CONTROL.CONTROL,
      UPNP_SERVICES.RENDERING_CONTROL.SERVICE,
      'SetTreble',
      {
        InstanceID: '0',
        DesiredTreble: clamped,
      }
    );
  }

  static async getLoudness(ip: string): Promise<boolean> {
    const res = await this.executeSoap(
      ip,
      UPNP_SERVICES.RENDERING_CONTROL.CONTROL,
      UPNP_SERVICES.RENDERING_CONTROL.SERVICE,
      'GetLoudness',
      { InstanceID: '0', Channel: 'Master' }
    );
    const parsed = parseSoapResponse<{ CurrentLoudness?: number | string }>(
      res,
      'GetLoudnessResponse'
    );
    return String(parsed?.CurrentLoudness ?? '0') === '1';
  }

  static async setLoudness(ip: string, enabled: boolean): Promise<void> {
    await this.executeSoap(
      ip,
      UPNP_SERVICES.RENDERING_CONTROL.CONTROL,
      UPNP_SERVICES.RENDERING_CONTROL.SERVICE,
      'SetLoudness',
      {
        InstanceID: '0',
        Channel: 'Master',
        DesiredLoudness: enabled ? '1' : '0',
      }
    );
  }

  static async setNightMode(ip: string, enabled: boolean): Promise<void> {
    await this.setEQ(ip, 'NightMode', enabled ? '1' : '0');
  }

  static async getNightMode(ip: string): Promise<boolean> {
    const val = await this.getEQ(ip, 'NightMode');
    return val === '1';
  }

  /**
   * Speech Enhancement is on/off: the official Sonos app writes DialogLevel 1 to turn
   * it on and 0 to turn it off (observed on Beam Gen 2). The speaker also stores
   * 2, 3 and 4, but the app never uses them, so we don't either.
   */
  static async setSpeechEnhancement(ip: string, enabled: boolean): Promise<void> {
    await this.setEQ(ip, 'DialogLevel', enabled ? '1' : '0');
  }

  static async getSpeechEnhancement(ip: string): Promise<boolean> {
    const val = await this.getEQ(ip, 'DialogLevel');
    return Number(val) > 0;
  }

  /**
   * Resolves the speaker's own room UUID (RINCON_xxx) from its device description.
   * Needed as the RoomUUID payload when (re-)enabling TV Autoplay.
   */
  static async getRoomUuid(ip: string): Promise<string> {
    const url = `http://${ip}:${SONOS_DEFAULTS.UPNP_PORT}/xml/device_description.xml`;
    const response = await axios.get(url, { timeout: SONOS_DEFAULTS.SOAP_TIMEOUT_MS });
    const parsed = xmlParser.parse(response.data);
    const udn = String(parsed?.root?.device?.UDN ?? '');
    return udn.replace('uuid:', '');
  }

  /**
   * TV Autoplay: whether the soundbar switches itself to TV audio when it detects
   * a signal on the TV input. Enabled means AutoplayRoomUUID holds the room that
   * should take over the TV source; an empty UUID means the feature is off.
   */
  static async getTVAutoplay(ip: string): Promise<boolean> {
    return (await this.getTVAutoplayRoomUuid(ip)) !== '';
  }

  /** The room TV Autoplay hands the TV source to, or '' when TV Autoplay is off. */
  static async getTVAutoplayRoomUuid(ip: string): Promise<string> {
    const res = await this.executeSoap(
      ip,
      UPNP_SERVICES.DEVICE_PROPERTIES.CONTROL,
      UPNP_SERVICES.DEVICE_PROPERTIES.SERVICE,
      'GetAutoplayRoomUUID',
      { Source: AUTOPLAY_SOURCE_TV }
    );
    const parsed = parseSoapResponse<{ RoomUUID?: string }>(res, 'GetAutoplayRoomUUIDResponse');
    return String(parsed?.RoomUUID ?? '').trim();
  }

  static async setTVAutoplay(ip: string, enabled: boolean, roomUuid: string = ''): Promise<void> {
    // Enabling requires a concrete room UUID; fall back to the speaker's own room.
    const targetUuid = enabled ? roomUuid || (await this.getRoomUuid(ip)) : '';
    if (enabled && !targetUuid) {
      throw new Error('Cannot enable TV Autoplay: room UUID could not be resolved');
    }

    await this.executeSoap(
      ip,
      UPNP_SERVICES.DEVICE_PROPERTIES.CONTROL,
      UPNP_SERVICES.DEVICE_PROPERTIES.SERVICE,
      'SetAutoplayRoomUUID',
      {
        RoomUUID: targetUuid,
        Source: AUTOPLAY_SOURCE_TV,
      }
    );
  }

  static async getTVAutoplayUngroup(ip: string): Promise<boolean> {
    const res = await this.executeSoap(
      ip,
      UPNP_SERVICES.DEVICE_PROPERTIES.CONTROL,
      UPNP_SERVICES.DEVICE_PROPERTIES.SERVICE,
      'GetAutoplayLinkedZones',
      { Source: AUTOPLAY_SOURCE_TV }
    );
    const parsed = parseSoapResponse<{ IncludeLinkedZones?: string | number | boolean }>(
      res,
      'GetAutoplayLinkedZonesResponse'
    );
    // Not including linked zones means autoplay ungroups the room first.
    const include = parsed?.IncludeLinkedZones;
    return include === false || include === 0 || include === '0' || include === 'false';
  }

  static async setTVAutoplayUngroup(ip: string, ungroup: boolean): Promise<void> {
    await this.executeSoap(
      ip,
      UPNP_SERVICES.DEVICE_PROPERTIES.CONTROL,
      UPNP_SERVICES.DEVICE_PROPERTIES.SERVICE,
      'SetAutoplayLinkedZones',
      {
        IncludeLinkedZones: ungroup ? '0' : '1',
        Source: AUTOPLAY_SOURCE_TV,
      }
    );
  }

  static async getSubEnabled(ip: string): Promise<boolean> {
    const val = await this.getEQ(ip, 'SubEnable');
    return val === '1';
  }

  static async setSubEnabled(ip: string, enabled: boolean): Promise<void> {
    await this.setEQ(ip, 'SubEnable', enabled ? '1' : '0');
  }

  static async getSubGain(ip: string): Promise<number> {
    const val = await this.getEQ(ip, 'SubGain');
    return Number(val) || 0;
  }

  static async setSubGain(ip: string, gain: number): Promise<void> {
    const clamped = Math.max(-10, Math.min(10, Math.round(gain)));
    await this.setEQ(ip, 'SubGain', clamped);
  }

  static async getSubCrossover(ip: string): Promise<number> {
    const val = await this.getEQ(ip, 'SubCrossover');
    return Number(val) || 80;
  }

  static async setSubCrossover(ip: string, freqHz: number): Promise<void> {
    await this.setEQ(ip, 'SubCrossover', freqHz);
  }

  static async getSubPolarity(ip: string): Promise<number> {
    const val = await this.getEQ(ip, 'SubPolarity');
    return Number(val) === 180 ? 180 : 0;
  }

  static async setSubPolarity(ip: string, phaseDeg: 0 | 180): Promise<void> {
    await this.setEQ(ip, 'SubPolarity', phaseDeg);
  }

  static async getSurroundEnabled(ip: string): Promise<boolean> {
    const val = await this.getEQ(ip, 'SurroundEnable');
    return val === '1';
  }

  static async setSurroundEnabled(ip: string, enabled: boolean): Promise<void> {
    await this.setEQ(ip, 'SurroundEnable', enabled ? '1' : '0');
  }

  static async getSurroundLevel(ip: string): Promise<number> {
    const val = await this.getEQ(ip, 'SurroundLevel');
    return Number(val) || 0;
  }

  static async setSurroundLevel(ip: string, level: number): Promise<void> {
    const clamped = Math.max(-15, Math.min(15, Math.round(level)));
    await this.setEQ(ip, 'SurroundLevel', clamped);
  }

  static async getSurroundMusicLevel(ip: string): Promise<number> {
    const val = await this.getEQ(ip, 'MusicSurroundLevel');
    return Number(val) || 0;
  }

  static async setSurroundMusicLevel(ip: string, level: number): Promise<void> {
    const clamped = Math.max(-15, Math.min(15, Math.round(level)));
    await this.setEQ(ip, 'MusicSurroundLevel', clamped);
  }

  static async getSurroundMode(ip: string): Promise<'Ambient' | 'Full'> {
    const val = await this.getEQ(ip, 'SurroundMode');
    return val === '1' ? 'Full' : 'Ambient';
  }

  static async setSurroundMode(ip: string, mode: 'Ambient' | 'Full'): Promise<void> {
    await this.setEQ(ip, 'SurroundMode', mode === 'Full' ? '1' : '0');
  }

  static async getHeightLevel(ip: string): Promise<number> {
    const val = await this.getEQ(ip, 'HeightChannelLevel');
    return Number(val) || 0;
  }

  static async setHeightLevel(ip: string, level: number): Promise<void> {
    const clamped = Math.max(-10, Math.min(10, Math.round(level)));
    await this.setEQ(ip, 'HeightChannelLevel', clamped);
  }

  static async setVolume(ip: string, volume: number): Promise<void> {
    await this.executeSoap(
      ip,
      UPNP_SERVICES.RENDERING_CONTROL.CONTROL,
      UPNP_SERVICES.RENDERING_CONTROL.SERVICE,
      'SetVolume',
      {
        InstanceID: '0',
        Channel: 'Master',
        DesiredVolume: Math.max(0, Math.min(100, volume)),
      }
    );
  }

  static async getTransportInfo(ip: string): Promise<{ state: string }> {
    const res = await this.executeSoap(
      ip,
      UPNP_SERVICES.AV_TRANSPORT.CONTROL,
      UPNP_SERVICES.AV_TRANSPORT.SERVICE,
      'GetTransportInfo',
      { InstanceID: '0' }
    );
    const parsed = parseSoapResponse<{ CurrentTransportState?: string }>(
      res,
      'GetTransportInfoResponse'
    );
    return { state: parsed?.CurrentTransportState || 'STOPPED' };
  }

  static async getPositionInfo(ip: string): Promise<PositionInfo> {
    const res = await this.executeSoap(
      ip,
      UPNP_SERVICES.AV_TRANSPORT.CONTROL,
      UPNP_SERVICES.AV_TRANSPORT.SERVICE,
      'GetPositionInfo',
      { InstanceID: '0' }
    );
    const parsed = parseSoapResponse<any>(res, 'GetPositionInfoResponse');
    const trackNum = Number(parsed?.Track) || 1;
    const trackDuration = String(parsed?.TrackDuration || '0:00:00');
    const relTime = String(parsed?.RelTime || '0:00:00');
    const trackUri = String(parsed?.TrackURI || '');
    const trackDurationMs = parseDurationToMs(trackDuration);
    const positionMs = parseDurationToMs(relTime);

    let title = '';
    let artist = '';
    let album = '';
    let albumArtUri = '';
    let format = parseServiceFormat(trackUri);

    if (trackUri.includes('x-sonos-htastream')) {
      title = 'TV Audio';
      artist = 'HDMI eARC / Optical';
      album = 'Home Theater';
      format = 'OPTICAL / EARC';
    }

    // Radio "now on air" text without an "Artist - Title" split (e.g. a show name).
    let streamText = '';

    /** `fillOnly` keeps fields already set — used to add a station's name/logo under a song's details. */
    const applyDidl = (rawMeta: unknown, fillOnly: boolean = false) => {
      if (!rawMeta || typeof rawMeta !== 'string' || !rawMeta.trim()) return;
      try {
        const didlParser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: false });
        const didl = didlParser.parse(rawMeta);
        const item = didl?.['DIDL-Lite']?.item || didl?.item || {};

        const itemTitle = item.title ? String(item.title) : '';
        if (itemTitle && !isStreamUrlTitle(itemTitle) && !(fillOnly && title)) title = itemTitle;
        if (!(fillOnly && artist)) {
          if (item.creator) artist = String(item.creator);
          else if (item.artist) artist = String(item.artist);
        }

        if (item.album && !(fillOnly && album)) album = String(item.album);

        const art = item.albumArtURI || item.albumArtUri;
        if (art && !(fillOnly && albumArtUri)) {
          const artStr = String(art);
          if (artStr.startsWith('/')) {
            albumArtUri = `http://${ip}:${SONOS_DEFAULTS.UPNP_PORT}${artStr}`;
          } else {
            albumArtUri = artStr;
          }
        }

        if (item.streamContent && typeof item.streamContent === 'string' && item.streamContent.trim()) {
          const sc = item.streamContent.trim();
          if (sc.includes(' - ')) {
            const [scArtist, scTitle] = sc.split(' - ');
            if (scArtist) artist = scArtist.trim();
            if (scTitle) title = scTitle.trim();
          } else {
            streamText = sc.replace(/[\s-]+$/, '');
          }
        }
      } catch {
        // Fallback to defaults
      }
    };

    applyDidl(parsed?.TrackMetaData);

    // A URI started directly (not via the queue) without an account-linked DIDL leaves TrackMetaData
    // empty; the speaker still echoes the metadata we sent in GetMediaInfo's CurrentURIMetaData.
    // Radio needs it too: that's where the station's name and logo live.
    const isStreamTrack = isRadioStreamUri(trackUri);
    if ((!title || (isStreamTrack && !albumArtUri)) && trackUri && !trackUri.startsWith('x-rincon-queue')) {
      try {
        const mediaRes = await this.executeSoap(
          ip,
          UPNP_SERVICES.AV_TRANSPORT.CONTROL,
          UPNP_SERVICES.AV_TRANSPORT.SERVICE,
          'GetMediaInfo',
          { InstanceID: '0' }
        );
        const media = parseSoapResponse<{ CurrentURI?: string; CurrentURIMetaData?: string }>(mediaRes, 'GetMediaInfoResponse');
        const currentUri = String(media?.CurrentURI ?? '');
        if (RADIO_SOURCE_URI.test(currentUri)) {
          // Station name/logo; a song title already read from the stream stays on top.
          applyDidl(media?.CurrentURIMetaData, true);
        } else if (isSameStreamUri(currentUri, trackUri)) {
          applyDidl(media?.CurrentURIMetaData);
        }
      } catch {
        // Keep the generic fallback title
      }
    }

    // A show name with no song details reads as the subtitle under the station.
    if (streamText && !artist) artist = streamText;

    return {
      track: trackNum,
      trackDurationMs,
      trackDuration,
      positionMs,
      relTime,
      trackUri,
      metadata: {
        title: title || (trackUri.includes('x-sonos-htastream') ? 'TV Audio' : 'Sonos Audio'),
        artist: artist || fallbackArtist(trackUri),
        album: album || '',
        albumArtUri,
        durationMs: trackDurationMs,
        positionMs,
        uri: trackUri,
        format,
      },
    };
  }

  /**
   * Retrieves Sonos Favorites from the speaker via ContentDirectory:1#Browse
   * ObjectID: "FV:2", BrowseFlag: "BrowseDirectChildren"
   */
  static async getFavorites(ip: string): Promise<FavoriteItem[]> {
    try {
      const res = await this.executeSoap(
        ip,
        UPNP_SERVICES.CONTENT_DIRECTORY.CONTROL,
        UPNP_SERVICES.CONTENT_DIRECTORY.SERVICE,
        'Browse',
        {
          ObjectID: 'FV:2',
          BrowseFlag: 'BrowseDirectChildren',
          Filter: '*',
          StartingIndex: '0',
          RequestedCount: '100',
          SortCriteria: '',
        }
      );

      const parsed = parseSoapResponse<{ Result?: string }>(res, 'BrowseResponse');
      const rawResult = parsed?.Result;
      if (!rawResult || typeof rawResult !== 'string') {
        return [];
      }

      const didlParser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: false });
      const didl = didlParser.parse(rawResult);
      const rawItems = didl?.['DIDL-Lite']?.item || didl?.item || [];
      const itemsList = Array.isArray(rawItems) ? rawItems : [rawItems];

      const favorites: FavoriteItem[] = [];

      for (let i = 0; i < itemsList.length; i++) {
        const item = itemsList[i];
        if (!item) continue;

        const title = String(item.title || 'Unknown Favorite');
        const id = String(item.id || item.parentID || `fav-${i}`);
        const typeDesc = String(item.description || item.type || 'Favorite');
        const subtitle = typeDesc;

        let albumArtUri: string | undefined;
        const art = item.albumArtURI || item.albumArtUri;
        if (art) {
          const artStr = String(art);
          if (artStr.startsWith('/')) {
            albumArtUri = `http://${ip}:${SONOS_DEFAULTS.UPNP_PORT}${artStr}`;
          } else {
            albumArtUri = artStr;
          }
        }

        // URI and Metadata
        let uri: string | undefined;
        if (item.res) {
          if (typeof item.res === 'string' && item.res.trim()) {
            uri = item.res.trim();
          } else if (typeof item.res === 'object' && item.res['#text']) {
            uri = String(item.res['#text']).trim();
          }
        }

        let metadata: string | undefined;
        if (item.resMD) {
          metadata = typeof item.resMD === 'string' ? item.resMD : JSON.stringify(item.resMD);
        }

        // If albumArtUri wasn't present on top-level item, check inside resMD DIDL
        if (!albumArtUri && metadata) {
          try {
            const innerMatch = metadata.match(/<upnp:albumArtURI>(.*?)<\/upnp:albumArtURI>/i);
            if (innerMatch && innerMatch[1]) {
              const innerArt = innerMatch[1].trim();
              if (innerArt.startsWith('/')) {
                albumArtUri = `http://${ip}:${SONOS_DEFAULTS.UPNP_PORT}${innerArt}`;
              } else {
                albumArtUri = innerArt;
              }
            }
          } catch {
            // Ignore inner parse errors
          }
        }

        // Sonos Radio or service logo fallback matching Sonos cloud asset service catalog
        if (!albumArtUri && (typeDesc.toLowerCase().includes('sonos radio') || title.toLowerCase().includes('sonos radio') || (metadata && metadata.includes('77575')))) {
          albumArtUri = 'https://integration-image-assets.ws.sonos.com/radio.sonos.sali/53495571-a428-4ea8-b8c6-b4ad443270a4/icon400x400-passport%20sonos%20radio%202024%20black%20400x400.png';
        }

        favorites.push({
          id,
          title,
          type: favoriteType(metadata, uri, typeDesc),
          subtitle,
          albumArtUri,
          uri,
          metadata,
        });
      }

      return favorites;
    } catch {
      return [];
    }
  }

  /**
   * Retrieves the current Sonos playback Queue via ContentDirectory:1#Browse
   * ObjectID: "Q:0"
   */
  static async getQueue(ip: string, startingIndex = 0, requestedCount = 50): Promise<QueueItem[]> {
    try {
      const res = await this.executeSoap(
        ip,
        UPNP_SERVICES.CONTENT_DIRECTORY.CONTROL,
        UPNP_SERVICES.CONTENT_DIRECTORY.SERVICE,
        'Browse',
        {
          ObjectID: 'Q:0',
          BrowseFlag: 'BrowseDirectChildren',
          Filter: '*',
          StartingIndex: String(startingIndex),
          RequestedCount: String(requestedCount),
          SortCriteria: '',
        }
      );

      const parsed = parseSoapResponse<{ Result?: string }>(res, 'BrowseResponse');
      const rawResult = parsed?.Result;
      if (!rawResult || typeof rawResult !== 'string') {
        return [];
      }

      const didlParser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: false });
      const didl = didlParser.parse(rawResult);
      const rawItems = didl?.['DIDL-Lite']?.item || didl?.item || [];
      const itemsList = Array.isArray(rawItems) ? rawItems : [rawItems];

      const queue: QueueItem[] = [];

      for (let i = 0; i < itemsList.length; i++) {
        const item = itemsList[i];
        if (!item) continue;

        const id = String(item.id || `Q:0/${startingIndex + i + 1}`);
        const trackNumber = Number(id.replace(/^Q:\d+\//, '')) || (startingIndex + i + 1);
        const title = String(item.title || 'Unknown Track');
        const artist = String(item.creator || item.artist || 'Unknown Artist');
        const album = String(item.album || '');

        let albumArtUri: string | undefined;
        const art = item.albumArtURI || item.albumArtUri;
        if (art) {
          const artStr = String(art);
          if (artStr.startsWith('/')) {
            albumArtUri = `http://${ip}:${SONOS_DEFAULTS.UPNP_PORT}${artStr}`;
          } else {
            albumArtUri = artStr;
          }
        }

        let uri: string | undefined;
        let durationMs = 0;
        if (item.res) {
          if (typeof item.res === 'string') {
            uri = item.res.trim();
          } else if (typeof item.res === 'object') {
            uri = String(item.res['#text'] || '').trim();
            if (item.res['@_duration']) {
              durationMs = parseDurationToMs(item.res['@_duration']);
            }
          }
        }

        queue.push({
          id,
          trackNumber,
          title,
          artist,
          album,
          albumArtUri,
          uri,
          durationMs,
        });
      }

      return queue;
    } catch {
      return [];
    }
  }

  /**
   * Jump to a specific track number in the Sonos Queue (1-indexed).
   * If not already playing from queue (e.g. was playing TV optical), sets AVTransportURI to x-rincon-queue.
   */
  static async seekTrack(ip: string, trackNumber: number, speakerId?: string): Promise<void> {
    // Seek TRACK_NR returns UPnP 701 unless the transport is on the queue (not TV/radio/stream), so switch first.
    if (speakerId) {
      const currentUri = await this.getCurrentUri(ip).catch(() => '');
      if (!currentUri.startsWith('x-rincon-queue:')) {
        await this.setAVTransportURI(ip, `x-rincon-queue:${speakerId.replace('uuid:', '')}#0`);
      }
    }
    await this.executeSoap(
      ip,
      UPNP_SERVICES.AV_TRANSPORT.CONTROL,
      UPNP_SERVICES.AV_TRANSPORT.SERVICE,
      'Seek',
      {
        InstanceID: '0',
        Unit: 'TRACK_NR',
        Target: String(trackNumber),
      }
    );
    await this.play(ip);
  }

  static async getCurrentUri(ip: string): Promise<string> {
    const res = await this.executeSoap(
      ip,
      UPNP_SERVICES.AV_TRANSPORT.CONTROL,
      UPNP_SERVICES.AV_TRANSPORT.SERVICE,
      'GetMediaInfo',
      { InstanceID: '0' }
    );
    const parsed = parseSoapResponse<{ CurrentURI?: string }>(res, 'GetMediaInfoResponse');
    return String(parsed?.CurrentURI ?? '');
  }

  /**
   * Raw `MusicServices:1#ListAvailableServices` response XML — the caller
   * (`musicServiceRegistry.ts`) parses the `<Service .../>` elements out of
   * it, since the `Id`/`Manifest` shapes need regex extraction rather than
   * a clean XML tree (the payload embeds an XML-escaped string).
   */
  static async listAvailableServices(ip: string): Promise<string> {
    return this.executeSoap(
      ip,
      UPNP_SERVICES.MUSIC_SERVICES.CONTROL,
      UPNP_SERVICES.MUSIC_SERVICES.SERVICE,
      'ListAvailableServices',
      { MarketId: '' }
    );
  }

  /**
   * Label for the audio format on the TV input ("Dolby Atmos (TrueHD)", "PCM 2.0"…),
   * or null when nothing is connected or the code is unknown.
   */
  static async getTvAudioFormat(ip: string): Promise<string | null> {
    const res = await this.executeSoap(
      ip,
      UPNP_SERVICES.DEVICE_PROPERTIES.CONTROL,
      UPNP_SERVICES.DEVICE_PROPERTIES.SERVICE,
      'GetZoneInfo'
    );
    const parsed = parseSoapResponse<{ HTAudioIn?: string | number }>(res, 'GetZoneInfoResponse');
    const code = Number(parsed?.HTAudioIn);
    if (!Number.isFinite(code) || TV_NO_INPUT_CODES.has(code)) return null;
    return TV_AUDIO_FORMATS[code] ?? null;
  }

  /** The id of the group this speaker currently belongs to (changes on regrouping). */
  static async getCurrentGroupId(ip: string): Promise<string> {
    const res = await this.executeSoap(
      ip,
      UPNP_SERVICES.ZONE_GROUP_TOPOLOGY.CONTROL,
      UPNP_SERVICES.ZONE_GROUP_TOPOLOGY.SERVICE,
      'GetZoneGroupAttributes'
    );
    const parsed = parseSoapResponse<{ CurrentZoneGroupID?: string }>(
      res,
      'GetZoneGroupAttributesResponse'
    );
    return String(parsed?.CurrentZoneGroupID || '');
  }

  /**
   * Audio quality of the current track, from the speaker's local Control API
   * (`playbackMetadata`). Unlike UPnP metadata this carries bit depth, sample rate,
   * lossless and immersive (Dolby Atmos) flags. Plain HTTP on port 1400 serves this
   * endpoint when the local API key is sent, so no TLS handling is needed.
   * Returns null when the speaker reports no quality (e.g. TV input, radio).
   */
  static async getTrackQuality(ip: string, isRetry = false): Promise<TrackQuality | null> {
    let groupId = groupIdCache.get(ip);
    if (!groupId) {
      groupId = await this.getCurrentGroupId(ip);
      if (!groupId) return null;
      groupIdCache.set(ip, groupId);
    }

    const url = `http://${ip}:${SONOS_DEFAULTS.UPNP_PORT}/api/v1/groups/${encodeURIComponent(groupId)}/playbackMetadata`;
    try {
      const response = await axios.get(url, {
        timeout: SONOS_DEFAULTS.SOAP_TIMEOUT_MS,
        headers: { 'X-Sonos-Api-Key': SONOS_DEFAULTS.LOCAL_API_KEY },
      });
      const quality = response.data?.currentItem?.track?.quality;
      if (!quality) return null;
      return {
        bitDepth: typeof quality.bitDepth === 'number' ? quality.bitDepth : undefined,
        sampleRate: typeof quality.sampleRate === 'number' ? quality.sampleRate : undefined,
        lossless: quality.lossless === true,
        immersive: quality.immersive === true,
      };
    } catch (error) {
      // A stale group id (the room was regrouped) fails; look it up once more.
      groupIdCache.delete(ip);
      if (!isRetry) return this.getTrackQuality(ip, true);
      throw error;
    }
  }

  /** `DeviceProperties#GetHouseholdID` — the base household id used by SMAPI credentials. */
  static async getHouseholdId(ip: string): Promise<string> {
    const res = await this.executeSoap(
      ip,
      UPNP_SERVICES.DEVICE_PROPERTIES.CONTROL,
      UPNP_SERVICES.DEVICE_PROPERTIES.SERVICE,
      'GetHouseholdID',
      {}
    );
    const parsed = parseSoapResponse<{ CurrentHouseholdID?: string }>(res, 'GetHouseholdIDResponse');
    return String(parsed?.CurrentHouseholdID || '');
  }

  /**
   * The zone player's serial number — used as the `<deviceId>` in the SMAPI
   * credentials header (distinct from the account-suffixed household id;
   * see `smapiClient.ts`). Read from the plain-HTTP `/status/zp` endpoint,
   * not SOAP.
   */
  static async getZonePlayerSerial(ip: string): Promise<string> {
    const url = `http://${ip}:${SONOS_DEFAULTS.UPNP_PORT}/status/zp`;
    try {
      const response = await axios.get<string>(url, {
        timeout: SONOS_DEFAULTS.SOAP_TIMEOUT_MS,
        headers: { 'User-Agent': SONOS_DEFAULTS.USER_AGENT },
      });
      const parsed = xmlParser.parse(response.data);
      const serial = parsed?.ZPSupportInfo?.ZPInfo?.SerialNumber;
      return String(serial || '');
    } catch (error) {
      log.error(TAG, `getZonePlayerSerial failed on ${url}`, error);
      throw error;
    }
  }

}

export interface QueueItem {
  id: string;
  trackNumber: number;
  title: string;
  artist: string;
  album: string;
  albumArtUri?: string;
  uri?: string;
  durationMs: number;
}

