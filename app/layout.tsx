import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'BalanceVid',
  description:
    'A conversation editor for recorded media: interrupt a video at any moment, ' +
    'respond, resume exactly where it stopped, and publish the conversation.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
