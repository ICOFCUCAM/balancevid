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
    <div className="wrap" style={{ maxWidth: 420, paddingTop: 80 }}>
      <h1 style={{ marginBottom: 4 }}>BalanceVid</h1>
      <p className="small muted" style={{ marginTop: 0 }}>
        A conversation editor for recorded media.
      </p>

      {configured ? (
        <form className="panel" onSubmit={submit} style={{ marginTop: 24 }}>
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
          <button className="primary" type="submit" disabled={busy || !password}
                  data-testid="signin-submit">
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
        <div className="panel" style={{ marginTop: 24, borderColor: 'var(--bad)' }}>
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
  );
}
