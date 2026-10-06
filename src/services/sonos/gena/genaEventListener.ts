import TcpSocket from 'react-native-tcp-socket';
import { Buffer } from 'buffer';
import { SONOS_DEFAULTS } from '../../../constants';
import { log } from '../../../utils/logger';

const TAG = 'GenaEventListener';

/** Renew this many seconds before the subscription actually expires. */
const RENEW_MARGIN_SEC = 60;
const SUBSCRIBE_TIMEOUT_SEC = 3600;
const SOCKET_CONNECT_TIMEOUT_MS = 5000;

export type GenaNotifyHandler = (body: string, headers: Record<string, string>) => void;

/**
 * GENA (Generic Event Notification Architecture) subscriber for a single
 * Sonos UPnP event path (e.g. `/ZoneGroupTopology/Event`).
 *
 * Ported from `references/tvonos/decompiled/sources/defpackage/rl1.java`:
 * tvonos opens a raw listening TCP socket, `SUBSCRIBE`s to the speaker with
 * a `CALLBACK` header pointing back at that socket, and hand-writes the
 * `200 OK` response to every `NOTIFY` it receives. There is no HTTP
 * server framework available in this RN app, so this class talks raw
 * HTTP/1.1 over `react-native-tcp-socket`, matching tvonos exactly.
 *
 * One instance == one subscription. Callers own the lifecycle: call
 * `subscribe()`, register `onNotify`, and call `unsubscribe()` on teardown.
 */
export class GenaEventListener {
  private readonly speakerIp: string;
  private readonly eventPath: string;
  private server: ReturnType<typeof TcpSocket.createServer> | null = null;
  private sid: string | null = null;
  private renewTimer: ReturnType<typeof setTimeout> | null = null;
  private notifyHandlers: Set<GenaNotifyHandler> = new Set();
  private disposed = false;

  constructor(speakerIp: string, eventPath: string) {
    this.speakerIp = speakerIp;
    this.eventPath = eventPath;
  }

  onNotify(handler: GenaNotifyHandler): () => void {
    this.notifyHandlers.add(handler);
    return () => this.notifyHandlers.delete(handler);
  }

  /**
   * Starts the local callback server, resolves our LAN-reachable address by
   * opening a throwaway connection to the speaker, then sends `SUBSCRIBE`.
   * Resolves once the speaker confirms with a `SID`. `NOTIFY`s (including
   * the first one, sent immediately per the UPnP GENA spec) arrive
   * asynchronously via `onNotify`.
   */
  async subscribe(): Promise<void> {
    if (this.sid) {
      log.warn(TAG, 'subscribe() called while already subscribed; ignoring');
      return;
    }

    const localAddress = await this.resolveLocalAddress();
    const { port } = await this.startCallbackServer(localAddress);
    const callbackUrl = `http://${localAddress}:${port}`;

    const response = await this.sendRawRequest(
      `SUBSCRIBE ${this.eventPath} HTTP/1.1\r\n` +
        `HOST: ${this.speakerIp}:${SONOS_DEFAULTS.UPNP_PORT}\r\n` +
        `USER-AGENT: ${SONOS_DEFAULTS.USER_AGENT}\r\n` +
        `CALLBACK: <${callbackUrl}>\r\n` +
        `NT: upnp:event\r\n` +
        `TIMEOUT: Second-${SUBSCRIBE_TIMEOUT_SEC}\r\n\r\n`,
    );

    const sid = extractHeader(response, 'SID');
    if (!sid) {
      throw new Error(`GENA subscribe failed, no SID in response: ${response.split('\r\n')[0]}`);
    }

    this.sid = sid;
    log.debug(TAG, `Subscribed to ${this.eventPath} (SID ${sid}, callback ${callbackUrl})`);

    const timeoutSec = parseTimeoutHeader(response) ?? SUBSCRIBE_TIMEOUT_SEC;
    this.scheduleRenew(timeoutSec);
  }

  async unsubscribe(): Promise<void> {
    this.disposed = true;
    if (this.renewTimer) {
      clearTimeout(this.renewTimer);
      this.renewTimer = null;
    }

    if (this.sid) {
      try {
        await this.sendRawRequest(
          `UNSUBSCRIBE ${this.eventPath} HTTP/1.1\r\n` +
            `HOST: ${this.speakerIp}:${SONOS_DEFAULTS.UPNP_PORT}\r\n` +
            `SID: ${this.sid}\r\n\r\n`,
        );
      } catch (error) {
        log.warn(TAG, 'UNSUBSCRIBE failed (non-fatal, tearing down anyway)', error as any);
      }
      this.sid = null;
    }

    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.notifyHandlers.clear();
  }

  private scheduleRenew(timeoutSec: number): void {
    const delayMs = Math.max(timeoutSec - RENEW_MARGIN_SEC, 30) * 1000;
    this.renewTimer = setTimeout(() => {
      this.renew().catch((error) => log.error(TAG, 'Renewal failed', error));
    }, delayMs);
  }

  private async renew(): Promise<void> {
    if (this.disposed || !this.sid) return;

    log.debug(TAG, `Renewing subscription (SID ${this.sid})`);
    const response = await this.sendRawRequest(
      `SUBSCRIBE ${this.eventPath} HTTP/1.1\r\n` +
        `HOST: ${this.speakerIp}:${SONOS_DEFAULTS.UPNP_PORT}\r\n` +
        `USER-AGENT: ${SONOS_DEFAULTS.USER_AGENT}\r\n` +
        `SID: ${this.sid}\r\n` +
        `TIMEOUT: Second-${SUBSCRIBE_TIMEOUT_SEC}\r\n\r\n`,
    );

    if (!response.startsWith('HTTP/1.1 200')) {
      log.error(TAG, `Renewal rejected: ${response.split('\r\n')[0]}`);
      this.sid = null;
      return;
    }

    const timeoutSec = parseTimeoutHeader(response) ?? SUBSCRIBE_TIMEOUT_SEC;
    this.scheduleRenew(timeoutSec);
  }

