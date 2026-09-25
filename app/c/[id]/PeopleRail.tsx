'use client';

/**
 * Who is in this conversation.  [Doctrine ROOM §4, D-17, U-20]
 *
 * "Now participants and responses are both first-class objects."
 *
 * TWO LISTS, NOT ONE. A person and a response are different things: Sarah is
 * one participant and three of the eleven responses, and a rail that merged
 * them would make her either one row or three and be wrong either way. So
 * this sits ABOVE the clips rather than instead of it — people, then what was
 * said, in the order the argument makes them.
 *
 * IT IS ABSENT WHEN THERE IS ONE VOICE. A solo author does not need a list
 * headed PEOPLE with their own name in it; they need the invitation, and that
 * is one line. The same test the lower third and the captions use decides it
 * (`hasSeveralVoices`), so the studio, the render and the exports agree about
 * whether this is a conversation with more than one person in it.
 *
 * WHAT IT DOES NOT DO is control the stage. Who is on stage is a live decision
 * and it belongs to the room, which has its own surface for it — a second
 * place to stage somebody would be two records disagreeing about who is on
 * screen. This is the Studio: it says who spoke, not who is speaking.
 */

export interface RailPerson {
  id: string;
  displayName: string;
  accent: string;
  role: string;
  /** How many responses in this conversation are theirs. */
  responses: number;
  /** Present and connected, where the room knows. [ROOM §4] */
  presence?: 'invited' | 'waiting' | 'staged';
}

const PRESENCE: Record<string, { label: string; dim: boolean }> = {
  staged: { label: 'on stage', dim: false },
  waiting: { label: 'waiting', dim: true },
  invited: { label: 'invited', dim: true },
};

export default function PeopleRail({
  people, roomHref, canInvite,
}: {
  people: RailPerson[];
  roomHref: string;
  /** False when this caller may not add anyone. [D-17] */
  canInvite: boolean;
}) {
  /*
   * One voice and no invitation to offer is nothing worth a heading. The
   * invitation alone still is: it is how a conversation stops having one
   * voice in it.
   */
  if (people.length <= 1 && !canInvite) return null;

  return (
    <div data-testid="people-rail" style={{ marginBottom: 14 }}>
      {people.length > 1 && (
        <>
          <div className="small muted" style={{
            textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 11, marginBottom: 8,
          }}>
            People
          </div>
          <ul style={{ listStyle: 'none', margin: '0 0 10px', padding: 0 }}>
            {people.map((person) => {
              const state = person.presence ? PRESENCE[person.presence] : undefined;
              return (
                <li key={person.id} data-testid="rail-person"
                    data-person={person.id}
                    style={{
                      display: 'flex', alignItems: 'baseline', gap: 8,
                      padding: '4px 2px', fontSize: 13,
                    }}>
                  {/* The colour they are in the video, so the rail and the
                      finished picture name the same person. [U-20] */}
                  <span aria-hidden="true" style={{
                    width: 8, height: 8, borderRadius: '50%', flex: '0 0 auto',
                    background: person.accent,
                    opacity: state?.dim ? 0.45 : 1,
                  }} />
                  <span style={{ opacity: state?.dim ? 0.7 : 1 }}>{person.displayName}</span>
                  <span className="small muted" style={{ marginLeft: 'auto', fontSize: 11 }}>
                    {/* What they contributed, which is what a studio rail is
                        for — not whether they are connected right now. */}
                    {state ? state.label : person.responses === 1
                      ? '1 response' : `${person.responses} responses`}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {canInvite && (
        <a className="small" data-testid="rail-invite" href={roomHref}
           style={{ display: 'inline-block', marginBottom: 4 }}>
          + Invite someone
        </a>
      )}
    </div>
  );
}
