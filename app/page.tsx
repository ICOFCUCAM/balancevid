import Link from 'next/link';
import { isRespondable } from '../src/domain/document.js';
import { listConversations } from '../src/store/repository.js';
import { formatTimecode } from '../src/domain/time.js';
import NewConversation from './NewConversation.js';
import SignOut from './SignOut.js';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const conversations = await listConversations();
  // A published conversation is a Class A source, so this list is somewhere a
  // new conversation can begin. [U-31]
  const respondable = conversations.filter(isRespondable);

  return (
    <div className="wrap">
      <div className="row">
        <h1 className="grow">BalanceVid</h1>
        <SignOut />
      </div>
      <p className="muted" style={{ maxWidth: 680, marginTop: 0 }}>
        Interrupt a video at any moment, respond, resume exactly where it stopped,
        repeat throughout the source, and publish the resulting conversation.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,420px)', gap: 20, marginTop: 24 }}>
        <section>
          <h2>Conversations</h2>
          {conversations.length === 0 && (
            <div className="panel muted">Nothing yet. Add a source to begin.</div>
          )}
          {conversations.map((c) => (
            <Link key={c.id} href={`/c/${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="panel" style={{ marginBottom: 10 }}>
                <div className="row">
                  <strong className="grow">{c.title}</strong>
                  <span className="small muted mono">
                    {c.source.durationFrames > 0 ? formatTimecode(c.source.durationFrames) : 'normalising…'}
                  </span>
                </div>
                <div className="small muted">
                  {c.interventions.length} intervention{c.interventions.length === 1 ? '' : 's'}
                  {' · '}source: {c.source.title}
                  {' · '}class {c.source.class}
                </div>
              </div>
            </Link>
          ))}
        </section>

        <section>
          <h2>New conversation</h2>
          <NewConversation />

          {respondable.length > 0 && (
            <>
              <h2 style={{ marginTop: 24 }}>Answer someone</h2>
              <p className="small muted" style={{ marginTop: 0 }}>
                Published conversations whose authors allowed responses.
              </p>
              {respondable.map((c) => (
                <div key={c.id} className="panel" style={{ marginBottom: 8 }}>
                  <div className="row">
                    <a className="grow" href={`/c/${c.id}/watch`}>{c.title}</a>
                    <span className="small muted">
                      {c.publication?.author ?? 'anonymous'}
                    </span>
                  </div>
                  <div className="small muted">
                    {c.interventions.length} intervention{c.interventions.length === 1 ? '' : 's'}
                    {(c.lineage?.chain.length ?? 0) > 0
                      && ` · ${c.lineage!.chain.length} responses deep`}
                  </div>
                </div>
              ))}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
