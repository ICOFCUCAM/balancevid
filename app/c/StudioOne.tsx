/*
 * NO `'use client'`, AND IT HAD ONE.
 *
 * The first version of this page carried a search box over the recent
 * list, which needed state, which needed the client. Capping the list at
 * ten and pointing at the Library for the rest took the state away — and
 * a component with no state has no business shipping to the browser. The
 * four doors are still a client component, because choosing one is
 * something a person does without reloading; this frame around them is
 * not.
 */
import Link from 'next/link';
import Icon from '../Icon.js';

export interface RecentConversation {
  id: string;
  title: string;
  /** One word for where the material came from. */
  from: string;
  /** How long the SOURCE runs, when it has been measured. */
  duration: string | null;
  responses: number;
  poster: string | null;
  updatedAt: string;
  href: string;
}

/**
 * Inside Studio One.  [STUDIO-ONE §4, §5, §9; D-19, U-19]
 *
 * The brief draws this page, and the drawing is the specification:
 *
 *     CONVERSATION STUDIO
 *     Start a new conversation
 *     What are you responding to?
 *     [ Upload ] [ Link ] [ Record ] [ Screen ]
 *     ──────────────────────────────────────────
 *     Recent conversations
 *     The Ancient…   YouTube   04:12   Yesterday
 *
 * WHY THE SOURCE PICKER MOVED HERE FROM THE DASHBOARD. *"Your current home
 * page has the Conversation Studio expanded directly inside the dashboard.
 * I don't think that is ideal… almost half of the screen consumed by the
 * Conversation Studio card."* And it is worse than a proportion problem:
 * the home page is the building, where three studios stand side by side,
 * and one of them had its entire intake form unfolded in the hallway.
 *
 * WHAT THE PAGE IS ACTUALLY FOR is stated once at the top, because
 * `SOURCE → RESPONSE` is the invention and it has never been written
 * anywhere a person could read it.
 */
