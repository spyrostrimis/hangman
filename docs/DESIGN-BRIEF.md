---
name: 'Hangman: Rescue Mission'
colors:
  background: '#0b0d1a'
  on-background: '#e4e3e8'
  primary: '#f3f400'
  on-primary: '#0b0c10'
  secondary: '#10cfe6'
  on-secondary: '#0b0c10'
  tertiary: '#a54ed7'
  on-tertiary: '#ffffff'
  success: '#3ee07a'
  error: '#bd1b6d'
  outline: '#93939355'
typography:
  display:
    fontFamily: TechnoBoard
    fontSize: 48px
    fontWeight: '400'
    lineHeight: 1.1
    letterSpacing: 0.04em
  label:
    fontFamily: Bruno Ace SC
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 1.3
    letterSpacing: 0.1em
---

# Design Brief: Hangman: Rescue Mission (redesign)

**This is a redesign brief, not a description to copy.** The live site (hangman.spyrostrimis.com) and the repository (github.com/spyrostrimis/hangman) are the current version and the source of truth for **content and rules**, not for layout or components. Please reimagine the pages: new layouts, new component shapes, new navigation, new ways to show game state, new motion. Section 8 separates the few binding constraints from how things work today; everything else is open, and bold alternatives are welcome. When in doubt, offer two directions rather than one safe copy.

**The product (README):** "A vocabulary game about reviving the robot Artsy." Players guess an English word letter by letter before six misses, then learn it from Merriam-Webster dictionary facts; a win reveals a painting. A second mode, Illucia, reverses the game: the player picks the word and a robot guesses it.

## 1. Visual Theme & Atmosphere

**Direction:** space, old video games, robots. Think retro arcade and early space-game interfaces, deep-space scenery, friendly cartoon robots, a sense of playful sci-fi nostalgia. It should feel like a game, not an app dashboard.

