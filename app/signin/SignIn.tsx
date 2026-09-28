'use client';

import { useState } from 'react';

/**
 * The way in.  [Doctrine D-03, D-06]
 *
 * One field, because there is one owner. The page that tells a locked
 * instance's operator what to do is as much a part of this as the password
 * check — an instance nobody can get into is a different outage from an
 * instance anyone can get into, and both start here.
 */
export default function SignIn({ configured, next }: { configured: boolean; next: string }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        throw new Error((await response.json().catch(() => ({}))).error ?? 'could not sign in');
      }
      window.location.href = next;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    /*
      * THE FIRST PAGE ANYBODY SEES, and the only one seen by somebody
      * who has not yet decided whether to trust the thing. It was a
      * heading, a line and a panel jammed against the top of a 1240px
      * column — content laid out by default, which is exactly how a
      * sign-in page tells you nobody thought about it.
      *
      * Centred in the window, on its own, with the mark above it. There
      * is nothing else on this page to compete with, so the one thing
      * on it should sit where the eye already is.
      */
    <div style={{
      minHeight: '100dvh', display: 'grid', placeItems: 'center',
      padding: 'var(--space-8)',
      /*
        * A DARKER WELL BEHIND IT. A flat field makes the panel look
        * pasted on; a very slight radial fall-off from the centre puts
        * the card in a pool of light, which is the oldest trick there
        * is for making one object matter.
        */
      background: 'radial-gradient(120% 90% at 50% 0%,'
        + ' var(--ink-750) 0%, var(--ink-800) 45%, var(--ink-900) 100%)',
    }}>
    <div style={{ width: '100%', maxWidth: 380 }}>
      <div className="row" style={{
        gap: 'var(--space-4)', marginBottom: 'var(--space-7)',
        justifyContent: 'center',
      }}>
        <span aria-hidden="true" style={{
          width: 34, height: 34, borderRadius: 'var(--radius-md)',
          display: 'grid', placeItems: 'center',
          background: 'linear-gradient(180deg, #3f8ee8 0%, #2a6fcc 100%)',
          color: '#fff', fontSize: 14, paddingLeft: 2,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3),'
            + ' 0 2px 10px rgba(26, 78, 150, 0.55)',
        }}>&#9654;</span>
        <h1 style={{
          margin: 0, fontSize: 'var(--text-xl)',
          letterSpacing: 'var(--tracking-tighter)',
        }}>BalanceVid</h1>
      </div>
      <p style={{
        marginTop: 0, textAlign: 'center', fontSize: 'var(--text-base)',
        color: 'var(--text-faint)',
      }}>
        A conversation editor for recorded media.
      </p>

      {configured ? (
        <form className="panel" onSubmit={submit} style={{
          marginTop: 'var(--space-7)', boxShadow: 'var(--elev-3)',
          borderColor: 'var(--line-strong)',
        }}>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password" type="password" autoFocus autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              data-testid="signin-password"
            />
          </div>
          {error && (
            <p className="small" style={{ color: 'var(--bad)' }} data-testid="signin-error">
              {error}
            </p>
          )}
          {/* Full width: it is the only action on the page. */}
          <button className="primary lg" type="submit" disabled={busy || !password}
                  data-testid="signin-submit" style={{ width: '100%' }}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
          <p className="small muted" style={{ marginBottom: 0, marginTop: 12 }}>
            Published conversations are readable without signing in. Everything
            else — drafts, recordings, anything not published — is not.
          </p>
        </form>
      ) : (
        /*
         * Locked, not open. An instance with no password configured serves
         * nothing, and this is the only page that says so.
         */
        <div className="panel" style={{
          marginTop: 'var(--space-7)', borderColor: 'var(--state-bad)',
          boxShadow: 'var(--elev-3), inset 3px 0 0 var(--state-bad)',
        }}>
          <strong>This instance has no password.</strong>
          <p className="small" style={{ marginTop: 8 }}>
            Nothing is being served until one is set — not even published
            conversations, because an instance with no owner has not published
            anything on purpose.
          </p>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Generate a hash and set it as <span className="mono">BALANCEVID_PASSWORD_HASH</span>:
          </p>
          <pre className="small mono" style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
            npm run passwd
          </pre>
        </div>
      )}
    </div>
    </div>
  );
}
