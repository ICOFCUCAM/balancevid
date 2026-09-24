/**
 * Paged documents.  [Doctrine U-33 §2]
 *
 * A deck is ONE citation with many pages, not many citations. It was
 * retrieved once, hashed once and cited once; which page is on screen is a
 * property of the moment being spoken, which is what the locator is for.
 */
import { describe, expect, it } from 'vitest';
import { evidenceCapture } from '../../src/domain/document.js';
import type { AssetId, Evidence } from '../../src/domain/document.js';

const deck = (page?: number, pages = 4): Evidence => ({
  id: 'ev_deck' as never,
  kind: 'document',
  title: 'Lecture one',
  captureAssetId: 'asset_dp1' as AssetId,
  pageAssetIds: Array.from({ length: pages }, (_, i) => `asset_dp${i + 1}`) as AssetId[],
  pageCount: pages,
  retrievedAt: '2026-01-01T00:00:00.000Z',
  locator: page === undefined ? {} : { page },
  archived: true,
});

describe('the page being cited', () => {
  it('is page one when nothing says otherwise', () => {
    expect(evidenceCapture(deck())).toBe('asset_dp1');
  });

  it('is the page the locator names, counted from one as people count', () => {
    expect(evidenceCapture(deck(1))).toBe('asset_dp1');
    expect(evidenceCapture(deck(3))).toBe('asset_dp3');
    expect(evidenceCapture(deck(4))).toBe('asset_dp4');
  });

  it('falls back to a real page rather than showing nothing', () => {
    // A citation pointing past the pages prepared is still a citation; a
    // blank panel tells the viewer nothing about why it is blank.
    expect(evidenceCapture(deck(99))).toBe('asset_dp4');
    expect(evidenceCapture(deck(0))).toBe('asset_dp1');
    expect(evidenceCapture(deck(-2))).toBe('asset_dp1');
  });

  it('is the single capture when the document has no pages', () => {
    const image: Evidence = {
      id: 'ev_img' as never, kind: 'image', title: 'A photograph',
      captureAssetId: 'asset_img' as AssetId,
      retrievedAt: '2026-01-01T00:00:00.000Z', locator: { page: 7 }, archived: true,
    };
    expect(evidenceCapture(image)).toBe('asset_img');
  });

  it('is nothing when there is nothing to show', () => {
    const stored: Evidence = {
      id: 'ev_raw' as never, kind: 'document', title: 'A spreadsheet',
      retrievedAt: '2026-01-01T00:00:00.000Z', locator: {}, archived: true,
      archiveNote: 'stored and hashed; export it as a PDF to show its pages',
    };
    expect(evidenceCapture(stored)).toBeUndefined();
  });
});
