'use client';

import { useState } from 'react';
import Link from 'next/link';
import Icon from '../Icon.js';
import Notice from '../Notice.js';
import SignOut from '../SignOut.js';
import {
  ALL_STUDIOS, STUDIOS, type StudioId,
} from '../../src/domain/account.js';

/**
 * The one page in the building that is a form.  [Doctrine U-24, D-16]
 *
 * It is short on purpose. There is exactly one thing here a person can
 * change — what they are called — and the rest is a statement of what
 * this instance is: where it runs, which build it is, how much room is
 * left, and when the account was made. Those are not settings and they
 * are not decoration either: they are the four things somebody needs when
 * they are about to ask for help, and having them on one page beats
 * having them in a footer, a badge and a tooltip.
 */
export default function Settings({
  account, runtime, version, space, deployment,
}: {
  account: { id: string; name: string; createdAt: string; studios: StudioId[] };
  runtime: { label: string; hosted: boolean };
  version: string;
  /** What this running installation says it is. [D-13] */
  deployment: {
    commit: string; short: string; startedAt: string;
    deployment?: string; environment?: string; url?: string;
  };
  space: { used: string; free: string; total: string };
}) {
  const [name, setName] = useState(account.name);
  const [studios, setStudios] = useState<StudioId[]>(account.studios);
  const [plan, setPlan] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const response = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setError(data.error ?? 'that did not save'); return; }
      setSaved(`Saved. The building will call you ${data.account.name}.`);
    } catch {
      setError('that did not save — the server did not answer');
    } finally {
      setBusy(false);
    }
  };

  /*
   * A STUDIO IS TURNED OFF ONE AT A TIME AND SAVED IMMEDIATELY, because
   * there is no draft state worth having here: the answer is three
   * booleans, and a Save button under three checkboxes is a form that
   * exists to have a button.
   */
  const toggle = async (id: StudioId) => {
    const want = studios.includes(id)
      ? studios.filter((each) => each !== id)
      : [...ALL_STUDIOS].filter((each) => studios.includes(each) || each === id);
    setStudios(want);
    setPlan(null);
    try {
      const response = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ studios: want }),
      });
      if (!response.ok) {
        setStudios(studios);
        setPlan('that did not save');
        return;
      }
      setPlan(want.length === 0
        ? 'No studios. The building still opens; there is nothing in it.'
        : `Saved. ${want.map((each) => STUDIOS[each].label).join(', ')}.`);
    } catch {
      setStudios(studios);
      setPlan('that did not save — the server did not answer');
    }
  };

  return (
    <div data-ground="light" data-testid="settings" style={{
      minHeight: '100dvh', background: 'var(--surface-base)',
    }}>
      <header className="row" style={{
        gap: 'var(--space-5)', padding: '0 24px', height: 62,
        flexWrap: 'nowrap',
        borderBottom: 'var(--border) solid var(--line)',
        background: 'var(--surface-raised)',
      }}>
        <Link href="/" className="row" style={{
          gap: 8, textDecoration: 'none', color: 'inherit', flexWrap: 'nowrap',
        }}>
          {/* Back points back. The chevron is one glyph, drawn once. */}
          <span aria-hidden="true" style={{ transform: 'rotate(180deg)' }}>
            <Icon name="chevron" size={14} />
          </span>
          <strong style={{ fontSize: 'var(--text-base)' }}>
            Back to the workspace
          </strong>
        </Link>
        <span className="grow" />
        {/*
          * NO SIGN OUT UP HERE. It is in Sessions, ten centimetres down,
          * next to the sentence explaining the difference between the two
          * ways of leaving. Twice on one short page is once too many.
          */}
      </header>

      <main style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px 64px' }}>
        <h1 style={{
          margin: 0, fontSize: 'var(--text-xl)',
          letterSpacing: 'var(--tracking-tighter)',
        }}>Settings</h1>
        <p style={{
          margin: '4px 0 26px', fontSize: 'var(--text-base)',
          color: 'var(--text-faint)',
        }}>
          What to call you, which studios you run, and four things worth
          knowing about this instance.
        </p>

        {/* ---- the only setting -------------------------------------- */}
        <form onSubmit={save} className="panel" data-testid="account-form"
              style={{ padding: 20, borderRadius: 'var(--radius-xl)' }}>
          <h2 style={{ margin: 0, fontSize: 'var(--text-md)' }}>Your name</h2>
          <p style={{
            margin: '4px 0 14px', fontSize: 'var(--text-sm)',
            color: 'var(--text-faint)', maxWidth: '58ch',
          }}>
            {/*
              * SAYING WHY IT IS "Owner" rather than letting them wonder.
              * The account is made on the first read — by a migration, or
              * by a process starting up — long before anybody is at a
              * keyboard to be asked.
              */}
            The account was created before anyone could be asked, so it
            started out called “Owner”. This is display only: nothing in
            the product keys off it.
          </p>
          <div className="field" style={{ maxWidth: 340 }}>
            <label htmlFor="account-name">What should we call you?</label>
            <input
              id="account-name" data-testid="account-name-field"
              value={name} maxLength={80} autoComplete="name"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="row" style={{ gap: 10, marginTop: 14 }}>
            <button type="submit" data-testid="save-name"
                    disabled={busy || !name.trim() || name.trim() === account.name}
                    style={{
                      background: 'var(--accent)',
                      borderColor: 'var(--accent)',
                      color: 'var(--text-on-accent)',
                      padding: '8px 16px', fontWeight: 'var(--weight-semi)',
                    }}>
              {busy ? 'Saving…' : 'Save the name'}
            </button>
          </div>
          {saved && (
            <div style={{ marginTop: 14 }}>
              <Notice kind="done" testid="name-saved">{saved}</Notice>
            </div>
          )}
          {error && (
            <div style={{ marginTop: 14 }}>
              <Notice kind="error" testid="name-failed">{error}</Notice>
            </div>
          )}
        </form>

        {/* ---- what this instance is --------------------------------- */}
        <section className="panel" data-testid="about-instance" style={{
          padding: 20, borderRadius: 'var(--radius-xl)', marginTop: 16,
        }}>
          <h2 style={{ margin: 0, fontSize: 'var(--text-md)' }}>
            This instance
          </h2>
          <p style={{
            margin: '4px 0 14px', fontSize: 'var(--text-sm)',
            color: 'var(--text-faint)',
          }}>
            The four things worth having to hand when something is wrong.
          </p>
          <dl style={{
            margin: 0, display: 'grid', gap: '0',
            gridTemplateColumns: 'minmax(0, 170px) minmax(0, 1fr)',
          }}>
            <Row term="Running on"
                 value={runtime.hosted ? runtime.label : 'This machine'}
                 note={runtime.hosted
                   ? 'The same product runs on your own machine.'
                   : 'The same product runs hosted, with nothing withheld.'} />
            <Row term="Build" value={version} />
            {/*
              * THE COMMIT, next to the version that never changes.
              * *"Could it be telling us that features written might not
              * even be deployed?"* — this is the row that answers it,
              * and it answers `Unknown` on an installation started by
              * hand rather than inventing one. [D-13]
              */}
            <Row
              term="Commit"
              value={deployment.commit === 'unknown'
                ? 'Unknown' : deployment.short}
              note={deployment.commit === 'unknown'
                ? 'Started by hand, so nothing set it. A deployed '
                  + 'installation names the commit it is running.'
                : [
                  deployment.environment,
                  `live here since ${new Date(deployment.startedAt)
                    .toLocaleString(undefined, {
                      day: 'numeric', month: 'short',
                      hour: '2-digit', minute: '2-digit',
                    })}`,
                ].filter(Boolean).join(' · ')}
            />
            <Row term="Storage"
                 value={`${space.used} of work`}
                 note={`${space.free} free of ${space.total}`} />
            <Row term="Account made"
                 value={new Date(account.createdAt).toLocaleDateString(
                   undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
                 note={account.id} />
          </dl>
        </section>

        {/* ---- the one dangerous thing, kept apart -------------------- */}
        {/*
          * STUDIOS.  [MASTER-EDIT §11]
          *
          * Here rather than behind a price, because there is no price yet.
          * What this panel is really for is that the separation is REAL —
          * turn Studio Two off and its tab goes, its section goes, and
          * `/p/<id>` stops answering, because the check is in `isOwner` and
          * not in the bar.
          */}
        <section className="panel" data-testid="studios" style={{
          padding: 20, borderRadius: 'var(--radius-xl)', marginTop: 16,
        }}>
          <h2 style={{ margin: 0, fontSize: 'var(--text-md)' }}>Studios</h2>
          <p style={{
            margin: '4px 0 14px', fontSize: 'var(--text-sm)',
            color: 'var(--text-faint)', maxWidth: '58ch',
          }}>
            Which studios this account runs. A studio that is off disappears
            from the bar and from the building, and its pages stop answering
            — the work in it is untouched and comes back when it does.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ALL_STUDIOS.map((id) => (
              <label key={id} data-testid="studio-toggle" data-studio={id}
                     style={{
                       display: 'flex', alignItems: 'baseline', gap: 10,
                       fontSize: 'var(--text-sm)',
                     }}>
                <input type="checkbox" checked={studios.includes(id)}
                       data-testid="studio-checkbox" data-studio={id}
                       onChange={() => { void toggle(id); }} />
                <span style={{ fontWeight: 'var(--weight-semi)' }}>
                  {STUDIOS[id].label}
                </span>
                <span style={{ color: 'var(--text-faint)' }}>
                  {STUDIOS[id].holds}
                </span>
              </label>
            ))}
          </div>
          {plan && (
            <p data-testid="studios-said" style={{
              margin: '12px 0 0', fontSize: 'var(--text-sm)',
              color: 'var(--text-faint)',
            }}>{plan}</p>
          )}
        </section>

        <section className="panel" data-testid="sessions" style={{
          padding: 20, borderRadius: 'var(--radius-xl)', marginTop: 16,
        }}>
          <h2 style={{ margin: 0, fontSize: 'var(--text-md)' }}>Sessions</h2>
          <p style={{
            margin: '4px 0 14px', fontSize: 'var(--text-sm)',
            color: 'var(--text-faint)', maxWidth: '58ch',
          }}>
            Signing out everywhere ends this session and every other one on
            every device — the remedy for a laptop you no longer have. It
            does not change the password.
          </p>
          <SignOut />
        </section>
      </main>
    </div>
  );
}

function Row({
  term, value, note,
}: { term: string; value: string; note?: string }) {
  return (
    <>
      <dt style={{
        padding: '10px 0', fontSize: 'var(--text-sm)',
        color: 'var(--text-faint)',
        borderTop: 'var(--border) solid var(--line-soft)',
      }}>{term}</dt>
      <dd style={{
        margin: 0, padding: '10px 0', fontSize: 'var(--text-sm)',
        borderTop: 'var(--border) solid var(--line-soft)',
      }}>
        <span style={{ fontWeight: 'var(--weight-semi)' }}>{value}</span>
        {note && (
          <span className="mono" style={{
            display: 'block', fontSize: 'var(--text-2xs)',
            color: 'var(--ink-400)', marginTop: 2,
          }}>{note}</span>
        )}
      </dd>
    </>
  );
}
