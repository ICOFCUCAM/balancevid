/**
 * "Yesterday", which is what a person scanning their own work is asking.
 *   [U-19]
 *
 * A DATE IS NOT AN ANSWER TO "WHEN DID I LAST TOUCH THIS". Somebody
 * looking down a list of things they made wants how long ago, and
 * "Monday" answers it while "2026-09-28" has to be converted in the
 * head. Past a week the conversion stops being free and the date is the
 * better answer.
 *
 * IT LIVES HERE BECAUSE THREE ROOMS ASK IT. It was written inside Studio
 * One's page when Studio One was the only room; a second copy in the
 * performance room would have been the first place the three lists
 * started to disagree, and the disagreement would have been one room
 * saying "Monday" while another said "28 Sep" about the same afternoon.
 */
export function when(at: string, now: number = Date.now()): string {
  const then = Date.parse(at);
  if (!Number.isFinite(then)) return '';
  const days = Math.floor((startOfDay(now) - startOfDay(then)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  /*
   * A WEEKDAY IS ONLY UNAMBIGUOUS INSIDE A WEEK. On the seventh day
   * "Monday" means either this Monday or the last one, and the reader
   * has no way to tell — so six is where it stops.
   */
  if (days < 7) {
    return new Date(then).toLocaleDateString(undefined, { weekday: 'long' });
  }
  return new Date(then).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short',
  });
}

function startOfDay(at: number): number {
  const day = new Date(at);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}
