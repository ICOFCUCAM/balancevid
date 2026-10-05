/**
 * How much this installation takes in one request.
 *   [Doctrine D-19, D-21, U-19]
 *
 * A 31 MB source video failed with *"could not start the
 * conversation — the server failed on that"*, and nothing in
 * this product was wrong. Next clones the request body so
 * middleware can read it and caps the clone at 10 MB by
 * default; over the cap it does not refuse, it ENDS THE STREAM
 * EARLY. So the route got the first ten megabytes of a
 * multipart body with no closing boundary and `formData()`
 * threw.
 *
 * TWO THINGS MADE IT INVISIBLE, and both are worth a test
 * rather than a memory. The cap exists only because a
 * `middleware.ts` exists — this product gained one with the
 * sign-in gate, and nothing about a gate suggests it changes
 * uploads. And a source added BY LINK never crosses it, so the
 * workaround people found by accident also hid the cause.
 *
 * The number therefore has to be stated, agreed between two
 * files that cannot import each other, and enforced where
 * somebody can read the reason.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MOST_BODY_BYTES, MOST_BODY_LABEL } from '../../src/web/body.js';

const ROOT = join(import.meta.dirname, '..', '..');

describe('the transport limit', () => {
  /*
   * THE CONFIG AND THE CONSTANT ARE ONE NUMBER IN TWO FILES, and
   * they cannot be made one: `next.config.mjs` is loaded before
   * any TypeScript exists, so it cannot import the constant. One
   * of them is the truth and the other is checked against it,
   * which is the only arrangement that survives somebody editing
   * the easy one. [D-19]
   */
  it('is the same number in the config as in the domain', async () => {
    const config = await import(join(ROOT, 'next.config.mjs')) as {
      default: { experimental?: { middlewareClientMaxBodySize?: number } };
    };
    expect(config.default.experimental?.middlewareClientMaxBodySize)
      .toBe(MOST_BODY_BYTES);
  });

  /*
   * AND IT IS ACTUALLY RAISED. The whole fault was a 10 MB
   * default nobody had chosen; a config that happened to set it
   * back to the default would pass the agreement test above and
   * fix nothing.
   */
  it('is larger than the default that caused the fault', () => {
    expect(MOST_BODY_BYTES).toBeGreaterThan(10 * 1024 * 1024);
  });

  /*
   * THE LABEL IS WHAT A PERSON IS TOLD, so it has to be the
   * number they are actually subject to. A refusal saying
   * "up to 512 MB" over a 256 MB limit is a refusal that reads
   * as a bug in the server.
   */
  it('is described to people as the size it really is', () => {
    expect(MOST_BODY_LABEL)
      .toBe(`${Math.round(MOST_BODY_BYTES / (1024 * 1024))} MB`);
  });

  /*
   * AND THE LIBRARY'S NARROWER RULE STILL FITS INSIDE IT. What a
   * library asset may be is a different question from what the
   * server will accept at all; a narrower rule inside a wider
   * limit is not a second answer. A library ceiling ABOVE the
   * transport limit would be — it would offer an upload the
   * server truncates.
   */
  it('is wide enough for every product rule inside it', async () => {
    const { MOST_UPLOAD_BYTES } = await import(
      '../../src/domain/libraryUpload.js');
    expect(MOST_UPLOAD_BYTES).toBeLessThanOrEqual(MOST_BODY_BYTES);
  });
});

describe('the upload route', () => {
  const route = readFileSync(
    join(ROOT, 'app', 'api', 'conversations', 'route.ts'), 'utf8');

  /*
   * IT REFUSES RATHER THAN BUFFERS. The route reads the whole
   * file with `arrayBuffer()`, so without a ceiling a large
   * upload is an out-of-memory kill — which takes every other
   * request on the instance with it, and is a worse failure
   * than a refusal.
   */
  it('refuses a file larger than the limit', () => {
    expect(route).toContain('MOST_BODY_BYTES');
    expect(route).toMatch(/fail\(413/);
  });

  /*
   * MEASURED, NOT BELIEVED.  [U-02]
   *
   * The first version of this refused on `Content-Length` first,
   * as a cheap early-out. `studio-one.test.ts` failed it, and
   * was right twice over: this product's rule is that a size is
   * counted from the artefact rather than read off a header —
   * the fetch path in the same file counts bytes as it streams —
   * and the early-out bought nothing, because a client that
   * understates the header is read by `formData()` anyway. The
   * only request it ever turned away was an honest one.
   */
  it('measures the file rather than believing a header', () => {
    expect(route).toMatch(/file\.size > MOST_BODY_BYTES/);
    expect(route).not.toContain("headers.get('content-length')");
  });

  /* A refusal nobody can act on is a refusal that generates a
     support question. It names the size, the limit and the way
     round it. [U-19] */
  it('says the size, the limit and what to do instead', () => {
    expect(route).toContain('MOST_BODY_LABEL');
    expect(route).toMatch(/by link/i);
  });
});
