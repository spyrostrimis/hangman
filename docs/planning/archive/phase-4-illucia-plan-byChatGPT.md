Yes. I went through the updated Phase 4 plan, the current `main` code—not just the plan—the present Hangman/Illucia UI, current Hangman solvers and research projects, browser-side ML options, current Cloudflare Workers AI capabilities/pricing, and several possible English lexicons.

The main conclusion I came away with is slightly more specific than the current plan:

> **Illucia should not be built as “local solver OR language model.”**  
> Build one clean reverse-Hangman game with a **shared deterministic game core**, then put an interchangeable **Illucia decision engine** on top of it. The first and default engine should be a strong local statistical solver. A live language-model engine can later become an optional second opponent/experimental mode without changing the game itself.

That fits what you already established: the secret is separate, Illucia receives only public state, ordinary code determines hits/misses/win/loss, and the sixth wrong guess ends the round. PLAN-accounts-and-illucia Your plan also correctly identifies local and Workers AI as the two principal runtime directions. PLAN-accounts-and-illucia

## **1\. Before Illucia: extract the game core**

This became more important after looking at the current repo.

Your current `App.js` still contains almost all the original Hangman state machine: `chosenLetters`, `incorrectGuesses`, `Winner`, `Loser`, `remainingTries`, `addChosenLetter`, keyboard handling, etc. It also still contains the known transparent-answer `<div>`, and `remainingTries` is a second, slightly awkward representation of the six-miss rule. [Current App.js on main](https://github.com/spyrostrimis/hangman/blob/main/client/src/App.js)

If we now implement the same rules independently in `Illucia.js`, we will immediately have **two Hangman engines** which can disagree.

I would instead create something conceptually like:

                ┌──────────────────────────┐  
                 │      Hangman core        │  
                 │                          │  
answer ─────────▶│ applyGuess(state, "e")   │  
                 │ pattern                  │  
                 │ misses                   │  
                 │ status                   │  
                 └────────────┬─────────────┘  
                              │  
                    public game state  
                              │  
                    ┌─────────▼─────────┐  
                    │ Illucia strategy  │  
                    │ chooseLetter()    │  
                    └─────────┬─────────┘  
                              │  
                              e  
                              │  
                    back into game core

The core should have **zero React, zero DOM and zero AI**. Something roughly along the lines of:

createRound(answer)  
applyGuess(round, letter)

getPattern(round)  
getIncorrectGuesses(round)  
getRemainingMisses(round)  
getRoundStatus(round) // "playing" | "solved" | "failed"

And one exported constant:

MAX\_MISSES \= 6;

For normal Hangman, **the human calls `applyGuess()`**. For Illucia, **the solver calls exactly the same `applyGuess()`**.

That simultaneously gives us a good Phase-4 place to remove the stale keyboard-closure issue, the transparent answer leak, and redundant `remainingTries` state that your own `CLAUDE.md` already flags for game-core extraction. [Current project rules / CLAUDE.md](https://github.com/spyrostrimis/hangman/blob/main/CLAUDE.md)

I would do this as a characterization/refactor slice **with no visible change whatsoever to `/hangman`** before touching the Illucia UI.

---

# **2\. What should Illucia's “brain” actually be?**

The web is full of Hangman solvers, but most fall into a few families.

A very common baseline does exactly what your plan describes: filter all words that fit the pattern, then guess the untried letter occurring in the most remaining candidate words. Current online solvers such as AllWordTools and WordGamesToolkit use essentially this candidate-frequency approach. [AllWordTools.com](https://www.allwordtools.com/tool/hangman-solver)

But there is a better basis for **your** Illucia.

A letter does not merely answer “yes/no.” It can produce different positional outcomes. If the pattern is:

\_ \_ \_ \_ \_ \_

and Illucia guesses `E`, different candidates might produce:

\_ \_ \_ \_ \_ \_    no E  
E \_ \_ \_ \_ \_  
\_ \_ E \_ \_ \_  
E \_ \_ \_ \_ E  
\_ E \_ E \_ \_  
...

Each is a different partition of the remaining candidate set.

So rather than merely asking:

> “Which letter is in the most words?”

Illucia can ask:

> **“Which letter gives me the best combination of information and safety?”**

This distinction appears in existing solver work too: some solvers explicitly aim for a roughly even split of the remaining candidate space rather than raw English letter frequency. [GitHub](https://github.com/ethan-schaffer/Hangman-Solver) Other current solvers expose entropy/information-gain rankings. [WordSolverX](https://wordsolverx.com/hangman-solver)

And Hangman has an important twist compared with pure information theory:

**hits are free; misses are expensive.**

So pure entropy is also not quite enough.

## **The model layers I would use**

| Layer | What it knows / does | My recommendation |
| ----- | ----- | ----- |
| **0\. Game state** | `_ _ A _ _`, guessed letters, wrong letters, misses remaining | Shared pure core |
| **1\. Lexical candidate model** | Keeps only words still mathematically possible | Essential |
| **2\. Outcome model** | For every available letter, groups candidates by the exact positions that would be revealed | Essential |
| **3\. Information model** | Measures how much a letter is expected to reduce uncertainty | Essential |
| **4\. Risk model** | Penalizes a letter according to its probability of being absent; penalty increases as Illucia approaches six misses | **This is the key Illucia layer** |
| **5\. Endgame search** | When very few candidates remain, looks one or two moves ahead rather than greedily choosing this turn | Very attractive V1.1 |
| **6\. Orthographic model** | Character n-grams/bigrams/trigrams/etc. when the secret is outside the lexicon | Only needed if we later permit unknown words |
| **7\. Neural model** | Character Transformer/BiLSTM predicting the next letter | Interesting later experiment |
| **8\. Generic LLM** | Workers AI proposes a letter from public state | Optional alternative opponent, not the foundation |

For a letter $L$, conceptually:

information\_gain(L)  
miss\_probability(L)  
remaining\_misses

become something like:

utility(L)  
  \= information\_gain(L)  
    \- riskWeight(remaining\_misses) \* miss\_probability(L)

When Illucia has six chances left, she can afford a clever discriminating guess.

With one chance left, she should become conservative and heavily prefer the letter most likely to hit.

That would make her behavior visibly intelligent rather than just following `ETAOIN...`.

And the value of the information model is higher if we use the **full reveal mask**, not merely “letter appears / letter does not appear.”

---

# **3\. A subtle candidate-filtering rule that matters a lot**

Suppose Illucia guessed `E`, and the game revealed:

E \_ \_ \_ E

Then a candidate such as:

EERIE

is **impossible**, even though a loose regular expression might consider it compatible with the known positions.

Why? Because Hangman reveals **every occurrence of E** when E is guessed.

Therefore, once a letter has been guessed, its set of positions in every surviving candidate must equal its visible positions **exactly**.

Similarly, a missed letter may occur nowhere.

This is worth encoding directly into the candidate-model tests. Several public solvers explicitly make the same “revealed everywhere” assumption. [AllWordTools.com](https://www.allwordtools.com/tool/hangman-solver)

That matters particularly for repeated-letter words, which you already sensibly have in the Phase-4 verification contract. PLAN-accounts-and-illucia

---

# **4\. Frequency solver vs entropy solver vs n-gram vs neural AI**

Here is how I see the realistic options for **this project**, rather than AI in the abstract.

| Engine | Quality | Runtime | Download / infrastructure | Explainable | Fit for Hangman Rescue Mission |
| ----- | ----- | ----- | ----- | ----- | ----- |
| Global English letter frequency | Low | instant | tiny | excellent | Too primitive |
| Candidate-word frequency | Good | instant | dictionary | excellent | Good baseline |
| **Candidate \+ risk-adjusted information gain** | **Very good** | instant | dictionary | **excellent** | **Best V1** |
| Above \+ short endgame lookahead | Better | very fast | dictionary | excellent | Strong V1.1 |
| Character n-grams | Good OOV generalization | fast | statistics | good | Useful if unknown words allowed |
| BiLSTM / char Transformer | Potentially strong OOV | local/model inference | model weights | medium | Interesting portfolio experiment |
| Generic browser Transformer | Uncertain | device dependent | large model | poor | Not attractive |
| Workers AI LLM | Variable | network latency | Worker \+ AI binding | medium/poor | Great optional “live model” experiment |
| RL/PPO/DQN | Research-interesting | training-heavy | model | poor-medium | Not justified for the product |

The repositories I inspected reflect almost the whole spectrum. A Trexquant-oriented solver combines candidate filtering with character n-grams from 2–5 characters; another trains PPO/LSTM on revealed word, previous guesses, attempts and letter probabilities; another compares a Transformer with DQN. There are also multi-expert systems combining several Transformers/CANINE models. Those are fascinating research directions, but much more machinery than your production game requires. [NLP/n-gram Hangman example](https://github.com/juBmam/Hangman-NLP-Solver) [PPO/LSTM Hangman example](https://github.com/sagarnildass/Hangman-PPO-LSTM?utm_source=chatgpt.com) [Supervised Transformer vs DQN example](https://github.com/havo2001/hangman-supervised-vs-rl)

The most interesting neural example I found is a dedicated **character-level** Hangman Transformer: 28-symbol vocabulary, eight Transformer layers, roughly 17.3M parameters, and a self-reported 63.4% win rate on the Trexquant benchmark. The number is the repository author's benchmark, not an independently verified comparison, but the architecture is much more relevant than dropping a generic chat model into Hangman. [GitHub](https://github.com/GeetRakala/HANGMAN)

Another n-gram project self-reports 55%, and other repositories report \>60%; the evaluation conditions differ substantially, so I would **not compare these percentages directly**. [GitHub](https://github.com/Sanky18/Trex-Quant-Hangman-Game-Challenge)

There is a major difference from Trexquant, though:

**Trexquant deliberately tests on words excluded from the training dictionary. Your V1 does not have to.**

If the player's word is validated against the exact same lexicon Illucia uses, the secret must always remain somewhere in Illucia's candidate set. That makes a huge neural network much less necessary.

This changes my recommendation from your current plan somewhat:

### **V1 does not actually need an n-gram fallback.**

If validation says the word belongs to Illucia's dictionary, then candidate inference is the correct model. A zero-candidate state would indicate a **bug in filtering**, not a normal linguistic situation.

Character n-grams become valuable when you later add:

> “Illucia doesn't know this word. Challenge her anyway?”

That would be an excellent V1.1/V2 mode.

---

# **5\. The lexicon: I would now look beyond ENABLE**

Your `CLAUDE.md` currently names ENABLE as the leading candidate. That made sense, and its public-domain pedigree is attractive.

But after checking what is available **now in 2026**, I think **ESDB/SCOWL v2 deserves to become the leading candidate**.

The current English Speller Database—the successor to SCOWL—can generate a particular English dialect and vocabulary size, has explicit variant/category controls, and says its default size 60 has been vetted. It is actively maintained; the February 2026 dictionary release added over 1,500 high-frequency words. [GitHub](https://github.com/en-wl/wordlist)

Its license explicitly permits using, copying, modifying, distributing and selling ESDB or lists generated from it, provided the copyright/permission notice is retained. [GitHub](https://github.com/en-wl/wordlist/blob/v2/Copyright)

That would let us deterministically generate something roughly like:

American English  
size 60  
normal variants  
special categories excluded  
A-Z words only  
length 3–20  
lowercase  
sorted \+ deduplicated

The source tool even documents the relevant extraction controls. [GitHub](https://github.com/en-wl/wordlist/blob/v2/README.md)

Two other candidates I checked are worth knowing about. The Wordnik open-source game-developer wordlist is MIT-licensed and explicitly aimed at English word games, although its public list dates from 2021\. [GitHub](https://github.com/wordnik/wordlist) The Common English Lexicon is also MIT-licensed and contains about 69,200 intentionally common word-game words. [GitHub](https://github.com/Fj00/CEL)

I would avoid the extremely popular `dwyl/english-words` dataset: although the repository itself uses the Unlicense, its own README says copyright in the underlying word data belongs to the original source. [GitHub](https://github.com/dwyl/english-words)

I also would **not import `wordfreq` just to obtain priors**. Its code is Apache-licensed but its redistributed data is CC BY-SA 4.0, adding licensing/attribution complexity we simply do not need here. [GitHub](https://github.com/rspeer/wordfreq/blob/master/README.md)

### **In fact, I would begin with *uniform* candidate weights**

This is an interesting consequence of your game design.

The user isn't being given a random English word. **The user deliberately chooses a word to defeat Illucia.**

So natural-language frequency is not necessarily a good prior. A strategic human will deliberately choose `rhythm`, `lynx`, `glyph`, etc. Existing Hangman analysis explicitly notes that opponents can adapt once they understand the guesser's statistical strategy. [scrabulizer.com](https://www.scrabulizer.com/hangman/solve)

Uniform candidate weighting is therefore clean, fair and robust for V1.

Later we can benchmark a modest commonness prior against uniform weighting.

---

# **6\. Do not ship the dictionary as one giant JavaScript import**

This page is an unusually good opportunity to make your first real code split.

Your own `CLAUDE.md` already suggests lazy-loading Illucia. I would go one step further.

Instead of:

illucia-words.json   170,000+ words

produce deterministic build assets such as:

illucia/  
  3.txt  
  4.txt  
  5.txt  
  6.txt  
  ...  
  20.txt

The player enters a 9-letter word → the browser requests **only the 9-letter lexicon**.

That gives us:

/illucia route loaded  
      ↓  
player enters "something"  
      ↓  
normalize: 9 letters  
      ↓  
fetch /illucia/lexicon/9.txt  
      ↓  
validate locally  
      ↓  
send 9-letter candidate set to solver

No word list contaminates the initial Home/Hangman bundles, and even Illucia doesn't download irrelevant word lengths.

I would probably run the solving calculations inside a **browser Web Worker**—not to be confused with your Cloudflare Worker.

A recent online entropy-based Hangman solver does exactly this sort of Worker separation for solver computation. [WordSolverX](https://wordsolverx.com/hangman-solver)

We can benchmark first and discover it isn't necessary, but architecturally it is clean: the UI says “Illucia is thinking,” the solver worker computes, and a restart can terminate/cancel stale work.

---

# **7\. What about an actual language model?**

This is where I would distinguish **“AI opponent”** from **“LLM opponent.”**

Your local solver absolutely qualifies as AI/game AI. It is doing inference over hidden state and taking actions under a loss budget.

But if part of the portfolio appeal is specifically:

> **Play against a live language model**

then Workers AI is still the logical additional mode.

Cloudflare currently gives the Free plan **10,000 neurons/day**, after which requests fail unless you move to Paid. Some of the heaviest models became Paid-only in July 2026, while several others remain available to Free users. [Cloudflare Docs](https://developers.cloudflare.com/workers-ai/platform/pricing/)

For Illucia the request can be exceptionally small:

{  
  "pattern": "\_ e \_ \_ e",  
  "guessed": \["e", "a", "s"\],  
  "wrong": \["a", "s"\],  
  "remaining\_misses": 4  
}

and the answer should be essentially:

{ "letter": "r" }

Cloudflare's current JSON Mode can request schema-constrained outputs, although Cloudflare explicitly says compliance isn't guaranteed in all cases—which reinforces your plan's requirement to validate the response anyway. [Cloudflare Docs](https://developers.cloudflare.com/workers-ai/features/json-mode/)

The secret word must **never** appear in that request. Your uploaded plan already specifies exactly this separation. PLAN-accounts-and-illucia

My Workers-AI flow would therefore be:

Browser owns "serene"  
       │  
       ├── game core knows "serene"  
       │  
       └── sends only "\_\_r\_\_\_", guesses, misses  
                    │  
                    ▼  
              /user/illucia/guess  
                    │  
             authenticated Worker  
                    │  
               Workers AI  
                    │  
                  "e"  
                    │  
                    ▼  
Browser's game core adjudicates

The server remains **stateless**. No Durable Object. No WebSocket. No agent framework. No model conversation history.

If the request fails, times out, returns `E again`, returns `"I think E"`, or Cloudflare hits quota:

validate result  
      ↓ bad  
bounded retry at most once  
      ↓ still bad  
local Illucia solver

That makes the local solver mandatory even in the live-model version, exactly as `CLAUDE.md` currently proposes.

### **But I would not make Workers AI the default Illucia**

A generic LLM has several disadvantages here: Hangman is fundamentally a **character-level** probability/control problem; LLMs operate on tokenized text, are nondeterministic, cost network latency, can output malformed actions, and need quota/failure handling.

A 50-line carefully designed candidate/information policy can be more appropriate than a billion-parameter language model.

That is a nice portfolio story in itself:

> “We used AI where it fits the problem, rather than adding an LLM because the menu says Play vs AI.”

---

# **8\. Browser-side Transformers.js?**

Technically, yes.

Transformers.js now runs models locally via WASM or WebGPU, and Hugging Face reports about **85% global WebGPU support as of March 2026**. It recommends quantized models for bandwidth/resource-constrained browser use. [Hugging Face](https://huggingface.co/docs/transformers.js/guides/webgpu)

So a future Illucia could load a custom ONNX character model locally.

But I would not use a generic DistilBERT/BERT-style model here just to say we have “local AI.” We'd introduce:

@huggingface/transformers  
ONNX model files  
large initial download  
WASM/WebGPU compatibility  
model warm-up  
memory usage  
mobile variability  
fallback path

to solve a 26-action decision problem that a compact statistical engine solves elegantly.

If we eventually train **our own char-level Illucia model**, that changes the equation. Then Transformers.js becomes genuinely interesting as a V2 portfolio experiment.

---

# **9\. How I would design the Illucia page**

Your normal Hangman page already gives us the visual language.

In the screenshot it reads vertically as:

            NAVIGATION

 ┌──────────────────┐   ┌──────────────────┐  
 │  Artsy / screen  │   │ instructions /   │  
 │                  │   │ hints / facts    │  
 └──────────────────┘   └──────────────────┘

             \_ \_ \_ \_ \_ \_ \_

       ┌──────────────────────────┐  
       │ hint buttons \+ keyboard  │  
       │           \+ Ronny        │  
       └──────────────────────────┘

I would **not invent an entirely different chat interface for Illucia**.

Instead, reverse the roles while keeping the visual grammar:

            NAVIGATION

 ┌──────────────────┐   ┌──────────────────┐  
 │     ILLUCIA      │   │   TURN LOG       │  
 │                  │   │                  │  
 │  character / AI  │   │ Turn 1  E  HIT   │  
 │  processing      │   │ Turn 2  T  MISS  │  
 │  display         │   │ Turn 3  A  HIT   │  
 └──────────────────┘   └──────────────────┘

            E \_ \_ A \_ E

         ● ● ● ● ○ ○  
       4 mistakes available

       ┌──────────────────────────┐  
       │       ILLUCIA GUESSES    │  
       │             R            │  
       │                          │  
       │ A B C D E ... X Y Z      │  
       │ used letters displayed   │  
       └──────────────────────────┘

The alphabet keyboard can actually remain—**but now it is a display, not an input**.

That inversion is attractive because the player immediately understands:

> “Ah\! This is the same machine, except now the computer is pressing the keys.”

Hit letters could adopt the current active style; missed letters the inactive/magenta style; unguessed letters stay neutral. Then Illucia's newly chosen letter pulses for a moment.

The right-hand screen can replace “Instructions & Tips” with the running turn history:

ILLUCIA // TURN 4

Candidate field: narrowing...  
Guess: R

✓ HIT  
2 positions revealed

4 mistakes remaining

I would **not expose candidate words** during gameplay because that turns the game into a debugging dashboard. But an expandable:

**HOW ILLUCIA THINKS**

could show after or during the game:

Possible words: 1,428 → 213  
R hit probability: 72%  
Information score: 3.18  
Decision: R

That would be unusually good for your portfolio: a visitor can actually see the solver's reasoning without seeing the secret.

### **Setup state**

The initial `/illucia` screen should not jump straight into that board. Before playing:

CHALLENGE ILLUCIA

Think of an English word.

Illucia will know its length and the results of  
her own guesses — never the word itself.

\[       your word       \]

3–20 letters · English letters only

        CHALLENGE ILLUCIA

Validation happens **locally**.

Once accepted, the text entry disappears and the game replaces it with blanks.

For the local version we can truthfully say:

> **Your secret word never leaves your browser.**

For a future Workers-AI version we can still truthfully say the *word* never leaves the browser because only public game state is sent.

### **Personality**

Keep Illucia's personality scripted, as your current rules propose.

That gives us lovely event-triggered lines without another AI call:

opening  
first hit  
first miss  
three misses  
one life left  
rare-letter guess  
solver wins  
player wins

This is more controllable and much cheaper than using an LLM to generate “Ha\! I knew it\!” every turn.

And I would definitely find or create a proper Illucia character treatment; the repo currently has `hanai.png`, `illucia-bg.jpg` and the route-specific Illucia backgrounds, but the live `Illucia.js` itself only renders the placeholder text. [Current Illucia component](https://github.com/spyrostrimis/hangman/blob/main/client/src/Components/Illucia.js)

---

# **10\. A three-state component, not another giant `App.js`**

I would model the page explicitly as:

setup  
  ↓  
playing  
  ↓  
finished

rather than sprinkling booleans through `App.js`.

Conceptually:

IlluciaPage  
├─ IlluciaSetup  
├─ IlluciaGame  
│  ├─ IlluciaStage  
│  ├─ Pattern  
│  ├─ MissCounter  
│  ├─ TurnHistory  
│  ├─ LetterBoard  
│  └─ AnalysisDrawer  
└─ IlluciaResult

with non-React code:

lib/hangman-core.js  
lib/illucia/solver.js  
lib/illucia/candidates.js  
lib/illucia/strategy.js

and potentially:

workers/illucia-solver.worker.js

This is one of those cases where I would **not reuse components merely because they happen to exist**. We can reuse presentation styles and perhaps small letter/pattern components, but `Keyboard.js` currently contains navigation, flip animation, hints, Ronny and `window.location.reload()`. It should not become the Illucia solver UI by adding fourteen conditionals. [Current Keyboard.js](https://github.com/spyrostrimis/hangman/blob/main/client/src/Components/Keyboard.js)

---

# **11\. “How intelligent should Illucia be?”**

There is an important product question hiding here.

If she plays mathematically close to optimally against a known finite lexicon, an ordinary player may discover that choosing a normal word becomes rather hopeless.

But the player is allowed to select the word, so the human has a counter-strategy: rare letter combinations, low-frequency vowels, words such as `rhythm`, etc. Existing statistical Hangman work explicitly identifies this kind of adversarial effect. [GitHub](https://github.com/ethan-schaffer/Hangman-Solver)

I therefore would **not artificially dumb her down yet**.

Build the strong deterministic engine first and benchmark it.

Then we can decide from actual play whether Illucia needs difficulty personalities such as “Curious / Clever / Merciless.” That is much better than putting a random 20% chance of making a stupid guess into the first implementation.

---

# **12\. How I would benchmark the model layers**

This is important because otherwise Claude, Codex, you and I can argue forever about entropy vs frequency vs n-grams. 😄

Build one **offline evaluation harness** in `tools/`.

Use exactly the same game core and test each policy over a fixed deterministic evaluation corpus.

Record:

win rate within 6 misses  
average wrong guesses  
average total turns  
win rate by word length  
worst-performing word families  
p50/p95 solve time per decision  
candidate-set sizes  
zero-candidate bugs

Then compare:

A — global frequency  
B — candidate hit frequency  
C — outcome entropy  
D — risk-adjusted entropy  
E — D \+ 2-ply endgame lookahead  
F — n-gram OOV solver       \[later\]  
G — neural char model       \[much later\]  
H — Workers AI models       \[optional\]

For the in-lexicon mode, this will tell us empirically whether the fancy layers are buying anything.

For an eventual neural/n-gram model, make a **separate held-out test corpus** where the answer is excluded from the candidate dictionary. That is the only honest way to measure generalization instead of dictionary recognition. Trexquant's challenge is built around exactly this distinction. The common baseline in that challenge reportedly gets only about 18% on mutually exclusive test words, which explains why those projects invest in n-grams/RNNs/Transformers; that scenario is much harder than your proposed validated-word V1. [Scribd](https://www.scribd.com/document/997864061/Hangman-Project)

---

# **13\. The implementation sequence I'd give Codex/Claude**

Because `main` deploys directly to production in your project, I'd keep the slices unusually clean:

1. **Extract `hangman-core` and characterize the current `/hangman` game.** Replace duplicate/redundant rule state, fix the stale keyboard closure and remove the transparent answer div as part of that explicitly authorized game-core slice. Existing page should look identical.  
2. **Choose and pin the Illucia lexicon.** My current preference is ESDB/SCOWL v2 size 60, American English, filtered to your A–Z/length contract. Add its license notice, deterministic extraction script, checksum and length-bucket output.  
3. **Build the pure solver plus benchmark harness.** Candidate filtering first; candidate-frequency baseline; outcome partitions; risk-adjusted information policy. No React yet.  
4. **Build `/illucia` setup → playing → finished using the local engine.** Keep auth gate, use the existing Illucia route art, lazy-load the route and length-specific dictionary, add cancellable “thinking” presentation and turn history.  
5. **Do responsive/accessibility/polish work.** Mobile should stack the two top panels, then pattern/misses, then letter board. Respect reduced motion. Restart must reset state without a page reload.  
6. **Only then decide whether “Play vs AI” needs a second `Live Model` mode.** If yes, change the mirrored HARD RULE explicitly, add the Cloudflare AI binding and authenticated stateless endpoint, benchmark free models against the local engine, validate every output and fall back locally. Your existing Phase-4 plan already says quota exhaustion and invalid-model responses need first-class testing. PLAN-accounts-and-illucia

---

## **So, what would I build?**

For **Phase 4 as it stands today**, my target would be:

**Illucia V1 \= shared pure Hangman core \+ local browser-side candidate solver \+ risk-adjusted information gain \+ ESDB/SCOWL-derived length-bucket lexicon \+ reversed version of your existing Hangman visual layout \+ scripted Illucia personality \+ visible turn history \+ optional “How Illucia thinks” panel.**

No LLM. No RL. No neural model. No vector DB. No embeddings. No RAG. No agent. No WebSocket. No new persistent server state.

And crucially, I would **design the `chooseLetter(state)` boundary from day one** so that six months from now we can drop in:

chooseLetterLocal()  
chooseLetterNgram()  
chooseLetterTransformer()  
chooseLetterWorkersAI()

and run the *same secret word against all four Illucias*.

That, actually, could become a very cool later feature in its own right: **“Which AI can beat your word?”**

The strongest immediate next step is therefore **not designing `Illucia.js` yet**. It is to specify the shared game-core contract and the local solver mathematically. Once those are fixed, we can design the page around real states rather than inventing UI and then bending the engine underneath it.

