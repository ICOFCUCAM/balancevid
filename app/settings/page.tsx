import { theAccount } from '../../src/store/accounts.js';
import { bytesLabel, diskSpace } from '../../src/store/space.js';
import { runtime } from '../../src/web/runtime.js';
import pkg from '../../package.json' with { type: 'json' };
import Settings from './Settings.js';

export const dynamic = 'force-dynamic';

/**
 * Settings.  [Doctrine §19, D-24, U-24]
 *
 * THIS EXISTS BECAUSE THE RAIL POINTED AT IT. The building's own rule is
 * that every row goes somewhere — a menu that lies is worse than a short
 * one — and the redesigned rail grew a Settings row before there was a
 * page behind it. The honest options were to remove the row or to build
 * the page, and there is one real setting: the account is created with
 * the name "Owner" before anybody has been asked anything, and that
 * default is then the word the whole product greets them with.
 *
 * WHAT IS NOT HERE. No theme switch, because the building is lit and the
 * studios are dark for a stated reason rather than a preference. No
 * notification preferences, because nothing notifies anybody. No
 * "advanced" section holding one checkbox. A settings page that is mostly
 * headings is a settings page that has been designed rather than needed.
 */
export default async function SettingsPage() {
  const [account, space] = await Promise.all([theAccount(), diskSpace()]);
  return (
    <Settings
      account={{ id: account.id, name: account.name, createdAt: account.createdAt }}
      runtime={runtime()}
      version={`v${(pkg as { version: string }).version}`}
      space={{
        used: bytesLabel(space.usedBytes),
        free: bytesLabel(space.freeBytes),
        total: bytesLabel(space.totalBytes),
      }}
    />
  );
}
