import { ChannelEditError, newChannel } from '../../../src/domain/channelEdit.js';
import { isOwner } from '../../../src/auth/request.js';
import {
  auditChannel, listChannels, saveChannel,
} from '../../../src/store/channels.js';
import { fail, json } from '../../../src/web/http.js';

export const dynamic = 'force-dynamic';

/**
 * The channels there are.  [Doctrine CHANNEL §1]
 *
 * Owner-only, like the other two libraries: which channels exist, and what is
 * scheduled on them, is the broadcaster's business until they publish one.
 */
export async function GET(request: Request): Promise<Response> {
  if (!(await isOwner(request))) return fail(404, 'not found');
  const channels = await listChannels();
  return json({ channels });
}

/**
 * A channel begins.  [§1, §2]
 *
 * With a name and a zone and nothing else — no media, because a channel never
 * holds any, and no schedule, because an empty schedule is a legitimate
 * channel that is off air. [D-18]
 */
export async function POST(request: Request): Promise<Response> {
  if (!(await isOwner(request))) return fail(404, 'not found');
  const body = await request.json().catch(() => ({})) as {
    name?: string; timezone?: string;
  };
  try {
    const channel = newChannel(
      body.name ?? '',
      /*
       * The server's zone is not a default, it is a coincidence. A channel
       * created on a machine in Virginia for a broadcaster in Lagos would
       * have a schedule five hours out and nothing would say so — so the zone
       * is asked for, and UTC is the fallback because it is the one zone that
       * is never secretly wrong. [§2]
       */
      body.timezone ?? 'UTC',
      new Date().toISOString(),
    );
    await saveChannel(channel);
    await auditChannel(channel.id, {
      action: 'channel.created',
      detail: { name: channel.name, timezone: channel.timezone },
    });
    return json({ channel }, { status: 201 });
  } catch (error) {
    if (error instanceof ChannelEditError) return fail(400, error.message);
    throw error;
  }
}
