'use client';

import { useState } from 'react';

/**
 * Leave.  [Doctrine D-06]
 *
 * TWO ACTIONS, ONE OF THEM DELIBERATELY HARDER TO REACH. Signing out is the
 * ordinary thing and stays a single click; ending every session is the thing
 * you do about a lost laptop, and it lands on people who are not in the room
 * to be asked. So it is a second press and it says what it will do.
 *
 * It used to be neither: the session is stateless, so the only way to revoke
 * one was to change the instance password — which ended every session
 * everywhere, including the ones you still wanted. The account now carries a
 * date instead.
 */
export default function SignOut() {
  const [arming, setArming] = useState(false);

  const leave = (everywhere: boolean) => {
    void fetch('/api/auth/signout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(everywhere ? { everywhere: true } : {}),
    }).finally(() => { window.location.href = '/signin'; });
  };

  return (
    <span className="row" style={{ gap: 6, alignItems: 'center' }}>
      <button
        className="small"
        data-testid="signout"
        onClick={() => leave(false)}
      >
        Sign out
      </button>
      {arming ? (
        <button
          className="small"
          data-testid="signout-everywhere-confirm"
          title="Ends this session and every other one, on every device."
          onClick={() => leave(true)}
          /*
           * THE ONE DESTRUCTIVE BUTTON ON THIS ROW, in the tones the
           * product uses for one. It was #c0392b on #8e2f24, which is
           * 3.24:1 against the surface behind it — under the bar, on the
           * button that ends every session on every device. --ink-on-bad
           * exists for exactly this and measures 7.86:1.
           */
          style={{ color: 'var(--ink-on-bad)',
            borderColor: 'var(--state-live-dim)' }}
        >
          End all sessions?
        </button>
      ) : (
        <button
          className="small muted"
          data-testid="signout-everywhere"
          title="Signs out every device, for a laptop you no longer have."
          onClick={() => setArming(true)}
          style={{ opacity: 0.7 }}
        >
          &hellip;
        </button>
      )}
    </span>
  );
}
