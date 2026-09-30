/**
 * Which build is this?  [D-13; DESIGN, the twelfth decision]
 *
 * *"Could it be telling us that features written might not even be
 *  deployed?"*
 *
 * The product could not answer. What is tested here is the part that
 * makes the answer trustworthy: it is read from the process rather than
 * compiled in, and where it does not know, it says so instead of
 * inventing a version — because a version somebody cannot trust is
 * worse than none, being exactly the thing they would check before
 * concluding a deploy had not happened.
 */

import { describe, expect, it } from 'vitest';

import { deployment } from '../../src/web/deployment.js';

const SHA = '7ac615d0f1e2a3b4c5d6e7f8a9b0c1d2e3f4a5b6';

describe('what this installation says it is', () => {
  it('reads the platform’s own variables', () => {
    const now = deployment({
      DEPLOYPRO_GIT_SHA: SHA,
      DEPLOYPRO_DEPLOYMENT: 'dpl_123',
      DEPLOYPRO_ENV: 'production',
      DEPLOYPRO_URL: 'https://balancevid.deploypro.us',
    });
    expect(now.commit).toBe(SHA);
    expect(now.deployment).toBe('dpl_123');
    expect(now.environment).toBe('production');
    expect(now.url).toBe('https://balancevid.deploypro.us');
  });

  it('shortens the commit to what a person compares', () => {
    /* Seven is what git prints, and what somebody reads against a
       branch's head without counting forty hex digits. */
    expect(deployment({ DEPLOYPRO_GIT_SHA: SHA }).short).toBe('7ac615d');
  });

  it('says it does not know rather than inventing a version', () => {
    const blank = deployment({});
    expect(blank.commit).toBe('unknown');
    expect(blank.short).toBe('unknown');
    expect(blank.deployment).toBeUndefined();
    expect(blank.environment).toBeUndefined();
    expect(blank.url).toBeUndefined();
  });

  it('does not truncate `unknown` into something that looks like a hash', () => {
    expect(deployment({}).short).not.toBe('unknow');
  });

  it('treats an empty or blank value as not knowing', () => {
    /* A platform that sets the variable and leaves it empty has told
       us nothing, and `''` displayed is a version of the empty string. */
    expect(deployment({ DEPLOYPRO_GIT_SHA: '' }).commit).toBe('unknown');
    expect(deployment({ DEPLOYPRO_GIT_SHA: '   ' }).commit).toBe('unknown');
    expect(deployment({ DEPLOYPRO_ENV: '  ' }).environment).toBeUndefined();
  });

  it('trims what it is given', () => {
    expect(deployment({ DEPLOYPRO_GIT_SHA: ` ${SHA}\n` }).commit).toBe(SHA);
  });

  it('says when this process started', () => {
    /* Which is when this build went live HERE — a container restarted
       onto the same commit is a different answer to "since when". */
    expect(Date.parse(deployment({}).startedAt)).not.toBeNaN();
  });

  it('is read from the process by default', () => {
    /* No argument is the production call, and it must not throw or
       read a baked-in constant. */
    expect(() => deployment()).not.toThrow();
    expect(typeof deployment().commit).toBe('string');
  });
});
