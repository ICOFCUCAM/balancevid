/**
 * Recording a sound into the timeline.  [TIMELINE B6i, B7, B8; U-06]
 *
 * "Recording directly into the timeline is particularly powerful."
 *
 * The studio already had a recorder that gets the hard part right —
 * the song on the audio clock, the offset taken at the instant the
 * first segment closes, the count-in, the crash safety. What this adds
 * is a third SINK for it, and what this file defends is that it stayed
 * a third sink rather than becoming a second recorder. [D-19]
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { Ask } from '../../app/Confirm.js';
import type { MenuItem } from '../../app/Menu.js';
import { songMenuItems, type SongMenuHost } from '../../app/p/[id]/songMenu.js';
import { soundSink } from '../../app/p/[id]/soundSink.js';
import type { AssetId } from '../../src/domain/document.js';
import { newPerformance } from '../../src/domain/performanceEdit.js';
import { secondsToSamples } from '../../src/domain/time.js';

const ROOT = join(import.meta.dirname, '..', '..');
const code = (file: string) => readFileSync(join(ROOT, file), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** Every request the sink made, so the three steps can be read in order. */
function recorder(answers: Record<string, unknown>[] = []) {
  const sent: { url: string; method: string; body?: unknown }[] = [];
  let next = 0;
  const send = (async (url: string, init: RequestInit = {}) => {
    const body = typeof init.body === 'string'
      ? JSON.parse(init.body) : init.body;
    sent.push({ url: String(url), method: init.method ?? 'GET', body });
    const answer = answers[next] ?? { recordingId: 'rec_one' };
    next += 1;
    return new Response(JSON.stringify(answer), { status: 202 });
  }) as unknown as typeof fetch;
  return { sent, send };
}

describe('the three steps a recorded sound goes through', () => {
  const sink = () => soundSink('perf_1', () => ({ label: 'The intro', track: 'voice' }));

  /*
   * DECLARED BEFORE THE MEDIA EXISTS, exactly as a take is. A browser
   * that crashes halfway through a voice-over has still left the
   * segments it managed to send, and segments arriving for something
   * nobody declared would have nowhere to go. [U-06]
   */
  it('declares the recording first, and is handed somewhere to put it', async () => {
    const made = recorder([{ recordingId: 'rec_seven' }]);
    const original = globalThis.fetch;
    globalThis.fetch = made.send;
    try {
      expect(await sink().begin({
        label: 'x', environment: { kind: 'original' },
        offsetSamples: 0, method: 'measured',
      })).toBe('rec_seven');
    } finally { globalThis.fetch = original; }
    expect(made.sent[0]?.url).toBe('/api/performances/perf_1/sounds/recording');
    expect(made.sent[0]?.method).toBe('POST');
    /* Nothing is decided at this point — not even the name. */
    expect(made.sent[0]?.body).toBeUndefined();
  });

  it('sends each segment under its own number', async () => {
    const made = recorder();
    const original = globalThis.fetch;
    globalThis.fetch = made.send;
    try {
      await sink().chunk('rec_one', 3, new Blob(['x']));
    } finally { globalThis.fetch = original; }
    expect(made.sent[0]?.url)
      .toBe('/api/performances/perf_1/sounds/recording/rec_one?index=3');
  });

  /*
   * THE PLACEMENT IS `hintSamples`, WHOLE, AND NOT ADDED TO ANYTHING.
   *
   * The hook already counts it from the top of the SONG: it adds the
   * playhead it was started from to how far into the count-in the
   * recorder actually opened. The first version of the sink added the
   * playhead a second time — a voice-over started at 02:00 would have
   * landed at 04:00, which is the exact doubling the hook's own
   * comment warns about two lines above where that number is made.
   */
  it('places it where the recorder says the song was, and not twice', async () => {
    const made = recorder([{ job: { id: 'job_9' } }]);
    const original = globalThis.fetch;
    globalThis.fetch = made.send;
    let answered;
    try {
      answered = await sink().finish('rec_one', {
        hintSamples: secondsToSamples(120),
        elapsedSamples: secondsToSamples(8),
        latencySamples: 0,
      });
    } finally { globalThis.fetch = original; }
    expect(answered?.jobId).toBe('job_9');
    expect(made.sent[0]?.method).toBe('PUT');
    expect(made.sent[0]?.body).toEqual({
      label: 'The intro', track: 'voice',
      fromSample: secondsToSamples(120),
    });
  });

  /* A recorder that somehow reports a negative moment is a recorder
     whose sound belongs at the start, not before it. */
  it('never places a sound before the song', async () => {
    const made = recorder([{ job: { id: 'job_9' } }]);
    const original = globalThis.fetch;
    globalThis.fetch = made.send;
    try {
      await sink().finish('rec_one', {
        hintSamples: -5000, elapsedSamples: 1, latencySamples: 0,
      });
    } finally { globalThis.fetch = original; }
    expect((made.sent[0]?.body as { fromSample: number }).fromSample).toBe(0);
  });

  /*
   * THE NAME IS ASKED FOR AT THE END, NOT REMEMBERED FROM THE START.
   *
   * The sink is built once and the name is typed later. The first
   * version took an object and captured whatever the name was when
   * the component mounted, so every voice-over was filed as
   * "Voice-over" however carefully the author had named it — correct
   * everywhere on the way in, wrong in the one place it is kept. The
   * browser found it; no test here could have.
   */
  it('asks for the name when the recording ends, not when the sink is made', async () => {
    let called = 'first';
    const late = soundSink('perf_1', () => ({ label: called, track: 'voice' as const }));
    called = 'The introduction';
    const made = recorder([{ job: { id: 'job_9' } }]);
    const original = globalThis.fetch;
    globalThis.fetch = made.send;
    try {
      await late.finish('rec_one', {
        hintSamples: 0, elapsedSamples: 1, latencySamples: 0,
      });
    } finally { globalThis.fetch = original; }
    expect((made.sent[0]?.body as { label: string }).label).toBe('The introduction');
  });

  it('escapes a performance id rather than pasting it into a path', () => {
    const made = recorder();
    const original = globalThis.fetch;
    globalThis.fetch = made.send;
    try {
      void soundSink('a/b', () => ({ label: 'x', track: 'voice' }))
        .chunk('rec_1', 0, new Blob());
    } finally { globalThis.fetch = original; }
    expect(made.sent[0]?.url).toContain('/api/performances/a%2Fb/sounds/recording');
  });
});

