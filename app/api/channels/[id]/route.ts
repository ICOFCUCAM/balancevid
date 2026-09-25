import { isOwner } from '../../../../src/auth/request.js';
import {
  ChannelEditError,
  addToRotation, closeIngest, endLive, goLive, moveInRotation, moveProgramme,
  openIngest, removeFromRotation, removeProgramme, requestRecording,
  retitleProgramme, rollIn, scheduleProgramme, setFiller,
} from '../../../../src/domain/channelEdit.js';
import {
  gaps, nextAfter, onAirAt, orderedProgrammes, overlaps, referencedAssets,
  rotationLengthMs, rotationOffsets, whatIsOn,
} from '../../../../src/domain/channel.js';
import {
  assertChannelOwnsNoScheduledMedia, assertScheduleResolves,
} from '../../../../src/domain/invariants.js';
import {
  auditChannel, channelAssetIds, loadChannel, mutateChannel,
} from '../../../../src/store/channels.js';
import { missingSources, resolves } from '../../../../src/store/playoutSources.js';
import { fail, json } from '../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** A day, which is the window a listing is read over. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The channel, plus what is derived from it.  [Doctrine CHANNEL §2, §7]
 *
 * The derivations are recomputed on every read and never stored, exactly as a
 * performance's timeline is — what is on air, what is next, where the holes
 * are, and which of the schedule's references no longer resolve. That last
 * one is the fault a broadcaster most needs to be told about and least likely
 * to discover: a programme whose render was deleted looks fine in a listing
 * and goes out as black.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  if (!(await isOwner(request))) return fail(404, 'channel not found');
  let channel;
  try {
    channel = await loadChannel(id);
  } catch {
    return fail(404, 'channel not found');
  }

  const now = Date.now();
  const missing = await missingSources(channel, referencedAssets(channel));
  /*
   * INV-17, both halves, checked on every read rather than on a schedule.
   * Reported rather than thrown: a channel with a broken reference must still
   * be openable, because the page that shows the fault is the page it is
   * fixed on. [D-13]
   */
  const violations: string[] = [];
  try {
    assertChannelOwnsNoScheduledMedia(channel, await channelAssetIds(id));
  } catch (error) { violations.push(String((error as Error).message)); }
  try {
    assertScheduleResolves(channel, missing);
  } catch (error) { violations.push(String((error as Error).message)); }

  return json({
    channel,
    listing: orderedProgrammes(channel),
    /* What is ACTUALLY on: live, then a fixed slot, then the loop. [§4, §5] */
    whatIsOn: whatIsOn(channel, now),
    onAir: onAirAt(channel, now) ?? null,
    next: nextAfter(channel, now) ?? null,
    rotationOffsets: rotationOffsets(channel),
    rotationLengthMs: rotationLengthMs(channel),
    gaps: gaps(channel, now, now + DAY_MS),
    overlaps: overlaps(channel).map(({ a, b }) => [a.id, b.id]),
    /** Distinct references, which is the number D-18 is about. */
    assets: referencedAssets(channel).length,
    missing,
    violations,
    serverNow: new Date(now).toISOString(),
  });
}

/**
 * Every change a channel can undergo, through the one door.  [§2–§6]
 *
 * Note what is absent: there is no action that uploads, copies or stages
 * media for a programme, because there is no such operation. Scheduling takes
 * a reference. [D-18, INV-17]
 */
