/**
 * TWO LETTERS IN THE PLATFORM'S COLOUR, rather than a logo file.
 *
 * A row of five identical grey squares is a row nobody scans: the whole
 * value of a platform badge is being recognised before it is read.
 * Colour does that, and the letters do it again for anybody who cannot
 * see the colour — which is the U-19 rule arriving somewhere it is easy
 * to forget, because a brand mark feels like decoration. [U-19]
 *
 * They are letterforms and not the brands' own marks on purpose: a
 * trademarked logo redistributed in a product is a licensing question
 * nobody here has asked, and these say the same thing.
 */
export const MARK: Record<string, { text: string; ink: string; wash: string }> = {
  own: { text: 'BV', ink: 'var(--studio-tv)', wash: 'var(--studio-tv-wash)' },
  youtube: {
    text: 'YT', ink: 'var(--platform-youtube)',
    wash: 'var(--platform-youtube-wash)',
  },
  facebook: {
    text: 'f', ink: 'var(--platform-facebook)',
    wash: 'var(--platform-facebook-wash)',
  },
  tiktok: {
    text: 'TT', ink: 'var(--platform-tiktok)',
    wash: 'var(--platform-tiktok-wash)',
  },
  x: { text: 'X', ink: 'var(--platform-x)', wash: 'var(--platform-x-wash)' },
};

/*
 * IT LIVES HERE BECAUSE TWO SURFACES DRAW IT. The home page's
 * distribution panel and the control room's own list both show the five
 * destinations, and five colours written in two components are five
 * colours that will eventually be written differently — which is the
 * argument `platforms.css` already makes about the same values. [D-19]
 */
