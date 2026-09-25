import Link from 'next/link';
import { isRespondable, orderedInterventions } from '../src/domain/document.js';
import { listConversations, loadConversation } from '../src/store/repository.js';
import { listPerformances } from '../src/store/performances.js';
import { formatMasterPosition } from '../src/domain/time.js';
import { formatTimecode } from '../src/domain/time.js';
import StartConversation from './StartConversation.js';
import StartPerformance from './StartPerformance.js';
import SignOut from './SignOut.js';

export const dynamic = 'force-dynamic';

/**
 * The library, and the way in.
 *
 * Two things a person arrives wanting: to carry on with something, or to
 * start something. The old page put a creation FORM beside a list, so the
 * first thing anyone met was a set of fields about rights and attribution.
 * Now the list is a library — each conversation showing the face of a
 * response in it — and starting one is its own short journey.
 */
export default async function Home() {
  const summaries = await listConversations();
  const respondable = summaries.filter(isRespondable);
  /*
   * The other studio's work, listed.  [STUDIO-TWO §13]
   *
   * It was not, and there was no other way back to a performance: start one,
   * lose the tab, lose the performance. A library that lists half of what you
   * have made is a library that teaches you to keep your own bookmarks.
   */
  const performances = (await listPerformances().catch(() => []))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  // One still per conversation, so the library is recognisable rather than
  // a column of titles. Read from the document; absent ones simply have none.
  const cards = await Promise.all(summaries.map(async (summary) => {
    const conversation = await loadConversation(summary.id).catch(() => null);
    const first = conversation ? orderedInterventions(conversation)[0] : undefined;
    const take = first?.takes.find((t) => t.id === first.selectedTakeId);
    return {
      summary,
      responses: conversation?.interventions.length ?? 0,
      poster: take && take.durationFrames > 0
        ? `/api/conversations/${summary.id}/takes/${take.id}/media?kind=poster`
        : null,
    };
  }));

  return (
    <div className="shell">
      <header className="shell-bar">
        <h1 className="grow" style={{ fontSize: 17, margin: 0 }}>BalanceVid</h1>
        <SignOut />
      </header>

      <div className="shell-body" style={{
        display: 'grid', gridTemplateColumns: 'minmax(300px, 0.75fr) minmax(0, 1.45fr)',
        gap: 28, padding: '20px 24px',
      }}>
        {/* ---- carry on with something -------------------------------- */}
        <section className="shell-scroll" style={{ paddingRight: 6 }}>
          <div className="row" style={{ marginBottom: 2 }}>
            <strong className="grow">Conversations</strong>
            <span className="small muted">{summaries.length}</span>
          </div>
          <p className="small muted" style={{ marginTop: 0 }}>Continue where you left off</p>

          {cards.length === 0 && (
            <div className="panel muted small">
              Nothing yet. Bring a video in and start responding to it.
            </div>
          )}

          {cards.map(({ summary, responses, poster }) => (
            <Link key={summary.id} href={`/c/${summary.id}`}
                  style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="panel" data-testid="library-card"
                   style={{ marginBottom: 8, padding: 10, display: 'flex', gap: 12 }}>
                <div style={{
                  width: 76, height: 44, borderRadius: 5, overflow: 'hidden', flex: '0 0 auto',
                  background: '#0d1319', border: '1px solid var(--line)',
                  display: 'grid', placeItems: 'center',
                }}>
                  {poster
                    ? <img alt="" src={poster}
                           style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span className="small muted" style={{ fontSize: 10 }}>—</span>}
                </div>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden',
                    textOverflow: 'ellipsis' }}>
                    {summary.title}
                  </div>
                  <div className="small muted">
                    {responses} {responses === 1 ? 'response' : 'responses'}
                    {summary.source.durationFrames > 0
                      ? ` · ${formatTimecode(summary.source.durationFrames).slice(0, 8)}`
                      : ' · preparing'}
                    {summary.publication && !summary.publication.unpublishedAt && ' · published'}
                  </div>
                </div>
              </div>
            </Link>
          ))}

          {/* ---- the other studio's work ----------------------------- */}
          {performances.length > 0 && (
            <div data-testid="performance-library" style={{ marginTop: 22 }}>
              <div className="row" style={{ marginBottom: 2 }}>
                <strong className="grow">Performances</strong>
                <span className="small muted">{performances.length}</span>
              </div>
              <p className="small muted" style={{ marginTop: 0 }}>
                One song, many takes
              </p>
              {performances.map((performance) => {
                const usable = performance.takes.filter((t) => t.durationSamples > 0);
                const poster = usable[0]
                  ? `/api/performances/${performance.id}/takes/${usable[0].id}`
                    + '/media?kind=poster'
                  : null;
                return (
                  <Link key={performance.id} href={`/p/${performance.id}`}
                        style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div className="panel" data-testid="performance-card"
                         style={{ marginBottom: 8, padding: 10, display: 'flex', gap: 12 }}>
                      <div style={{
                        width: 76, height: 44, borderRadius: 5, overflow: 'hidden',
                        flex: '0 0 auto', background: '#0d1319',
                        border: '1px solid var(--line)', display: 'grid',
                        placeItems: 'center',
                        ...(poster ? {
                          backgroundImage: `url(${poster})`,
                          backgroundSize: 'cover', backgroundPosition: 'center',
                        } : {}),
                      }}>
                        {!poster && <span className="small muted"
                                          style={{ fontSize: 10 }}>&mdash;</span>}
                      </div>
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, whiteSpace: 'nowrap',
                          overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {performance.title}
                        </div>
                        <div className="small muted">
                          {performance.takes.length}
                          {performance.takes.length === 1 ? ' take' : ' takes'}
                          {performance.master.durationSamples > 0
                            ? ` · ${formatMasterPosition(
                              performance.master.durationSamples).slice(0, 5)}`
                            : ' · preparing'}
                          {performance.publication && !performance.publication.unpublishedAt
                            && ' · published'}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* ---- or start something ------------------------------------- */}
        <section className="shell-scroll" style={{ display: 'grid', alignContent: 'center' }}>
          <div className="panel" style={{ padding: 28 }}>
            <StartConversation />
          </div>

          {/* The second studio. A different door, because it is a different
              job: one answers media, the other makes it. [STUDIO-TWO §13] */}
          <div className="panel" style={{ padding: 28, marginTop: 16 }}>
            <StartPerformance />
          </div>

          {/* A published conversation is itself a source, so answering one is
              a way to begin. [U-31, §40] */}
          {respondable.length > 0 && (
            <div style={{ marginTop: 22 }}>
              <div className="small muted" style={{ textTransform: 'uppercase',
                letterSpacing: 0.8, fontSize: 11, marginBottom: 8 }}>
                Published — anyone can answer these
              </div>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {respondable.map((c) => (
                  <a key={c.id} className="btn small" href={`/c/${c.id}/watch`}>
                    {c.title}
                  </a>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

    </div>
  );
}
