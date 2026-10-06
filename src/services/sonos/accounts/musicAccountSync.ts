import { XMLParser } from 'fast-xml-parser';
import { SonosUpnpClient } from '../upnp/sonosUpnpClient';
import { GenaEventListener } from '../gena/genaEventListener';
import { decryptThirdPartyPayload } from '../security/sonosCrypto';
import { parseThirdPartyAccounts } from '../security/thirdPartyAccounts';
import { MusicAccountStore } from './musicAccountStore';
import { UPNP_SERVICES } from '../../../constants';
import { log } from '../../../utils/logger';
import { MusicServiceAccount } from '../smapi/smapiTypes';

const TAG = 'MusicAccountSync';

/** How long to wait for a NOTIFY carrying ThirdPartyMediaServersX before giving up on a subscription. */
const SYNC_TIMEOUT_MS = 10000;
/**
 * On a real TV the first subscription after launch sometimes never gets its
 * NOTIFY while an immediate second one does, so a timed-out attempt is
 * retried once with a fresh subscription before reporting failure.
 */
const SYNC_ATTEMPTS = 2;

const propertySetParser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true });

/**
 * "Synchronize Music Services" — imports whatever accounts are already
 * linked in the official Sonos app, exactly as tvonos's
 * "Synchronize Music Services" action does (no QR / device-link flow).
 *
 * `ThirdPartyMediaServersX` is delivered only via the first GENA `NOTIFY`
 * after subscribing to `/ZoneGroupTopology/Event` — it is absent from
 * `GetZoneGroupState` (verified against the captured device dump). This
 * opens a short-lived subscription, waits for that value, decrypts it, and
 * persists the resulting accounts.
 *
 * Returns the persisted account list, now matching the speaker's. Throws if
 * none of the `SYNC_ATTEMPTS` subscriptions gets a `ThirdPartyMediaServersX`
 * NOTIFY within `SYNC_TIMEOUT_MS` (e.g. the speaker has no linked accounts,
 * or it can't reach this device's callback port), or if the household id
 * could not be fetched first.
 */
export async function synchronizeMusicServices(speakerIp: string): Promise<MusicServiceAccount[]> {
  const householdId = await SonosUpnpClient.getHouseholdId(speakerIp);
  if (!householdId) {
    throw new Error('Could not resolve household id; cannot decrypt music service accounts');
  }

  let accounts: MusicServiceAccount[] | null = null;
  for (let attempt = 1; accounts === null; attempt++) {
    try {
      accounts = await fetchLinkedAccounts(speakerIp, householdId);
    } catch (error) {
      if (attempt >= SYNC_ATTEMPTS) throw error;
      log.warn(TAG, `Sync attempt ${attempt} failed; retrying with a fresh subscription`, String(error));
    }
  }
  return MusicAccountStore.reconcile(accounts);
}

/** One subscription's worth of waiting for the speaker's linked-account payload. */
async function fetchLinkedAccounts(speakerIp: string, householdId: string): Promise<MusicServiceAccount[]> {
  const listener = new GenaEventListener(speakerIp, UPNP_SERVICES.ZONE_GROUP_TOPOLOGY.EVENT);

  try {
    return await new Promise<MusicServiceAccount[]>((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('Timed out waiting for ThirdPartyMediaServersX (no linked services?)'));
      }, SYNC_TIMEOUT_MS);

      const unregister = listener.onNotify((body) => {
        if (settled) return;

        const payload = extractThirdPartyMediaServersX(body);
        if (!payload) {
          log.debug(TAG, 'NOTIFY received without ThirdPartyMediaServersX; waiting for next one');
          return;
        }

        const decrypted = decryptThirdPartyPayload(householdId, payload);
        if (!decrypted) {
          log.error(TAG, 'Decryption of ThirdPartyMediaServersX returned no data');
          return;
        }

        const parsedAccounts = parseThirdPartyAccounts(decrypted);
        log.debug(TAG, `Synced ${parsedAccounts.length} music service account(s)`);

        settled = true;
        clearTimeout(timer);
        unregister();
        resolve(parsedAccounts);
      });

      listener.subscribe().catch((error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unregister();
        reject(error);
      });
    });
  } finally {
    await listener.unsubscribe();
  }
}

/**
 * Pulls `<ThirdPartyMediaServersX>` out of a GENA `<e:propertyset>` NOTIFY
 * body. Namespace prefixes are stripped by the parser, so this looks for
 * the bare tag name across all `<property>` entries.
 */
function extractThirdPartyMediaServersX(notifyBody: string): string | null {
  try {
    const parsed = propertySetParser.parse(notifyBody);
    const properties = parsed?.propertyset?.property;
    const propertyList = Array.isArray(properties) ? properties : properties ? [properties] : [];

    for (const property of propertyList) {
      const value = property?.ThirdPartyMediaServersX;
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }
  } catch (error) {
    log.error(TAG, 'Failed to parse GENA NOTIFY body', error);
  }
  return null;
}
