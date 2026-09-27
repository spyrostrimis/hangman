# state.md — Hangman: Rescue Mission
# Living status. Full regen on "update state.md". Why→diary; what-now→here.
UPDATED: 2026-09-27 (accounts live; Phase 4 Illucia planned; HARD RULES v4)

FOCUS: **Three slices are LIVE** at `hangman.spyrostrimis.com`: the static word game, the frontend loading pass, and **accounts + scores + Hall of Fame** (`10bf933`, `a30101f`, `063ca07`). HEAD is `0eec78a` (Codex plan update).

**Next: Phase 4, Illucia (Play vs AI)** — researched and planned in `PLAN-illucia.md`. It starts with the old Phase 2 item, extracting the shared game core, because Illucia must run the same rules as Hangman. Six product decisions are open (see NEXT).

IN_PROGRESS: Nothing mid-flight. HARD RULES v4 is drafted in the Instructions and CLAUDE.md; it is not in the repo until Code commits it (slice I0).

## SESSION-START TEMPLATE (paste into Claude Code / Codex)

Code cannot see this file. The opening prompt is the handoff.

```text
Task: <one sentence, from NEXT below>
Scope: <which files/dirs may change; everything else is off-limits>
Verify: show me the real diff and the real test output before committing.
Do not bundle: flag any adjacent fix you spot, do not apply it.
```

## ALIGNMENT PASS — 2026-09-27

Reconciled against a fresh clone at `0eec78a`, the uploaded `CLAUDE.md`, `README.md` and `PLAN-accounts-and-illucia.md`, plus `server/RELEASE.md`.

- **HARD RULES v3 → v4** in both mirrored copies (identical text, verified by diff). Changes: (1) one scoped, first-party Workers AI exception for Illucia with five conditions; (2) the free Workers AI allowance is a ceiling, never a reason to upgrade; (3) new password rule (browser PBKDF2 600k + peppered HMAC verifier; work factor only rises); (4) secrets rule now covers `server/.dev.vars*` and `.wrangler/`; (5) "every deploy is production" covers both the Pages push and `wrangler deploy`. MW, examples and scoring rules unchanged.
- **CHANGE DISCIPLINE stays v2** (no change). Its two copies still differ in wording but not in rules, as before.
- **CLAUDE.md**: HARD RULES v4; HEAD; Illucia line; image-generation wording softened to match the Instructions (square locked; model undecided — this closes the old OPEN_Q); Illucia planned-stack bullet; Worker deployment lines; ILLUCIA section rewritten; SCOPE moved to Phase 4.
- **Instructions**: HARD RULES v4; CURRENT STATE; STACK rewritten from "to build" to shipped; removal list corrected (`@testing-library/*` is now USED by the account UI tests — no longer dead); ILLUCIA section; PROJECT FILES list.
- **README.md**: no change needed now. It already says Illucia and live AI are future work. When the word list ships, add the SCOWL copyright notice and LDNOOBW attribution; when Workers AI ships, describe the voice layer and its limits.
- **`PLAN-accounts-and-illucia.md`**: its Phase 4 section is superseded by `PLAN-illucia.md` (new). Suggest Code commits `PLAN-illucia.md` and replaces that Phase 4 section with a pointer.

## THE WORD LIST — 105 SURVIVORS, LOCKED

Canonical authority:

`tools/words.locked.json`

It contains exactly 105 lowercase alphabetically sorted unique words. The validator asserts against this file, not against a generated count.

All 105 already have a rescued 2023 DALL·E 2 painting. **No image generation is needed to ship.**

acquaint · activity · admonish · adventure · ambitious · ambivalent · architect · atlantis · available · awkward · backstage · bellwether · bituminous · bookshelf · caffeine · cardiovascular · challenge · chancellor · chemistry · chimpanzee · colloquy · comfortable · commitment · consistent · contest · conversation · correspondence · criticize · deception · definitely · dictionary · disparage · divulge · effervescent · encyclopedia · epistemology · eschatology · ethereal · euphoria · existentialism · expertise · exquisite · fallacy · fluorescent · gemstone · gnarled · hermeneutics · homesick · illuminate · insistent · instagram · instruction · irrevocable · jacuzzi · jerusalem · jocund · knowledge · laminate · language · lavender · legend · library · literature · locomotion · loquacious · manipulate · melancholy · misanthrope · mountain · myopia · mystery · nefarious · novelist · onomatopoeia · ornithology · oxygen · oxymoron · panoply · parenthesis · patricide · peacock · pickle · pineapple · playful · poltergeist · possessed · prestigious · probably · punishment · puzzle · quintessential · regenerate · rhythmic · scared · schadenfreude · solitude · student · supersede · variant · victorious · vocabulary · wondrous · xenophobia · zeitgeist · zygote

### Cut — 11, all reversible

- **Hyphen (1):** `hurdy-gurdy`. Deferred until the board supports non-letter characters.
- **Under 6 letters (6):** `echo` · `ennui` · `grit` · `joist` · `odium` · `yeti`. Deferred for layout reasons.
- **Register (4):** `alfresco` · `ersatz` · `shibboleth` · `tmesis`. Judgement call, not mechanics.
  - ⚠ Consistency question remains: comparable kept words include `schadenfreude`, `zeitgeist`, `jocund`, `colloquy`, `panoply`.

## CLEAN-START DATA RULE

The manifest is built from the locked corpus + current Merriam-Webster Collegiate data + conversationally authored, human-reviewed enrichment committed as static data. There is no generation harness.

`../hangman-export/` is **not** part of current dictionary curation or generation. Do not consult the old MongoDB/export records to choose meanings, definitions, examples, synonyms, or explanations. They may be used only for an optional retrospective comparison after the new manifest is complete.

The rescued paintings remain valid project assets and are not part of this exclusion.

