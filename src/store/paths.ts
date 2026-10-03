/**
 * On-disk layout.
 *
 * It deliberately mirrors the portable archive the doctrine promises (U-25):
 * a conversation directory is already the export. "No lock-in. In a product
 * built on the premise that discourse should be open and accountable, holding
 * users' recorded arguments hostage would contradict the product's thesis."
 *
 *   var/conversations/<id>/
 *     conversation.json      the document -- the canonical artifact (INV-00)
 *     audit.log              append-only history (U-25 §2, D-06)
 *     assets/                originals, mezzanines, stills
 *     assets/chunks/<take>/  streamed recording chunks (U-06)
 *     renders/<planHash>/    render plan, shot cache, outputs
 *
 *   var/performances/<id>/   Studio Two. The same shape, a different document.
 *     performance.json       the canonical artifact (INV-00)
 *     audit.log
 *     assets/                the master track, its analysis copy, the takes
 *     assets/chunks/<take>/  streamed recording chunks (U-06, shared)
 *     renders/<planHash>/
 *
 * This is a filesystem adapter standing in for object storage (D-14). Every
 * path goes through here so swapping in S3 touches one module.
 */

import { join, resolve } from 'node:path';
import { mkdir, readdir, rename } from 'node:fs/promises';
import { OWNER_ACCOUNT_ID } from '../domain/account.js';

export const VAR_ROOT = process.env['BALANCEVID_VAR'] ?? resolve(process.cwd(), 'var');

/**
 * WHAT AN ACCOUNT OWNS LIVES UNDER IT.  [Doctrine D-06, U-24, U-25]
 *
 *   var/accounts/<account>/conversations/…    the work
 *   var/accounts/<account>/performances/…
 *   var/accounts/<account>/channels/…
 *   var/accounts/<account>/library/…
 *   var/queue/…                               the instance
 *   var/models/…
 *   var/playout.json
 *
 * D-06: "Tenant isolation is enforced at the data layer, not in application
 * code alone. One user reaching another's unpublished recordings is the worst
 * incident this product can have." On a filesystem store the data layer IS
 * the path, so isolation means the account is a DIRECTORY somebody else's id
 * cannot name — not a field every query has to remember to filter on. A
 * missed filter leaks; a missed path join cannot reach outside the tree,
 * because `safe()` refuses anything with a separator in it.
 *
 * SYNCHRONOUS, AND THAT IS WHY THE FIRST ACCOUNT HAS A FIXED ID. Every path
 * in this module is a pure function and hundreds of call sites depend on
 * that; resolving "which account" from a request would make all of them
 * async and the change unreviewable. With one account whose id is a
 * constant, the root is a constant too.
 *
 * WHEN THERE ARE MANY, this takes an argument and these functions take one
 * with it. That is a signature change over code, done once, with a compiler
 * listing every site. What it is NOT is a data migration — the bytes are
 * already where they belong, which is the expensive half and the reason it
 * is done now rather than then.
 */
export function owned(account: string = OWNER_ACCOUNT_ID): string {
  return join(VAR_ROOT, 'accounts', safe(account));
}

/** The roots that belong to an account, for the move below. */
const OWNED_ROOTS = ['conversations', 'performances', 'channels', 'library'] as const;