describe('one recorder, three sinks', () => {
  const stage = code('app/p/[id]/SwitchingStage.tsx');
  const hook = code('app/p/[id]/useMasterRecording.ts');

  /*
   * THE HARD PART IS NOT COPIED. The count-in, the audio clock, the
   * offset taken when the first segment closes and the crash safety
   * all live in one hook; a voice-over gets them by being a third
   * destination for it. [D-19]
   */
  it('records a voice-over with the hook takes are recorded with', () => {
    expect(stage).toMatch(/const voice = useMasterRecording\(\{/);
    expect(stage).toMatch(/sink: useMemo\(\(\) => soundSink\(performance\.id, \(\) => \(\{/);
    /* And not by a second recorder written beside it. */
    expect(stage).not.toMatch(/new MediaRecorder|getUserMedia/);
  });

  /*
   * NO CAMERA FOR A SOUND. Asking for one the recording will not use
   * costs a permission prompt, a light on the machine and the
   * author's trust, all for a stream that is thrown away.
   */
  it('asks for a microphone and not a camera', () => {
    expect(stage).toMatch(/audioOnly: true,/);
    expect(hook).toMatch(/video: audioOnly\s*\?\s*false/);
    /* And says the right word when it cannot get one. */
    expect(hook).toMatch(/audioOnly \? 'microphone' : 'camera'/);
  });

  /*
   * AND THE MICROPHONE GOES OFF WHEN THE SOUND IS KEPT.
   *
   * A take recorder stays armed, because the next thing an author
   * does is record the same song again. A voice-over is one sentence
   * at one moment, and the browser showed the bar still offering
   * "Start" over a sound that had already landed — a microphone left
   * on after the thing it was turned on for. [U-19]
   */
  it('turns the microphone off once the recording is kept', () => {
    expect(stage).toMatch(/once: true,/);
    /*
     * AND IT IS THE HOOK'S DECISION, NOT THE CALLER'S. The first
     * version called `disarm()` from `onFinished`, which the hook
     * calls from inside `finishTake` — whose `finally` then set the
     * phase straight back to 'ready', so the bar reappeared offering
     * "Start" over a sound that had already landed.
     */
    expect(hook).toMatch(/if \(once\) disarm\(\);\s*\n\s*else setPhase\('ready'\);/);
    expect(stage).not.toMatch(/\.disarm\(\);\s*\n\s*void watchSound/);
  });

  /* Armed from the playhead, and placed from there: the arithmetic
     that makes recording into a timeline worth having. [B7a] */
  it('starts the song from the playhead the row was raised at', () => {
    expect(stage).toMatch(/voiceFrom\.current = at;/);
    expect(stage).toMatch(
      /voice\.start\(voiceLabel\.current,\s*\{ kind: 'original' \}, voiceFrom\.current\)/);
  });

  /*
   * THE MICROPHONE IS VISIBLE WHILE IT IS ON, on the timeline rather
   * than in a dialogue over it: the thing being recorded INTO is the
   * timeline, and a modal would hide the playhead the author is
   * watching. [U-19]
   */
  it('shows what the microphone is doing, beside the lanes', () => {
    expect(stage).toMatch(/data-testid="voice-recorder" data-phase=\{voice\.phase\}/);
    for (const id of ['voice-go', 'voice-stop', 'voice-cancel']) {
      expect(stage, id).toContain(`data-testid="${id}"`);
    }
    /* And a lane opposite it, or every row under it shifts. */
    expect(stage).toMatch(
      /\{voice\.phase !== 'idle' && <div style=\{\{ height: 26 \}\} \/>\}/);
  });
});

describe('the row that starts it', () => {
  const SONG = secondsToSamples(240);
  function host(recordSound?: (at: number) => void): SongMenuHost {
    return {
      performance: newPerformance('A Performance', {
        assetId: 'asset_song' as AssetId, title: 'The Ancient of Days',
        class: 'own', durationSamples: SONG,
      }, '2026-09-30T00:00:00.000Z'),
      patch: () => undefined,
      confirm: (_ask: Ask) => undefined,
      at: () => secondsToSamples(60),
      ...(recordSound ? { recordSound } : {}),
    };
  }
  const row = (one: SongMenuHost) => songMenuItems(one)
    .find((item) => item && item.label === 'Record a sound here…') as MenuItem;

  it('is on the song’s menu and records from the playhead', () => {
    let where: number | null = null;
    const item = row(host((at) => { where = at; }));
    expect(item).toBeTruthy();
    item.onSelect?.();
    expect(where).toBe(secondsToSamples(60));
  });

  it('is present and greyed where it cannot be done', () => {
    expect(row(host()).disabled).toBe('not from here');
  });

  /* Behind "More": adding a file is the common case and recording is
     the deliberate one. [B9] */
  it('is behind one press, where the deliberate rows are', () => {
    expect(row(host(() => undefined)).advanced).toBe(true);
    const add = songMenuItems(host(() => undefined))
      .find((item) => item && item.label === 'Add a sound here…') as MenuItem;
    expect(add.advanced).toBeUndefined();
  });
});

describe('what the server does with a recorded sound', () => {
  const begin = code('app/api/performances/[id]/sounds/recording/route.ts');
  const parts = code('app/api/performances/[id]/sounds/recording/[recordingId]/route.ts');
  const worker = code('src/worker/index.ts');

  /* An id out of a URL becomes a directory path, so it is checked
     against a shape before it is used for anything. [INV-15] */
  it('refuses an id that is not one of ours before touching the disk', () => {
    expect(parts).toMatch(/const RECORDING = \/\^rec_\[A-Za-z0-9\]\{1,64\}\$\//);
    expect(parts.match(/if \(!RECORDING\.test\(recordingId\)\) return fail\(400/g))
      .toHaveLength(2);
  });

  /* Nothing is decided when the recording is declared — the recorder
     does not yet know where the song was when capture began. */
  it('decides nothing at the start, and everything at the end', () => {
    expect(begin).not.toMatch(/fromSample|track|label/);
    expect(parts).toMatch(/TRACKS\.has\(asked\) \? asked : 'voice'/);
    expect(parts).toMatch(/Math\.max\(0, Math\.min\(\s*performance\.master\.durationSamples/);
  });

  /* A finish with nothing behind it would queue the worker to join a
     directory that does not exist. */
  it('refuses to finish a recording that produced nothing', () => {
    expect(parts).toMatch(/if \(landed\.count === 0\) return fail\(409, 'nothing was recorded'\)/);
  });

  /*
   * AND THE SEGMENTS ARE JOINED BY THE CODE EVERY OTHER RECORDING IN
   * THIS PRODUCT IS JOINED BY — the concat FILTER, never the demuxer,
   * which silently keeps only the first segment of browser-captured
   * media. An upload and a recording differ for exactly one line.
   */
  it('joins segments the way every other recording here is joined', () => {
    const body = worker.slice(
      worker.indexOf('async function ingestSound'),
      worker.indexOf('async function ingestPlate'));
    expect(body).toMatch(/joinSoundSegments\(/);
    /* And NOT the take joiner, whose filtergraph asks for a video
       stream in its first line: a voice-over has no picture, and
       ffmpeg's answer to that is "Stream specifier ':v' matches no
       streams" — which is what the first browser run of this
       produced. */
    expect(body).not.toMatch(/joinPerformanceSegments\(/);
    expect(body).toMatch(/if \(job\.payload\['chunkDir'\]\) \{/);
    expect(body).toMatch(/originalPath = String\(job\.payload\['originalPath'\]\);/);
    /* One measurement, one placement, whichever way it arrived. */
    expect(body.match(/decodeToAnalysis\(/g)).toHaveLength(1);
    expect(body.match(/addSound\(draft, layer\)/g)).toHaveLength(1);
  });
});
