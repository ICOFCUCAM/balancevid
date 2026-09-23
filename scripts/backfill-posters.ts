/**
 * Give existing responses their timeline stills.
 *
 *   npx tsx scripts/backfill-posters.ts            # every conversation
 *   npx tsx scripts/backfill-posters.ts conv_abc   # just one
 *
 * Posters are taken when a take is assembled, so responses recorded before
 * that existed have none and show their duration instead. This fills them in.
 * Safe to re-run: a take that already has one is skipped.
 *
 * Worker-side, because it runs ffmpeg (U-23).
 */
import { access } from 'node:fs/promises';
import { listConversations, loadConversation } from '../src/store/repository.js';
import { paths } from '../src/store/paths.js';
import { takeMezzaninePath } from '../src/store/takes.js';
import { renderTakePoster } from '../src/render/thumbnails.js';
import { HOUSE_FPS } from '../src/domain/time.js';

const only = process.argv[2];
const conversations = only ? [only] : (await listConversations()).map((c) => c.id);

let made = 0;
let skipped = 0;
let failed = 0;

for (const id of conversations) {
  const conversation = await loadConversation(id).catch(() => null);
  if (!conversation) continue;

  for (const intervention of conversation.interventions) {
    for (const take of intervention.takes) {
      if (take.durationFrames === 0) { skipped += 1; continue; }
      const poster = paths.takePoster(id, take.assetId);
      if (await access(poster).then(() => true).catch(() => false)) { skipped += 1; continue; }

      try {
        await renderTakePoster(
          takeMezzaninePath(id, take.assetId), poster, take.mediaInFrame + HOUSE_FPS,
        );
        made += 1;
        process.stdout.write('.');
      } catch {
        // A take whose media has gone is not an error worth stopping for:
        // the timeline falls back to its duration, as it did before.
        failed += 1;
        process.stdout.write('x');
      }
    }
  }
}

console.log(`\n${made} made, ${skipped} already had one or had no media, ${failed} could not be read`);