export const paths = {
  conversations: () => join(owned(), 'conversations'),
  conversation: (id: string) => join(paths.conversations(), safe(id)),
  document: (id: string) => join(paths.conversation(id), 'conversation.json'),
  audit: (id: string) => join(paths.conversation(id), 'audit.log'),
  assets: (id: string) => join(paths.conversation(id), 'assets'),
  asset: (id: string, assetId: string, ext: string) =>
    join(paths.assets(id), `${safe(assetId)}.${ext.replace(/[^a-z0-9]/gi, '')}`),
  chunks: (id: string, takeId: string) => join(paths.assets(id), 'chunks', safe(takeId)),
  renders: (id: string) => join(paths.conversation(id), 'renders'),
  render: (id: string, planHash: string) => join(paths.renders(id), safe(planHash)),
  /** Archived evidence: captures, originals and their hashes. [U-33] */
  evidence: (id: string) => join(paths.assets(id), 'evidence'),
  evidenceCapture: (id: string, assetId: string) =>
    join(paths.assets(id), 'evidence', `${safe(assetId)}.png`),
  /** The editing proxy: what the player scrubs. Same frames as the mezzanine. */
  sourceProxy: (id: string, assetId: string) =>
    join(paths.assets(id), `${safe(`${assetId}proxy`)}.webm`),
  /**
   * A take's playback proxy.  [Doctrine U-39]
   *
   * The companion player is a published artefact, and whether a viewer's
   * browser can decode H.264 is a licensing question we do not control. The
   * proxy is offered alongside the mezzanine so the player picks what it can
   * actually play.
   */
  takeProxy: (id: string, assetId: string) =>
    join(paths.assets(id), `${safe(`${assetId}proxy`)}.webm`),
  /** A take's normalised media. Named here so the web tier can serve it
   *  without importing anything that can run ffmpeg. */
  takeMezzanine: (id: string, assetId: string) =>
    join(paths.assets(id), `${safe(`${assetId}mezz`)}.mp4`),
  /**
   * One still of a response, for the conversation timeline.
   *
   * Taken when the take is assembled rather than on demand: ffmpeg already
   * has the file open at that moment, so the frame costs almost nothing —
   * and a timeline that fills in later is a timeline that looks broken first.
   */
  takePoster: (id: string, assetId: string) =>
    join(paths.assets(id), `${safe(`${assetId}poster`)}.jpg`),
  /** Rendered thumbnail candidates. [U-30] */
  thumbnails: (id: string) => join(paths.conversation(id), 'thumbnails'),
  thumbnail: (id: string, candidateId: string) =>
    join(paths.thumbnails(id), `${safe(candidateId)}.png`),
  /**
   * The picture a link to this conversation shows. [U-31]
   *
   * One per conversation, not one per candidate: there is nothing to choose
   * between. It sits beside the thumbnails because it is made at the same
   * moment, by the same job, out of the same decoder.
   */
  shareCard: (id: string) => join(paths.thumbnails(id), 'share-card.png'),
  /**
   * A card per exchange.  [U-30, U-31]
   *
   * Beside the share card and for the same reason — both are typography made
   * by the same job out of the same facts — but a directory rather than a
   * file, because there are as many of these as the author had things to say.
   */
  claimCards: (id: string) => join(paths.thumbnails(id), 'claim-cards'),
  /* ---- Studio Two.  [STUDIO-TWO S-1] --------------------------------- *
   *
   * A parallel tree rather than a flag inside the conversation one, for the
   * same reason the document is a second root: the two are different objects
   * and a directory that is sometimes one and sometimes the other is a
   * directory somebody's cleanup script gets wrong.
   */
  performances: () => join(owned(), 'performances'),
  performance: (id: string) => join(paths.performances(), safe(id)),
  performanceDocument: (id: string) => join(paths.performance(id), 'performance.json'),
  performanceAudit: (id: string) => join(paths.performance(id), 'audit.log'),
  performanceAssets: (id: string) => join(paths.performance(id), 'assets'),
  performanceAsset: (id: string, assetId: string, ext: string) =>
    join(paths.performanceAssets(id), `${safe(assetId)}.${ext.replace(/[^a-z0-9]/gi, '')}`),
  performanceChunks: (id: string, takeId: string) =>
    join(paths.performanceAssets(id), 'chunks', safe(takeId)),
  performanceRenders: (id: string) => join(paths.performance(id), 'renders'),
  /**
   * Past versions of the document, for undo.  [MASTER-EDIT §12 P1]
   *
   * Beside the document and not inside it: a version IS a document, and a
   * directory that sometimes holds one and sometimes holds a list of them
   * is the kind of thing a cleanup script gets wrong — the same reasoning
   * that keeps assets out of here.
   */
  performanceHistory: (id: string) => join(paths.performance(id), 'history'),
  performanceVersion: (id: string, n: number) =>
    join(paths.performanceHistory(id), `v${String(n).padStart(6, '0')}.json`),

  /* ---- Studio Three: the channel.  [CHANNEL §1, D-18, INV-17] ---------- *
   *
   *   var/channels/<id>/
   *     channel.json     the document — the canonical artifact (INV-00)
   *     audit.log
   *     assets/          live ingests and requested recordings, AND NOTHING
   *                      ELSE. A scheduled programme puts nothing here: it
   *                      references a render that already exists in the
   *                      conversation or performance that made it. INV-17 is
   *                      asserted against the contents of this directory.
   *     stream/          the broadcast stream's segments — a rolling window
   *                      of transport, produced ahead of the playhead and
   *                      deleted behind it. Deliberately NOT under assets/:
   *                      a segment you cannot go back and watch is the wire,
   *                      not a copy of the work.
   */
  /**
   * OTHER MEDIA: the third branch of the brief's library diagram.
   *
   *   var/library/<assetId>.<ext>
   *
   * Idents, caption cards, photographs, announcement slides — the things no
   * studio made and every channel may schedule. Outside `channels/` on
   * purpose: an ident belongs to the library, not to whichever channel
   * happened to use it first, and putting it inside one would make the second
   * channel that wanted it copy it. [CHANNEL §3, D-18]
   */
  library: () => join(owned(), 'library'),
  libraryMedia: (assetId: string, ext: string) =>
    join(paths.library(), `${safe(assetId)}.${ext.replace(/[^a-z0-9]/gi, '')}`),
  /**
   * Decks live beside the library and not inside a channel. [CHANNEL §20]
   *
   * A deck is an ORDER over library images, and the images are ordinary
   * library media — so any channel can put the same talk on air, and
   * deleting the channel takes none of it with it. The same reason the
   * library is not inside a conversation.
   */
  decks: () => join(paths.library(), 'decks'),
  deck: (deckId: string) => join(paths.decks(), `${safe(deckId)}.json`),
  /** Where an uploaded document waits for the worker to turn it into pages. */
  deckUpload: (deckId: string, ext: string) =>
    join(paths.decks(), `${safe(deckId)}.src.${ext.replace(/[^a-z0-9]/gi, '')}`),

  /**
   * PARTICIPATION REQUESTS, AND WHY THEY ARE NOT UNDER A STUDIO.
   *   [Doctrine D-25; TAKE-APP T16]
   *
   *   var/accounts/<account>/requests/<id>/
   *     request.json     the record, including what came back
   *     assets/          what a participant sent, until it is accepted
   *
   * A request belongs to the ACCOUNT, not to the performance or the
   * channel that prompted it, because production and participation are
   * separate: a submission that lived inside a performance directory
   * would already be part of that performance, which is the exact thing
   * D-25 says it must not be until somebody accepts it. What a
   * participant sends sits here, beside the request, until a producer
   * chooses it — and only then is it copied into a studio's assets.
   *
   * It also makes the inbox one directory to read rather than a walk of
   * every performance, conversation and channel asking whether anybody
   * sent them anything.
   */
  requests: () => join(owned(), 'requests'),
  request: (id: string) => join(paths.requests(), safe(id)),
  requestDocument: (id: string) => join(paths.request(id), 'request.json'),
  requestAssets: (id: string) => join(paths.request(id), 'assets'),
  requestAsset: (id: string, assetId: string, ext: string) =>
    join(paths.requestAssets(id), `${safe(assetId)}.${ext.replace(/[^a-z0-9]/gi, '')}`),
  /**
   * Chunks a phone uploads while recording, the same shape takes use.
   *
   * TRACK 0 IS WHERE IT ALWAYS WAS, and that is the whole of the
   * compatibility story. [TAKE-DESKTOP B-2]
   *
   * A phone sends one camera, passes no track, and writes
   * `chunks/<sub>/000000.part` exactly as it did before tracks
   * existed — including a recording already in flight when the
   * server was upgraded, which must still join. A capture station's
   * second camera goes in `t1/` BENEATH it, so that reading track 0
   * is still `readdir` filtered on `.part` (a directory is not a
   * part) and deleting the recording is still one `rm -r` of one
   * directory. Nothing above has to learn that tracks exist in order
   * to keep working.
   */
  requestChunks: (id: string, submissionId: string, track = 0) =>
    join(paths.request(id), 'chunks', safe(submissionId),
      ...(track > 0 ? [`t${Math.floor(track)}`] : [])),

  /**
   * The calls this account has opened.  [GO-VIRAL V-2]
   *
   * A FIFTH STORE BESIDE THE FOURTH, for the reason D-25 gives
   * about the fourth: a campaign is not part of a production
   * either, and it is not a request. It contains N of them and
   * outlives all of them, so it cannot live inside one — and a
   * campaign written into a performance would be a call that
   * disappeared when somebody deleted the song it was about.
   *
   * UNDER `owned()`, like everything else an account holds. A
   * campaign on the public competition network is a different
   * installation's record, reached as a connection, which is
   * V-8's whole argument. [GO-VIRAL, separation one]
   */
  campaigns: () => join(owned(), 'campaigns'),
  campaign: (id: string) => join(paths.campaigns(), safe(id)),
  campaignDocument: (id: string) =>
    join(paths.campaign(id), 'campaign.json'),

  channels: () => join(owned(), 'channels'),
  channel: (id: string) => join(paths.channels(), safe(id)),
  /**
   * WHERE CHANNEL NUMBERS LIVE, and why not in the channel.
   * [TV-NETWORK N-6]
   *
   * Beside the channels rather than inside one, because an
   * assignment is the NETWORK's and a channel document is its
   * owner's. A number kept in a file the owner edits is a number
   * the owner can change, and the one rule about channel numbers
   * is that they are allocated.
   */
  lineup: () => join(paths.channels(), 'lineup.json'),
  channelDocument: (id: string) => join(paths.channel(id), 'channel.json'),
  channelAudit: (id: string) => join(paths.channel(id), 'audit.log'),
  /** Live feeds and recordings somebody asked for. Nothing scheduled. */
  channelAssets: (id: string) => join(paths.channel(id), 'assets'),
  channelAsset: (id: string, assetId: string, ext: string) =>
    join(paths.channelAssets(id), `${safe(assetId)}.${ext.replace(/[^a-z0-9]/gi, '')}`),
  /** The wire. Windowed and swept, never archived. */
  channelStream: (id: string) => join(paths.channel(id), 'stream'),
  /**
   * THE LIVE BUFFER, which is not an asset. [CHANNEL §7, §8, D-18]
   *
   *   var/channels/<id>/live/<bufferId>.mp4
   *
   * What the camera is writing while the red light is on. Deliberately
   * outside `assets/`: it is temporary by construction, it is swept when the
   * broadcast ends, and INV-17 does not count it — because it is not an asset
   * until somebody chooses to keep it, at which point it is PROMOTED into
   * `assets/` and becomes an archived recording like any other.
   */
  channelLive: (id: string) => join(paths.channel(id), 'live'),
  /*
   * WebM, because that is what a browser records. MediaRecorder writes a
   * header chunk and then continuation clusters, so appending them in order
   * produces a growing file a decoder can follow — which is what a live
   * buffer has to be. Nothing transcodes it on the way in (U-23); the playout
   * engine re-encodes every piece it puts on the wire anyway.
   */
  channelLiveBuffer: (id: string, bufferId: string) =>
    join(paths.channelLive(id), `${safe(bufferId)}.webm`),
  channelSegment: (id: string, index: number) =>
    join(paths.channelStream(id), `${Math.max(0, Math.floor(index))}.ts`),
  /**
   * THE PLAYLIST A SENDER READS.  [CHANNEL §15, D-21, C-29]
   *
   *   var/senders/<id>/playlist.m3u8
   *
   * NOT IN `stream/`, which holds only `N.ts` and is swept by age: a
   * playlist among the segments is one the sweeper will eventually
   * delete and the playlist route may eventually serve. The same
   * argument `playoutHealth` makes about not living with the
   * material, and the same mistake C-24 made once already.
   *
   * It names its segments by ABSOLUTE PATH, because it is not beside
   * them. The viewer's playlist is the same `livePlaylist` function
   * rendering URLs instead — one generator, two renderings, so the
   * sender and the viewer cannot be watching different windows.
   */
  senderPlaylist: (id: string) =>
    join(VAR_ROOT, 'senders', safe(id), 'playlist.m3u8'),
  /**
   * THE CHANNEL'S GRAPHICS, RASTERISED.  [CHANNEL §13, C-40]
   *
   * Outside the account tree for the same reason the stream is: a
   * transparent PNG of this moment's lower third is derived from the
   * channel document and worth nothing in a backup. Named by what
   * the marks say, so an identity that has not changed is drawn once
   * and used for a thousand segments.
   */
  overlays: () => join(VAR_ROOT, 'overlays'),
  /** Clips and the link preview of a performance. [STUDIO-TWO §14] */
  performanceClips: (id: string) => join(paths.performance(id), 'clips'),
  performanceCard: (id: string) => join(paths.performance(id), 'share-card.png'),
  /** The averaged still of an empty room, for §4's matte. [STUDIO-TWO S-6] */
  performancePlate: (id: string, assetId: string) =>
    join(paths.performanceAssets(id), `${safe(assetId)}.plate.png`),
  /**
   * The master, as raw samples for analysis.
   *
   * A second copy, deliberately. Alignment reads whole minutes of audio and
   * decoding an MP3 to do it every time is work repeated for no reason;
   * mono 16-bit PCM at the house rate is the cheapest thing to read and the
   * only form the measurement wants. [S-3]
   */
  masterAnalysis: (id: string) => join(paths.performanceAssets(id), 'master.f32'),
  /** A take's first frame, for the rail. */
  performanceTakePoster: (id: string, takeId: string) =>
    join(paths.performanceAssets(id), `${safe(takeId)}.poster.jpg`),
  /** The same take as a strip of frames, for its row on the timeline. */
  performanceTakeStrip: (id: string, takeId: string) =>
    join(paths.performanceAssets(id), `${safe(takeId)}.strip.jpg`),
  takeAnalysis: (id: string, assetId: string) =>
    join(paths.performanceAssets(id), `${safe(assetId)}.f32`),
  /**
   * WHO OWNS THE WORK. [U-24, D-06]
   *
   * Beside the documents rather than above them, for now: this step gives
   * the owner an identity, it does not yet move anything underneath it.
   * Scoping the document directories by account is the next step and the
   * one that makes D-06's "tenant isolation enforced at the data layer"
   * true of this store rather than merely intended.
   */
  accounts: () => join(VAR_ROOT, 'accounts'),
  account: (id: string) => join(paths.accounts(), safe(id)),
  accountDocument: (id: string) => join(paths.account(id), 'account.json'),

  queue: () => join(VAR_ROOT, 'queue'),
  queueState: (state: QueueState) => join(VAR_ROOT, 'queue', state),
};

