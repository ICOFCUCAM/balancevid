import {
  availabilityFrom, whenProblem,
} from '../../../../src/domain/availability.js';
import { isOwner } from '../../../../src/auth/request.js';
import {
  ChannelEditError,
  addBlock, addToBlock, addToRotation, bookLiveEvent, closeIngest, endLive,
  goLive, keepLive, moveInRotation, moveProgramme, openIngest, removeBlock,
  removeFromBlock, removeFromRotation, removeProgramme, requestRecording,
  cite, retitleProgramme, rollIn, scheduleProgramme, setEmergency, setFiller,
  addDestination, removeDestination, setBackup, setDestination, setIdentity,
  setStation,
  skipToNext, takeLive, publishChannel, unpublishChannel, attachRoom,
} from '../../../../src/domain/channelEdit.js';
import {
  gaps, nextAfter, onAirAt, orderedProgrammes, overlaps, referencedAssets,
  blockAt, orderedBlocks, rotationLengthMs, rotationOffsets, whatIsOn,
} from '../../../../src/domain/channel.js';
import {
  assertChannelOwnsNoScheduledMedia, assertScheduleResolves,
} from '../../../../src/domain/invariants.js';
import {
  auditChannel, channelAssetIds, deleteChannel, listChannels, loadChannel,
  mutateChannel,
} from '../../../../src/store/channels.js';
import { channelOwns } from '../../../../src/domain/deletion.js';
import { missingSources, resolves } from '../../../../src/store/playoutSources.js';
import {
  newestSegmentAt, readBeat, readFailure,
} from '../../../../src/store/playoutHealth.js';
import {
  controlRoomNote, engineState, healthSentence, stillFailing, streamState,
  whyDark,
} from '../../../../src/domain/health.js';
import { discardBuffer, keepBuffer } from '../../../../src/store/liveBuffer.js';
import { isSendable } from '../../../../src/domain/rtmp.js';
import { forgetKey, keyNote, putKey } from '../../../../src/store/streamKeys.js';
import { forgetSender, readSenders } from '../../../../src/store/senderHealth.js';
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
/**
 * Each destination's state and address, with no credential in it.
 * [§15, D-21, C-29]
 */