**The characters carry the story** and should be prominent:
- **Artsy**, a robot from the planet Solaria who "cannot speak" and "communicates through painting". He has shut down, and the player's guesses bring him back.
- **Professor Han Fastolfe**, a robot linguist from Aurora (inspired by Asimov's Robot series), Professor of Linguistics at MIT, Artsy's best friend. He gives the hints.
- **Illucia**, Han's daughter: nerdy, supersmart, confident, a little cheeky. She loves words and statistics, and she is the opponent in the reversed game.

**Tone of copy:** warm, lightly humorous, nerdy. Illucia's lines are scripted and quote real numbers (for example, "E is in 66% of the 11,200 words I still have in mind.").

What the current site does (for context only, not to reproduce): full-screen space photographs behind every page, neon yellow text, cyan glowing "CRT screen" panels with scanlines, rounded glowing "pods" where the robots stand, a grey arcade-style keyboard console, and a yellow neon navigation capsule. Keep the spirit if you like it; change the execution freely.

## 2. Color Palette & Roles

The tokens above are **brand anchors**, not a complete palette. Extend, adjust tones or add colours as your direction needs.

- **Arcade Yellow** (#f3f400): the brand accent, used today for titles and the main call to action.
- **Screen Cyan** (#10cfe6): machines, information, secondary actions.
- **Illucia Violet** (#a54ed7): Illucia's personal accent.
- **Power Green** (#3ee07a) and **Warning Magenta** (#bd1b6d): right and wrong guesses, remaining and lost chances.
- **Deep Space** (#0b0d1a): dark base. The site is dark-themed; keep it dark.

Character accents already used in the story: Han green, Artsy orange, Illucia violet.

## 3. Typography Rules

- **TechnoBoard** (supplied font file, not on Google Fonts): the display face for titles. Blocky, retro-computer. It has no "!" glyph, so avoid exclamation marks in it.
- **Bruno Ace SC** (Google Fonts): wide sci-fi small caps for navigation, buttons, labels and numbers.
- These two are the brand's type voice and should stay recognisable across all pages. **Body text is open:** the current site uses a system monospace for a "terminal readout" feel; you may keep that or propose a readable companion face.

## 4. Component Stylings

Components are described by **what they must do**. Their look, shape and placement are yours to design.

### Buttons
Primary actions ("Play Hangman", "Play again", "Start the duel", "Sign in") and small tools ("Hint 1", "Hint 2", "Instructions & tips", "New word"). They need clear primary and secondary levels and visible focus states.

### Cards & Containers
Content panels for the story, dictionary facts, hints, scores and forms. The characters need a place to stand and react.

### Navigation
Five destinations: "HOMEWORLD" (home), "Play Hangman", "Play vs AI", "Illucia", "Hall of Fame". Plus the account area: the signed-in player's name and points ("100 pts") with "Logout", or "Sign In" for guests. Show the current page. It must work on a 360px-wide phone.

### Inputs & Forms
Username, password and the Illucia secret word field (3–15 letters, A–Z), each with help and error text.

### Domain-Specific Components
- **Word board:** one slot per letter; found letters appear; after a loss, the missed letters are revealed.
- **Letter keyboard:** A–Z, showing unused, correct and wrong letters. The physical keyboard also works.
- **Chances:** six misses allowed; show what remains in a game-like way (not a hanged figure).
- **Artsy's revival:** his state during play, a painting on a win, "Game Over" on a loss.
- **Word facts after the round:** the word, "Definition", "Part of speech", "Merriam-Webster pronunciation" with an audio play button, "Example" with its source, "More about this word", and the Merriam-Webster attribution.
- **Illucia's thinking:** how many words she still has in mind, why she picks each letter, her next guess.

## 5. Layout Principles

Free to redesign. Requirements only:
- Works from 360px phones up to wide desktops with no horizontal scrolling, and 44px minimum touch targets.
- Pages may scroll. The Play vs AI page is deliberately a long, downward-scrolling conversation.
- Every page is dark, over or around space imagery (the four supplied backgrounds may be used, replaced or dropped).

## 6. Design System Notes for Stitch Generation

### Language to Use
"Retro arcade in deep space", "friendly cartoon robots", "old space-game interface", "playful, nerdy, glowing". Avoid a generic SaaS or dashboard look.

### Color References
Arcade Yellow #f3f400, Screen Cyan #10cfe6, Illucia Violet #a54ed7, Power Green #3ee07a, Warning Magenta #bd1b6d, Deep Space #0b0d1a.

### Component Prompts
- "Reimagine the Hangman game screen for a robot-rescue story: Artsy has shut down, each correct letter helps revive him, six misses end the attempt. Retro arcade in space, dark, playful."
- "Design a two-player duel page where a nerdy robot girl guesses the player's secret word one letter at a time, as a conversation that scrolls downwards."
- "Design a Hall of Fame high-score screen that feels like an arcade cabinet, with the signed-in player's row highlighted."

### Incremental Iteration
Explore at least two distinct directions for the Home and Hangman pages before converging; keep the fonts and characters constant across them.

## 7. Pages to Design (all of them)

Real content below; UI labels may be tightened, but keep the meaning and do not invent features.

1. **Home** (`/`): the story. "Professor Han Fastolfe urgently seeks your assistance. His dear friend Artsy has mysteriously shut down. Only one thing can awaken Artsy from his slumber — a secret word. Discover it and breathe life back into Artsy." "But beware! You have a limited number of attempts." Actions: play Hangman, challenge Illucia. Guests: sign in to earn 100 points per rescue. Introduce the three characters with their short bios.
2. **Play Hangman** (`/hangman`): the main game. Word board, keyboard, six chances, Hint 1 (a harder synonym), Hint 2 (a friendlier clue), Instructions & tips, Artsy's revival, word facts after the round, the score message ("100 points saved! Your total is 100."), "Play again" and a way to the Hall of Fame.
3. **Play vs AI** (`/illucia`): the experimental page. A duel as a **conversation scrolling downwards**. Illucia asks for a letter ("Is there an S?"). On a hit, grey tiles appear where the letter goes and the player taps each to reveal it. On a miss, the player replies "Oops, wrong" or "That wasn't so smart ;)" and Illucia answers that reply. A row showing the word so far follows each turn. Setup is part of the conversation (secret word, vocabulary level: Apprentice, Scholar or Master). Her chances stay visible while scrolling. It ends with "Illucia wins" or "You win", "Play again", and "Rematch" at a harder level.
4. **Illucia** (`/illucia-observatory`): the same duel as a single-screen "observatory". Illucia on stage, her words-in-mind count, a letter-frequency visual showing her next guess, her speech, the word board, her chances, Pause, Speed, New word. **This page is the owner's current favourite style**, so use it as inspiration for the overall feel, not as a layout to copy everywhere.
5. **Hall of Fame** (`/hall-of-fame`): top cumulative scores (Rank, Player, Score), shared places for ties, the signed-in player highlighted ("You are 2nd with 100 points."), loading, empty ("No scores yet.") and error states, and a guest invitation to compete.
6. **Sign in / Create account** (`/login`, `/signup`): username (3–20 letters or numbers, shown in the Hall of Fame), password (15–128 characters; "password recovery is not available yet"), and a link to switch between the two. A character may greet the player.
7. **Guest notice on both Illucia pages**: "Only for registered players", with sign-in and create-account links.

## 8. Constraints and today's design

Binding (the project's CONSTRAINTS):

- **English UI only**; this is an English-vocabulary learning game.
- **Merriam-Webster branding** wherever dictionary content appears: the unmodified official logo at exactly 50×50, 100×100 or 125×125 px, and the title in full, "Merriam-Webster's Collegiate® Dictionary with Audio". Never "Webster's" alone.
- **Example sentences are real**, sourced from Merriam-Webster with attribution.

How it works today (keep unless a brief says otherwise):

- **The three characters keep their appearance**: use the supplied images of Artsy, Professor Han Fastolfe and Illucia, unaltered.
- **The painting is a reward, not a hint**: shown only after a win; a loss shows "Game Over". Hints and word facts do not describe the painting.
- **No gallows or hanged figure.** The story is rescuing a robot.
- **Word facts (definition, example, explanation) appear only after the round ends.**
- **Illucia guesses from the board** (the pattern and the letters already guessed); the player may see their own word. This design is being rethought.
- **No voice or speech for Illucia or the player** (Spyros's decision; only the dictionary pronunciation button in Hangman plays audio).
- Illucia duels earn no Hall of Fame points yet; points are being designed. Each Illucia page links "Credits & licences" for its vocabulary.
- **Accessibility**: visible focus states, respect reduced-motion settings.