export type QueueState = 'pending' | 'running' | 'done' | 'failed';

/**
 * Ids are generated, but they also arrive from HTTP. Anything that reaches a
 * path join is constrained to the alphabet we actually issue -- path traversal
 * into another tenant's recordings is the worst incident this product can have
 * (D-06).
 */
export function safe(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw new Error(`unsafe identifier: ${JSON.stringify(id)}`);
  }
  return id;
}

/**
 * Move what an existing instance already has underneath its account.
 * [Doctrine U-25 §1, D-06]
 *
 * Every deployment made before accounts existed holds its work at
 * `var/conversations`, `var/performances`, `var/channels` and `var/library`.
 * Nothing about that data changes — only where it sits — so this is a
 * RENAME of four directories and not a rewrite of anything inside them.
 * A rename on one filesystem is atomic and instant whatever the directory
 * weighs, which matters when it holds hours of recorded speech.
 *
 * RUN AT STARTUP RATHER THAN BY HAND. A migration somebody has to remember
 * to run is a migration that gets skipped on the deployment nobody was
 * watching, and the symptom — an instance that has silently forgotten every
 * conversation — is the worst possible one for this product. [U-25]
 *
 * SAFE TO RUN TWICE, AND SAFE TO RUN THREE TIMES AT ONCE. The web tier, the
 * worker and the playout engine all start together and all call this. Each
 * root is moved independently, so a crash halfway leaves the rest to be
 * finished next time; the process that loses the race is told the source is
 * gone, which is not an error but the answer.
 *
 * BOTH PLACES POPULATED IS NOT SOMETHING TO GUESS AT. If a root exists in
 * the old location AND in the new one with anything in it, two sets of work
 * exist and picking one would destroy the other. It is left exactly as it
 * is and said out loud, which is the only honest move.
 */
