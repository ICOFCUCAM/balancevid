import {
  availabilityState, isListed, maySubmit,
} from '../../../src/domain/availability.js';
import { isRespondable } from '../../../src/domain/document.js';
import { listConversations } from '../../../src/store/repository.js';
import { listPerformances } from '../../../src/store/performances.js';
import { listChannels } from '../../../src/store/channels.js';
import { theAccount } from '../../../src/store/accounts.js';
import { originOf } from '../../../src/web/share.js';
import { json } from '../../../src/web/http.js';

export const dynamic = 'force-dynamic';

/**
 * What this installation is offering to take part in.
 *   [TAKE-PLATFORM U5, P2, P3, P4, P24, PART FIVE; U-31, D-03]
 *
 * ONE QUERY, NOT THREE SECTIONS. Music, Video and Online TV are not three
 * subsystems — they are this list filtered by what kind of thing each row
 * is, which the model already says. Building them as three would be the
 * mistake the timeline brief named: *"Don't create separate systems for
 * these features."* The Take App groups by `kind`; it does not ask three
 * times. [D-19]
 *
 * PER INSTALLATION, AND THERE IS NO INDEX ABOVE IT. This answers for the
 * installation that serves it and nothing else. A central directory of
 * every BalanceVid would be the universal library the brief rejects in
 * §12, wearing a different hat — so a person's home screen is the union
 * of the instances they have added, assembled on their device. [P16, P24]
 *
 * PUBLIC, AND THAT IS THE WHOLE OF ITS DANGER, so the rule is narrow:
 * a row appears only when its document is PUBLISHED, not withdrawn, and
 * its author chose to have it LISTED. Three conditions, all of them the
 * author's own decision, none of them a default that leaks a draft. The
 * existence of a draft is private. [D-03]
 *
 * AND LISTED IS NOT THE SAME AS OPEN. A row says what it will accept —
 * `respondable`, and from whom — and a person holding nothing but this
 * URL is told `anyone` or told to bring an invitation. Discovery and
 * authorization are separate questions and this route answers only the
 * first. [PART FIVE]
 */
export async function GET(request: Request): Promise<Response> {
  const rows: {
    kind: 'music' | 'video' | 'programme';
    id: string;
    title: string;
    author?: string;
    publishedAt?: string;
    /** Whether a take may be sent at all, and by whom. */
    respondable: boolean;
    access: string | null;
    state: string;
    /** Where to watch it before deciding. Same-origin, always. */
    watch: string;
    /**
     * Whether somebody arriving with nothing but this listing may take
     * part, which is the only question the browsing surface can answer
     * for itself. Anything narrower needs a link or an invitation, and
     * the row says so rather than offering a button that will refuse.
     */
    openToAnyone: boolean;
  }[] = [];

  /*
   * A SONG SOMEBODY MAY SING ON. `Performance.publication` is the same
   * `Publication` a conversation carries, so the same three fields mean
   * the same thing and are read by the same module.
   */
  for (const performance of await listPerformances()) {
    const publication = performance.publication;
    if (!publication || publication.unpublishedAt) continue;
    if (!isListed(publication)) continue;
    rows.push({
      kind: 'music',
      id: performance.id,
      title: performance.title,
      ...(publication.author ? { author: publication.author } : {}),
      publishedAt: publication.publishedAt,
      respondable: publication.respondable === true,
      access: publication.respondable === true ? publication.access ?? 'anyone' : null,
      state: availabilityState(publication),
      watch: `/p/${performance.id}/watch`,
      openToAnyone: maySubmit(publication, 'anyone'),
    });
  }

  /*
   * A VIDEO SOMEBODY MAY ANSWER. `isRespondable` is the predicate that
   * already existed for exactly this and is used unchanged: a second
   * reading of "may this be responded to" is a second answer. [D-19]
   */
  for (const conversation of await listConversations()) {
    const publication = conversation.publication;
    if (!publication || publication.unpublishedAt) continue;
    if (!isListed(publication)) continue;
    rows.push({
      kind: 'video',
      id: conversation.id,
      title: conversation.title,
      ...(publication.author ? { author: publication.author } : {}),
      publishedAt: publication.publishedAt,
      respondable: isRespondable(conversation),
      access: isRespondable(conversation) ? publication.access ?? 'anyone' : null,
      state: availabilityState(publication),
      watch: `/c/${conversation.id}/watch`,
      openToAnyone: maySubmit(publication, 'anyone'),
    });
  }

  /*
   * A PROGRAMME SOMEBODY MAY SEND SOMETHING IN TO. A channel's
   * publication is its own type because it publishes a SCHEDULE rather
   * than a render — and it carries the same three fields under the same
   * names, so this reads them the same way.
   */
  for (const channel of await listChannels()) {
    const publication = channel.publication;
    if (!publication || publication.unpublishedAt) continue;
    if (!isListed(publication)) continue;
    rows.push({
      kind: 'programme',
      id: channel.id,
      title: channel.name,
      publishedAt: publication.publishedAt,
      respondable: publication.respondable === true,
      access: publication.respondable === true ? publication.access ?? 'anyone' : null,
      state: availabilityState(publication),
      watch: `/t/${channel.id}/watch`,
      openToAnyone: maySubmit(publication, 'anyone'),
    });
  }

  /* Newest first, which is the order a browse surface wants. */
  rows.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));

  /*
   * WHO IS ANSWERING.  [TAKE-PLATFORM P13, P22, P23, P25]
   *
   * One Take App speaks to many independent installations, and a person
   * with three of them in their home must be able to tell whose song
   * they are looking at. So the answer says what this installation is
   * called and where it is — the two things a connection is made of.
   *
   * THE NAME IS THE ACCOUNT'S, which is already what the studio bar
   * shows, and it is no more exposed than the titles beside it: every
   * row here is something its author published and chose to list, and
   * a listing that would not say whose it is would be worse.
   *
   * THE ORIGIN IS THE ONE THE BROWSER REACHED, never the one Node is
   * listening on. A client storing a connection stores this, and
   * behind a proxy `request.url` is the internal address — the fault
   * the QR codes had, which is the same fault in a different place.
   */
  let name = 'BalanceVid';
  try {
    name = (await theAccount()).name || name;
  } catch {
    /* An installation that cannot read its own account still lists. */
  }

  return json({
    instance: { name, origin: originOf(request) },
    participate: rows,
  }, {
    headers: {
      /*
       * READABLE FROM ANOTHER INSTALLATION'S TAKE APP.
       *   [TAKE-PLATFORM P22, P23, P25; §10, §11]
       *
       * A musician with three production companies has one Take App,
       * and it is served by one of them. Merging what the other two
       * offer means reading their listings from a page on a different
       * origin, which the browser refuses without this.
       *
       * `*` AND NEVER CREDENTIALS. This answer does not vary by
       * session — it is the same for the owner and for a stranger,
       * which was checked — so there is nothing a cookie could add
       * but risk. Without `Allow-Credentials` the browser sends none,
       * and a cross-origin read can learn only what an author
       * published and chose to list. [D-03]
       *
       * READ ONLY. The POST beside this is a WRITE and gets no CORS
       * at all: taking part happens on the installation that owns the
       * song, in its own page, so a claim is always same-origin and
       * a listing can never be turned into a way to make one.
       */
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
    },
  });
}
