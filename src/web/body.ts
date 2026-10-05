/**
 * How much this installation will take from a browser in one request.
 *   [Doctrine D-19, D-21, U-19]
 *
 * THE FAULT THIS EXISTS TO NAME. A 31 MB source video failed with
 * *"could not start the conversation — the server failed on
 * that"*, and nothing in this product was wrong. Next.js clones
 * the request body so middleware can read it, and that clone is
 * capped — `middlewareClientMaxBodySize`, which defaults to
 * **10 MB** in the version this runs on. Over the cap it does not
 * refuse: it ENDS THE STREAM EARLY and logs a warning on the
 * server. So the route was handed the first ten megabytes of a
 * multipart body with no closing boundary, `formData()` threw on
 * the truncation, and the person uploading was told the server
 * failed.
 *
 * Two things made it invisible. The cap only applies when a
 * `middleware.ts` exists — this product gained one with the
 * sign-in gate, and nothing about adding a gate suggests it
 * changes uploads. And a source added BY LINK is fetched by the
 * server, so it never crosses the cap: the one workaround people
 * found by accident is also the one that hid the cause.
 *
 * SO THE NUMBER LIVES HERE AND `next.config.mjs` IS HELD TO IT.
 * The config cannot import TypeScript, so the value is written
 * out in both places and `body.test.ts` fails when they drift.
 * One of them is the truth; the other is checked against it,
 * which is the only arrangement that survives somebody editing
 * the easy one. [D-19]
 *
 * WHY NOT SIMPLY UNLIMITED. The clone is held while the request
 * passes the gate, and `app/api/conversations/route.ts` then
 * reads the whole file with `arrayBuffer()` — so a single upload
 * is resident twice at its peak. On a 4 GB instance an unbounded
 * upload is an out-of-memory kill, which is a worse failure than
 * a refusal because it takes every other request with it.
 *
 * 512 MB covers a half-hour 1080p source at a normal bitrate,
 * which is the longest thing this product is for. Lifting it
 * further is not a bigger number: it is teaching the upload
 * route to stream to disk instead of buffering, after which this
 * constant stops being about memory at all.
 *
 * AND IT IS A TRANSPORT LIMIT, NOT A PRODUCT RULE. The library
 * keeps its own, narrower `MOST_UPLOAD_BYTES` (64 MB) — what a
 * library asset may be is a different question from what the
 * server will accept at all, and a narrower rule inside a wider
 * limit is not a second answer to one question.
 */
export const MOST_BODY_BYTES = 512 * 1024 * 1024;

/** The same number as the config has to spell it. */
export const MOST_BODY_LABEL = '512 MB';