async function sendersFor(channel: { id: string;
  destinations?: { id: string; settingsRef?: string }[] }): Promise<
  Record<string, { state?: string; says?: string; at?: string;
    server?: string; hasKey: boolean }>> {
  const notes = await readSenders(channel.id)
    .catch(() => ({} as Awaited<ReturnType<typeof readSenders>>));
  const out: Record<string, { state?: string; says?: string; at?: string;
    server?: string; hasKey: boolean }> = {};
  for (const destination of channel.destinations ?? []) {
    const key = await keyNote(destination.settingsRef).catch(() => null);
    out[destination.id] = {
      ...(notes[destination.id] ?? {}),
      ...(key ? { server: key.server } : {}),
      hasKey: Boolean(key?.has),
    };
  }
  return out;
}

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
   * IS ANYTHING ACTUALLY GOING OUT?  [§18]
   *
   * A resolving schedule is not a transmitting channel. The playout engine
   * is a separate process (§11, U-23), so the only way this tier can know is
   * to look at what that one left on disk: its heartbeat, and the age of
   * this channel's newest segment. Two facts, two questions, and a control
   * room full of green lamps over a dead encoder is the fault they prevent.
   */
  const [heartbeat, newestSegment] = await Promise.all([
    readBeat(), newestSegmentAt(id),
  ]);
  const engine = engineState(heartbeat ? Date.parse(heartbeat.at) : null, now);
  const stream = streamState(newestSegment, now);
  /* Once, and given to both the page and the sentence below it: two calls
     a microsecond apart could straddle a programme boundary and disagree
     about whether the channel is off air. [§4] */
  const on = whatIsOn(channel, now);
  /*
   * INV-17, both halves, checked on every read rather than on a schedule.
   * Reported rather than thrown: a channel with a broken reference must still
   * be openable, because the page that shows the fault is the page it is
   * fixed on. [D-13]
   */
  /*
   * WHY A HEALTHY CHANNEL IS STILL DARK. [§6, §9]
   *
   * `healthSentence` covers the transmitter and every one of its answers
   * is about a PROCESS. It has no word for the two states where every
   * process is fine and nothing is going out: the operator pressed GO
   * LIVE and not TAKE LIVE, and the channel has nothing to play. Both are
   * correct behaviour, which is exactly why they need saying.
   */
  /* What the encoder last could not render, if it was recent. [C-24] */
  const failure = await readFailure(id);
  const dark = whyDark({
    offAir: on.kind === 'off',
    armed: channel.live?.phase === 'armed',
    hasSchedule: orderedProgrammes(channel).length > 0
      || orderedBlocks(channel).length > 0
      || rotationLengthMs(channel) > 0,
  });

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
    whatIsOn: on,
    onAir: onAirAt(channel, now) ?? null,
    next: nextAfter(channel, now) ?? null,
    rotationOffsets: rotationOffsets(channel),
    rotationLengthMs: rotationLengthMs(channel),
    blocks: orderedBlocks(channel),
    blockNow: blockAt(channel, now)?.block.name ?? null,
    gaps: gaps(channel, now, now + DAY_MS),
    overlaps: overlaps(channel).map(({ a, b }) => [a.id, b.id]),
    /** Distinct references, which is the number D-18 is about. */
    assets: referencedAssets(channel).length,
    missing,
    violations,
    health: {
      engine,
      stream,
      /* One sentence, written in the domain so the control room and the
         viewer cannot describe the same condition two different ways. */
      /*
       * AND NOT WHAT THIS CONTAINER WAS TOLD TO RUN. The `ROLE` this
       * process can read was passed here, and on a split deployment —
       * web containers at `ROLE=web`, the engine its own service, both
       * on the same volume — it made the sentence call a correct
       * configuration a broken one. The heartbeat on the shared volume
       * is the only thing that knows. [health.ts, healthSentence]
       */
      says: healthSentence(engine, stream, 'operator'),
      /*
       * AND THE TWO REASONS A HEALTHY CHANNEL IS STILL DARK. [§6, §9]
       *
       * *"Why is this channel not showing when I am live?"*
       *
       * `healthSentence` covers the transmitter and every one of its
       * answers is about a PROCESS. It has no word for the two states
       * where every process is fine and nothing is going out: the
       * operator pressed GO LIVE and not TAKE LIVE, and the channel has
       * nothing to play. Both are correct behaviour, which is exactly
       * why they need saying — a fault announces itself and a correct
       * state that looks like one does not.
       *
       * Computed here from what this read already knows rather than
       * stored: `on` is the same `whatIsOn` the page is given, and
       * liveness is never a field in a document. [§18, D-13]
       */
      dark,
      /*
       * AND WHICH OF THE TWO THE CONTROL ROOM SHOWS. Both are often
       * true at once and a desk that says both is a desk talking over
       * itself, so the order is decided in the domain where it can be
       * tested rather than in the component. [§6, D-04]
       */
      /* A render failure outranks the rest, because it is the only
         fault here that a green dashboard and a healthy-looking
         control room both hide. [C-24] */
      note: controlRoomNote(engine, stream, dark,
        stillFailing(failure, now) ? failure : null),
      /*
       * AND THE FAILURE ITSELF, because the confidence monitor has to
       * rank it against what it can see. Two instruments on one desk
       * describing one condition two different ways — "the encoder
       * cannot render" and "the picture is black" — is the fault
       * `controlRoomNote` exists to prevent, so the monitor is given
       * the same input and keeps the same order. [§6, C-28]
       */
      ...(stillFailing(failure, now) && failure
        ? { failing: { says: failure.says } } : {}),
      ...(heartbeat ? { beatAt: heartbeat.at, pid: heartbeat.pid } : {}),
      ...(newestSegment
        ? { segmentAt: new Date(newestSegment).toISOString() } : {}),
    },
    /*
     * WHAT EACH DESTINATION IS ACTUALLY DOING, and what it is
     * pointed at.  [§15, D-21, C-29]
     *
     * `enabled` is in the document and is the operator's switch;
     * this is the connector's answer, and D-21 requires both to be
     * shown because *"a destination showing 'on' with nothing
     * arriving is the screen that loses a broadcast"*.
     *
     * AND NO KEY IS IN IT. `keyNote` returns the server address and
     * whether a key exists. There is no route in this product that
     * returns one.
     */
    senders: await sendersFor(channel),
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

  /** What to do with the live buffer once the document has been written. */
  let afterwards:
    | { bufferId: string; keep: false }
    | { bufferId: string; keep: true; assetId: string; recordingId: string }
    | undefined;

  /*
   * THE REST OF THE LINEUP, for the one action that needs to know
   * about the others. Read before the mutation rather than inside
   * it, because `mutateChannel` holds the document and a read of
   * every channel from inside that is a read under a lock.
   */
  const others = body['action'] === 'station'
    ? await listChannels().catch(() => []) : [];

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
        /* ---- the day's shape (§5) ------------------------------------- */
        case 'add-block':
          addBlock(draft, {
            name: body['name'] ?? '',
            fromMinute: Number(body['fromMinute']),
            ...(Array.isArray(body['days']) ? { days: body['days'].map(Number) } : {}),
          }, at);
          break;
        case 'remove-block':
          removeBlock(draft, body['blockId']);
          break;
        case 'add-to-block': {
          if (!await resolves(draft, body['source'])) {
            throw new ChannelEditError('there is no such render');
          }
          addToBlock(draft, body['blockId'], {
            source: body['source'],
            durationMs: Number(body['durationMs']),
            title: body['title'],
            ...(body['loop'] ? { loop: true } : {}),
          }, at);
          break;
        }
        case 'remove-from-block':
          removeFromBlock(draft, body['blockId'], body['entryId']);
          break;
        /* ---- a slot booked for a broadcast nobody has made yet (§6) ---- */
        case 'book-live':
          bookLiveEvent(draft, {
            startsAt: body['startsAt'],
            durationMs: Number(body['durationMs']),
            title: body['title'],
            note: body['note'],
          }, at);
          break;
        /* ---- how the channel looks (§13) ------------------------------ */
        case 'identity':
          setIdentity(draft, body['identity'] ?? {});
          break;
        /* ---- what the world calls it (TV-NETWORK N-1) ----------------- */
        case 'station':
          /*
           * THE REST OF THE LINEUP IS READ HERE, not in the domain.
           * A slug must be unique across the installation, which is
           * a question about the filesystem, and `setStation` is
           * pure by the same rule every other domain module keeps.
           * The route is where I/O lives, so the route fetches.
           */
          setStation(draft, body['station'] ?? {}, others);
          break;
        /* ---- the red button (§5) -------------------------------------- */
        case 'go-live':
          goLive(draft, body['label'] ?? 'Live', at, body['roomId']);
          break;
        case 'take-live':
          takeLive(draft, at);
          break;
        case 'keep-live':
          keepLive(draft, body['keep'] !== false);
          break;
        case 'next':
          skipToNext(draft, at);
          break;
        /* ---- where the programme goes (§15) --------------------------- */
        case 'add-destination':
          addDestination(draft, {
            kind: body['kind'],
            label: body['label'],
            ...(body['shape'] ? { shape: body['shape'] } : {}),
            ...(body['layoutId'] ? { layoutId: body['layoutId'] } : {}),
          }, at);
          break;
        case 'set-destination':
          setDestination(draft, body['destinationId'], {
            ...(body['enabled'] !== undefined ? { enabled: Boolean(body['enabled']) } : {}),
            ...(body['shape'] ? { shape: body['shape'] } : {}),
            ...(body['layoutId'] !== undefined ? { layoutId: body['layoutId'] } : {}),
            ...(body['label'] ? { label: body['label'] } : {}),
          });
          break;
        /*
         * THE KEY NEVER ENTERS THE DOCUMENT.  [§15, D-21]
         *
         * The edit sets a `settingsRef` and nothing else; the
         * credential goes to `streamKeys`, outside the account tree
         * that backups and exports walk. There is deliberately no
         * action that READS one back: the control room is told that
         * a key exists and where it points, and a product that can
         * show you your own stream key can show it to whoever is
         * behind you.
         */
        case 'set-destination-key': {
          const destination = (draft.destinations ?? []).find(
            (one) => one.id === body['destinationId']);
          if (!destination) {
            throw new ChannelEditError('no such destination');
          }
          const server = String(body['server'] ?? '').trim();
          const key = String(body['key'] ?? '').trim();
          if (!server && !key) {
            /* Clearing it. The reference goes with the credential, or
               the document would point at a file that is not there. */
            if (destination.settingsRef) {
              await forgetKey(destination.settingsRef);
              delete destination.settingsRef;
            }
            destination.enabled = false;
            break;
          }
          if (!isSendable(server)) {
            throw new ChannelEditError(
              'that server address is not an RTMP URL \u2014 it should '
              + 'begin rtmp:// or rtmps://');
          }
          if (!key) throw new ChannelEditError('a stream key is needed');
          /* The reference IS the destination's id: one key per
             destination, and nothing to keep in step. */
          await putKey(destination.id, { server, key });
          destination.settingsRef = destination.id;
          break;
        }
        case 'remove-destination': {
          /*
           * THE CREDENTIAL GOES WITH THE DESTINATION. A key whose
           * destination was deleted is a live credential in a file
           * nothing references, and nothing will ever remove it
           * because nothing remembers it is there.
           */
          const going = (draft.destinations ?? []).find(
            (one) => one.id === body['destinationId']);
          removeDestination(draft, body['destinationId']);
          if (going?.settingsRef) await forgetKey(going.settingsRef);
          await forgetSender(draft.id, body['destinationId']);
          break;
        }
        /* ---- the safe playlist (§9) ----------------------------------- */
        case 'backup':
          if (body['source'] && !await resolves(draft, body['source'])) {
            throw new ChannelEditError('there is no such render');
          }
          setBackup(draft, body['source'] ?? null);
          break;
        case 'emergency':
          if (body['source'] && !await resolves(draft, body['source'])) {
            throw new ChannelEditError('there is no such render');
          }
          setEmergency(draft, body['source'] ?? null, at);
          break;
        /* Somebody's name on air while their answer plays, and down
           again when the host moves on. [TIMELINE B14e] */
        case 'cite':
          cite(draft, body['citing'] ?? null, new Date().toISOString());
          break;
        case 'roll-in':
          if (body['source'] && !await resolves(draft, body['source'])) {
            throw new ChannelEditError('there is no such render');
          }
          rollIn(draft, body['source'] ?? null,
            body['fromMs'] === undefined ? undefined : Number(body['fromMs']));
          break;
        case 'end-live': {
          /*
           * The domain decides what happens to the buffer and this layer does
           * it, because the domain does not touch disk. Kept means move the
           * bytes into `assets/` where INV-17 allows them; not kept means
           * delete them, which is the brief's rule. [§8, D-18]
           */
          const outcome = endLive(draft, at,
            body['durationMs'] === undefined ? undefined : Number(body['durationMs']));
          afterwards = outcome;
          break;
        }
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
        /*
         * Which room the guests are in (§6). The channel names it; the Room
         * owns everything that follows. [D-17, D-19]
         */
        case 'attach-room':
          attachRoom(draft, body['roomId']);
          break;
        /* ---- who may watch it (§17) ----------------------------------- */
        /*
         * Publishing moves no bytes. The playout engine was already writing
         * segments; this decides who may fetch them. [D-18]
         */
        case 'publish': {
          /*
           * A window that will not parse is refused here, where the
           * person who typed it is standing. [GO-VIRAL V-1]
           */
          const bad = whenProblem(body as Record<string, unknown>);
          if (bad) throw new ChannelEditError(bad);
          publishChannel(draft, {
            at,
            author: body['author'],
            /* "Audience participation open", which the control room
               could not say until now. [P10] */
            availability: availabilityFrom(body as Record<string, unknown>),
          });
          break;
        }
        case 'unpublish':
          unpublishChannel(draft, at);
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

  /*
   * THE BUFFER, AFTER THE DOCUMENT. In this order deliberately: if the
   * process dies between them, the document says what should have happened
   * and a sweep can finish it. The other way round, the bytes would be gone
   * and the document would still promise a recording.
   */
  if (afterwards) {
    try {
      if (afterwards.keep) await keepBuffer(id, afterwards.bufferId, afterwards.assetId);
      else await discardBuffer(id, afterwards.bufferId);
    } catch (error) {
      await auditChannel(id, {
        action: 'channel.buffer-failed',
        detail: { ...afterwards, error: String(error).slice(0, 200) },
      });
    }
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

/**
 * Throw the channel away.  [Doctrine §19, CHANNEL §1, D-18, INV-17]
 *
 * NOTHING SCHEDULED DIES WITH IT. The schedule was references, so six months
 * of programming removes no video from this machine — which is D-18 paying
 * out one last time, at the end of a channel's life.
 *
 * What does die is the only media a channel ever owns: saved live sessions
 * and recordings somebody asked for. The count goes back in the response so
 * the page can say how many before asking, rather than after.
 */
export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  if (!(await isOwner(request))) return fail(404, 'channel not found');
  let channel;
  try {
    channel = await loadChannel(id);
  } catch {
    return fail(404, 'channel not found');
  }

  /*
   * NOT REFUSED WHILE LIVE, but said. Ending a broadcast by deleting its
   * channel is a strange way to do it and it is still the owner's call; what
   * would be wrong is doing it silently, so the answer names it.
   */
  const wasLive = Boolean(channel.live && channel.live.phase !== 'ended');
  const owned = channelOwns(channel);
  await deleteChannel(id);
  return json({ ok: true, deleted: id, recordingsLost: owned, wasLive });
}
