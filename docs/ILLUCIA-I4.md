# Illucia I4 — page v1

Implemented and verified locally on 2026-09-28. Not yet verified in production. MOB completion was confirmed by Spyros before this slice. Built on the I3/I3b solver and the filtered vocabulary at `7c3345c`; no vocabulary or policy changes.

## Behavior

- Signed-in route with setup, playing and finished states. Apprentice ≤35, Scholar ≤50 and Master ≤70 use the existing count policy and own-tier fallback.
- The secret field is a plain text input masked with CSS where the browser supports it; it is deliberately not `type="password"`, so browsers do not offer to save and sync the word as a credential. It accepts only A–Z, 3–15 letters, and validates against the filtered Master lexicon. The sole vocabulary request is `/illucia/words/<length>.txt`. Input state is cleared and the form unmounts on start. There is no secret-bearing request, browser storage, score request, or model call.
- Turns use `chooseLetter(toPublicState(round), knowledge)` and shared `applyGuess`. A 1.1-second timer is cancelled on restart, route departure, account change, or completion. Download cancellation and a 10-second timeout permit retry.
- Candidate counts, pattern, six-slot miss meter, read-only letter history, live announcements, turn log and decision explanation. Candidate words appear only in the result. Restart is not a victory and never reloads the page.
- Scripted commentary covers opening, hits/misses, three misses, last chance, rare letters, rejected words and both outcomes. The temporary SVG robot is drawn in code; final character art remains open. No generated image or paid service was used.
- Existing route background retained. Scoped styles accommodate 15 letters, labelled 44px tier controls and reduced motion. Credits link to the existing ESDB/LDNOOBW notices.

## Verification

- `cd client; npm test`: 37/37 passed, including public-state, exact-position, six-miss and tier fallback tests.
- `cd client; npm run test:ui`: 24/24 passed. Seven new integration tests use the real core/solver under React StrictMode with controlled vocabulary responses. Cover both outcomes, repeated letters, privacy, only one length request, validation, restart/unmount, loading failure/timeout, duplicate submissions and solver failure recovery. The existing auth test checks the new page and guest redirect.
- `cd client; npm run build`: passed. Per-length files remain static assets outside the JavaScript bundle.
- Mutation checks: removing turn cleanup, passing the private round into `chooseLetter`, bypassing accepted-word validation, and widening a lower tier to Master each caused the integration suite to fail. Source restored after every mutation.
- Headless Edge browser, actual local vocabulary, controlled `/user/me` response (no real account created): inspected setup and playing screenshots at 360×800, 390×844, 844×390, plus desktop at 1280×900. `congratulations` (15 letters) fits; document width equals viewport width at all phone sizes. No input or secret text remains after starting. Each round requests one length file, with no body and no external request.
- Actual `eerie` Master round completed with Illucia winning. Production-build preview also verified Apprentice losing on `jazz` after six misses, final suspects, expanded analysis/log, Scholar setup, restart and no stale turn. No score request occurred. Reduced-motion emulation yields `animation-name: none`; all tier labels measure at least 44px high.

Browser checks use emulated viewports, not a physical phone or a screen reader. Physical-device performance, assistive-technology listening and production verification remain unmeasured. Optional manifest word facts, Workers AI commentary and speech are outside this slice.
