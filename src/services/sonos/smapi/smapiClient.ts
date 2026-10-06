import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { SONOS_DEFAULTS } from '../../../constants';
import { log } from '../../../utils/logger';
import { accountSuffixedDeviceId } from '../security/thirdPartyAccounts';
import { MusicAccountStore } from '../accounts/musicAccountStore';
import { supportsTimeZoneContext } from './musicServiceRegistry';
import {
  MusicService,
  MusicServiceAccount,
  GetMetadataResult,
  MediaCollection,
  MediaMetadata,
  GetMediaUriResult,
  HttpHeader,
} from './smapiTypes';

const TAG = 'SmapiClient';
const SMAPI_TIMEOUT_MS = 8000;

/** A stable per-app-launch controller id, sent as `X-Sonos-Controller-ID`. */
export const CONTROLLER_ID = randomUuid();

const responseParser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: true,
  isArray: (tagName) => tagName === 'mediaCollection' || tagName === 'mediaMetadata' || tagName === 'header',
});

export class SmapiFault extends Error {
  constructor(public readonly faultCode: string, message: string) {
    super(message);
    this.name = 'SmapiFault';
  }
}

/**
 * Everything a SMAPI call needs beyond the request-specific arguments.
 * `account` is `null` for anonymous services (e.g. TuneIn, `Auth="Anonymous"`).
 */
export interface SmapiContext {
  service: MusicService;
  account: MusicServiceAccount | null;
  householdId: string;
  /** Zone player serial number — the `<deviceId>` in the SOAP body. See `buildCredentialsHeader`. */
  zonePlayerSerial: string;
}

/**
 * Builds the SOAP `<soap:Header><credentials>...` block.
 *
 * Ported from `references/tvonos/src/sonos/smapi/b.java` `f()`. Two values
 * that look interchangeable are NOT:
 *   - `<householdId>` inside `<loginToken>` = the ACCOUNT-SUFFIXED id
 *     (`householdId + "_" + accountSuffix"`, via `accountSuffixedDeviceId`).
 *   - `<deviceId>` = the zone player's serial number (`ctx.zonePlayerSerial`),
 *     a completely different value. Conflating these two produces SOAP
 *     fault 1000 — the exact bug the pre-59ec6f0 client had.
 *
 * Anonymous services (`Auth="Anonymous"`, e.g. TuneIn) send no `<loginToken>`
 * at all.
 */
function buildCredentialsHeader(ctx: SmapiContext): string {
  const { service, account, householdId, zonePlayerSerial } = ctx;
  const isLinked = service.auth.toLowerCase() === 'applink' || service.auth.toLowerCase() === 'devicelink';

  let header: string;
  if (isLinked && account) {
    const suffixedHouseholdId = accountSuffixedDeviceId(householdId, account.udn);
    header =
      '<soap:Header><credentials><loginToken>' +
      `<token>${escapeXml(account.authToken)}</token>` +
      `<key>${escapeXml(account.privateKey)}</key>` +
      `<householdId>${escapeXml(suffixedHouseholdId)}</householdId>` +
      '</loginToken>';
  } else {
    header = '<soap:Header><credentials>';
  }

  header += `<deviceId>${escapeXml(zonePlayerSerial)}</deviceId><deviceProvider>Sonos</deviceProvider>`;

  if (supportsTimeZoneContext(service)) {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    header += `<context><timeZone>${escapeXml(timeZone)}</timeZone></context>`;
  }

  return `${header}</credentials></soap:Header>`;
}

/** `X-Sonos-Device-Id` uses the same account-suffixed value as `<loginToken><householdId>`. */
function deviceIdHeaderValue(ctx: SmapiContext): string {
  return ctx.account ? accountSuffixedDeviceId(ctx.householdId, ctx.account.udn) : ctx.householdId;
}

const YOUTUBE_MUSIC_SERVICE_ID = '284';

/**
 * Mirrors tvonos `b.d()` + `c.o()`: YouTube Music gets `X-Goog-Api-Key` on
 * every SOAP call, but the Bearer only on data calls. `refreshAuthToken`
 * must not carry the (expired) Bearer, or Google rejects it with 401.
 */
