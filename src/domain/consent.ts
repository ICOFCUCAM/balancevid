/**
 * What a participant was told, and what they agreed to.
 *   [GO-VIRAL V-3; Doctrine D-03, D-25]
 *
 * > *"If a campaign is going to put somebody's face on a public
 * > results page, in a clip, possibly on television, then the
 * > thing that permits that is not a tick box they passed on the
 * > way to the camera. It is a record: what they were told, in
 * > what words, on what date, and what they agreed to. And they
 * > must be able to take it back."*
 *
 * > *"I would rather have no campaign than a campaign that cannot
 * > say what each person agreed to."*
 *
 * CONSENT EXISTS IN THIS PRODUCT AND IT IS THE WRONG PERSON'S.
 * `src/domain/publish.ts` holds `ConsentError`, and the publish
 * route says *"consent is recorded here and nowhere else"* — that
 * is the AUTHOR consenting to be answered, which is U-31's door.
 * A grep for `consent` over the whole product returned eleven
 * hits before this file and every one of them was the
 * publisher's. **Nothing recorded a participant's.**
 *
 * THE TWO MUST NOT BECOME ONE FIELD. Two different people consent
 * to two different things, and collapsing them would make a
 * producer's publish decision look like a performer's release.
 * `publish.ts` is untouched by this stage.
 *
 * WHY IT IS A RECORD AND NOT A BOOLEAN. D-03: *"the product
 * handles people's faces, voices, homes, and unpublished
 * opinions… recording content is not training data. Not without
 * separate, specific, revocable, opt-in consent."* A competition
 * entry is the same class of act — specific, revocable, opt-in,
 * and never a condition dressed as a default.
 *
 * NOTHING HERE TOUCHES THE FILESYSTEM, THE NETWORK, A CLOCK — OR
 * `node:crypto`, WHICH IS THE ONE THAT TOOK AN EDIT TO ARRANGE.
 * The Take surface has to draw these scopes in a browser, and a
 * module reaching `ids.ts` for `sha256` would pull Node's crypto
 * into the phone's bundle. The hash of a set of terms is the
 * CAMPAIGN's to compute, once, when the organiser writes them; a
 * participant only ever echoes back the one they were shown. So
 * `termsHashOf` lives in `campaignEdit.ts` with the other things
 * only a server does, and this file is importable from anywhere.
 * [T-5's boundary, one module over]
 */

/**
 * The four things somebody may agree to, separately.
 *
 * NOT ONE BIT, which is the whole of the brief's objection. A
 * person willing to be judged in a competition has not thereby
 * agreed to be on television, and a product that recorded one
 * tick could not tell the two apart afterwards — which is
 * precisely the moment it matters.
 *
 *   entry      it may be entered and judged
 *   display    it may be shown on a public page
 *   clip       it may be cut into something else
 *   broadcast  it may go out on a channel
 *
 * ORDERED WIDEST-LAST, AND THE ORDER IS NOT AN IMPLICATION.
 * Agreeing to broadcast does not imply agreeing to a clip; they
 * are different uses and the list is a list. What the order is
 * for is drawing them in a sensible sequence and nothing else.
 */
export const CONSENT_SCOPES = ['entry', 'display', 'clip', 'broadcast'] as const;

export type ConsentScope = (typeof CONSENT_SCOPES)[number];

/** What each one means, in words a person can act on. */
export const CONSENT_MEANS: Record<ConsentScope, string> = {
  entry: 'My video may be entered in this call and judged.',
  display: 'My video may be shown on a public page for this call.',
  clip: 'My video may be cut into a compilation or a trailer.',
  broadcast: 'My video may be broadcast on a channel.',
};

/**
 * What somebody agreed to, and when, and to what words.
 *
 * `termsHash` IS THE WORDS THEMSELVES, by their hash, which is
 * the same reasoning `quoteHash` applies to quotations: the thing
 * signed must not be editable underneath the signature. A
 * campaign that could rewrite its terms and leave every existing
 * record pointing at the new text would have a hundred signatures
 * on a document nobody signed.
 *
 * AND THE WORDS ARE KEPT, not only their hash. A record saying
 * *"they agreed to something with hash a3f…"* is a record nobody
 * can read back — so a campaign's terms are APPEND-ONLY and an
 * old hash still resolves to the text it was. [`campaign.ts`]
 */
