# Illucia question labels (B1)

Static yes/no category labels for Illucia's questions ("Can your word mean a bird?"),
built from Open English WordNet 2025. Requires Python 3.12+ (standard library only).
From the repository root:

```sh
python tools/build_illucia_labels.py --download
python tools/build_illucia_labels.py --check
cd tools
npm test
```

The first command may fetch missing inputs into ignored `tools/cache/illucia-wordnet/`.
It also reads the ESDB and LDNOOBW downloads in `tools/cache/illucia/`, created by the
vocabulary build (`tools/ILLUCIA-WORDS.md`). Later builds are offline. A build takes
about 80 seconds, mostly rebuilding the ESDB database. `--check` rebuilds and compares
every generated file without writing.

Nothing reads these files yet. B2 (the question chooser) and D1 (the AI-mode test) are
the first users.

## Source

`illucia-wordnet-sources.json` pins the `2025-edition` release asset
`english-wordnet-2025.xml.gz` (WN-LMF 1.3) by tag commit and SHA-256. It also pins
`LICENSE.md` and `WNDB_License.txt` at that commit. It is a separate lock because the
vocabulary build records every entry of `illucia-sources.json` in its own manifest.
We use the base release, not "2025-plus". The base has no proper-noun instances, so
`paris` is unknown, and `turkey` is a bird, a food and a person (a flop), but not a
country.

## Rules

- **YES if ANY sense fits.** A word is YES for a category if any of its senses belongs to
  it, in any part of speech. `crane` is first a machine but also a bird, so it is a bird.
- **Inflections** take the senses of their ESDB base word, but only in the inflected part
  of speech. `cranes` (plural noun or present verb) gets the noun and verb crane.
  `flying` (verb -ing) gets the verb fly and never the insect. `flies` gets both. Links
  through a blocked base word are never followed (`came` is never labelled through
  `cum`). The blocked set is the LDNOOBW list, ESDB's offensive/vulgar groups and the
  `illucia-filter.json` block entries.
  WordNet's own irregular forms are not used; they would add only 66 rare words.
- **Case-insensitive**, like the word files: the accepted word `monday` matches WordNet's
  `Monday`.
- **Categories** are listed in `illucia-categories.json`. Each one is either one or more
  WordNet lexicographer files (broad classes: person, animal, man-made object) or a
  "kind of" synset with all its descendants (narrow classes: bird, fruit, vehicle). The
  hypernym tree has gaps (`teacher` never reaches `person`), so broad classes use
  lexicographer files. Every synset id is checked against the lemma named beside it, so
  a mistyped id fails the build.
  Questions read "Can your word mean …?", which tells the player that any meaning counts.
  The adjective question reads "Can your word be a describing word (an adjective)?",
  because "mean" doesn't fit a part of speech. Each category has a `kind` (noun, verb or
  adjective). v1 asks noun categories only, unless B2's benchmark shows otherwise.
- **Exclusions.** `illucia-wordnet-exclude.json` lists reviewed senses with a reason each:
  obscene terms, and slurs against a group (ethnicity, nationality, religion,
  sexuality). They remove categories, never the word. Without them, `tool` would be a
  part of the body and `queer` and `taco` would be persons. Mild slang and words that are
  merely *about* rudeness keep their categories (`cuss`, `bawdy`, `boffin`, `runt`).
  OEWN's own usage tags are too sparse to rely on: 25 senses carry one, and synset-level
  tags are noisy (plain `teacher` is tagged "disparagement").

## Files

`client/public/illucia/labels/4.txt` … `15.txt` have one sorted line per word that
WordNet knows:

```
crane bcoM
news -
```

The codes follow the category order in `categories.json`. `-` means WordNet knows the
word but no category fits, so every answer can be checked as NO. **A word that is absent
is unknown**: an answer can't be checked, so the offer says "no bonus possible for this
word". There is no 3-letter file. The minimum word length is 4.

`manifest.json` records the sources, input hashes (including each word file it was built
from, so the contract test fails when the words change without a rebuild), the policy,
coverage and output hashes. `categories.json` is a byte copy of the reviewed spec.
`CREDITS.txt`, `OEWN-LICENSE.md` and `WordNet-LICENSE.txt` ship alongside. The files total
1,106 KiB raw; the largest, `9.txt`, is 170 KiB, next to its 260 KiB word file.

## Coverage

These counts are words known to WordNet among the accepted words of 4–15 letters. They
are regenerated into `manifest.json`.