## MANIFEST CONTRACT — IMPLEMENTED

Runtime manifest: nested JSON, schema version 1.

Implemented files:

- `tools/schema/manifest.schema.json`
- `tools/validate.js`
- `tools/validate.test.js`

Per-word runtime shape:

```json
{
  "word": "melancholy",
  "mw_entry_id": "melancholy:1",
  "mw_unit_id": "1a",

  "definition": {
    "text": "...",
    "part_of_speech": "noun",
    "source": "mw-collegiate"
  },

  "hints": {
    "synonym": { "text": "...", "source": "llm-generated" },
    "clue":    { "text": "...", "source": "llm-generated" }
  },

  "pronunciation": {
    "mw": "...",
    "audio_file": "melanc04",
    "audio_url": "https://..."
  },

  "example": {
    "text": "...",
    "kind": "vis",
    "form_matched": "melancholy",
    "attribution": {
      "author": null,
      "source": "Rolling Stone",
      "date": null
    }
  },

  "explanation": {
    "text": "...",
    "provenance": "llm-generated"
  },

  "image": {
    "key": "paintings/melancholy.webp",
    "origin": "2023-dalle2",
    "provenance": "recovered",
    "generation": null
  }
}
```

`example` may instead be `null`.

### Locked contract rules

1. **Merriam-Webster Collegiate Dictionary API only.** No Thesaurus API.
2. MW supplies definition, part of speech, written pronunciation, audio filename, and optional attributed `vis`.
3. Synonym hint, clue and explanation are LLM-authored during planning, human-reviewed, and committed to `tools/enrichment.json`. No generation code exists in `tools/`.
4. `example` is **nullable**. Absence of a usable attributed MW example does not reject the word.
5. If `example` exists, it must be a sense-bound MW `vis`; v1 does **not** allow `quote`.
6. If `example` exists, attribution must have a non-empty `author` or `source`. `date` is nullable and remains a string when present.
7. `form_matched` records the headword/stem form found in the source example. Runtime validation proves it appears in `example.text`.
8. Definition and example selection originate from the same MW entry and semantic unit. The final manifest records the shared `mw_entry_id` + `mw_unit_id`.
9. `part_of_speech` is required.
10. Definition text normally comes from the selected semantic unit's top-level `dt` text, rendered to display text.
11. **Narrow `shortdef` fallback:** only when there is exactly one exact entry candidate, normal dt-based selection finds zero selectable units, that sole entry has exactly one eligible semantic unit with no non-empty `dtText`, and `shortdef` contains exactly one non-empty string. `shortdef` supplies definition text only; it never chooses an entry or semantic unit.
12. MW markup is **rendered, not stripped**. Visible payloads such as `{a_link|volume}` must survive as `volume`.
13. No unresolved MW `{...}` markup may reach runtime display strings.
14. `image.key` is an R2 object key, not a full URL.
15. Recovered images say `origin: "2023-dalle2"` and `provenance: "recovered"`.
16. Pipeline verification state such as audio HEAD results does not ship in the manifest.
17. `word_count` is informational. `tools/words.locked.json` is the corpus authority.
18. **Answer-leak rule (hardened at `05b5c5d`):** the complete headword may not occur as a contiguous substring in `synonym` or `clue`, NFKC-normalized and case-insensitive. Spelling disclosure is invalid in both hints. Five-character-prefix similarity is warning-only. No length or sentence-count invariants exist on any enrichment field.
19. **Pronunciation rule:** selected entry's `hwi.prs[0]` is authoritative whenever it exists. Never fall through to `prs[1]`. If the selected entry has no `prs[0]` at all, pronunciation may be inherited only from exactly one usable **direct-headword homograph** sibling. Stem-only entries, variants, inflections, run-ons, sense-level pronunciations, and later `prs` objects are never fallback sources. An incomplete selected `prs[0]` still fails rather than inheriting.
20. Written pronunciation and audio filename always come from the same selected `prs[0]` object.

### Corpus validation

The validator requires:

- exactly the 105 locked words;
- no duplicates;
- no missing locked words;
- no unexpected words.

Current suites (per CLAUDE.md / `server/RELEASE.md`, not re-run by Chat): `tools/` **177** · client **11** Node + **8** React component · server **8** Workers/D1 integration.

### Current pipeline error codes

Defined in `tools/lib/mw-errors.js`:

- `NO_MW_ENTRY`
- `AMBIGUOUS_ENTRY`
- `AMBIGUOUS_UNIT`
- `NO_DEFINING_TEXT`
- `SENSE_IS_ARCHAIC`
- `INVALID_OVERRIDE`
- `MISSING_PRONUNCIATION`
- `MISSING_AUDIO`
- `AUDIO_404`
- `MW_MARKUP_REMAINS`
- `EXAMPLE_HEADWORD_MISMATCH`
- `NO_PART_OF_SPEECH`

Validator codes additionally include `AUDIO_URL_MISMATCH` (audio URL must exactly equal the URL implied by `audio_file`).

No-attributed-example is **not** an error when `example` is `null`.

## MW COLLECTION / SELECTION PIPELINE — IMPLEMENTED

### Main files

- `tools/lib/mw-client.js`
- `tools/lib/mw-audio.js`
- `tools/lib/mw-errors.js`
- `tools/lib/mw-render.js`
- `tools/lib/mw-walk.js`
- `tools/lib/mw-select.js`
- `tools/collect-mw.js`
- `tools/mw-overrides.json`

Local-only artifacts:

- `tools/cache/collegiate/` — real Collegiate responses; gitignored
- `tools/output/mw-probe.json` — probe/report output; gitignored
- `tools/.env` — local `MW_KEY`; gitignored

All 105 current Collegiate responses are cached locally. Full reruns require **0 Collegiate GETs**.

### Cache / client

