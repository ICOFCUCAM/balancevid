import SignIn from './SignIn.js';

export const dynamic = 'force-dynamic';

export default async function SignInPage(
  { searchParams }: { searchParams: Promise<{ next?: string }> },
) {
  const { next } = await searchParams;
  const configured = Boolean(
    process.env['BALANCEVID_PASSWORD_HASH']?.trim() || process.env['BALANCEVID_PASSWORD']?.trim(),
  );
  // Only ever a path on this site: a `next` of https://elsewhere/ would make
  // the sign-in page an open redirect.
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  return <SignIn configured={configured} next={safeNext} />;
}