export interface ConsentRecord {
  /** `sha256` of the exact text that was shown. */
  termsHash: string;
  /** When they agreed. */
  at: string;
  /** What they agreed to, separately. */
  permits: ConsentScope[];
  /**
   * When they took it back.
   *
   * IT STOPS FUTURE USE AND UNMAKES NOTHING ALREADY DONE, which
   * is `unpublish`'s own rule one person over: *"they answered a
   * version of this that existed and was consented to;
   * withdrawing now cannot unmake that."* What was broadcast last
   * week was broadcast. What has not gone out yet does not.
   *
   * SET RATHER THAN DELETED, so the record still says what was
   * agreed and when — a withdrawal that erased the consent would
   * erase the evidence that there had been any, which is the
   * opposite of an auditable record.
   */
  withdrawnAt?: string;
}

/**
 * What a participant said, made safe.
 *
 * NOTHING IS PRE-TICKED AND NOTHING IS INFERRED. A scope that is
 * not in the list was not agreed to, and an unknown word in the
 * list is dropped rather than guessed at — the same direction
 * `availabilityFrom` takes for the same reason: when the meaning
 * is permission, the safe reading of a word we do not know is
 * that it was not given.
 *
 * AND A RECORD THAT PERMITS NOTHING IS NOT A RECORD. Somebody who
 * agrees to none of it has not entered; writing an empty consent
 * would be filing a signature on a blank page.
 */
export function consentFrom(said: {
  termsHash?: unknown; permits?: unknown;
}, at: string): ConsentRecord | null {
  const hash = typeof said.termsHash === 'string' ? said.termsHash.trim() : '';
  if (!/^[a-f0-9]{64}$/.test(hash)) return null;
  const asked = Array.isArray(said.permits) ? said.permits : [];
  const permits = CONSENT_SCOPES.filter((scope) => asked.includes(scope));
  /*
   * ENTRY IS THE ONE THAT HAS TO BE THERE. The others are about
   * what happens to the work afterwards; without this one there
   * is no work to do anything with, and a record permitting
   * display but not entry describes nothing anybody can act on.
   */
  if (!permits.includes('entry')) return null;
  return { termsHash: hash, at, permits };
}

/**
 * Whether this consent permits a thing, now.
 *
 * ONE PREDICATE, ASKED EVERYWHERE, so a withdrawal cannot be
 * honoured by three surfaces and missed by the fourth. A
 * withdrawn record permits nothing at all — and it still says
 * what it once permitted, to whoever reads it. [D-19]
 */
export function permits(
  record: ConsentRecord | undefined, scope: ConsentScope,
): boolean {
  if (!record || record.withdrawnAt) return false;
  return record.permits.includes(scope);
}

/** Take it back. Future use stops; nothing already done is unmade. */
export function withdrawConsent(record: ConsentRecord, at: string): void {
  /*
   * THE FIRST WITHDRAWAL IS THE ONE THAT COUNTS. Pressing it
   * twice must not move the date forward, because the date is
   * when they said so.
   */
  if (!record.withdrawnAt) record.withdrawnAt = at;
}

/** What to tell somebody reading a record. One line, no jargon. */
export function consentSays(record: ConsentRecord | undefined): string {
  if (!record) return 'Nothing was agreed to.';
  if (record.withdrawnAt) {
    return 'Taken back. Nothing more may be done with this; what was '
      + 'already done stands.';
  }
  /*
   * NO PHRASE HERE CONTAINS *AND*, which a screenshot decided.
   * `entry` read *entered and judged*, and two agreed scopes came
   * out as *may be entered and judged and shown publicly* — a
   * sentence a person has to parse twice to find the list in. The
   * conjunction belongs to the join and to nothing else.
   */
  const named = record.permits.map((scope) => ({
    entry: 'entered in this call', display: 'shown publicly',
    clip: 'cut into something else', broadcast: 'broadcast',
  }[scope]));
  if (named.length === 1) return `Agreed: may be ${named[0]}.`;
  return `Agreed: may be ${named.slice(0, -1).join(', ')} and ${named.at(-1)}.`;
}