- Collegiate endpoint only.
- Cache-first; refresh is explicit.
- One cached response per locked word.
- API key required only when network access is needed.
- Atomic cache writes.
- Error messages sanitize API-key material.
- Real MW responses are never committed.

### Entry selection

Two-tier exact-entry policy:

1. Direct normalized `hwi.hw` matches first.
2. `meta.stems` fallback only when no direct headword candidate exists.

Normalization removes MW `*` syllable separators, trims, and compares case-insensitively.

A stem-only lexical relative does not compete with a real direct headword entry.

Multiple viable direct homographs remain `AMBIGUOUS_ENTRY` unless resolved by a committed explicit override.

### Semantic-unit walker

Handled structures include:

- ordinary `sense`
- elided numbering (`1 a` → `1a`, contextual `b` → `1b`)
- hierarchical numbering such as `1 a (1)` → `1a(1)`
- contextual forms such as `b (1)` with valid major context
- `pseq`
- `bs`
- unnumbered sole senses → `1`
- nested `sdsense` → IDs such as `1a:sd`
- `sen` group headers and inherited `sls`
- context reset between unrelated groups/definition sections
- exact selected-unit `dt` / `vis` pairing
- multiple top-level `dt` text fragments concatenated in source order with `join("")`
- top-level `vis` retained on the same semantic unit
- nested note structures are not silently flattened
- unknown structural shapes reject loudly
- `uros` / `suppl` excluded from lexical-unit selection
- `archaic` / `obsolete` units marked ineligible

### Markup renderer

The renderer preserves display content and fails loud on unsupported markup.

Observed runtime-relevant token coverage across the full cached corpus includes: `a_link` · `bc` · `d_link` · `dx` · `dx_def` · `dxt` · `gloss` · `inf` · `it` · `ldquo` · `phrase` · `rdquo` · `sx` · `wi`.

Current full-corpus runtime-relevant scan found no unsupported MW markup tokens.

### Example selection

- selected semantic unit only;
- `vis` only in schema v1;
- attributed example requires non-empty `aq.auth` or `aq.source`;
- exact requested word or exact `meta.stems` form must occur as a whole word in rendered example text;
- actual matched form is recorded as `form_matched`;
- no suitable attributed example → `example: null`;
- no top-level quote fallback;
- no `uros` example leakage.

### Pronunciation / audio

- selected entry's own `prs[0]` wins whenever present;
- incomplete selected `prs[0]` fails with `MISSING_PRONUNCIATION` or `MISSING_AUDIO`;
- no `prs[1]` fallthrough;
- if selected entry entirely lacks `prs[0]`, exactly one usable direct-headword homograph sibling may supply the shared pronunciation;
- multiple usable sibling sources reject rather than rank;
- stem-only entries never supply pronunciation;
- `mw` and `sound.audio` come from the same `prs[0]`;
- audio URL is constructed from `sound.audio`;
- subdirectory rule: `bix*` → `bix` · `gg*` → `gg` · leading number/punctuation → `number` · otherwise first letter;
- generated audio URLs are HEAD-verified during the probe/report stage;
- HEAD verification state does not ship in the runtime manifest.

### Probe CLI / diagnostics

`tools/collect-mw.js`:

- requires explicit requested words; never silently defaults to all;
- validates requested words against `tools/words.locked.json`;
- continues after per-word pipeline/technical failures;
- writes an atomic ignored report;
- counts cache hits and new Collegiate GETs;
- verifies audio for successful records;
- produces ambiguity candidate diagnostics;
- diagnostic generation is best-effort per candidate and cannot abort the entire probe;
- original ambiguity error remains authoritative even if diagnostics fail;
- raw MW responses and keyed request URLs are never written to the report.

## CURRENT CURATION STATE

Committed override file: `tools/mw-overrides.json` — **76** overrides.

These 76 words required explicit human `entry_id + unit` selection. The other 29 locked words resolve deterministically without overrides.

Curation is **complete**. No `AMBIGUOUS_ENTRY` or `AMBIGUOUS_UNIT` cases remain.

### Decisive full 105-word MW-only cache run

After commit `9f26e963dd85b048ee6004296127143d444b46fb`: total **105** · success **105** · needs curation **0** · failed **0** · every pipeline error-code count **0** · cache hits **105** · Collegiate GETs **0** · audio HEAD successes **105** / failures **0** · examples present **23** / null **82**.

The MW layer is considered complete for the current locked corpus unless a later downstream step exposes a specific, evidenced defect.

## REBUILD COMMITS (2026)

Data foundation:

- `734d6d2c01461b183df8889ee3969f4570e267f8` — `Add locked word corpus`
- `05f5e5c2e35cb714ec96d5fb385959eb26c8e9d2` — `Add Merriam-Webster markup renderer`
- `ea04a6d9c4e5a3e5c69e7c35fd6ed667c739bc8d` — `Add Merriam-Webster sense walker`
- `43deb8a92bf13f07655eb235ba1498c7b9871ae5` — `Add word manifest schema and validator`
- `cd190557fc04b1577883701e8c5c0d9164fdde64` — `Align manifest schema contract`
- `4689f8a2c3caaa8ad20b488367b73e420eb0c805` — `Remove Thesaurus API dependency`

Collector / real-corpus hardening:

