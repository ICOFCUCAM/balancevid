'use client';

import { useState } from 'react';
import Link from 'next/link';
import Icon from '../Icon.js';
import Notice from '../Notice.js';
import SignOut from '../SignOut.js';

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
  account, runtime, version, space,
}: {
  account: { id: string; name: string; createdAt: string };
  runtime: { label: string; hosted: boolean };
  version: string;
  space: { used: string; free: string; total: string };
}) {
  const [name, setName] = useState(account.name);
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
          One thing to change, and four things worth knowing about this
          instance.
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
