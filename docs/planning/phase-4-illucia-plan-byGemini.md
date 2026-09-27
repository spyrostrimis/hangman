### **Core Solver & Model Layer Options**

To build Illucia’s reverse-Hangman engine, three distinct technical architectures can drive letter selection and gameplay dialogue.

| Metric / Dimension | Option 1: Pure Algorithmic Solver | Option 2: Pure LLM Guesser | Option 3: Recommended Hybrid Architecture |
| :---- | :---- | :---- | :---- |
| **Mechanic** | Shannon Entropy / Letter Frequency over dictionary | Direct LLM prompting via Cloudflare Workers AI | Algorithmic Solver selects letter; Workers AI / Template delivers persona |
| **Accuracy / Win Rate** | \~96–98% within 6 misses | \~60–75% (prone to letter/spelling tokenization errors) | 100% rule-compliant & optimal |
| **Latency** | \< 1 ms (Client or Worker edge) | 400 ms – 1500 ms per turn | \< 1 ms (Local) or \~500 ms (with LLM commentary) |
| **CF Neurons Cost** | 0 Neurons (100% Free) | \~150–300 Neurons/turn (\~15–20 games/day max free) | Optional \~50 Neurons/turn for commentary; 0 on local fallback |
| **Persona / Dialogue** | Static template strings | Fully dynamic, contextual AI chatter | Dynamic AI dialogue with seamless zero-cost template fallback |

### **Technical Deep Dive: The Optimal Solver Engine**

LLMs struggle with character-level manipulation due to sub-word tokenization (e.g., tokenizing "hangman" as single or dual tokens rather than individual characters). Relying on an LLM alone often leads to guessing previously tried letters, choosing invalid characters, or making suboptimal guesses.

#### **1\. Information-Theoretic Solver Core**

The solver maintains a active candidate set \$\\mathcal{D}\_{\\text{valid}}\$ initialized from a comprehensive 50,000–100,000 word English dictionary (e.g., ENABLE1 or SOWPODS).  
Upon each turn, given the current revealed pattern \$P\$ and eliminated wrong letters \$E\$:

> 1. **Filter candidate set:**  
>    \$\$\\mathcal{D}\_{\\text{valid}} \= \\{ w \\in \\mathcal{D} \\mid \\text{length}(w) \= N \\land \\text{matches}(w, P) \\land \\text{excludes}(w, E) \\}\$\$  
> 2. **Compute Shannon Entropy per unguessed letter \$L\$:**  
>    Each letter \$L\$ splits \$\\mathcal{D}\_{\\text{valid}}\$ into pattern equivalence classes \$p \\in \\mathcal{P}(L)\$. The probability of hitting pattern \$p\$ is \$P(p) \= \\frac{\\vert{}\\mathcal{D}\_{p}\\vert{}}{\\vert{}\\mathcal{D}\_{\\text{valid}}\\vert{}}\$.  
>    The expected information gain \$H(L)\$ is:  
>    \$\$H(L) \= \-\\sum\_{p \\in \\mathcal{P}(L)} P(p) \\log\_2 P(p)\$\$  
> 3. **Selection Rule:**  
   * **Early Game (high candidate count):** Pick \$L\$ that maximizes entropy \$H(L)\$ to halve the search space per guess.  
   * **Late Game (small candidate count):** Pick the letter with highest raw frequency across remaining candidates to guarantee hits.  
   * **Dictionary Miss (0 candidates remain \- user entered an obscure or nonsense word):** Fall back to standard English letter frequency (E, T, A, O, I, N, S, H, R, D, L, U).

#### **2\. Countering Human Strategy Words**

Humans attempt to trick solver algorithms using vowel-less or rare-consonant words (e.g., RHYTHM, LYNCH, SYZYGY, JAZZ, PHYXIA, JINX, MYTH).  
The entropy solver naturally adapts: when E, A, O, I, U all return misses, candidate filtering drastically shrinks \$\\mathcal{D}\_{\\text{valid}}\$ down to the small subset of \$Y\$-vowel words, allowing Illucia to instantly lock onto Y, M, H, L, or Z.

### **Cloudflare Workers AI Model Layer & Quota Strategy**

For live mode, execute the solver in the Worker (or client) and pass the decision to Cloudflare Workers AI strictly for character persona generation.

#### **1\. Selected Model Candidates**

* **@cf/meta/llama-3.1-8b-instruct**: Excellent short persona dialogue and snappy response time.  
* **@cf/qwen/qwen2.5-7b-instruct**: High speed and compact output formatting.

#### **2\. Prompting Architecture (Zero Rule Leakage)**

Never ask the model to evaluate win conditions or track used letters. Send only public pattern state:

JSON  
{  
  "system": "You are Illucia, a sentient cosmic AI opponent in a word game. You are competitive, mysterious, and witty.",  
  "prompt": "Current word state: '\_ \_ S C A P E'. Remaining shields: 5/6. Your calculated guess: 'A'. Give a brief 1-sentence sci-fi commentary about this guess."  
}

#### **3\. Quota & Fallback Mechanism (10,000 Neurons/Day Limit)**

* **Rate-limiting & Caching:** Limit LLM commentary requests per session. If Cloudflare returns 429 (Quota Exceeded) or times out (\>1.5s), instantly switch to pre-authored static Illucia voice lines without disrupting game flow:  
  * *Hit:* "Your encryption weakens. 'E' has been revealed\!"  
  * *Miss:* "An anomaly\! 'Z' yields no matches. System shields remaining: 5/6."

