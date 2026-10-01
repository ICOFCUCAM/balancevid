/**
 * The picture the author supplies, and the door to it.
 * [Doctrine STUDIO-TWO §4, S-6, S-31; D-19]
 *
 * *"What about images and videos as backgrounds?"*
 *
 * THE PROMISE WAS MADE IN THREE PLACES AND KEPT IN NONE OF THE FOURTH.
 * `environment.ts` has told the operator for as long as it has existed —
 * *"For a real place behind you, use your own image"*. `Environment`
 * carries `kind: 'custom'` with an `assetId`. `setEnvironment` refuses
 * one without a picture. `compose.ts` loads the asset and cover-fits it
 * through the same matte as every drawn space.
 *
 * And Studio Two's shelf offered Original, Blur and the drawn spaces,
 * and never offered a picture. A sentence, a field, a validation and a
 * renderer, with no way in — which by this building's own rule is a
 * capability that does not exist.
 *
 * The shelf is read as source for the same reason `entrypoint.test.ts`
 * reads a shell script: the thing being protected is one tile, and the
 * alternative is a browser in a unit test.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { newPerformance, setEnvironment } from '../../src/domain/performanceEdit.js';
import { SPACES_ARE_DRAWN } from '../../src/domain/environment.js';

const SHELF = readFileSync(join(
  import.meta.dirname, '..', '..', 'app', 'p', '[id]', 'SwitchingStage.tsx'),
'utf8');

describe('the shelf offers the picture the renderer can already draw', () => {
  it('has a tile for it', () => {
    expect(SHELF).toContain("tile('custom'");
  });

  it('and somewhere to choose which picture', () => {
    expect(SHELF).toContain('picture-shelf');
    expect(SHELF).toContain('picture-option');
  });

  it('sets the environment the domain and the renderer both expect', () => {
    /* `kind: 'custom'` with an `assetId` — not a new shape invented at
       the edge of the screen for the renderer to guess at. [U-19] */
    expect(SHELF).toMatch(/kind:\s*'custom',\s*assetId/);
  });

  it('asks the library for pictures and not for everything', () => {
    /* A song in a backdrop picker is a row that cannot be chosen. */
    expect(SHELF).toMatch(/form === 'image'/);
  });
});

describe('what the document does with it', () => {
  const song = () => newPerformance('acct_owner', 'Song', {
    assetId: 'asset_song' as never, title: 'Song', class: 'own',
    durationSamples: 48_000 * 10,
  });

  it('refuses a custom background with no picture, and says so', () => {
    const p = song();
    expect(() => setEnvironment(p, 'nope', { kind: 'custom' }))
      .toThrow();
  });

  it('still tells the author a drawn space is not a photograph', () => {
    /* The sentence that promised this feature. It should keep saying so
       now that the promise is kept, because the two are different
       answers to the same question rather than one replacing the
       other. */
    expect(SPACES_ARE_DRAWN).toMatch(/use your own image/);
  });
});
