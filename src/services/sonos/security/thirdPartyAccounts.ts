import { XMLParser } from 'fast-xml-parser';
import { log } from '../../../utils/logger';
import { MusicServiceAccount } from '../smapi/smapiTypes';

const TAG = 'ThirdPartyAccounts';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (tagName) => tagName === 'Service',
});

/**
 * Parses the decrypted `ThirdPartyMediaServersX` XML into one
 * `MusicServiceAccount` per indexed account.
 *
 * Shape (verified against `references/tvonos/src/DeviceAuthItem.java` and
 * `wh1.java`; this is NOT the flat `<Services><Service Id Name AuthToken.../>`
 * shape the pre-59ec6f0 parser assumed):
 *
 *   <MediaServers>
 *     <Service UDN="SA_RINCON52231_X_#Svc52231-aa0461a8-Token"
 *              NumAccounts="1"
 *              Token0="..." Key0="..." Nickname0="Ali" Username0="..."/>
 *   </MediaServers>
 *
 * `NumAccounts` accounts are indexed 0..N-1 as `Token{n}`/`Key{n}`/
 * `Nickname{n}`/`Username{n}` on the same element. `serviceId` is derived
 * from the UDN, not from an attribute: the digits immediately after
 * `SA_RINCON` are `serviceId * 256 + 7` (`typeId`), so
 * `serviceId = (typeId - 7) / 256` (the `- 7` is required — see `wh1.java`;
 * plain `/256` truncates to the same answer for most services but is not
 * the actual formula).
 */
export function parseThirdPartyAccounts(decryptedXml: string): MusicServiceAccount[] {
  if (!decryptedXml || decryptedXml.trim().length === 0) {
    return [];
  }

  let parsed: any;
  try {
    parsed = parser.parse(decryptedXml);
  } catch (error) {
    log.error(TAG, 'Failed to parse decrypted ThirdPartyMediaServersX XML', error);
    return [];
  }

  const mediaServers = parsed?.MediaServers;
  if (!mediaServers) {
    log.warn(TAG, 'Decrypted payload has no <MediaServers> root');
    return [];
  }

  const services: any[] = Array.isArray(mediaServers.Service)
    ? mediaServers.Service
    : mediaServers.Service
      ? [mediaServers.Service]
      : [];

  const accounts: MusicServiceAccount[] = [];

  for (const service of services) {
    const udn: string | undefined = service['@_UDN'];
    if (!udn) continue;

    const serviceId = serviceIdFromUdn(udn);
    if (!serviceId) {
      log.warn(TAG, `Could not derive serviceId from UDN: ${udn}`);
      continue;
    }

    const numAccounts = parseInt(service['@_NumAccounts'] ?? '0', 10) || 0;

    for (let i = 0; i < numAccounts; i++) {
      const authToken = service[`@_Token${i}`];
      // Key may be empty: a fresh Apple Music link (Flags0="4") ships Token0 with
      // Key0="", and the service accepts the token alone. Only the token is required.
      const privateKey = service[`@_Key${i}`] ?? '';
      if (!authToken) continue;

      accounts.push({
        serviceId,
        udn,
        authToken,
        privateKey,
        nickname: service[`@_Nickname${i}`],
        username: service[`@_Username${i}`],
      });
    }
  }

  return accounts;
}

/**
 * `UDN="SA_RINCON<digits>_X_#Svc<digits>-<accountSuffix>-Token"`
 * → `serviceId = (digits - 7) / 256`.
 */
function serviceIdFromUdn(udn: string): string | null {
  const match = /SA_RINCON(\d+)_/.exec(udn);
  if (!match) return null;

  const typeId = parseInt(match[1], 10);
  if (Number.isNaN(typeId)) return null;

  const serviceId = Math.floor((typeId - 7) / 256);
  return String(serviceId);
}

/**
 * The account-suffixed device id used for `X-Sonos-Device-Id` and
 * `<loginToken><householdId>` — NOT the same as `<deviceId>` in the SOAP
 * body (that is the zone player serial; see `smapiClient.ts`).
 *
 * Ported from `src/sonos/smapi/b.java` `e()`: split the UDN suffix on "-"
 * and append the middle segment to the household id, unless that segment
 * is "0" (a freshly-minted, not-yet-linked account UDN).
 */
export function accountSuffixedDeviceId(householdId: string, udn: string): string {
  const hashIndex = udn.indexOf('#Svc');
  if (hashIndex === -1) return householdId;

  const suffix = udn.slice(hashIndex + 1); // "Svc52231-aa0461a8-Token"
  const parts = suffix.split('-');
  if (parts.length === 3 && parts[1] !== '0') {
    return `${householdId}_${parts[1]}`;
  }
  return householdId;
}
