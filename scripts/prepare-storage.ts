/**
 * Make the volume ready, before anything reads it.  [Doctrine U-25, D-06]
 *
 * The container starts three processes and they start together. Two of them
 * (the web tier, the worker) call `ensureDirs` on their own account; the
 * playout engine does not — it goes straight to `listChannels()`, because a
 * broadcast engine's first act is to find out what is on air.
 *
 * That is fine while the layout never changes and fatal the one time it
 * does: an instance whose work still sits at the pre-accounts addresses
 * would have its channels read from the new, empty one, find nothing, and
 * go off air — silently, and for as long as it took somebody to create a
 * conversation and trip the migration by accident.
 *
 * So the move happens HERE, once, before any of the three exist. A step in
 * the entrypoint rather than a race between the processes it starts.
 */

import { ensureDirs } from '../src/store/paths.js';

await ensureDirs();
console.log('serve: storage ready');