export default function StudioOne({
  recent, total, start,
}: {
  /** The ten most recent, which is what "recent" can mean. */
  recent: RecentConversation[];
  /** How many there are in all, which is a different question. */
  total: number;
  /** The four doors, rendered by the server page. */
  start: React.ReactNode;
}) {

  return (
    <div className="shell-scroll" data-testid="studio-one" style={{
      padding: 'var(--space-7) var(--space-6)', maxWidth: 1080, margin: '0 auto',
    }}>
      <Link href="/" data-testid="back-home" className="small" style={{
        textDecoration: 'none', color: 'var(--muted)',
      }}>
        <span className="row" style={{ gap: 6 }}>
          <Icon name="chevron" size={11} turn={180} />Home
        </span>
      </Link>

      <h1 style={{
        fontSize: 'var(--text-2xs)', letterSpacing: '0.1em',
        fontWeight: 'var(--weight-bold)', color: 'var(--ink-400)',
        margin: '10px 0 0',
      }}>CONVERSATION STUDIO</h1>

      {/*
        * THE INVENTION, WRITTEN DOWN.  [§4]
        *
        * *"The fundamental concept should be SOURCE → RESPONSE. This is
        * more important than the individual upload buttons… That is the
        * actual invention in your Conversation Studio."*
        *
        * It is a line of text and not a diagram because a diagram of six
        * boxes at the top of a working page is a poster. The sequence is
        * the sentence.
        */}
      <p data-testid="the-loop" style={{
        margin: '6px 0 0', fontSize: 'var(--text-md)',
        color: 'var(--text-faint)', maxWidth: 640,
        lineHeight: 'var(--leading-snug)',
      }}>
        Bring something in, watch it, interrupt wherever you have something to
        say, respond, carry on — and publish the whole exchange as one film.
      </p>

      <section style={{ marginTop: 'var(--space-6)' }} className="panel">
        {start}
      </section>

      {/* ---- what has been made in this room ------------------------ */}
      <div className="row" style={{
        margin: '30px 0 12px', flexWrap: 'nowrap', alignItems: 'baseline',
        gap: 12,
      }}>
        <h2 className="grow" style={{
          margin: 0, minWidth: 0, fontSize: 'var(--text-lg)',
          letterSpacing: 'var(--tracking-tight)',
        }}>Recent conversations</h2>
        {/*
          * WHAT IS NOT ON THIS PAGE, SAID RATHER THAN HIDDEN.
          *
          * A list of ten out of a hundred and sixty-one that does not
          * say so reads as "this is everything", and somebody looking
          * for a conversation from last month concludes it is gone.
          * The Library is where all of them are, with a search box,
          * and it is one link away.
          */}
        {total > recent.length && (
          <Link href="/#library" data-testid="all-conversations" className="small"
                style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>
            All {total} in the Library →
          </Link>
        )}
      </div>

      {recent.length === 0 ? (
        <p className="muted" data-testid="nothing-yet">
          Nothing here yet. Choose a source above and the conversation starts.
        </p>
      ) : (
        <div data-testid="recent-list" className="panel" style={{ padding: 0 }}>
          {recent.map((one, index) => (
            <Link key={one.id} href={one.href} data-testid="recent-row"
                  style={{
                    display: 'grid', alignItems: 'center', gap: 12,
                    /*
                     * THE BRIEF'S FOUR COLUMNS. A picture is added at the
                     * front because this product has one for nearly every
                     * conversation and a row of titles is a list of files.
                     * `minmax(0, 1fr)` on the title is what lets it
                     * ellipsis instead of pushing the other three off the
                     * end — a grid item will not shrink below its content
                     * without it.
                     */
                    gridTemplateColumns: '56px minmax(0, 1fr) 84px 60px 96px',
                    padding: '10px 12px', textDecoration: 'none',
                    color: 'inherit',
                    borderTop: index === 0 ? 'none'
                      : 'var(--border) solid var(--line)',
                  }}>
              <span aria-hidden="true" style={{
                width: 56, height: 32, borderRadius: 'var(--radius-sm)',
                overflow: 'hidden', background: 'var(--surface-sunk)',
                display: 'block',
              }}>
                {one.poster && (
                  <img alt="" src={one.poster} style={{
                    width: '100%', height: '100%', objectFit: 'cover',
                    display: 'block',
                  }} />
                )}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{
                  display: 'block', fontWeight: 'var(--weight-medium)',
                  whiteSpace: 'nowrap', overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>{one.title}</span>
                <span className="small muted" style={{
                  display: 'block', fontSize: 'var(--text-2xs)',
                }}>
                  {one.responses} {one.responses === 1 ? 'response' : 'responses'}
                </span>
              </span>
              <span className="small muted" data-testid="recent-from"
                    style={{ whiteSpace: 'nowrap' }}>{one.from}</span>
              {/*
                * A MEASUREMENT OR NOTHING. An embedded source has no
                * duration until its player has reported one, and printing
                * 00:00 would be this product stating a number it has not
                * measured. [U-02]
                */}
              <span className="small muted" style={{
                whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
              }}>{one.duration ?? '—'}</span>
              <span className="small muted" style={{
                whiteSpace: 'nowrap', textAlign: 'right',
              }}>{when(one.updatedAt)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * "Yesterday", which is what the brief's own mock-up says.
 *
 * A DATE IS NOT AN ANSWER TO "WHEN DID I LAST TOUCH THIS". Somebody
 * scanning a list of their own work is asking how long ago, and "Monday"
 * answers it while "2026-09-28" has to be converted in the head. Past a
 * week the conversion stops being free and the date is the better answer.
 */
function when(at: string): string {
  const then = Date.parse(at);
  if (!Number.isFinite(then)) return '';
  const days = Math.floor((startOfToday() - startOfDay(then)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) {
    return new Date(then).toLocaleDateString(undefined, { weekday: 'long' });
  }
  return new Date(then).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short',
  });
}

function startOfDay(at: number): number {
  const day = new Date(at);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

function startOfToday(): number {
  return startOfDay(Date.now());
}
