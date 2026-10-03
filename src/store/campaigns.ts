/**
 * The campaign store.  [GO-VIRAL V-2; Doctrine D-25, D-06]
 *
 * A FIFTH STORE BESIDE THE FOURTH, and the fourth's own reason
 * says why: *"a request is not part of a production. It is what a
 * producer sent out and what came back, held where neither can be
 * mistaken for the other."* A campaign is not part of a
 * production either, and it is not a request — it CONTAINS N of
 * them and outlives all of them, so it cannot live inside one.
 *
 * WRITTEN THE WAY EVERY OTHER RECORD IN THIS PRODUCT IS: to a
 * temporary name, then renamed over the target. A half-written
 * file is a file that reads as corrupt, and a call that lost its
 * deadline because somebody closed a laptop mid-write is a call
 * nobody can judge.
 *
 * A DIRECTORY THAT IS NOT A CAMPAIGN IS SKIPPED, not thrown. The
 * list of calls is on the path to a surface people look at, and
 * showing nine of ten beats showing none. [D-21]
 */

import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';

import type { Campaign } from '../domain/campaign.js';
import { paths } from './paths.js';

export async function saveCampaign(campaign: Campaign): Promise<void> {
  const dir = paths.campaign(campaign.id);
  await mkdir(dir, { recursive: true });
  const target = paths.campaignDocument(campaign.id);
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(campaign, null, 2), 'utf8');
  await rename(temp, target);
}

export async function loadCampaign(id: string): Promise<Campaign> {
  return JSON.parse(
    await readFile(paths.campaignDocument(id), 'utf8')) as Campaign;
}

/** Every call this account has opened, newest first. */
export async function listCampaigns(): Promise<Campaign[]> {
  let names: string[];
  try {
    names = await readdir(paths.campaigns());
  } catch {
    return [];
  }
  const found: Campaign[] = [];
  for (const name of names) {
    try {
      found.push(await loadCampaign(name));
    } catch {
      /* Not a campaign, or half-written. */
    }
  }
  return found.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Load, change, save.
 *
 * NO LOCK, AND IT IS THE SAME DECISION `requests.ts` STATES. The
 * writers that can race on a campaign are one organiser's browser
 * and a clock nobody has built yet; when a campaign can be
 * advanced by something other than a person pressing a button,
 * this takes the directory lock the conversation store uses. [D-19]
 */
export async function mutateCampaign(
  id: string, change: (draft: Campaign) => void | Promise<void>,
): Promise<Campaign> {
  const campaign = await loadCampaign(id);
  await change(campaign);
  await saveCampaign(campaign);
  return campaign;
}
