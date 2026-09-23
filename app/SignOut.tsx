'use client';

/**
 * Leave.  [Doctrine D-06]
 *
 * The cookie is cleared rather than a token revoked: the session is stateless
 * and its signature is the proof. A token that has genuinely leaked is revoked
 * by changing the password, which re-derives the signing key and ends every
 * session at once — and the sign-in page says so.
 */
export default function SignOut() {
  return (
    <button
      className="small"
      data-testid="signout"
      onClick={() => {
        void fetch('/api/auth/signout', { method: 'POST' })
          .finally(() => { window.location.href = '/signin'; });
      }}
    >
      Sign out
    </button>
  );
}