- `223eadb818682f05e50dcde9305c18e873eef902` — `Add Merriam-Webster collection core`
- `dddec320ca95f65b353845aab74d94ebff551054` — `Add Merriam-Webster probe CLI`
- `46e1414bfa4c263232f15307bd82b7a1aa05df27` — `Curate initial Merriam-Webster senses`
- `34268bbd7f682545024b4f6686e6a04615bcf6f5` — `Tighten Merriam-Webster entry matching`
- `8dbd33a388f6e5b3d1e55f07edb82049ad661e40` — `Support Merriam-Webster hierarchical sense numbers`
- `74b355ef21d825f1e696a2c6504c5a2897864b31` — `Support multi-part Merriam-Webster defining text`
- `f9271838338adabf8d26ce71baee94722f54eb12` — `Use synthetic Merriam-Webster renderer fixtures`
- `6320bc63d1544bb8ccc893cc95f6e506f4ab03d8` — `Expand Merriam-Webster markup rendering`
- `59dfa4a266124a0445e2e7f67096247b6f322bd8` — `Make Merriam-Webster probe diagnostics resilient`
- `9265cf9980bc07997392fb7b393c804453621947` — `Add narrow Merriam-Webster shortdef fallback`
- `3ec3ef9b89f00a8e98a77d1cba5a1eab6384b259` — `Curate Merriam-Webster entry ambiguities`
- `1c9499da1d093442f7394ef0deb5d9b9976e6374` — `Support shared Merriam-Webster homograph pronunciation`
- `fc95382ae5c27ccb5e602520ca7e58fa1d4220e5` — `Curate first Merriam-Webster unit batch`
- `6b5acfbe6984f84eeb1b32b99a46a8b07bdb9d17` — `Curate second Merriam-Webster unit batch`
- `a85e5b892ebd2c268c94980da84df863b7ed2995` — `Curate third Merriam-Webster unit batch`
- `9f26e963dd85b048ee6004296127143d444b46fb` — `Complete Merriam-Webster unit curation`

Enrichment / manifest / assets:

- `05b5c5d` — `Harden enrichment hint validation`
- `e38adec` — `Add reviewed word enrichment data`
- `19bb6c8` — `Build static word manifest`
- `107809e` — `Update project data pipeline documentation`
- `7065b76` — `Validate Merriam-Webster audio URLs`
- `d426e86` — `Add painting WebP preparation`

Wiring / frontend / docs:

- `028a660` — `Wire game to static word manifest` *(word game LIVE)*
- `6846661` — `docs: update project status and asset conventions`
- `03abd35` — `Improve first-visit loading and stabilize page backgrounds` *(frontend pass LIVE)*
- `49092d9` — `Restore game text panel base font size to 16px`
- `3a4fa1d` — `docs: refresh current rebuild status`

Accounts:

- `b03207d` — `docs: record audit findings and accounts/Illucia plan`
- `10bf933` — `Rebuild accounts and cumulative scores on Cloudflare`
- `a30101f` — `Finalize account release and canonical Pages redirect`
- `063ca07` — `Remove score notifications from Play Hangman`
- `0eec78a` — `Update account plan with live state and game overview` *(current HEAD)*

Repo totals at `0eec78a`: 106 commits (60 dated 2023).

## WHAT IS ACTUALLY LIVE

| state | word game | frontend loading pass | accounts + scores | Illucia |
|---|---|---|---|---|
| implemented / committed | ✅ | ✅ | ✅ | ✗ |
| agreed / planned | ✅ | ✅ | ✅ | ◐ planned, 6 decisions open |
| **actually wired / live** | **✅** | **✅** | **✅** | **✗ gated placeholder** |

### Word game — live since `028a660`

- words selected from `client/src/data/words.json`;
- **no runtime word API request** — the old backend is not required for gameplay;
- hints, facts, pronunciation, explanation and examples read from nested manifest fields;
- painting URLs derived from `image.key` against the R2 custom domain;
- painting shown on a win only; Game Over on a loss;
- real Merriam-Webster pronunciation audio;
- Merriam-Webster logo and full product title visible.

Deployed bundle confirmed to contain manifest word data and the production R2 domain, and **no** old word endpoint.

Manual browser verification before `028a660` (backend OFF throughout) passed: word loads, blanks render, mouse and physical keyboard both work, HINT 1 = manifest synonym, HINT 2 = clue, MW audio plays, win shows the correct R2 painting, loss shows Game Over and never the painting, definition renders, MW pronunciation renders and is not mislabelled IPA, explanation renders, null-example records produce no broken section, real-example records show attribution, MW logo and title visible, refresh and Play Again work, routing away and back gives a clean game, winner-score request fails invisibly.

### Frontend loading pass — live since `03abd35` + `49092d9`

- `App.js` owns one `.page-shell`; `PageBackground.js` renders route art in an isolated layer (no body-class background swapping — it flashed between routes).
- `lib/page-art.js` maps `/`, `/hangman`, `/illucia`, `/hall-of-fame` to desktop/mobile art pairs; login, signup and unknown paths fall back to home art. Mobile = `(max-width: 800px)`.
- Background and character art are prefetched only on link intent (pointer over, focus, touch); `saveData` and 2G are respected.
- TechnoBoard and Bruno Ace SC ship as local WOFF2; Roboto from `@fontsource/roboto`. No runtime web-font requests.
- `mdb-react-ui-kit` and Font Awesome removed; `client/src/base.css` keeps only the reset/popover subset still used.
- First-view character images have intrinsic dimensions (no layout shift).
- `lib/leaderboard.js` validates the response, forwards cancellation, 10-second timeout. `Halloffame.js` has loading, empty, ready and failure states (now backed by the live API).
- Game text panel base font deliberately 16px monospace (`49092d9`).
- Still a single Vite bundle; no code splitting yet.

### Accounts, scores, Hall of Fame — live since `10bf933` / `a30101f`

Full record: `server/RELEASE.md` (evidence) and `server/README.md` (protocol, limits, rollback).

