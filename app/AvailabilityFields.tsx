'use client';

import {
  CLAIMS_BY_DEFAULT, TAKE_ACCESS, TAKE_ACCESS_LABELS, TAKE_ACCESS_MEANS,
  claimsAllowed, describeAvailability, type TakeAccess, type TakeAvailability,
} from '../src/domain/availability.js';

/**
 * Who may take part, as a control.
 *   [TAKE-PLATFORM P8, P10, PART FIVE; U-19, D-19]
 *
 * THREE DECISIONS THAT ARE MADE AT ONE MOMENT, so they are one control
 * rather than three scattered through a publish panel. A producer pressing
 * Publish is answering all three whether or not they are asked, and the
 * version of this panel with only a "may anyone respond" checkbox answered
 * two of them silently: listed, and open to the world.
 *
 * ONE DEFINITION FOR EVERY SURFACE THAT PUBLISHES. A conversation, a
 * performance and a programme mean exactly the same thing by these three,
 * and a second copy is how two surfaces come to disagree about who is
 * allowed in — which is the author's own argument for naming the fields
 * identically on two different publication types. [D-19]
 *
 * THE ACCESS ROW IS NOT THERE WHEN NOTHING MAY BE SENT, because it would
 * be a control that cannot do anything, which looks like a fault. That is
 * the author's two em-dashes, in the interface: access is not a dimmed
 * menu on a closed item, it is absent. [U-19]
 */
export default function AvailabilityFields({
  value, onChange, noun, testId = 'availability', disabled,
}: {
  value: TakeAvailability;
  onChange: (next: TakeAvailability) => void;
  /**
   * What the thing is called here — "song", "conversation", "programme".
   *
   * A prop rather than three copies of the panel: the words differ and
   * the decision does not. Studio Two asks about a song, Studio One about
   * a conversation, and asking a musician whether anyone may "respond to"
   * their song would be the wrong verb for the right question.
   */
  noun: string;
  testId?: string;
  disabled?: boolean;
}) {
  const respondable = value.respondable === true;
  const listed = value.listed !== false;

  return (
    <div data-testid={testId} style={{
      display: 'flex', flexDirection: 'column', gap: 7,
    }}>
      {/*
        * FIRST, BECAUSE THE OTHER TWO DEPEND ON IT. Nothing below this
        * means anything if nobody may send anything.
        */}
      <label className="row small" style={{ gap: 8, margin: 0 }}>
        <input type="checkbox" data-testid={`${testId}-respondable`}
               checked={respondable} disabled={disabled}
               style={{ width: 'auto' }}
               onChange={(event) => onChange({
                 ...value, respondable: event.target.checked,
               })} />
        <span>Let people record and send a take of this {noun}</span>
      </label>

      <label className="row small" style={{ gap: 8, margin: 0 }}>
        <input type="checkbox" data-testid={`${testId}-listed`}
               checked={listed} disabled={disabled}
               style={{ width: 'auto' }}
               onChange={(event) => onChange({
                 ...value, listed: event.target.checked,
               })} />
        <span>Show this {noun} where people are browsing</span>
      </label>

      {/*
        * AND WHO — THE THIRD CONCEPT, AND THE ONE THE TWO BOXES ABOVE
        * CANNOT EXPRESS.
        *
        * Unlisted does not mean private: an unlisted song open to anyone
        * is open to everybody holding the URL, and an unlisted song open
        * to invited people is open to four. Those are different and no
        * arrangement of two checkboxes says which.
        */}
      {respondable && (
        <label className="field" data-testid={`${testId}-access-field`}
               style={{ margin: 0 }}>
          <span className="module-sub">Who may send one</span>
          {/*
            * WHAT THE CHOICE MEANS IS ON THE CONTROL, NOT UNDER IT.
            *
            * The first version printed `TAKE_ACCESS_MEANS` as a line of
            * its own, and a screenshot showed why that is wrong: under
            * "Only people I invite" it read "Only the people you send an
            * invitation to.", and directly beneath that the summary read
            * "Nobody can find this. Only the people you invite can take
            * part." Two sentences saying nearly the same thing, and the
            * summary is the one that adds something — it covers
            * discovery as well. The explanation stays, on hover, where
            * it answers a question instead of competing with an answer.
            */}
          <select className="small" data-testid={`${testId}-access`}
                  disabled={disabled}
                  title={TAKE_ACCESS_MEANS[value.access ?? 'anyone']}
                  value={value.access ?? 'anyone'}
                  onChange={(event) => onChange({
                    ...value, access: event.target.value as TakeAccess,
                  })}>
            {TAKE_ACCESS.map((one) => (
              <option key={one} value={one} title={TAKE_ACCESS_MEANS[one]}>
                {TAKE_ACCESS_LABELS[one]}
              </option>
            ))}
          </select>
        </label>
      )}

      {/*
        * AND HOW MANY OF THEM, WHICH ONLY `anyone` RAISES.
        *
        * Every other policy means the producer hands out the
        * invitations, so a ceiling there is a number that does
        * nothing — and a control that does nothing looks like a
        * fault. This is the door strangers come through, and the
        * question is one a producer can actually answer: how many
        * takes from people you did not invite.
        *
        * IT COUNTS CLAIMS AND NOT INVITATIONS, so inviting a choir
        * does not close the door on the public.
        */}
      {respondable && (value.access ?? 'anyone') === 'anyone' && (
        <label className="field" data-testid={`${testId}-claims-field`}
               style={{ margin: 0 }}>
          <span className="module-sub">At most, from strangers</span>
          <input
            type="number" className="small" min={0} step={1}
            data-testid={`${testId}-claims`} disabled={disabled}
            value={claimsAllowed(value)}
            onChange={(event) => {
              const asked = Number(event.target.value);
              onChange({
                ...value,
                claims: Number.isInteger(asked) && asked >= 0
                  ? asked : CLAIMS_BY_DEFAULT,
              });
            }} />
          <span className="small muted" style={{ fontSize: 'var(--text-2xs)' }}>
            Takes from people you did not invite. Your own invitations do
            not count towards it.
          </span>
        </label>
      )}

      {/*
        * THE WHOLE OF IT IN ONE SENTENCE, because three controls make six
        * situations and a producer should not have to compose them in
        * their head at the moment they press Publish. The sentence comes
        * from the same function everything else reads, so the panel
        * cannot describe a state the model does not have. [D-19]
        */}
      <p className="small muted" data-testid={`${testId}-says`}
         style={{ margin: 0, fontSize: 'var(--text-2xs)' }}>
        {describeAvailability(value)}
      </p>
    </div>
  );
}
