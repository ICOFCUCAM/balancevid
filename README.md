# BalanceVid

**Turn videos into conversations.**

Watch any supported video. Stop it at the exact moment something needs an
answer. Respond with your voice, your camera, your annotations, your evidence.
Continue. Repeat. Publish the whole exchange as one polished video.

---

## Start here

**[`docs/DOCTRINE.md`](docs/DOCTRINE.md)** is the constitution of this product.

It contains the founding map in full — 52 sections, unabridged — with 38
inline upgrades resolving the decisions the map left open, plus 15 sections of
cross-cutting doctrine (invariants, testing, rights, accessibility, privacy,
performance budgets).

Read it before writing code. Every technical decision in this repository
defers to it.

### The short version

```
1   The document is the product. The video is an export of it.
2   The user's recorded speech is irreplaceable and is never lost.
3   A source quote is never altered, by a user or by a model.
4   AI never speaks as the user.
5   The resume frame equals the interrupt frame. Exactly.
6   Nothing is downloaded from a platform that forbids it.
7   Attribution is automatic and cannot be removed.
8   Captions ship with every render.
9   Every export is loudness-mastered.
10  A first-time user can do this with one key.
```

See `D-01 · The Non-Negotiables`.

---

## Status

Doctrine adopted. Implementation beginning — MVP scope is defined in §49 as
amended by `U-36`.
