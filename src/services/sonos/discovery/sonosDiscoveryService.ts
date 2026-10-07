import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { SONOS_DEFAULTS, UPNP_SERVICES } from '../../../constants';
import { SonosDevice, ZoneGroup } from '../../../types/sonos';
import { SonosUpnpClient } from '../upnp/sonosUpnpClient';
import { getLocalNetworks, hostsToScan, ssdpSearch } from './localNetwork';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
});

/**
 * Parses Sonos ZoneGroupTopology state XML into typed ZoneGroups.
 *
 * Only visible `ZoneGroupMember`s are rooms. Bonded players stay out: home theater
 * surrounds and subs are nested `<Satellite>` elements, and the second speaker of a
 * stereo pair is a member flagged `Invisible="1"`. Both play as part of their room.
 */
function parseZoneGroupState(xmlState: string): ZoneGroup[] {
  if (!xmlState) return [];

  try {
    const parsed = parser.parse(xmlState);
    // Newer firmware wraps the document in <ZoneGroupState>; older firmware doesn't.
    const zoneGroups = parsed?.ZoneGroupState?.ZoneGroups ?? parsed?.ZoneGroups;
    const rawGroups = zoneGroups?.ZoneGroup || [];
    const groupList = Array.isArray(rawGroups) ? rawGroups : [rawGroups];

    return groupList.map((g: any) => {
      const rawMembers = g.ZoneGroupMember || [];
      const memberList = (Array.isArray(rawMembers) ? rawMembers : [rawMembers]).filter(
        (m: any) => String(m.Invisible || m.invisible || '0') !== '1'
      );

      const rawCoordinator = memberList.find((m: any) => m.UUID === g.Coordinator) || memberList[0];
      const coordinatorName = rawCoordinator ? String(rawCoordinator.ZoneName || 'Group') : 'Group';

      const members: SonosDevice[] = memberList.map((m: any) => {
        let ip = '';
        if (m.Location) {
          const match = m.Location.match(/http:\/\/([^:]+):/);
          if (match) ip = match[1];
        }
        const otherMembers = memberList.filter((other: any) => other.UUID !== m.UUID);
        const groupedWith = otherMembers.map((other: any) => String(other.ZoneName || 'Sonos Room'));

        // Home theater bonds (surrounds, sub) are listed in HTSatChanMapSet, e.g.
        // "<main>:LF,RF;<sat>:LR;<sat>:RR;<sub>:SW". ChannelMapSet covers stereo pairs.
        const channelMap = `${m.HTSatChanMapSet || ''};${m.ChannelMapSet || ''}`;
        const hasSub = /:SW\b/.test(channelMap);
        const hasSurrounds = /:(LR|RR)\b/.test(channelMap);

        return {
          id: String(m.UUID || ''),
          name: String(m.ZoneName || 'Sonos Room'),
          ip,
          port: SONOS_DEFAULTS.UPNP_PORT,
          isCoordinator: m.UUID === g.Coordinator,
          groupMembersCount: memberList.length,
          groupName: memberList.length > 1 ? `${coordinatorName} + ${memberList.length - 1}` : undefined,
          groupedWith: groupedWith.length > 0 ? groupedWith : undefined,
          hasSub: hasSub || undefined,
          hasSurrounds: hasSurrounds || undefined,
        };
      });

      const coordinator = members.find(m => m.isCoordinator) || members[0];

      return {
        id: String(g.ID || ''),
        coordinatorId: String(g.Coordinator || ''),
        name: coordinator?.name || 'Group',
        members,
      };
    });
  } catch {
    return [];
  }
}

const KNOWN_IPS_KEY = 'SONOS_TV_KNOWN_SPEAKER_IPS';
const KNOWN_PROBE_TIMEOUT_MS = 2000;
const SSDP_TIMEOUT_MS = 2500;
const SCAN_PROBE_TIMEOUT_MS = 1500;
const SCAN_CONCURRENCY = 48;

async function loadKnownIps(): Promise<string[]> {
  try {
    const data = await AsyncStorage.getItem(KNOWN_IPS_KEY);
    const parsed = data ? JSON.parse(data) : [];
    return Array.isArray(parsed) ? parsed.filter((ip) => typeof ip === 'string') : [];
  } catch {
    return [];
  }
}

async function saveKnownIps(ips: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KNOWN_IPS_KEY, JSON.stringify(Array.from(new Set(ips))));
  } catch {
    // Only costs a slower next start.
  }
}

async function probeAll(ips: string[], timeoutMs?: number): Promise<SonosDevice[]> {
  const probes = await Promise.all(ips.map((ip) => SonosDiscoveryService.probeSpeaker(ip, timeoutMs)));
  return probes.filter((p): p is SonosDevice => p !== null);
}

/** Probes `ips` in parallel batches and stops at the first player: its topology lists the rest. */
async function scanForPlayer(ips: string[]): Promise<SonosDevice[]> {
  const found: SonosDevice[] = [];
  let next = 0;
  const worker = async () => {
    while (found.length === 0 && next < ips.length) {
      const player = await SonosDiscoveryService.probeSpeaker(ips[next++], SCAN_PROBE_TIMEOUT_MS);
      if (player) found.push(player);
    }
  };
  await Promise.all(Array.from({ length: SCAN_CONCURRENCY }, worker));
  return found;
}

