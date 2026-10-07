import { NativeModules } from 'react-native';

export interface LocalNetwork {
  address: string;
  prefixLength: number;
}

interface SonosDiscoveryNative {
  search(timeoutMs: number): Promise<string[]>;
  getNetworks(): Promise<LocalNetwork[]>;
}

/** Android-only; on other platforms discovery falls back to remembered speakers. */
const native: SonosDiscoveryNative | undefined = NativeModules.SonosDiscovery;

/** SSDP M-SEARCH for ZonePlayers; resolves with the IPs that answered. */
export async function ssdpSearch(timeoutMs: number): Promise<string[]> {
  if (!native) return [];
  try {
    return await native.search(timeoutMs);
  } catch {
    return [];
  }
}

export async function getLocalNetworks(): Promise<LocalNetwork[]> {
  if (!native) return [];
  try {
    return await native.getNetworks();
  } catch {
    return [];
  }
}

/* eslint-disable no-bitwise -- IPv4 address math */
function toInt(ip: string): number | null {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function toIp(n: number): string {
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

/**
 * Host addresses worth probing on the device's own network.
 *
 * Networks wider than /24 (e.g. a /16 on some routers) are capped to the /24
 * around the device: Sonos players almost always share it, and probing 65k
 * hosts over HTTP is not practical.
 */
export function hostsToScan({ address, prefixLength }: LocalNetwork): string[] {
  const self = toInt(address);
  if (self === null || prefixLength < 1 || prefixLength > 30) return [];

  const prefix = Math.max(prefixLength, 24);
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  const network = (self & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;

  const hosts: string[] = [];
  for (let n = network + 1; n < broadcast; n++) {
    if (n !== self) hosts.push(toIp(n));
  }
  return hosts;
}
/* eslint-enable no-bitwise */
