import { SonosUpnpClient } from '../upnp/sonosUpnpClient';
import { SmapiContext } from './smapiClient';
import { buildTrackPlaybackTarget, radioKind } from './containerPlaybackUri';
import { MediaMetadata } from './smapiTypes';

const STREAM_START_CHECK_MS = 1500;
const STREAM_START_ATTEMPTS = 6;

/**
 * A station the speaker accepts can still fail to start — a region-locked or
 * offline stream drops back to STOPPED with no SOAP error. Watches the
 * transport for ~9s so the user gets "Couldn't play" instead of silence.
 * A speaker too busy to answer counts as still starting, not as a failure.
 */
async function confirmStreamStarted(speakerIp: string): Promise<void> {
  for (let attempt = 0; attempt < STREAM_START_ATTEMPTS; attempt++) {
    await new Promise<void>((resolve) => setTimeout(() => resolve(), STREAM_START_CHECK_MS));
    const state = await SonosUpnpClient.getTransportInfo(speakerIp)
      .then((info) => info.state)
      .catch(() => 'UNKNOWN');
    if (state === 'PLAYING') return;
    if (state === 'STOPPED') throw new Error('The station stopped before it started playing');
  }
}

/**
 * Starts one service item (a song or a radio station) and returns the
 * URI/DIDL it used, for playback history.
 *
 * - Songs go in after the current track and are jumped to, keeping the
 *   queue (tvonos's "Play Now").
 * - Radio can't live in the queue — the speaker skips such an entry — so a
 *   station replaces the transport source directly, like the Sonos app.
 */
export async function playMediaItem(
  speakerIp: string,
  speakerId: string,
  ctx: SmapiContext,
  item: MediaMetadata,
): Promise<{ uri: string; metadata: string }> {
  const target = buildTrackPlaybackTarget(ctx, item);

  if (radioKind(item, ctx.service.serviceId)) {
    await SonosUpnpClient.setAVTransportURI(speakerIp, target.uri, target.metadata);
    await SonosUpnpClient.play(speakerIp);
    await confirmStreamStarted(speakerIp);
    return target;
  }

  const desired = await SonosUpnpClient.getPositionInfo(speakerIp)
    .then((pos) => pos.track + 1)
    .catch(() => 0);
  const { firstTrackNumberEnqueued } = await SonosUpnpClient.addURIToQueue(
    speakerIp,
    target.uri,
    target.metadata,
    desired,
    true,
  );
  if (firstTrackNumberEnqueued >= 1) {
    await SonosUpnpClient.seekTrack(speakerIp, firstTrackNumberEnqueued, speakerId);
  }
  return target;
}