### **UI / UX & Visual Page Design (/hangman vs /illucia)**

While /hangman features Artsy the robot at his easel on Earth, /illucia should present a high-contrast, cosmic AI combat arena matching the dark starry background in Screenshot 2\.

\+-----------------------------------------------------------------------------------+  
|  \[HOMEWORLD\]  \[PLAY HANGMAN\]  \[PLAY VS AI (Active)\]  \[HALL OF FAME\]  \[LOGOUT\]     |  
\+-----------------------------------------------------------------------------------+  
|                                                                                   |  
|  \+-----------------------------------+   \+-------------------------------------+  |  
|  |           ILLUCIA ENTITY          |   |          COMBAT LOG / DIALOGUE      |  |  
|  |     (Glowing Cosmic Core / Orb)   |   |                                     |  |  
|  |                                   |   |  Illucia: "A bold word choice...    |  |  
|  |   \[O\] \[O\] \[O\] \[O\] \[O\] \[O\]          |   |  Scanning letter frequencies."      |  |  
|  |   6 Cosmic Shields (Life Bar)     |   |  Illucia guesses: 'E'               |  |  
|  \+-----------------------------------+   \+-------------------------------------+  |  
|                                                                                   |  
|                        WORD PATTERN:  \_  E  \_  C  A  P  E                         |  
|                                                                                   |  
|  \+-----------------------------------------------------------------------------+  |  
|  |  PHASE 1: SECRET WORD ENTRY  |  PHASE 2: GUESSING GRID / TURN CONTROLS     |  |  
|  |  \[ Enter Word: \_\_\_\_\_\_\_\_\_ \]   |  \[ A \] \[ B \] \[ C \] ... (Hits: Green, Misses: Red)|  |  
|  |  \[ Lock In & Begin Battle \]  |  \[ Next AI Turn \] / \[ Auto-Play Battle \]    |  |  
|  \+-----------------------------------------------------------------------------+  |  
\+-----------------------------------------------------------------------------------+

#### **1\. Character Contrast & Thematic Design**

| Element | Hangman (/hangman) | Illucia (/illucia) |
| :---- | :---- | :---- |
| **Opponent / Companion** | Artsy (Friendly mechanical robot) | Illucia (Mysterious glowing nebula AI core) |
| **Primary Theme Color** | Cyberpunk Cyan & Yellow Glow | Cosmic Deep Purple, Magenta, & Pulsing Violet |
| **Health / Lives Display** | Artsy's easel canvas drawing steps | 6 Floating Energy Shields / Crystal Orbs (shatter on miss) |
| **Interaction Focus** | Player clicks letters to save Artsy | Player enters word, then triggers or watches Illucia solve |

#### **2\. Two-Phase Interactive Game Flow**

> 1. **Setup Phase (Word Secret Input):**  
   * Input box with mask option (•••••• toggle to prevent over-the-shoulder peeking).  
   * Real-time normalization (converts to UPPERCASE, strips non A-Z).  
   * Word length counter (e.g., 3 to 15 letters).  
   * "Lock Word & Challenge Illucia" CTA button.  
> 2. **Battle Phase (Illucia's Turn Loop):**  
   * **Turn Controls:**  
     * **Manual Step (\[ Ask Illucia Next Letter \]):** Player clicks to trigger each guess, allowing time to read Illucia's commentary.  
     * **Auto-Play Toggle:** Automatically executes turns with a 1.2-second delay between guesses for cinematic pace.  
   * **Visual Feedback:**  
     * **Hits:** Letter slots highlight green with glowing particle effects.  
     * **Misses:** A cosmic shield node shatters with a pulsing red wave; missed letter is appended to eliminated list.  
   * **Terminal Feed:** A retro terminal box showing step-by-step logic:  
     \[SYSTEM\]: 142 candidate words remain.  
     \[ILLUCIA\]: "I detect standard vowel patterns. I guess 'E'."

### **Step-by-Step Implementation Roadmap for Phase 4**

#### **Step 1: Engine Layer (src/engine/IlluciaSolver.js)**

* Bundle a clean dictionary JSON (\~50k frequency-sorted words, \~350 KB gzipped).  
* Export getBestGuess(wordPattern, wrongLetters, wordLength) function implementing the entropy/frequency algorithm.

#### **Step 2: Hono API / Workers AI Endpoint (server/src/routes/illucia.ts)**

* Add authenticated POST /user/illucia/guess (or keep client-side for zero latency).  
* Handle optional Workers AI prompt binding with strict timeout protection and structured JSON response formatting.

#### **Step 3: Frontend Component (src/pages/IlluciaGame.jsx)**

* Construct the dual-phase view (Word Setup vs Combat Arena).  
* Build keyboard tracker showing state: Untried (Gray), Hit (Neon Green), Miss (Red Cross-out).  
* Integrate state management for round history and shield animations.

#### **Step 4: Outcome & Scoring Integration**

* Define Illucia leaderboard/scoring rules:  
  * Player wins if Illucia loses all 6 shields (6 misses).  
  * Illucia wins if she completes the word.  
* Keep score tracking separate from standard Hangman (+100) until anti-cheat / custom word difficulty scaling is finalized.