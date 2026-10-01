import { isOwner } from '../../../../../src/auth/request.js';
import { moveSlide, withoutSlide } from '../../../../../src/domain/deck.js';
import { BACKGROUNDS } from '../../../../../src/domain/graphic.js';
import { bookingsFor, refusalFor } from '../../../../../src/domain/deletion.js';
import { listChannels } from '../../../../../src/store/channels.js';
import { loadDeck, saveDeck } from '../../../../../src/store/decks.js';
import { paths } from '../../../../../src/store/paths.js';
import { enqueue } from '../../../../../src/store/queue.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ deckId: string }> };

/**
 * Slides written rather than uploaded.  [Doctrine CHANNEL §21, U-23]
 *
 * What comes out is a library PNG appended to the deck — the same thing a
 * page of somebody's PowerPoint becomes — so nothing downstream learns a
 * new kind of media. The drawing happens in the worker, because it opens a
 * browser and the web tier does not.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { deckId } = await params;
  if (!(await isOwner(request))) return fail(404, 'not found');

  let deck;
  try {
    deck = await loadDeck(deckId);
  } catch {
    return fail(404, 'deck not found');
  }

  const body = await request.json().catch(() => ({})) as {
    layout?: string; heading?: string; text?: string; footnote?: string;
    pictureAssetId?: string; at?: number; fill?: boolean;
    background?: string; focus?: string; accent?: string; channel?: string;
    replaces?: string;
  };

  const layout = body.layout ?? 'text';
  if (!['title', 'text', 'picture', 'quote'].includes(layout)) {
    return fail(400, `unknown slide layout: ${layout}`);
  }
  /*
   * A BACKGROUND AND A FOCUS ARE CLOSED SETS, checked here rather than
   * trusted, because they reach a renderer that puts them in a
   * stylesheet. `colourOr` makes the same check of the colours inside
   * the renderer; this one is the door. [D-06]
   */
  const background = body.background ?? 'black';
  if (!BACKGROUNDS.some((one) => one.id === background)) {
    return fail(400, `unknown slide background: ${background}`);
  }
  const focus = body.focus ?? 'centre';
  if (!['top', 'centre', 'bottom'].includes(focus)) {
    return fail(400, `unknown picture focus: ${focus}`);
  }
  /* Editing one is drawing a new one in its place, and the swap
     happens in the worker when the drawing succeeded — so a render
     that fails leaves the slide that was already on air alone. */
  if (body.replaces
    && !deck.slides.some((one) => one.assetId === body.replaces)) {
    return fail(404, 'that slide is not in this deck');
  }
  if (!body.heading?.trim() && !body.text?.trim() && !body.pictureAssetId) {
    return fail(400, 'a slide needs a heading, some words or a picture');
  }

  /*
   * A picture is a LIBRARY ASSET, not an upload to this route. Pictures
   * arrive the way every other piece of other media arrives, and a slide
   * names one — which is the same reference a caption card is, and means a
   * photograph can be on two slides without a second copy. [§3, D-18]
   */
  let picturePath: string | undefined;
  if (body.pictureAssetId) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(body.pictureAssetId)) {
      return fail(400, 'that is not a library asset');
    }
    const { access } = await import('node:fs/promises');
    for (const ext of ['png', 'jpg']) {
      const candidate = paths.libraryMedia(body.pictureAssetId, ext);
      if (await access(candidate).then(() => true).catch(() => false)) {
        picturePath = candidate;
        break;
      }
    }
    if (!picturePath) return fail(404, 'that picture is not in the library');
  }

  const job = await enqueue({
    kind: 'compose_slide',
    conversationId: deck.id,
    payload: {
      spec: {
        layout,
        ...(body.heading?.trim() ? { heading: body.heading.trim() } : {}),
        ...(body.text?.trim() ? { body: body.text.trim() } : {}),
        ...(body.footnote?.trim() ? { footnote: body.footnote.trim() } : {}),
        ...(body.pictureAssetId ? { picture: body.pictureAssetId } : {}),
        /* Fill the frame rather than fit inside it. Only meaningful
           with a picture, and harmless without one. [C-25] */
        ...(body.fill ? { fill: true } : {}),
        ...(focus === 'centre' ? {} : { focus }),
        ...(background === 'black' ? {} : { background }),
        ...(body.accent ? { accent: body.accent } : {}),
        ...(body.channel?.trim() ? { channel: body.channel.trim() } : {}),
      },
      /* Resolved here because this tier knows the library's layout,
         and sent beside the spec rather than inside it: the spec is
         stored and a path is this machine's. */
      ...(picturePath ? { picturePath } : {}),
      ...(body.at === undefined ? {} : { at: body.at }),
      ...(body.replaces ? { replaces: body.replaces } : {}),
    },
  });
  return json({ job }, { status: 202 });
}

/**
 * Reorder or remove a slide.  [§20, §21]
 *
 * The order IS the deck, so moving one is the edit that matters most after
 * the slides exist.
 */
export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const { deckId } = await params;
  if (!(await isOwner(request))) return fail(404, 'not found');

  const body = await request.json().catch(() => ({})) as {
    action?: string; assetId?: string; to?: number;
  };
  if (!body.assetId) return fail(400, 'which slide?');

  let deck;
  try {
    deck = await loadDeck(deckId);
  } catch {
    return fail(404, 'deck not found');
  }

  if (body.action === 'move') {
    await saveDeck(moveSlide(deck, body.assetId, Number(body.to ?? 0)));
    return json({ deck: await loadDeck(deckId) });
  }

  if (body.action === 'remove') {
    /*
     * A slide may be somebody's safe playlist. Asked before it goes, like
     * every other deletion in this product. [D-23]
     */
    const channels = await listChannels().catch(() => []);
    const refusal = refusalFor(bookingsFor(channels, 'media', body.assetId));
    if (refusal) return fail(409, refusal);

    await saveDeck(withoutSlide(deck, body.assetId));
    const { rm } = await import('node:fs/promises');
    await rm(paths.libraryMedia(body.assetId, 'png'), { force: true });
    await rm(`${paths.library()}/${body.assetId}.json`, { force: true });
    return json({ deck: await loadDeck(deckId) });
  }

  return fail(400, `unknown action: ${body.action}`);
}
