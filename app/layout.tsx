import type { ReactNode } from 'react';
import './globals.css';

/**
 * WHAT A SHARED LINK SAYS ABOUT ITSELF.  [TV-NETWORK N-4]
 *
 * This is the sentence a search engine indexes and a social card
 * shows, for every page that does not set its own — so every
 * channel anybody shared was advertised as *"a conversation editor
 * for recorded media"*, which is a sentence about Studio One under
 * a link to a television station.
 *
 * The station pages set their own (`generateMetadata`), which is
 * the right answer for a channel. This is the right answer for
 * everything else: the product has four parts and this names
 * three of them.
 */
export const metadata = {
  title: 'BalanceVid',
  description:
    'Conversations, performances and television. Interrupt a video at any '
    + 'moment and respond, build a performance from takes, and run a channel '
    + 'that broadcasts around the clock.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