async function moveOwnedUnderAccount(): Promise<void> {
  for (const root of OWNED_ROOTS) {
    const from = join(VAR_ROOT, root);
    const to = join(owned(), root);
    let held: string[];
    try {
      held = await readdir(from);
    } catch {
      continue; /* Nothing at the old address. Already moved, or never made. */
    }

    let already: string[] = [];
    try { already = await readdir(to); } catch { /* not there: the normal case. */ }
    if (already.length > 0) {
      console.warn(
        `balancevid: ${root} exists at both var/${root} and `
        + `var/accounts/${OWNER_ACCOUNT_ID}/${root}. Leaving both alone — `
        + 'merge them by hand; nothing has been deleted.');
      continue;
    }
    /* An empty directory at the old address is worth removing, not moving. */
    if (held.length === 0) continue;

    try {
      await rename(from, to);
    } catch {
      /*
       * Another process got there, or the two are on different filesystems.
       * The first needs nothing; the second needs a person, and either way
       * the data is still at one of the two addresses.
       */
    }
  }
}

/**
 * Done once per process, however many callers ask.
 *
 * `ensureDirs` is on the queue's hot path — every enqueue calls it — and
 * four directory reads per job to be told four times that there is nothing
 * to move is work with no reader. The answer cannot change while a process
 * is running: once the roots are under the account, nothing puts them back.
 */
let moved: Promise<void> | null = null;

/** For tests, which need a process to believe it has just started. */
export function forgetStorageMigration(): void {
  moved = null;
}

export async function ensureDirs(): Promise<void> {
  await mkdir(owned(), { recursive: true });
  moved ??= moveOwnedUnderAccount();
  await moved;

  await mkdir(paths.conversations(), { recursive: true });
  await mkdir(paths.channels(), { recursive: true });
  await mkdir(paths.accounts(), { recursive: true });
  for (const state of ['pending', 'running', 'done', 'failed'] as const) {
    await mkdir(paths.queueState(state), { recursive: true });
  }
}