function buildHeaders(ctx: SmapiContext, action: string): Record<string, string> {
  const { service, account } = ctx;
  const headers: Record<string, string> = {
    'Content-Type': 'text/xml; charset=utf8',
    'User-Agent': SONOS_DEFAULTS.USER_AGENT,
    SoapAction: `http://www.sonos.com/Services/1.1#${action}`,
    'X-Sonos-Corr-Id': randomUuid(),
    'X-Sonos-Controller-ID': CONTROLLER_ID,
    'X-Sonos-Device-Id': deviceIdHeaderValue(ctx),
    'X-Sonos-Api-Key': SONOS_DEFAULTS.API_KEY,
    'Accept-Language': 'en-US',
  };

  if (service.serviceId === YOUTUBE_MUSIC_SERVICE_ID) {
    headers['X-Goog-Api-Key'] = SONOS_DEFAULTS.YOUTUBE_MUSIC_GOOGLE_API_KEY;
    if (account && action !== 'refreshAuthToken') {
      headers.Authorization = `Bearer ${account.authToken}`;
    }
  }

  return headers;
}

function escapeXml(value: string): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/** Strips inter-tag whitespace, matching `b.b()` in the decompiled client. */
function compactEnvelope(xml: string): string {
  return xml.replace(/>\s+</g, '><').trim();
}

