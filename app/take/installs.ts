import type { Metadata, Viewport } from 'next';

/**
 * THE TAKE APP, AS SOMETHING THAT INSTALLS.
 *   [TAKE-PLATFORM P1, P6; TAKE-APP T2c, T13a; D-04, D-21]
 *
 * `/api/take/<link>/manifest` installs ONE ASSIGNMENT, for the
 * reason that route gives: what a performer sent a link wants on
 * their home screen is the song they were asked to sing, opening
 * straight into the recorder. That is still true, and it is a
 * different thing from what is installed here.
 *
 * THIS INSTALLS THE APPLICATION — the open calls, the channels on
 * air, the guide and this person's own library. Somebody who was
 * sent nothing had no way to keep it: the icons and the service
 * worker were already built and shipped, and the one file that
 * declares them an app was only ever composed per invitation. So
 * the Take App could be installed by a performer mid-assignment
 * and not by a user, which is the wrong way round. [D-21]
 *
 * AND THE RECORDER STILL NEEDS A LINK. Installing this does not
 * make a phone able to record into nothing — `/take/<link>` is a
 * different route, reached from an invitation the server issued,
 * and without one there is no production to record for and
 * nowhere to send it. The app is for finding something to take
 * part in; the invitation is what turns the camera on.
 *
 * DECLARED ON THE PAGES AND NOT ON A LAYOUT, which is the opposite
 * of `/tv`. A layout at `app/take/` would wrap `/take/<link>` too,
 * and that page carries its OWN manifest — two `<link
 * rel="manifest">` in one document and the browser picks one,
 * which would mean a performer installing the whole application
 * instead of their assignment, or the other way about, depending
 * on head order. A third app page belongs in a route group with
 * `app/take/(app)/layout.tsx`; two do not need one.
 */
export const INSTALLS: Metadata = {
  manifest: '/take-app/manifest.json',
  appleWebApp: { capable: true, title: 'Take', statusBarStyle: 'black-translucent' },
  icons: { apple: '/take-app/apple-touch-icon.png' },
};

/**
 * The app's own ground, so a phone that installed it paints the status
 * bar to match instead of flashing white on launch.
 *
 * IT IS A `viewport` EXPORT AND NOT A FIELD OF THE METADATA, and that
 * distinction was found by reading the head of the served page rather
 * than by reading Next's documentation. `themeColor` in a `Metadata`
 * object is accepted by the types, accepted by the build, and
 * SILENTLY DROPPED — no warning, no meta tag, and an installed app
 * that flashes white on every launch with nothing anywhere saying
 * why. Next moved the field to `viewport` and left the old spelling
 * type-valid. [U-02]
 *
 * The recorder at `/take/<link>` had the same line in the same wrong
 * place, and had had it for as long as it has been installable.
 */
export const GROUND: Viewport = { themeColor: '#0e0f11' };