async function fetchZoneGroups(ip: string): Promise<ZoneGroup[]> {
  const res = await SonosUpnpClient.executeSoap(
    ip,
    UPNP_SERVICES.ZONE_GROUP_TOPOLOGY.CONTROL,
    UPNP_SERVICES.ZONE_GROUP_TOPOLOGY.SERVICE,
    'GetZoneGroupState'
  );
  // The state is an XML document escaped inside the SOAP response.
  const body = parser.parse(res)?.['s:Envelope']?.['s:Body']?.['u:GetZoneGroupStateResponse'];
  return parseZoneGroupState(String(body?.ZoneGroupState || ''));
}

export class SonosDiscoveryService {
  /**
   * Queries UPnP device description from a known IP
   */
  static async probeSpeaker(ip: string, timeoutMs = 3000): Promise<SonosDevice | null> {
    try {
      const url = `http://${ip}:${SONOS_DEFAULTS.UPNP_PORT}/xml/device_description.xml`;
      const response = await axios.get(url, {
        timeout: timeoutMs,
        headers: {
          'User-Agent': SONOS_DEFAULTS.USER_AGENT,
        },
      });

      const parsed = parser.parse(response.data);
      const dev = parsed?.root?.device;
      const modelName = dev.modelName ? String(dev.modelName) : undefined;
      // Only players with a TV input (Arc, Beam, Ray, Amp, …) publish the HTControl
      // service, so the device itself tells us — no model list to keep up to date.
      const hasTvInput = /serviceId:HTControl\b/.test(String(response.data));

      const rawFriendly = dev.friendlyName ? String(dev.friendlyName) : undefined;
      let cleanName = modelName || 'Sonos Speaker';
      if (rawFriendly) {
        let cleaned = rawFriendly
          .replace(/^(\d{1,3}\.){3}\d{1,3}\s*[-–:]\s*/i, '')
          .replace(/\s*[-–:]\s*RINCON_[A-Z0-9]+.*$/i, '')
          .replace(/RINCON_[A-Z0-9]+/i, '')
          .replace(/\s*Media (Server|Renderer)\s*/i, ' ')
          .replace(/^Sonos\s*[-–:]\s*/i, '')
          .trim();
        if (cleaned) {
          cleanName = cleaned;
        }
      }

      return {
        id: String(dev.UDN || '').replace('uuid:', ''),
        name: cleanName,
        ip,
        port: SONOS_DEFAULTS.UPNP_PORT,
        modelName,
        isCoordinator: true,
        hasTvInput,
      };
    } catch {
      return null;
    }
  }

  /**
   * Returns one entry per Sonos group — what users pick in the Sonos app.
   *
   * Any reachable player knows the whole household's topology, so we probe until one
   * answers, read its ZoneGroupState and address each group through its coordinator.
   * Surrounds, subs and stereo-pair partners are never listed on their own.
   */
  static async findAllSpeakers(): Promise<SonosDevice[]> {
    const players = await this.findPlayers();
    if (players.length === 0) return [];
    const devices = await this.groupsFromPlayers(players);
    await saveKnownIps([...devices, ...players].map((d) => d.ip));
    return devices;
  }

  /**
   * Finds at least one reachable player, cheapest way first: the IPs that answered
   * last time, then SSDP, then probing every host on the TV's own subnet for
   * networks where multicast is blocked (some mesh and guest Wi-Fi setups).
   */
  private static async findPlayers(): Promise<SonosDevice[]> {
    const known = await loadKnownIps();
    if (known.length > 0) {
      const players = await probeAll(known, KNOWN_PROBE_TIMEOUT_MS);
      if (players.length > 0) return players;
    }

    const answered = await ssdpSearch(SSDP_TIMEOUT_MS);
    if (answered.length > 0) {
      const players = await probeAll(answered);
      if (players.length > 0) return players;
    }

    for (const network of await getLocalNetworks()) {
      const players = await scanForPlayer(hostsToScan(network));
      if (players.length > 0) return players;
    }
    return [];
  }

  private static async groupsFromPlayers(players: SonosDevice[]): Promise<SonosDevice[]> {
    let groups: ZoneGroup[] = [];
    for (const player of players) {
      try {
        groups = await fetchZoneGroups(player.ip);
        if (groups.length > 0) break;
      } catch {
        // Try the next player.
      }
    }

    // Without topology we can't tell rooms from satellites; show only the first player
    // rather than list surrounds as rooms.
    if (groups.length === 0) return players.slice(0, 1);

    const devices = await Promise.all(
      groups.map(async (group) => {
        const coordinator =
          group.members.find((m) => m.id === group.coordinatorId) || group.members[0];
        if (!coordinator?.ip) return null;
        // Model info lives in the device description, not in the topology.
        const described =
          players.find((p) => p.id === coordinator.id) ||
          (await this.probeSpeaker(coordinator.ip));
        const otherRooms = group.members.filter((m) => m.id !== coordinator.id);
        return {
          ...coordinator,
          modelName: described?.modelName,
          hasTvInput: described?.hasTvInput,
          isCoordinator: true,
          groupMembersCount: group.members.length,
          groupedWith: otherRooms.length > 0 ? otherRooms.map((m) => m.name) : undefined,
        } as SonosDevice;
      })
    );
    return devices.filter((d): d is SonosDevice => d !== null);
  }
}