export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  if (!(await isOwner(request))) return fail(404, 'channel not found');
  /*
   * `any`, as the other two studios' PATCH routes use, and for the same
   * reason: this is one endpoint over a union of actions whose bodies differ,
   * and the checking that matters happens in the domain, which is where a
   * wrong shape is refused with a sentence rather than a type error nobody
   * sees. Typing each action here would be fifteen files that differ by four
   * lines. [D-07]
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = await request.json().catch(() => ({})) as Record<string, any>;
  const at = new Date().toISOString();

  let channel;
  try {
    channel = await mutateChannel(id, async (draft) => {
      switch (body['action'] as string) {
        case 'schedule': {
          /*
           * THE ONE PLACE A REFERENCE IS CHECKED AGAINST DISK. The domain
           * cannot do it — it does not read files — and the playout engine is
           * too late, because by then it is nine o'clock. A programme that
           * names a render nobody has made is refused here, where somebody is
           * looking at the screen. [§3]
           */
          if (!await resolves(draft, body['source'])) {
            throw new ChannelEditError(
              'there is no such render — schedule something that has been made');
          }
          scheduleProgramme(draft, {
            startsAt: body['startsAt'],
            durationMs: Number(body['durationMs']),
            source: body['source'],
            title: body['title'],
            ...(body['fromMs'] !== undefined ? { fromMs: Number(body['fromMs']) } : {}),
            ...(body['toMs'] !== undefined ? { toMs: Number(body['toMs']) } : {}),
            ...(body['loop'] ? { loop: true } : {}),
          }, at);
          break;
        }
        case 'move':
          moveProgramme(draft, body['programmeId'], {
            ...(body['startsAt'] ? { startsAt: body['startsAt'] } : {}),
            ...(body['durationMs'] !== undefined
              ? { durationMs: Number(body['durationMs']) } : {}),
          });
          break;
        case 'retitle':
          retitleProgramme(draft, body['programmeId'], body['title'] ?? null);
          break;
        case 'unschedule':
          removeProgramme(draft, body['programmeId']);
          break;
        /* ---- the continuous loop (§4) --------------------------------- */
        case 'rotate': {
          if (!await resolves(draft, body['source'])) {
            throw new ChannelEditError(
              'there is no such render — put something in the loop that has been made');
          }
          addToRotation(draft, {
            source: body['source'],
            durationMs: Number(body['durationMs']),
            title: body['title'],
            ...(body['fromMs'] !== undefined ? { fromMs: Number(body['fromMs']) } : {}),
            ...(body['toMs'] !== undefined ? { toMs: Number(body['toMs']) } : {}),
            ...(body['loop'] ? { loop: true } : {}),
          }, at, body['position'] === undefined ? undefined : Number(body['position']));
          break;
        }
        case 'move-in-rotation':
          moveInRotation(draft, body['entryId'], Number(body['position']));
          break;
        case 'unrotate':
          removeFromRotation(draft, body['entryId']);
          break;
        /* ---- the red button (§5) -------------------------------------- */
        case 'go-live':
          goLive(draft, body['label'] ?? 'Live', at, body['roomId']);
          break;
        case 'roll-in':
          if (body['source'] && !await resolves(draft, body['source'])) {
            throw new ChannelEditError('there is no such render');
          }
          rollIn(draft, body['source'] ?? null,
            body['fromMs'] === undefined ? undefined : Number(body['fromMs']));
          break;
        case 'end-live':
          endLive(draft, at,
            body['durationMs'] === undefined ? undefined : Number(body['durationMs']));
          break;
        case 'filler':
          if (body['source'] && !await resolves(draft, body['source'])) {
            throw new ChannelEditError('there is no such render');
          }
          setFiller(draft, body['source'] ?? null);
          break;
        /* ---- the two that make media (§5, §6) ------------------------- */
        case 'open-ingest':
          openIngest(draft, body['label'] ?? '', at);
          break;
        case 'close-ingest':
          closeIngest(draft, body['ingestId'], at,
            body['durationMs'] === undefined ? undefined : Number(body['durationMs']));
          break;
        case 'record':
          requestRecording(draft, {
            label: body['label'] ?? '',
            fromAt: body['fromAt'],
            toAt: body['toAt'],
            requestedBy: body['requestedBy'] ?? '',
          }, at);
          break;
        default:
          throw new ChannelEditError(`unknown action: ${body['action']}`);
      }
    });
  } catch (error) {
    if (error instanceof ChannelEditError) return fail(409, error.message);
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return fail(404, 'channel not found');
    }
    throw error;
  }

  await auditChannel(id, { action: `channel.${body['action']}`, detail: body });
  return json({
    channel,
    listing: orderedProgrammes(channel),
    whatIsOn: whatIsOn(channel, Date.now()),
    onAir: onAirAt(channel, Date.now()) ?? null,
    rotationOffsets: rotationOffsets(channel),
    assets: referencedAssets(channel).length,
  });
}