function wrapEnvelope(header: string, body: string): string {
  return compactEnvelope(
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns="http://www.sonos.com/Services/1.1">` +
      `${header}<soap:Body>${body}</soap:Body></soap:Envelope>`,
  );
}

/**
 * `getMetadata` — root/container browse (used both for a service's own
 * "root" panel and, with `id="search"`, to resolve its search categories).
 * On HTTP 401 or a fault body containing `TokenRefreshRequired`, retries
 * once via `refreshAuthToken`.
 */
export async function getMetadata(
  ctx: SmapiContext,
  containerId: string,
  index: number = 0,
  count: number = 100,
): Promise<GetMetadataResult> {
  const body =
    `<getMetadata><id>${escapeXml(containerId)}</id>` +
    `<index>${index}</index><count>${count}</count></getMetadata>`;

  return request(ctx, 'getMetadata', body, (xml) => parseMetadataResult(xml, 'getMetadataResponse'));
}

/**
 * `search` — the primary cross-service search entry point. `categoryId`
 * must be the service-specific `mappedId` resolved by `searchCategories.ts`
 * ("song" for Apple Music, "track" for Spotify, etc.), never a generic
 * category name.
 */
export async function search(
  ctx: SmapiContext,
  categoryId: string,
  term: string,
  index: number = 0,
  count: number = 50,
): Promise<GetMetadataResult> {
  const body =
    `<search><id>${escapeXml(categoryId)}</id><term>${escapeXml(term)}</term>` +
    `<index>${index}</index><count>${count}</count></search>`;

  return request(ctx, 'search', body, (xml) => parseMetadataResult(xml, 'searchResponse'));
}

/** `getMediaMetadata` — one track's full metadata (artist, album, artwork, duration) by its SMAPI id. */
export async function getMediaMetadata(ctx: SmapiContext, itemId: string): Promise<MediaMetadata | null> {
  const body = `<getMediaMetadata><id>${escapeXml(itemId)}</id></getMediaMetadata>`;
  return request(ctx, 'getMediaMetadata', body, (xml) => {
    const parsed = responseParser.parse(xml);
    const item = parsed?.Envelope?.Body?.getMediaMetadataResponse?.getMediaMetadataResult;
    return item ? toMediaMetadata(item) : null;
  });
}

export async function getMediaURI(ctx: SmapiContext, itemId: string): Promise<GetMediaUriResult> {
  const body = `<getMediaURI><id>${escapeXml(itemId)}</id><action>IMPLICIT</action></getMediaURI>`;
  return request(ctx, 'getMediaURI', body, (xml) => parseMediaUriResult(xml));
}

type RefreshedCredentials = { authToken: string; privateKey?: string };

/** Same regex extraction as tvonos `dv.h()` — works for both refresh responses and `TokenRefreshRequired` fault details. */
function extractCredentials(xml: string): RefreshedCredentials | null {
  const authToken = /<(?:\w+:)?authToken[^>]*>([\s\S]+?)<\/(?:\w+:)?authToken>/.exec(xml)?.[1];
  if (!authToken) return null;
  const privateKey = /<(?:\w+:)?privateKey[^>]*>([\s\S]+?)<\/(?:\w+:)?privateKey>/.exec(xml)?.[1];
  return { authToken: authToken.trim(), privateKey: privateKey?.trim() };
}

/** Redeems a fresh `authToken`/`privateKey` pair using the existing linked account. */
export async function refreshAuthToken(
  ctx: SmapiContext & { account: MusicServiceAccount },
): Promise<RefreshedCredentials | null> {
  const envelope = wrapEnvelope(buildCredentialsHeader(ctx), '<refreshAuthToken/>');

  try {
    const response = await axios.post<string>(ctx.service.uri, envelope, {
      headers: buildHeaders(ctx, 'refreshAuthToken'),
      timeout: SMAPI_TIMEOUT_MS,
      validateStatus: () => true,
    });
    const bodyText = typeof response.data === 'string' ? response.data : String(response.data);
    if (bodyText.includes('AuthTokenExpired')) {
      throw new SmapiFault('AuthTokenExpired', `${ctx.service.name} account must be re-linked in the Sonos app`);
    }
    const credentials = extractFault(bodyText) ? null : extractCredentials(bodyText);
    if (!credentials) {
      log.error(TAG, `refreshAuthToken failed for service ${ctx.service.serviceId} (HTTP ${response.status})`, bodyText);
    }
    return credentials;
  } catch (error) {
    if (error instanceof SmapiFault) throw error;
    log.error(TAG, `refreshAuthToken failed for service ${ctx.service.serviceId}`, error);
    return null;
  }
}

/**
 * Refreshes `ctx.account`'s credentials in place and persists them — for
 * callers outside SOAP `request()` (e.g. the JSON Browse API) that get a 401.
 * Returns false when there's no account or the service refused to refresh.
 */
export async function refreshContextCredentials(ctx: SmapiContext): Promise<boolean> {
  const { account } = ctx;
  if (!account) return false;
  const refreshed = await refreshAuthToken({ ...ctx, account });
  if (!refreshed) return false;
  account.authToken = refreshed.authToken;
  account.privateKey = refreshed.privateKey ?? account.privateKey;
  await persistRefreshedAccount({ ...account });
  return true;
}

async function persistRefreshedAccount(account: MusicServiceAccount): Promise<void> {
  const accounts = await MusicAccountStore.getAccounts();
  await MusicAccountStore.saveAccounts(
    accounts.map((existing) => (existing.serviceId === account.serviceId && existing.udn === account.udn ? account : existing)),
  );
}

async function request<T>(
  ctx: SmapiContext,
  action: string,
  body: string,
  parseResult: (xml: string) => T,
  isRetry: boolean = false,
): Promise<T> {
  const { service, account } = ctx;
  const envelope = wrapEnvelope(buildCredentialsHeader(ctx), body);

  try {
    const response = await axios.post<string>(service.uri, envelope, {
      headers: buildHeaders(ctx, action),
      timeout: SMAPI_TIMEOUT_MS,
      validateStatus: () => true, // SMAPI faults come back as 200 with a SOAP Fault body
    });

    const bodyText: string = typeof response.data === 'string' ? response.data : String(response.data);
    const shouldRefresh = response.status === 401 || bodyText.includes('TokenRefreshRequired');

    if (shouldRefresh) {
      if (isRetry || !account) {
        throw new SmapiFault('TokenRefreshRequired', `${action} requires a token refresh but none is available`);
      }
      log.warn(TAG, `${action} on ${service.name} requires token refresh; retrying once`);
      // TokenRefreshRequired faults usually carry the new token in <detail>; only call refreshAuthToken if not.
      const refreshed = extractCredentials(bodyText) ?? (await refreshAuthToken({ ...ctx, account }));
      if (!refreshed) {
        throw new SmapiFault('TokenRefreshFailed', `Failed to refresh token for ${service.name}`);
      }
      const refreshedAccount: MusicServiceAccount = {
        ...account,
        authToken: refreshed.authToken,
        privateKey: refreshed.privateKey ?? account.privateKey,
      };
      account.authToken = refreshedAccount.authToken;
      account.privateKey = refreshedAccount.privateKey;
      await persistRefreshedAccount(refreshedAccount);
      return request({ ...ctx, account: refreshedAccount }, action, body, parseResult, true);
    }

    const fault = extractFault(bodyText);
    if (fault) {
      throw new SmapiFault(fault.faultcode, fault.faultstring);
    }

    return parseResult(bodyText);
  } catch (error) {
    if (error instanceof SmapiFault) throw error;
    log.error(TAG, `${action} failed on ${service.name} (${service.uri})`, error);
    throw error;
  }
}

function toMediaMetadata(item: any): MediaMetadata {
  return {
    id: String(item.id ?? ''),
    itemType: item.itemType,
    title: String(item.title ?? ''),
    summary: item.summary,
    mimeType: item.mimeType,
    albumArtUri: item.trackMetadata?.albumArtURI,
    artist: item.trackMetadata?.artist,
    artistId: item.trackMetadata?.artistId,
    album: item.trackMetadata?.album,
    albumId: item.trackMetadata?.albumId,
    durationMs: item.trackMetadata?.duration ? Number(item.trackMetadata.duration) * 1000 : undefined,
  };
}

function parseMetadataResult(xml: string, responseTag: string): GetMetadataResult {
  const parsed = responseParser.parse(xml);
  const result = parsed?.Envelope?.Body?.[responseTag]?.[`${responseTag.replace('Response', '')}Result`] ?? {};

  const mediaCollection: MediaCollection[] = (result.mediaCollection ?? []).map((item: any) => ({
    id: String(item.id ?? ''),
    itemType: item.itemType,
    title: String(item.title ?? ''),
    summary: item.summary,
    albumArtUri: item.albumArtURI,
    canPlay: item.canPlay === 'true' || item.canPlay === true,
    displayType: item.displayType,
  }));

  const mediaMetadata: MediaMetadata[] = (result.mediaMetadata ?? []).map(toMediaMetadata);

  return {
    index: Number(result.index ?? 0),
    count: Number(result.count ?? mediaCollection.length + mediaMetadata.length),
    total: Number(result.total ?? mediaCollection.length + mediaMetadata.length),
    mediaCollection,
    mediaMetadata,
  };
}

function parseMediaUriResult(xml: string): GetMediaUriResult {
  const parsed = responseParser.parse(xml);
  const result = parsed?.Envelope?.Body?.getMediaURIResponse ?? {};

  const rawHeaders = result.httpHeaders?.header ?? [];
  const httpHeaders: HttpHeader[] = rawHeaders.map((h: any) => ({
    header: String(h.header ?? ''),
    value: String(h.value ?? ''),
  }));

  return {
    uri: String(result.getMediaURIResult ?? ''),
    httpHeaders,
  };
}

function extractFault(xml: string): { faultcode: string; faultstring: string } | null {
  if (!xml.includes('<Fault>') && !xml.includes(':Fault>')) return null;
  try {
    const parsed = responseParser.parse(xml);
    const fault = parsed?.Envelope?.Body?.Fault;
    if (fault) {
      return {
        faultcode: String(fault.faultcode ?? 'Unknown'),
        faultstring: String(fault.faultstring ?? 'Unknown SOAP fault'),
      };
    }
  } catch {
    // fall through
  }
  return null;
}

export function randomUuid(): string {
  // Not cryptographically strong — this is only used for correlation
  // headers (X-Sonos-Corr-Id, X-Sonos-Controller-ID), not for security.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.trunc(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
