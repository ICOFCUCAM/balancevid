import Link from 'next/link';
import { listConversations } from '../src/store/repository.js';
import { formatTimecode } from '../src/domain/time.js';
import NewConversation from './NewConversation.js';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const conversations = await listConversations();

  return (
    <div className="wrap">
      <h1>BalanceVid</h1>
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
        </section>
      </div>
    </div>
  );
}
