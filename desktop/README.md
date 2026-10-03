# Take Software for desktop

**A multi-camera capture station.** Not the phone Take App with a
bigger window — a different program for a different job.

> *"Phone Take = personal participation. Desktop Take = multi-camera
> capture station."*
> — `docs/TAKE-DESKTOP.md`

The frozen flow is **CONNECT → CAMERAS → PREPARE → RECORD → REVIEW →
SUBMIT**, and everything up to SUBMIT works with no network, because
the brief says the recording must not depend on one.

## What this build is

**T-1: the shell.** It installs, opens a window, and says it is not
connected to anything. The six steps are drawn with five of them grey.
That is a complete and honest first release; a window saying "coming
soon" says nothing a person can plan around.

`BUILT_TO` in `src/shell.ts` is the one constant that says how far the
application has got. The stage that builds a step moves it.

## Why Electron

This application's whole job is four cameras starting together, and
`useMasterRecording` in the installation already does that against
Chromium's `MediaRecorder`. **Electron ships one Chromium on every
platform it builds for.**

A webview shell — Tauri and everything like it — uses the operating
system's own engine: WebKitGTK on Linux, WebView2 on Windows. That is
a different `MediaRecorder`, different codec support and different
device enumeration per platform, and the single claim a capture makes
is that its angles agree about when they started. A capture station
whose measurement depends on which operating system it is on is not
one.

The cost, stated: a Chromium per install. T-4 is the stage that
cashes it.

## Running it

```sh
cd desktop
npm install
npm start            # build, then open the window
npm run typecheck
```

`npm install` here is separate from the repository root's on purpose.
A root npm workspace would make the web application's install — and
its CI — pull three hundred megabytes of Chromium for a build that
does not use it.

## The shared library

`shared/src/time.ts` and `shared/src/align.ts` are imported by relative
path and bundled in by esbuild. They are **depended on, never copied**:
a desktop recorder with its own `HOUSE_SAMPLE_RATE` is a capture
station that disagrees with the installation it submits to, measured
in samples by somebody looking at a waveform six months later.

The window prints `48000 Hz · 30 fps` for exactly this reason — read
out of the shared library, not typed. `test/domain/shared-library.test.ts`
fails if it is ever typed.

## Packaging

```sh
npm run package      # Linux: AppImage and .deb, into release/
npm run package:win  # Windows: an NSIS installer
```

**Linux is built and verified.** `Take-0.1.0.AppImage` (117 MB) and
`balancevid-take-desktop_0.1.0_amd64.deb` (81 MB) build from this
configuration, and the AppImage was run and inspected: it opens the
window, draws the six steps, and reads the house rates out of
`shared/`. The package contains `out/` and `package.json` and nothing
else — no `src/`, no web tier.

**Windows is configured and not verified here.** Cross-building from
Linux stops at `rcedit`, which electron-builder runs to put the icon
and version into the `.exe` and which needs **wine**; there is none in
this container. It is not a configuration fault — the same file
produces the installer on a machine with wine, or on Windows.

## Signing, and why there is none

**Nothing is signed.** Signing needs a certificate from a certificate
authority — an Authenticode certificate on Windows, an Apple Developer
ID on macOS — which is a purchase and an identity, not a build
setting. Until there is one, Windows SmartScreen warns about this
installer, **and that warning is accurate**.

macOS is deliberately absent from `electron-builder.yml`: building for
it needs a Mac and shipping for it needs notarisation, which needs the
Developer ID above. Half a macOS target would be a target that fails
and teaches everybody to ignore a red build.

## Releasing

**By hand, and there is no CI workflow for it.** Two reasons, and the
second is the one that decided it:

1. A release needs the signing identity above, and there is none.
2. The repository's build pipeline deploys the web application.
   A second workflow producing binaries is a second thing that can
   fail on a push that has nothing to do with it — and the standing
   rule about this repository's CI is that it does not grow jobs that
   fight the deployment.

`publish: null` in `electron-builder.yml` says the same thing to the
tool: no auto-update server. An application that phones home for a new
version is an application that phones home, and the premise here is
that recording does not depend on the internet. Updating is
downloading the next release, as it is for ffmpeg.
