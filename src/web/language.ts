/**
 * What the creator reads.  [Doctrine D-13]
 *
 * The doctrine's identifiers — INV-01, U-35 §6, "Class B" — are precise, and
 * they belong in the code, the audit log, the tests and the invariant that
 * throws. They do not belong on the screen of someone who is trying to answer
 * a video.
 *
 * "INV-01: cannot build a COMPOSED plan for a Class B source" tells an
 * engineer exactly what happened. It tells a creator that they have done
 * something wrong, which is false, and gives them nothing to do about it.
 * The same fact, said in product language, is: this video stays on YouTube,
 * so your responses publish alongside it.
 *
 * Both survive. The rule keeps its code for the log; the person gets a
 * sentence. Neither is a translation of the other — they are written for
 * different readers.
 */

const RULES: Record<string, string> = {
  'INV-01':
    'This video stays on its own platform, so it cannot be cut into a single '
    + 'combined file. Your responses publish alongside it instead, as a player '
    + 'that drives the original.',
  'INV-04':
    'The source is still being prepared. This will work as soon as that finishes.',
  'INV-02':
    'Something went wrong lining the cuts up. Nothing has been lost — try again, '
    + 'and tell us if it keeps happening.',
  'INV-05':
    'The quoted statement no longer matches the transcript, so it was not '
    + 'attached. Re-select the sentence you meant.',
  'INV-06':
    'A suggestion needs a name against it before it can be used.',
  'INV-07':
    'An export has to carry captions and a credit to the original. Something is '
    + 'missing, so it was not produced.',
};

/** A sentence for a person, given a rule code. Falls through unchanged. */
export function forCreator(code: string | undefined, fallback: string): string {
  if (code && RULES[code]) return RULES[code]!;
  return stripCitations(fallback);
}

/**
 * Remove doctrine citations from a message written for engineers.
 *
 * A safety net rather than the main mechanism: the main mechanism is writing
 * the creator's sentence deliberately. This catches the ones nobody has got
 * to yet, so a bracketed clause never reaches a screen.
 */
export function stripCitations(text: string): string {
  return text
    .replace(/\s*\[(?:Doctrine\s+)?[A-Z]+-\d+[^\]]*\]/g, '')
    .replace(/\s*\((?:Doctrine\s+)?(?:INV|U|D)-\d+[^)]*\)/g, '')
    .replace(/^(?:INV|U|D)-\d+:\s*/, '')
    .replace(/\s*\[(?:U|D|INV)-\d+[^\]]*\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Source classes are an engineering distinction. These are the two products. */
export function sourceKindLabel(sourceClass: 'A' | 'B'): string {
  return sourceClass === 'A' ? 'Your own copy' : 'Plays on its own platform';
}
