import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { SONOS_DEFAULTS, UPNP_SERVICES } from '../../../constants';
import { SonosDevice, ZoneGroup } from '../../../types/sonos';
import { SonosUpnpClient } from '../upnp/sonosUpnpClient';

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

const CANDIDATE_IPS = Array.from(
  new Set(['192.168.1.101', ...[100, 101, 102, 103, 104, 105, 106, 107, 108, 110, 150].map(
    (i) => `192.168.1.${i}`
  )])
);

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
  static async probeSpeaker(ip: string): Promise<SonosDevice | null> {
    try {
      const url = `http://${ip}:${SONOS_DEFAULTS.UPNP_PORT}/xml/device_description.xml`;
      const response = await axios.get(url, {
        timeout: 3000,
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
    const probes = await Promise.all(CANDIDATE_IPS.map((ip) => this.probeSpeaker(ip)));
    const players = probes.filter((p): p is SonosDevice => p !== null);
    if (players.length === 0) return [];

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