- Hono Worker `hangman-api` at `hangman.spyrostrimis.com/user/*`, deployed separately with `wrangler deploy`. D1 `hangman-accounts` (EEUR), migration `0001_accounts.sql`.
- Routes: `auth-params`, `signup`, `login`, `me`, `logout`, `get-best-scores` (top 100, zeros included, deterministic ties), `add100` (auth, empty JSON body, atomic `+100`).
- Passwords: browser PBKDF2-HMAC-SHA-256 600k + per-account 128-bit salt → Worker HMAC-SHA-256 verifier under a separate pepper; stable secret-derived fake salts for unknown usernames. Signup requires 15–128 characters. No recovery.
- Sessions: `jose` HS256, 24 h, host-only `__Host-hangman_session` cookie (HttpOnly, Secure, SameSite=Lax); exact-Origin + JSON checks; 2 KiB bodies; `no-store`.
- Rate limits: native bindings, 60/min per IP and 10/min per normalized username on auth. Approximate and per-location.
- Client: shared auth state from `/user/me`; forms with validation/pending/error states; Illucia gated; guest Hangman allowed.
- Scores: `useRoundScore` claims one request per signed-in winning round (StrictMode-safe); guest wins never count; no auto-retry of ambiguous writes; **no score notifications on Play Hangman** (`063ca07`, at Spyros's request).
- Tests at release: 8 Workers/D1 integration + 11 client Node + 8 React component = 27, with three deliberate mutations caught. Production smoke checks passed; disposable accounts deleted.
- Worker CPU on Free: P50 1.96 ms, P99/P999 3.56 ms (small sample, not a load test).
- Canonical domain: Bulk Redirect `hangman_canonical` sends `hangman-caq.pages.dev` and deployment subdomains to the custom domain.
- Known limits: slow-phone stretching time unmeasured; no password recovery; copied JWTs valid until expiry; nine existing client dependency advisories (separate work).

### Hashing spike that drove the design (2026-09-26)

Throwaway Worker `hash-spike` on workers.dev, 10 calls per test, CPU read from Workers Logs `$workers.cpuTimeMs` (invocation events only). Account on Workers Free.

| Test | ok | CPU median (range) |
|---|---|---|
| cheap server step (SHA-256) | 10/10 | 0 ms |
| PBKDF2-SHA256 10k | 10/10 | 3 ms (2–4) |
| PBKDF2-SHA256 50k | 10/10 | 14 ms (12–17) |
| PBKDF2-SHA256 100k | 10/10 | 25 ms (21–34) |
| PBKDF2 100,001 | 0/10 | `NotSupportedError` — 100k production cap confirmed |
| bcryptjs cost 8 | 10/10 | 27 ms |
| bcryptjs cost 10 | 10/10 | 105 ms (94–112) |
| bcryptjs cost 12 | 5/10 | ~405 ms, then `exceededCpu` (503) |

Findings:

- **The 10 ms limit is not enforced per request.** Roughly 30 consecutive over-budget requests succeeded (up to ~430 ms each). Then the Worker was killed mid-hash and switched to strict mode: the next four requests were cut off at exactly 10 ms. Behaves like an undocumented, depleting overdraft; the refill rate is unknown. Do not build on it.
- **Every strong server-side option exceeds 10 ms** — bcrypt 10 by ~10×, PBKDF2 at its 100k maximum (itself below OWASP's 600k) by ~2–3×. It would appear to work in testing and fail under a login burst or deliberate login spam.
- **The client-side-stretching server step costs 0 ms** and fits the limit strictly.
- The spike did not cover D1 or Pages routing; the separate-Worker design made the `_routes.json` question moot.
- Raw log exports contain the tester's IP and location: never commit them.

### Not live

- **Illucia:** `/illucia` is gated to signed-in players and shows "Coming Soon! Welcome, {username}. Illucia is preparing for your challenge." No game.

## AUDIO URL INTEGRITY — IMPLEMENTED

Commit `7065b76`. Validator code `AUDIO_URL_MISMATCH`: `pronunciation.audio_url` must exactly equal the official MW URL implied by `pronunciation.audio_file`, reusing `buildMwAudioUrl()` from `tools/lib/mw-audio.js`. No network call. The project's only runtime external dependency is structurally verified rather than merely well-formed.

## PAINTING PREPARATION — IMPLEMENTED

### Rescued source audit

Authoritative source: `D:\Documents\SHA\hangman-export\images`. 116 PNGs, all valid, all 512×512, RGB/sRGB, no transparency. 105 exact locked-word mappings, 11 retired-word paintings preserved, 0 missing, 0 ambiguous, no duplicates, no corrupt files. `contact-sheet.png` sits outside the word-image directory.

### WebP calibration — rescued corpus only

Manual review of q80 / q85 / q90. **q90 chosen; q80 and q85 were visibly inadequate.** Approved settings for this corpus: `quality: 90`, `preset: "picture"`, `smartSubsample: true`, `effort: 6`.

### Conversion tool

Commit `d426e86`. `tools/prepare-images.js` (+ test) owns `sharp` 0.35.3. Requires explicit `--source-dir`, validates and decodes before converting, preserves dimensions, strips metadata, publishes through a verified staging directory, verifies manifest keys, excludes retired words. Output: gitignored `tools/output/paintings/`.

Real run: 105 in, 105 out. 82,675,635 → 7,566,668 bytes (**−90.85%**), average 72,063.50 bytes; smallest `oxymoron.webp` 14,568, largest `gnarled.webp` 122,494.

## R2 — LIVE

Bucket `hangman-assets`, Standard, EEUR. Custom domain `https://assets.hangman.spyrostrimis.com`, SSL active. **`r2.dev` DISABLED.** 105/105 objects at `paintings/<word>.webp`, 7,566,668 bytes. Every URL verified: 200, `image/webp`, `public, max-age=604800`, valid signature, byte length matches.

⚠ Wrangler's aggregate bucket-info briefly reported 0 objects / 0 B while direct enumeration proved all 105 present. **Treat the aggregate as lagging analytics** — do not re-upload on the strength of it.

## ENRICHMENT — IMPLEMENTED, NO HARNESS

Commit `e38adec`. `tools/enrichment.json`, flat `{ "<word>": { "synonym", "clue", "explanation" } }`, no provenance wrappers (the assembler assigns them). Verified: exactly the 105 locked words, three non-empty keys each, SHA-256 `63A7B3F207485CBD5968809081F03C4FFF0CB93F04AA46F45B5422976B1914CD`.

### The generation harness was cancelled — architectural, not deferred

Not built, and not to be proposed again unless conversational authoring demonstrably fails: OpenAI Responses API generation code, an enrichment CLI, retry logic, bounded concurrency, resume behaviour, an SDK or fetch harness.

Reasoning: 105 locked words, generation happens once, all 315 strings need human review regardless. The MW pipeline earned its machinery (quota, entry ambiguity, `sdsense` traps, archaic senses, markup, elided sense numbers, constructed audio URLs); enrichment has none of that.

`llm-generated` describes **who produced the text**, not how it travelled. Zero OpenAI calls anywhere, in production or `tools/`.

### Enrichment editorial semantics — LOCKED

- **HINT 1 = `synonym`**, the HARDER hint.
- **HINT 2 = `clue`**, the friendlier fallback.
- **The painting is a post-guess REWARD** — win only; never a hint source.
- **`explanation` and `example` are post-answer content** — hence leak validation covers the two hints only.

Style guidance, not invariants: clue ~6–18 words; explanation ~1–2 short sentences. A reviewed 19-word clue stays valid.

### Content polish is deliberately deferred

Ship first. Editorial pass after the site is fully online. Not a blocker.

## VALIDATOR HARDENING — IMPLEMENTED

Commit `05b5c5d`. Hard errors: `SYNONYM_EQUALS_HEADWORD` · `SYNONYM_CONTAINS_HEADWORD` · `SYNONYM_REVEALS_SPELLING` · `CLUE_CONTAINS_HEADWORD` · `CLUE_REVEALS_SPELLING`.

**Headword-leak rule:** NFKC, case-insensitive, the complete headword may not occur as a **contiguous substring** in either hint (`student → students`, `contest → contestant` fail). Deliberately not a stemmer: `library → libraries` escapes because the final `y` stays hidden. Exact equality emits only the equality error. Spelling-disclosure phrases covered deliberately non-exhaustively. Five-character-prefix similarity is warning-only.

## STATIC PRODUCTION MANIFEST — IMPLEMENTED

Commit `19bb6c8`. `tools/build-manifest.js` is a **deterministic assembler**: `words.locked.json` + `output/mw-probe.json` + `enrichment.json` → `client/src/data/words.json`. Requires all 105 MW successes and exact enrichment coverage, preserves locked order, copies only runtime MW fields, assigns provenance and image metadata (`paintings/<word>.webp` · `2023-dalle2` · `recovered` · `generation: null`). Validator green, 23 examples / 82 null.

## NEXT (priority)

### Phase 0 — remaining verification

1. **⚠ VERIFY — one working copy.** Confirm `C:\Users\PC\hangman-restart` is gone.
2. **⚠ VERIFY — SSH key hygiene.** `chmod 600 ~/.ssh/id_ed25519`; retire the old 3072-bit RSA key once nothing uses it.
3. **⚠ Secrets backup.** `server/RELEASE.md` says the only recovery copy of production secrets is DPAPI-encrypted and tied to this Windows user/machine. Arrange a portable secure backup before the machine changes.

### Phase 4 — Illucia (Play vs AI) — ACTIVE (planning)

Reference: `PLAN-illucia.md`. Build order (one verified slice each):

| # | Slice | Depends on | Status |
|---|---|---|---|
| I0 | Commit HARD RULES v4 (docs-only; both mirrored copies) + commit `PLAN-illucia.md` | — | ready |
| I1 | **Extract the game core** (old Phase 2): characterization tests first against current behaviour; pure `guess(state, letter)` + selectors; Hangman switches to it; removes the stale keyboard closure, `remainingTries`, the transparent answer `<div>`, `BODY_PARTS` | — | ready |
| I2 | Word-list build tool in `tools/`: SCOWL levels, offensive/vulgar removed, LDNOOBW blocklist, deterministic static output, tests | decision 2 | blocked on decision |
| I3 | Solver module + "no peeking" test + in-repo benchmark reproducing the simulation tables | I1, I2 | — |
| I4 | Illucia page v1: mirror layout + "mind" panel, scripted lines, difficulty, lazy-loaded list, `aria-live`, 390 px check | I3, decisions 3–6 | — |
| I5 | Workers AI voice: Worker route under `/user/*`, public-state-only request, validated/capped reply, per-user cap, ~2.5 s timeout, scripted fallback, Worker tests | I0, I4 | — |
| I6 | Optional: browser `speechSynthesis` voice toggle | I4 | — |
| I7 | Optional experiment: offline benchmark of a model picking letters vs the solver; decide afterwards | I0, I3 | — |

**Decisions for Spyros** (recommendations in `PLAN-illucia.md`):

1. Approve the order: core → solver + scripted voice → Workers AI voice; model-picked letters only as an experiment. *(rec: yes)*
2. Difficulty = Illucia's vocabulary size, e.g. Apprentice ≤35 / Scholar ≤50 / Master ≤70 SCOWL levels. *(rec: yes)*
3. Secret entry: typed secret vs "answer her" mode. *(rec: typed)*
4. Illucia's art: CSS/SVG avatar, derivative of existing art, or new generated art. *(open)*
5. Scoring: none in v1. *(rec: yes)*
6. Registered-only stays (required anyway for the Workers AI voice). *(rec: yes)*

### Later / independent

- Dead client deps: remove `read-more-react`, `web-vitals`, `buffer` (zero imports). Carve-out commit. **Do not** remove `@testing-library/*` — the account UI tests use them now.
- Nine client dependency advisories (from the release audit) — a separate dependency-update slice.
- THE SIX-GUESS VISUAL for the main game (no gallows; robot story). Could share its design with Illucia's miss meter.
- Measure PBKDF2 stretching time on a slow physical phone.

### End of project — lowest priority, deliberately last

- **CLOUDFLARE BUDGET ALERT.** Only after the substantive rebuild is finished. Do not promote it.

## ILLUCIA — SUMMARY (full plan: `PLAN-illucia.md`)

Reverse Hangman: the player sets a secret word; Illucia guesses letters; hits are free; six misses and the player wins.

**Direction (research-backed, 2026-09-27; decisions above still open):**

- **Her moves: a local solver**, not a model. Filter the word list by length, revealed pattern and misses; guess the letter present in the most remaining candidates. In-browser, instant, $0, never fails. It never receives the secret word.
- **Her voice: scripted lines first**; optional Workers AI lines later under the HARD RULES v4 exception. The model comments on a guess already made, sees public state only, and has a scripted fallback.
- **Player words must be in the accepted list** (A–Z, 3–15 letters, blocklist-filtered).
- **Word list:** SCOWL-derived (MIT-like licence, frequency levels, offensive entries marked) + LDNOOBW blocklist. Verified: the npm SCOWL build contains profanity, so filtering is mandatory. Sizes (brotli): ≤35 ≈ 87 KB · ≤50 ≈ 145 KB · ≤60 ≈ 188 KB · ≤70 ≈ 284 KB. Lazy-loaded on `/illucia` (first code-split).

**Evidence (our simulations, 2026-09-27; ±~10 points from tie-breaking and sampling):**

- Full-vocabulary Illucia vs common words: 3 letters ~30–40% · 4 ~45–53% · 5 ~67–75% · 6–7 ~85–92% · 8+ ~99–100%. Naive ETAOIN order: 5–15% (too weak). Random noise barely helps the player on long words.
- **Vocabulary-size difficulty** (5–9-letter words): Illucia knowing ≤35 wins 94% vs common words but 11% vs less-common and 12% vs rare; ≤50 wins 92% vs less-common and 11% vs rare; ≤70 wins ~90–93% across all bands. Beating her rewards richer vocabulary.
- Literature agrees: ENABLE-based solver 68.6% (5 letters) → 100% (10+) ([sharkfeeder](http://www.sharkfeeder.com/hangman/)); on words outside the dictionary, dictionary solvers drop to ~18% and ML reaches ~50–60% (Trexquant challenge repos).
- LLMs: cannot host hangman without private state (2–12% self-consistency; [arXiv 2601.06973](https://arxiv.org/html/2601.06973v1)); weak at character-level tasks (CharBench avg 50.3%; [arXiv 2508.02591](https://arxiv.org/html/2508.02591)).

**Workers AI (verified 2026-09-27):** 10,000 neurons/day free, hard stop on Free; paid-only models excluded (Kimi K2.6/2.7, GLM 5.x, DeepSeek V4). ~1–5 neurons per short line on small/mid models (granite-4.0-h-micro ≈ 1, llama-3.2-3b ≈ 3, gemma-4-26b-a4b ≈ 4.7) → hundreds of games/day at ~5 lines/game. Aura-2 TTS is too expensive (~270 neurons per 100-character line); browser `speechSynthesis` is free.

**Ruled out:** Gemini free tier (terms require Paid Services for apps serving EEA/CH/UK users); other third-party APIs (HARD RULES); Chrome Prompt API (desktop-only, 22 GB disk, >4 GB VRAM) and WebLLM (360 MB–1.4 GB model downloads; WebGPU gaps) as a basis — progressive-enhancement ideas at most; existing npm hangman engines (unmaintained).

## MERRIAM-WEBSTER BRANDING — HARD RULE (block now SYNC v4; MW text unchanged since v3)

Verified 2026-09-06 against `dictionaryapi.com/info/branding-guidelines` and `dictionaryapi.com/products/index`.

- Every application using the MW API **must** feature the MW logo, unmodified. Sizes 50×50, 100×100, 125×125; PNG on web. ® visible at bottom right.
- Full product title: **"Merriam-Webster's Collegiate® Dictionary with Audio"**; ® after "Collegiate" on first use per page.
- "Merriam-Webster Inc." (no comma); "Merriam-Webster's", never "Webster's"; always hyphenated.

Implemented in production: official unmodified dark-background PNG at 50×50, full title shown.

- The ® rule includes **placement**, not only visibility.
- "First use on each page" is ambiguous in a React SPA (OPEN_Q); currently moot.
- ⚠ MW's products page says the APIs allow commercial and non-commercial use. Our "non-commercial only" is self-imposed and stays.

## CONFIG HYGIENE

- **HARD RULES = `SYNC v4`** (2026-09-27, identical in CLAUDE.md and Instructions by diff). **CHANGE DISCIPLINE = `SYNC v2`** (unchanged).
  - Versions are **per block**. Compare HARD RULES with HARD RULES, CHANGE DISCIPLINE with CHANGE DISCIPLINE. Mixed versions are expected; bumping an unchanged block destroys the signal.
  - Edit either mirrored block → edit the other → bump BOTH markers for that block.
  - ⚠ Until Code commits I0, the repo's CLAUDE.md still says v3 while the Instructions say v4. That mismatch is expected for that window only.
- `update state.md` ritual also eyeballs STACK / BEING REMOVED for drift outside the markers — this pass fixed `@testing-library/*` (now used, not dead) and the stale "still to build" API/D1/auth lines.
- The repo is **public**: planning chats can read committed files (including `CLAUDE.md`) straight from GitHub.
- `.gitattributes`: `* text=auto eol=lf`. `server/.gitignore` covers `.env`, `.dev.vars*`, `.wrangler/`. There is still no root `.gitignore`, and the client keeps CRA rules — never create plain secret files at the root or in `client/`.
- MCP audit closed. `CLAUDE.md` stays whole unless measured need appears. Auto memory off. Hooks deferred until game-core testing (I1).

## BACKLOG (cleanup, unscheduled)

- Dead client deps `read-more-react`, `web-vitals`, `buffer`.
- Commented `Header`/`Footer` imports and render references in `App.js`.
- React StrictMode still disabled in `index.js` (the score lifecycle is tested under StrictMode and does not depend on it).
- Game-core landmines (stale keyboard closure, `remainingTries`, transparent answer `<div>`, `BODY_PARTS`) — all removed by I1, not piecemeal.
- Closed by the account slice: the legacy `server/` (with `script.js`, `/word/*` routes, port bug, pre-save hook, headers-sent routes, `SALTY_ROUNDS`, `Word.hint`, Thesaurus lines), the Signup garbage-token branch, `jwt-decode`, `axios`, Hello/AuthWrapper, the README placeholder acknowledgement.

## DECISIONS

- All 116 paintings are keepers; 105 words currently ship. No image generation needed to ship.
- New dictionary pipeline is a clean start; old Mongo/export records excluded from curation/generation. Optional old-vs-new comparison only after the manifest is complete.
- Difficulty tracks distinct letters/vowels, not length.
- Static manifest + R2 makes the game playable without a runtime word API.
- Cloudflare free tier only. React 18 stays for this rebuild. Vite is live.
- Hall of Fame stays; scoring client-authoritative/forgeable by design.
- No gallows.
- Merriam-Webster **Collegiate Dictionary API only**.
- Examples are real MW `vis` with attribution when available, otherwise `null`. No automatic `quote` fallback in schema v1.
- Synonym, clue, explanation: LLM-authored in planning, human-reviewed, static. **No generation harness** — cancelled architecturally.
- HINT 1 (`synonym`) harder; HINT 2 (`clue`) friendlier.
- Painting = post-guess reward, never a hint input. `explanation` / `example` = post-answer content.
- Answer-leak validation = contiguous substring, complete letter exposure, not word families. Style limits stay editorial.
- Ship first; enrichment polish after the site is fully online.
- MW markup rendered, not stripped. Selection granularity = semantic unit. Direct headwords outrank stem-only matches. Ambiguity resolved only by explicit human override. Archaic/obsolete ineligible. Narrow `shortdef` fallback supplies text only.
- `tools/words.locked.json` is corpus authority. Pipeline cache makes reruns quota-free.
- Pronunciation = selected entry `prs[0]`; sole direct-homograph sibling fallback; never `prs[1]`.
- Audio filename stored; verification in reports only. Audio URL must exactly equal the one implied by `audio_file`.
- `image.key` is an R2 key. `r2.dev` disabled. No per-word hard-coded painting URLs; base via `VITE_ASSET_BASE_URL`.
- **Image conventions are source-agnostic**; 512×512 and q90 describe the rescued corpus only. Square framing is agreed for any future paintings.
- Merriam-Webster branding compliance is a HARD RULE, verified against MW's live guidelines.
- The word game, frontend loading pass, and accounts/scores are LIVE; Illucia is not. Keep the three states apart.
- **2026-09-26/27: Password design = browser PBKDF2-HMAC-SHA-256 600k + peppered server HMAC verifier** — chosen on measured spike evidence (every strong server-side hash exceeds the Free-plan CPU budget), approved by Spyros, implemented by Codex, now a HARD RULE.
- Accounts: separate Hono Worker at `/user/*` (not Pages Functions); `users` + `scores` tables; top-100 leaderboard including zeros; 24 h tokens; no password recovery; fresh start (no 2023 accounts).
- **2026-09-27: HARD RULES v4** — one scoped first-party Workers AI exception for Illucia; everything else stays static.
- **2026-09-27: Illucia's moves come from a local solver; a model may at most voice her.** Player words must be in the accepted list. (Product details — difficulty, entry mode, art, scoring — still open.)
- Gemini free tier is not usable here (terms require Paid Services for EEA users).
- Image generation, if ever: square locked; model undecided (`gpt-image-2` is a candidate only).
- **2026-09-26: Phase 3 (accounts) moved ahead of Phase 2 (game-core extraction).** Done. The game-core extraction now opens Phase 4 as I1.
- Body-class background swapping is retired; route art lives in `PageBackground` (it flashed and destabilized blending).
- Image preloading is intent-based only; never eagerly preload every route.
- Cloudflare budget alerts at the very end.
- Validation is deterministic; heuristics advisory. Testing must be non-vacuous.
- Git history never rewritten. Main-only; every deploy (Pages push or `wrangler deploy`) is production.

## OPEN_Q

- **Illucia decisions 1–6** (NEXT, Phase 4).
- **Illucia model choice** for the voice layer — taste test llama-3.2-3b vs granite-4.0-h-micro vs gemma-4-26b-a4b before I5.
- **Examples for every word — policy, NOT decided.** Production is 23 attributed / 82 null. Broadening provenance needs an explicit decision and probably a HARD RULE change with a SYNC bump. **Do not silently widen it.** Revisit in the post-launch content pass.
- **"First use of Collegiate® on each page" in a React SPA** — moot while logo and full title are always visible.
- What happens when the player exhausts all 105 words?
- What should the UI do if a hotlinked MW audio URL fails at runtime? It is the ONLY third-party runtime dependency on the gameplay path.
- Do 12–14 letter words break the board on mobile? `prestigious` (11) renders correctly; the longest are unverified on small screens. (Illucia's board needs the same check up to 15.)
- What is the actual distinction behind the four register cuts vs. comparable kept words?