  /** Opens a throwaway connection to the speaker to learn our own LAN-facing address. */
  private resolveLocalAddress(): Promise<string> {
    return new Promise((resolve, reject) => {
      const probe = TcpSocket.createConnection(
        { port: SONOS_DEFAULTS.UPNP_PORT, host: this.speakerIp },
        () => {
          const info = probe.address() as { address?: string } | null;
          probe.destroy();
          if (info && 'address' in info && info.address) {
            resolve(info.address);
          } else {
            reject(new Error('Could not resolve local LAN address'));
          }
        },
      );
      probe.setTimeout(SOCKET_CONNECT_TIMEOUT_MS, () => {
        probe.destroy();
        reject(new Error('Timed out resolving local LAN address'));
      });
      probe.on('error', (error) => reject(error));
    });
  }

  /** Starts the callback server that will receive `NOTIFY` requests. */
  private startCallbackServer(localAddress: string): Promise<{ port: number }> {
    return new Promise((resolve, reject) => {
      const server = TcpSocket.createServer((socket) => {
        let buffered = Buffer.alloc(0);
        let handled = false;
        log.debug(TAG, `NOTIFY connection on ${this.eventPath}`);

        socket.on('data', (chunk) => {
          const chunkBuffer = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
          buffered = Buffer.concat([buffered, chunkBuffer]);

          const headerEnd = buffered.indexOf('\r\n\r\n');
          if (headerEnd === -1) return; // headers not fully received yet

          const headerText = Buffer.from(buffered.subarray(0, headerEnd)).toString('utf8');
          const contentLength = parseInt(extractHeader(headerText, 'CONTENT-LENGTH') ?? '0', 10) || 0;
          const bodyStart = headerEnd + 4;
          const bodyReceived = buffered.length - bodyStart;

          if (handled || bodyReceived < contentLength) return; // body still arriving
          handled = true;

          const body = Buffer.from(buffered.subarray(bodyStart, bodyStart + contentLength)).toString('utf8');
          this.handleNotify(headerText, body);

          try {
            socket.write(
              'HTTP/1.1 200 OK\r\n' +
                `Server: ${SONOS_DEFAULTS.USER_AGENT}\r\n` +
                'Connection: close\r\n\r\n',
            );
          } finally {
            socket.end();
          }
        });

        socket.on('error', (error) => log.warn(TAG, 'NOTIFY socket error', error as any));
        socket.on('close', () => {
          if (!handled) {
            log.warn(TAG, `NOTIFY connection closed before a complete request arrived (${buffered.length} bytes)`);
          }
        });
      });

      server.on('error', (error) => reject(error));
      server.listen({ port: 0, host: localAddress }, () => {
        const info = server.address();
        this.server = server;
        if (info && 'port' in info) {
          resolve({ port: info.port });
        } else {
          reject(new Error('Callback server has no bound port'));
        }
      });
    });
  }

  private handleNotify(headerText: string, body: string): void {
    const sid = extractHeader(headerText, 'SID');
    if (this.sid && sid && sid !== this.sid) {
      log.warn(TAG, `NOTIFY SID mismatch (expected ${this.sid}, got ${sid}); ignoring`);
      return;
    }

    const transferEncoding = extractHeader(headerText, 'TRANSFER-ENCODING');
    if (transferEncoding?.toLowerCase().includes('chunked')) {
      // tvonos does not implement chunked decoding either (rl1.java logs
      // "implement chunk decoding" and drops the event). Sonos speakers do
      // not chunk GENA NOTIFY bodies in practice, so this is a safety net.
      log.warn(TAG, 'Received chunked NOTIFY body; unsupported, dropping');
      return;
    }

    const headers = parseHeaders(headerText);
    this.notifyHandlers.forEach((handler) => {
      try {
        handler(body, headers);
      } catch (error) {
        log.error(TAG, 'onNotify handler threw', error);
      }
    });
  }

  /** Opens a fresh connection, writes a raw HTTP request, and returns the full raw response. */
  private sendRawRequest(request: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = TcpSocket.createConnection(
        { port: SONOS_DEFAULTS.UPNP_PORT, host: this.speakerIp },
        () => socket.write(request),
      );

      let response = '';
      socket.on('data', (chunk) => {
        response += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      });
      socket.on('error', (error) => reject(error));
      socket.on('close', () => resolve(response));
      socket.setTimeout(SOCKET_CONNECT_TIMEOUT_MS, () => {
        socket.destroy();
        reject(new Error(`Request timed out: ${request.split('\r\n')[0]}`));
      });
    });
  }
}

function extractHeader(rawHeaders: string, name: string): string | null {
  const re = new RegExp(`^${name}\\s*:\\s*(.*)$`, 'im');
  const match = re.exec(rawHeaders);
  return match ? match[1].trim() : null;
}

function parseHeaders(rawHeaders: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of rawHeaders.split('\r\n').slice(1)) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    headers[line.slice(0, colonIndex).trim().toUpperCase()] = line.slice(colonIndex + 1).trim();
  }
  return headers;
}

function parseTimeoutHeader(response: string): number | null {
  const raw = extractHeader(response, 'TIMEOUT');
  if (!raw) return null;
  const match = /Second-(\d+)/i.exec(raw);
  return match ? parseInt(match[1], 10) : null;
}
