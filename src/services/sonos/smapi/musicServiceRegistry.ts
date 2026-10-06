import { XMLParser } from 'fast-xml-parser';
import { SonosUpnpClient } from '../upnp/sonosUpnpClient';
import { log } from '../../../utils/logger';
import { MusicService } from './smapiTypes';

const TAG = 'MusicServiceRegistry';

/** Bit 0 of `Capabilities` — service supports `search`. */
const CAPABILITY_SEARCH = 0x1;

const descriptorParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (tagName) => tagName === 'Service',
});

/**
 * Fetches and parses `MusicServices:1#ListAvailableServices`.
 *
 * The SOAP response wraps the service list as an XML-entity-escaped
 * *string* inside `<AvailableServiceDescriptorList>` (verified against the
 * captured `music_services.xml` dump) — the same "parse the outer envelope,
 * then parse the extracted inner XML" pattern `sonosUpnpClient.getPositionInfo`
 * already uses for `TrackMetaData`.
 *
 * `ContainerType="Preload"` entries are skipped (`pb1.x` in the decompiled
 * source filters these — they are not user-facing music services).
 */
export async function listMusicServices(speakerIp: string): Promise<MusicService[]> {
  const rawXml = await SonosUpnpClient.listAvailableServices(speakerIp);

  const outerParser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true });
  const outer = outerParser.parse(rawXml);
  const descriptorXml: string | undefined =
    outer?.Envelope?.Body?.ListAvailableServicesResponse?.AvailableServiceDescriptorList;

  if (!descriptorXml) {
    log.warn(TAG, 'ListAvailableServices response had no AvailableServiceDescriptorList');
    return [];
  }

  let parsed: any;
  try {
    parsed = descriptorParser.parse(descriptorXml);
  } catch (error) {
    log.error(TAG, 'Failed to parse AvailableServiceDescriptorList', error);
    return [];
  }

  const rawServices: any[] = parsed?.Services?.Service ?? [];
  const services: MusicService[] = [];

  for (const raw of rawServices) {
    if (String(raw['@_ContainerType']).toLowerCase() === 'preload') {
      continue;
    }

    const serviceId = raw['@_Id'];
    if (!serviceId) continue;

    const capabilities = parseInt(raw['@_Capabilities'] ?? '0', 10) || 0;
    const policy = raw.Policy;
    const manifest = raw.Manifest;

    services.push({
      serviceId: String(serviceId),
      name: String(raw['@_Name'] ?? ''),
      auth: String(policy?.['@_Auth'] ?? 'Anonymous'),
      uri: String(raw['@_Uri'] ?? ''),
      secureUri: String(raw['@_SecureUri'] ?? ''),
      capabilities,
      manifestUri: manifest?.['@_Uri'],
      containerType: raw['@_ContainerType'],
      typeId: parseInt(serviceId, 10) * 256 + 7,
    });
  }

  return services;
}

export function supportsSearch(service: MusicService): boolean {
  return (service.capabilities & CAPABILITY_SEARCH) !== 0;
}

/** Bit 16 of `Capabilities` — service expects `<context><timeZone>` in the credentials header. */
export function supportsTimeZoneContext(service: MusicService): boolean {
  return (service.capabilities & 0x10000) !== 0;
}

export function isAppLinkOrDeviceLink(service: MusicService): boolean {
  const auth = service.auth.toLowerCase();
  return auth === 'applink' || auth === 'devicelink';
}
