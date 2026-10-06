import { SonosUpnpClient } from '../upnp/sonosUpnpClient';
import { listMusicServices, supportsSearch } from './musicServiceRegistry';
import { MusicAccountStore } from '../accounts/musicAccountStore';
import { SmapiContext } from './smapiClient';
import { MusicService } from './smapiTypes';

/**
 * Builds one `SmapiContext` per service the user actually synced via
 * "Synchronize Music Services" — matches `useMusicServices.ts`'s "Your
 * Services" filtering exactly. `ListAvailableServices` returns every
 * service the speaker CAN offer, including dozens of `Auth="Anonymous"`
 * services (Hit Network, Triple M, ...) nobody linked; those, and any
 * removed/unsynced service, are excluded — not just linked services
 * without credentials.
 */
export async function buildSmapiContexts(speakerIp: string): Promise<SmapiContext[]> {
  const [services, accounts, householdId, zonePlayerSerial] = await Promise.all([
    listMusicServices(speakerIp),
    MusicAccountStore.getAccounts(),
    SonosUpnpClient.getHouseholdId(speakerIp),
    SonosUpnpClient.getZonePlayerSerial(speakerIp),
  ]);

  const accountsByServiceId = new Map(accounts.map((account) => [account.serviceId, account]));

  const contexts: SmapiContext[] = [];
  for (const service of services) {
    const account = accountsByServiceId.get(service.serviceId);
    if (!account) continue; // Not synced — skip.

    contexts.push({ service, account, householdId, zonePlayerSerial });
  }

  return contexts;
}

/** Search-capable subset — used by cross-service search fan-out. */
export async function buildSearchableSmapiContexts(speakerIp: string): Promise<SmapiContext[]> {
  const contexts = await buildSmapiContexts(speakerIp);
  return contexts.filter((ctx) => supportsSearch(ctx.service));
}

export function findServiceContext(contexts: SmapiContext[], serviceId: string): SmapiContext | undefined {
  return contexts.find((ctx) => ctx.service.serviceId === serviceId);
}

export type { MusicService };
