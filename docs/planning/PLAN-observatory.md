# Observatory catch-up — plan (2026-10-03)

Agreed by Spyros on 2026-10-03. `/illucia-observatory` gets every Illucia v2 feature that `/illucia` has, without losing its design. This replaces the "no new features" line of `ILLUCIA-V2-DECISIONS.md` §6 (amended there).

## Why it needs care

`/illucia` is a conversation: the player takes part in every turn and the page scrolls. The Observatory is a spectator page on one screen: the player sets a word and watches her think (the starfield of words still possible, the letter bars, her speech bubble, the turns playing by themselves). Its panels have fixed heights and nothing scrolls.

**Rule: no new panels and no conversation log.** Every feature lives in a surface the page already has (the pod with its stars, scoreboard and bubble; the notebook screen; the tier cards; the console), in the page's own visual language.

## Where each feature goes

| Feature | Observatory surface |
|---|---|
| Honest reasoning (E1) | The notebook's reasoning line, written from her decision record, third person ("B scores a little higher, but she has a feeling about I"). The bars show her **weighted** score, the number she actually decides on; letters on her shortlist get an outline, so her temperament is visible: a wide band early, only the best letter once she is careful. |
| Memory (A3) | Her `brain` from the server's round (letter habits, personality, learned words) goes into her knowledge, as on `/illucia`. Learned words that are still possible show as distinct stars. Her memory line plays in the bubble at the end. |
| Scored rounds, points, "already won" (E3) | A points chip in the pod's scoreboard next to the tier. The pre-start warnings appear above the Start button ("Start anyway" on a second press). The claim result goes into the notebook's end summary. "New word" during a scored round asks for a second press ("Leave? Counts as a loss"). |
| Ladder (E3) | On the three tier cards: a rung badge on the next rung, ticks on climbed rungs. No separate widget. |
| Questions (E2) | The duel **holds** (as Pause does, at either speed). The notebook switches to a question card: her question, the stake line, Yes / No / Decline. The starfield **splits** into two colours by side; after an answer, the ruled-out side fades with the existing animation; a decline restores it. The split shows her candidates, never the secret. |
| Your record (E4) | A "Your record" button on the setup and end screens flips the notebook to the stats view and back. |
| Experimental AI (E5) | A small switch at the bottom of the setup screen, with `/illucia`'s warning. While she asks her helper she shows her thinking state and the bubble says so; the AI question uses the same question card. |

## One engine, one session

The brain is already shared (`client/src/lib/illucia/`). The game session around it is not: knowledge with memory, question narrowing, AI leanings, the choice between question / consult / letter, point and ladder previews, warnings, and the start / claim / abandon lifecycle all live inside `Components/Illucia.js`, mixed with its conversation log. Copying them into the Observatory would make two engines.

Slice 1 extracts them first, with no behaviour change:

- `client/src/lib/illucia/duel-session.js` — pure rules: her knowledge for a round, her knowledge after answers and leanings, what she does next (question, consult, or a letter with its decision record), what an answer changes, point and ladder previews, start warnings, stakes.
- `client/src/lib/use-illucia-rounds.js` — the server side as a hook: ladder, spent words, the open round, begin (with abandon), claim with retries, session expiry.

`/illucia` keeps its conversation view over the session; the Observatory becomes a single-screen view over the same session.

## Decisions taken (2026-10-03)

1. **Questions on a spectator page:** she asks and the duel holds until the player answers; Decline is always one tap. No setup toggle.
2. **One ladder, one open round across both pages:** starting a scored duel on one page abandons an unfinished one on the other (the same word, tier and mode resumes it), as the server already rules. Both feed the same Hall of Fame total.
3. **Speed 2× stays in scored rounds:** a fast win waits out the 15-second claim floor behind "Saving…", as on `/illucia`.

## Slices

One commit each, pushed to `main` for Spyros to check on the live site. No server change is needed; every route is deployed.

0. **Docs:** this plan; amend `ILLUCIA-V2-DECISIONS.md` §6 and `CLAUDE.md`.
1. **Extract the shared session** from `Illucia.js`. Characterization tests first, passing against the unmodified page; `/illucia` tests and the parity measure stay equal. No visible change on either page.
2. **Honest notebook:** reasoning from the decision record, weighted bars, shortlist outline. Local only.
3. **Scored rounds and memory:** ticket, server seed and brain, points chip, ladder on tier cards, warnings, claim, leave confirmation, memory line, learned-word stars. The trust note changes from "Illucia plays blind, from the blanks alone" to `/illucia`'s wording, because the server keeps the word to check the result.
4. **Questions:** hold, question card, split starfield.
5. **Your record** view.
6. **Experimental AI** switch.

## Status (2026-10-03)

All slices are committed and pushed to `main`, one commit each, so the frontend is published: slice 0 `5353e69`, the parity-harness fix `079d666`, slice 1 `42aace4`, slice 2 `3e9b2e9`, slice 3 `4bce708`, slice 4 `9067f7e`, slice 5 `27c34bd`, slice 6 in the commit that adds this section. No Worker change was needed. Each slice was tested (unit and component tests, each seen failing when its feature was broken), page parity stayed 108/108 on both pages, and each was run in the browser against the local Worker. Checking on the live site is Spyros's.

## Known issues in today's Observatory (fixed by the slices above)

- The bars count plain words while she decides on weighted scores, so the highlighted "next" bar is sometimes not the tallest (slice 2).
- "Illucia plays blind, from the blanks alone" stays true of her guessing but not of the round once the server keeps the word (slice 3).