| Length | Words | Known | % |
|---:|---:|---:|---:|
| 4 | 4,240 | 2,934 | 69.2 |
| 5 | 8,522 | 5,814 | 68.2 |
| 6 | 13,955 | 9,618 | 68.9 |
| 7 | 19,355 | 13,510 | 69.8 |
| 8 | 21,426 | 15,066 | 70.3 |
| 9 | 20,443 | 14,253 | 69.7 |
| 10 | 17,035 | 11,705 | 68.7 |
| 11 | 12,522 | 8,437 | 67.4 |
| 12 | 8,443 | 5,494 | 65.1 |
| 13 | 5,270 | 3,298 | 62.6 |
| 14 | 2,990 | 1,734 | 58.0 |
| 15 | 1,696 | 930 | 54.8 |
| **4–15** | **135,897** | **92,793** | **68.3** |

| ESDB size | Words | Known | % |
|---|---:|---:|---:|
| ≤35 | 38,049 | 37,436 | 98.4 |
| 40–50 | 30,328 | 21,863 | 72.1 |
| 55–70 | 67,520 | 33,494 | 49.6 |

Nearly every common word can be checked. The unknown words are mostly rare derived
forms and function words (`because`).

| Code | Kind | Question | Words |
|---|---|---|---:|
| `a` | noun | Can your word mean a person or a kind of person? | 12,263 |
| `b` | noun | Can your word mean an animal? | 4,163 |
| `c` | noun | Can your word mean a bird? | 827 |
| `d` | noun | Can your word mean a mammal? | 1,152 |
| `e` | noun | Can your word mean a fish? | 512 |
| `f` | noun | Can your word mean an insect? | 274 |
| `g` | noun | Can your word mean a plant? | 2,753 |
| `h` | noun | Can your word mean a tree? | 442 |
| `i` | noun | Can your word mean a flower? | 213 |
| `j` | noun | Can your word mean a fruit? | 403 |
| `k` | noun | Can your word mean a vegetable? | 184 |
| `l` | noun | Can your word mean a food or drink? | 2,501 |
| `m` | noun | Can your word mean a drink? | 368 |
| `n` | noun | Can your word mean a part of the body? | 1,833 |
| `o` | noun | Can your word mean a man-made object? | 12,879 |
| `p` | noun | Can your word mean a tool or utensil? | 855 |
| `q` | noun | Can your word mean a vehicle? | 721 |
| `r` | noun | Can your word mean a building or a room? | 667 |
| `s` | noun | Can your word mean something you wear? | 840 |
| `t` | noun | Can your word mean a piece of furniture? | 198 |
| `u` | noun | Can your word mean a musical instrument? | 275 |
| `v` | noun | Can your word mean a weapon? | 247 |
| `w` | noun | Can your word mean a container? | 674 |
| `x` | noun | Can your word mean a substance or material? | 3,183 |
| `y` | noun | Can your word mean a place? | 1,173 |
| `z` | noun | Can your word mean a time or a period of time? | 956 |
| `A` | noun | Can your word mean a feeling? | 925 |
| `B` | noun | Can your word mean a color? | 237 |
| `C` | noun | Can your word mean a job, or someone who does one? | 1,982 |
| `D` | noun | Can your word mean a sport or a game? | 308 |
| `E` | noun | Can your word mean an illness? | 414 |
| `F` | verb | Can your word mean a way of moving? | 4,411 |
| `G` | verb | Can your word mean a way of speaking or communicating? | 6,418 |
| `H` | verb | Can your word mean seeing, hearing, smelling, tasting or touching? | 1,946 |
| `I` | verb | Can your word mean eating, drinking or using something up? | 1,090 |
| `J` | verb | Can your word mean fighting or competing? | 1,666 |
| `K` | verb | Can your word mean making or creating something? | 2,505 |
| `L` | verb | Can your word mean thinking, knowing or believing? | 2,974 |
| `M` | verb | Can your word mean something your body does? | 2,638 |
| `N` | verb | Can your word mean something the weather does? | 355 |
| `O` | adjective | Can your word be a describing word (an adjective)? | 16,407 |

## Known play risk

"Any sense" includes meanings a player won't think of: `blue` can be a butterfly, so it
counts as an insect, and `hammer` (a bone in the ear) is a part of the body. Players
answer about the meaning they have in mind, so an honest answer can be "corrected". The
"Can your word mean …?" wording states the rule up front. WordNet's sense order is no
fix: OEWN lists "a very large person" as the first meaning of `whale`, and the machine
before the bird for `crane`. A quick check with the current solver found that a question
splitting her candidates 25–75% is available in nearly every game, but on a blank board
only broad categories qualify ("man-made object"). B2 measures this properly.

## Credits

Open English WordNet 2025, Copyright (c) 2019-present, The Open English WordNet Team,
licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). It derives from
Princeton WordNet (WordNet 3.1 Copyright 2011 by Princeton University), whose licence
notice must appear on all copies. Both licence files are distributed with the labels.
Changes: senses reduced to yes/no category labels for the Illucia vocabulary, inflections
mapped to base words using ESDB, a reviewed list of senses excluded, and the labels split
by word length.
