'use client';

import { useCallback, useEffect, useState } from 'react';

import Icon from '../Icon.js';
import {
  type Connection, addConnection, asOrigin, askInstance, readConnections,
  removeConnection,
} from './connections.js';

/**
 * The installations this device takes part in, as a surface.
 *   [TAKE-PLATFORM U3, P13, P22, P23, P25; D-19, U-19]
 *
 * > *"Imagine you are a musician. Your Take app might have… each a
 * > separate production environment. Yet you have one Take App."*
 *
 * LIFTED OUT OF THE HOME SCREEN BECAUSE A SECOND PAGE NEEDED IT.
 * Both uploaded designs put this on a Profile screen rather than
 * on the front page, and they are right: a first-time visitor is
 * here to find something to sing, and the list is empty for them
 * anyway. A musician with three production companies is who it is
 * for, and they come looking.
 *
 * COPYING IT WOULD HAVE COPIED THE SUBTLE HALF. Asking an
 * installation who it is, refusing an address that is not one,
 * keeping a connection that is merely asleep rather than deleting
 * it — three behaviours, none of them obvious, and the second
 * copy is the one that would quietly lose somebody's studio.
 * [D-19]
 *
 * AN INSTALLATION THAT DOES NOT ANSWER IS SHOWN, NOT DROPPED. A
 * self-hosted BalanceVid on somebody's laptop is often simply off,
 * and a row that vanished would leave a person wondering whether
 * they had imagined adding it. [U-19, P20]
 */
export default function Connections(
  { here }: {
    /** The installation serving this page, named by itself. */
    here: { name: string; origin: string } | null;
  },
) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [asleep, setAsleep] = useState<string[]>([]);
  const [adding, setAdding] = useState('');
  const [said, setSaid] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setConnections(readConnections());
    setOrigin(window.location.origin);
  }, []);

  /*
   * ASKED ONE BY ONE, AND A SILENT ONE IS MARKED RATHER THAN
   * REMOVED. This page is the only place a person can see that
   * a studio is not answering, so the check belongs here even
   * though it costs a request per connection — there are at most
   * a handful, and they are the point of the page.
   */
  useEffect(() => {
    let alive = true;
    const others = readConnections()
      .filter((one) => one.origin !== window.location.origin);
    if (others.length === 0) return undefined;
    void (async () => {
      const answers = await Promise.all(others.map(async (one) => ({
        origin: one.origin, answer: await askInstance(one.origin),
      })));
      if (!alive) return;
      setAsleep(answers.filter((one) => one.answer === null)
        .map((one) => one.origin));
    })();
    return () => { alive = false; };
  }, []);

  const add = useCallback(async () => {
    setSaid(null);
    const where = asOrigin(adding);
    if (!where) { setSaid('That is not an address.'); return; }
    try {
      const answer = await askInstance(where);
      if (!answer) {
        setSaid('That installation did not answer.');
        return;
      }
      /* `askInstance` answers with the instance AND what it is
         offering; only the instance is a connection. [connections.ts] */
      setConnections(addConnection({
        ...answer.instance, addedAt: new Date().toISOString(),
      }));
      setAdding('');
    } catch (error) {
      setSaid(error instanceof Error ? error.message : 'That did not work.');
    }
  }, [adding]);

  const forget = useCallback((where: string) => {
    setConnections(removeConnection(where));
  }, []);

  return (
    <section className="tk-shelf" data-testid="section-instances">
      <div className="tk-shelf-head">
        <h2 className="tk-shelf-title">Your studio network</h2>
      </div>

      {said && <p className="tk-note" data-testid="instance-said">{said}</p>}

      <ul className="tk-rows">
        <li className="tk-row" data-testid="instance-here">
          <span aria-hidden="true" className="tk-row-mark">
            <Icon name="home" size={16} />
          </span>
          <span className="tk-row-said">
            <span className="tk-row-name">{here?.name ?? 'This installation'}</span>
            <span className="tk-row-under">you are here</span>
          </span>
        </li>
        {connections
          .filter((one) => one.origin !== origin)
          .map((one) => (
            <li key={one.origin} data-testid="instance-row" className="tk-row">
              <span aria-hidden="true" className="tk-row-mark"
                    data-asleep={asleep.includes(one.origin) ? 'true' : 'false'}>
                <Icon name="link" size={16} />
              </span>
              <div className="tk-row-said">
                <div className="tk-row-name">{one.name}</div>
                <div className="tk-row-under">
                  {asleep.includes(one.origin)
                    ? 'not answering just now'
                    : one.origin.replace(/^https?:\/\//, '')}
                </div>
              </div>
              <button type="button" className="tk-quiet"
                      data-testid="instance-forget"
                      title="Forget this installation on this device"
                      onClick={() => forget(one.origin)}>
                Forget
              </button>
            </li>
          ))}
      </ul>

      <div className="tk-field" data-testid="instance-field">
        <input data-testid="instance-add"
               placeholder="Add another BalanceVid"
               aria-label="The address of another BalanceVid"
               value={adding}
               onChange={(event) => setAdding(event.target.value)}
               onKeyDown={(event) => { if (event.key === 'Enter') void add(); }} />
        <button type="button" className="tk-go"
                data-testid="instance-add-go"
                disabled={!adding.trim()}
                onClick={() => void add()}>
          Add
        </button>
      </div>

      <p className="tk-note">
        Every BalanceVid keeps its own productions. What you record for one of
        them stays with them, and this list is on your device alone.
      </p>
    </section>
  );
}
