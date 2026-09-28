# Hangman: Rescue Mission

A vocabulary game about reviving the robot Artsy. Originally a 2023 Social Hackers Academy MERN project, now rebuilt with React/Vite and Cloudflare.

[Play Hangman](https://hangman.spyrostrimis.com) · [Historical 2023 demo video](https://vimeo.com/833806691)

## Game

Guess the word before six incorrect letters. Use the prepared hints, then explore definitions, pronunciation and word facts. A win reveals the accompanying painting.

The game selects from 105 checked-in word records. Paintings are served from Cloudflare R2; pronunciation audio is hotlinked from Merriam-Webster. There are no runtime word-generation or dictionary API calls.

## Accounts and Hall of Fame

The account rebuild uses a Hono Worker, D1, browser-side password stretching, and expiring HttpOnly cookies. Registered players earn 100 points per reported win; the public Hall of Fame displays the top 100 cumulative scores. Guest play remains available.

Accounts and scores are live and browser-verified on the custom domain. Production rollout, test evidence, and initial Free-tier CPU measurements are recorded in [the account release record](server/RELEASE.md).

Passwords use PBKDF2-HMAC-SHA-256 (600,000 iterations) in the browser. The server stores an HMAC verifier under a separate secret pepper. [Account protocol, limitations, development and deployment instructions](server/README.md).

Scoring is client-authoritative and forgeable by design. The server authenticates the player and increments the total; it does not verify the game. Password recovery is not available yet. Logout clears the browser cookie; copied tokens expire after 24 hours.

Illucia is reverse Hangman for signed-in players: choose an accepted 3–15-letter word and challenge Apprentice, Scholar, or Master. A deterministic local solver guesses letters; six misses wins the round for you. The secret stays in the browser, commentary is scripted, and this mode awards no Hall of Fame points. [I4 implementation and local verification](docs/ILLUCIA-I4.md). Live AI commentary remains a later feature.

## Development

Use Node.js 24. From `client/`, run `npm ci` and `npm run dev`. The Vite server proxies `/user` to the local Worker; follow [the API setup](server/README.md) for accounts.

- Client: `npm test`, `npm run test:ui`, `npm run build`.
- API: `npm run types`, `npm run check`, `npm test`, `npm run build`.
- Word-data tools: `npm test` and `node validate.js ../client/src/data/words.json` from `tools/`.
- Illucia vocabulary: `python tools/build_illucia_words.py --download`, then
  `python tools/build_illucia_words.py --check`. Python 3.12+; pinned inputs,
  offline rebuilds, filtering policy and tests: [build documentation](tools/ILLUCIA-WORDS.md).
- Illucia solver benchmark: `node tools/benchmark-illucia.js`.
  [Policies, public-state boundary and reproducibility](tools/ILLUCIA-SOLVER.md).
- Illucia tier benchmark: `node tools/benchmark-illucia-tiers.js`.
  [Fallback rules and tier measurements](tools/ILLUCIA-TIERS.md).

Pages builds the `client/` directory with `npm run build` and publishes `dist/`. The Worker is deployed separately. Pushes to `main` publish the frontend; secrets and build output must never be committed.

## Credits and license

Illucia's prepared vocabulary derives from [ESDB/SCOWL v2](https://github.com/en-wl/wordlist),
copyright 2000–2026 by Kevin Atkinson; its [copyright and permission notice](client/public/illucia/words/ESDB-Copyright.txt)
is included with the word files. Profanity filtering also uses the English list by
[LDNOOBW contributors](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words),
licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
The derived vocabulary is filtered, lowercased, deduplicated and split by length with size annotations.
[In-app credits source](client/public/illucia/credits.html). Illucia loads only the selected word length when a challenge is submitted; the vocabulary is not bundled into JavaScript.

<img src="client/src/Images/mw-logo-dark-background.png" alt="Merriam-Webster logo" width="100" height="100" />

Dictionary definitions, written pronunciations, available sourced example sentences, and audio come from **Merriam-Webster's Collegiate® Dictionary with Audio**, used for this non-commercial educational project. Examples retain their supplied attribution. Prepared hints and explanations were authored with AI assistance and reviewed; they are not dictionary quotations. The paintings are rescued assets from the original 2023 AI-assisted project.

[MIT License](LICENSE). Suggestions and bug reports are welcome through this repository's issues.
