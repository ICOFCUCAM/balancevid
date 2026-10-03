# shared

**The arithmetic both pieces of software depend on.**

Two programs read what is in here: the BalanceVid installation
(`src/`, `app/`) and Take Software for desktop (`desktop/`). They are
separate applications with separate releases, and this is the only
code they have in common.

> *"`align.ts` and `time.ts` are depended on, not pasted. Two copies of
> alignment arithmetic is two answers."*
> — `docs/TAKE-DESKTOP.md`, *What must not happen*

## What belongs here

Arithmetic over numbers, and nothing else. Every file in this
directory must:

- import nothing but other files in this directory,
- touch no filesystem, no network, no clock, no DOM and no React,
- hold no knowledge of how either application stores or draws
  anything.

`time.ts` imports nothing at all. `align.ts` imports `time.ts`. That
is the whole dependency graph, and it is checked:
`test/domain/shared-library.test.ts` fails if a file here reaches
outside, and fails if the arithmetic reappears under `src/`.

## What does not belong here

A thing used by both applications is not automatically shared code.
The test is whether the two would otherwise have to **agree about a
number**. Alignment and the clocks qualify: a desktop recorder with
its own `HOUSE_SAMPLE_RATE` is a capture station that disagrees with
the installation it submits to, measured in samples by somebody
looking at a waveform six months later.

A type, a label, a validation rule or a shape of JSON does not
qualify on its own. Those are a protocol, and a protocol belongs to
whichever side defines it.

## How it is depended on

By relative path, from both sides:

```ts
// src/domain/time.ts          — the installation's door
export * from '../../shared/src/time.js';

// desktop/src/...             — the application's own import
import { HOUSE_SAMPLE_RATE } from '../../shared/src/time.js';
```

**Not as an npm workspace**, deliberately. A root workspace would
make `npm install` for the web application pull Electron and its
three hundred megabytes of Chromium, on every developer machine and
in CI, for a build that does not use it. The two applications
install separately and share a directory.

**Not published to a registry** either — yet. That is the right
answer the day `desktop/` becomes its own repository, and the wrong
one while a single `git mv` keeps them in step.

## The doors

`src/domain/time.ts` and `src/domain/align.ts` are one line each:
`export * from` the file here. A hundred and twenty-one files in the
installation import those paths, and the desktop application's
directory layout has no business appearing in any of them.
