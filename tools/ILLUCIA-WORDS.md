# Illucia vocabulary build (I2)

Requires Python 3.12+ with SQLite (standard library only). Node 24 runs the
existing tools test suite. From the repository root:

```sh
python tools/build_illucia_words.py --download
python tools/build_illucia_words.py --check
cd tools
npm test
```

The first command may fetch missing inputs. Subsequent builds are offline;
`--download` does not bypass checksum validation. Inputs live in ignored
`tools/cache/illucia/`. A corrupted cached input fails rather than being trusted
or silently replaced. `--cache-dir` and `--output-dir` support isolated rebuilds.
`--check` rebuilds from source and compares every generated file without writing.
Building the upstream database takes roughly a minute; fast tests need no network.

## Source and policy

`illucia-sources.json` pins the ESDB/SCOWL v2 source tree at the
`rel-2026.02.25` dictionary release, its exact commit and archive SHA-256, plus
the LDNOOBW English list and license at an exact commit and SHA-256. Upstream
calls this a dictionary-only release: its database tooling is still evolving,
so we pin the source tree too, not just the release name.

We build the database with the release's `combine.py`, then use its own query
builder over `scowl_v0`: American English (`A`, including unmarked spellings
and default/US regions), normal variants (level <=1), size <=70, and the empty
category only. No accent removal, punctuation stripping or substring blocking.
ASCII A-Z/a-z words of length 3-15 are lowercased and deduplicated. Capitalized
ASCII entries are therefore accepted after normalization, as specified by I2.

Every spelling and inflection in an ESDB group whose usage note starts with
`offensive-` or `vulgar-` is blocked globally, including words with another
unflagged sense. The LDNOOBW English list supplies an additional case-normalized,
whole-word deny set. For example, blocking `ass` does not block `class` or `grass`.
This implements the two specified lists; neither upstream claims exhaustive coverage.

Each `client/public/illucia/words/3.txt` through `15.txt` contains sorted
`word size` records, LF endings, and a final newline. The size is the minimum
original ESDB size of a surviving record, **not** a remapped difficulty name.
The release documents 35/50/70 as its small/medium/large sizes. Intermediate
sizes remain intact. A future accepted-word check uses all records <=70;
solver knowledge uses its chosen size ceiling. Difficulty names and win-rate
claims still require I3b.

`manifest.json` records source provenance, policy, counts and output hashes,
without timestamps or machine paths. Notices are generated alongside the data.
The files are public static assets, outside the JavaScript bundle; fetching
only the chosen length is part of the later I4 integration.

## Credits

ESDB/SCOWL v2: Copyright 2000-2026 by Kevin Atkinson, used under its MIT-like
permission notice. The complete notice is distributed in
`client/public/illucia/words/ESDB-Copyright.txt`.

Filtering uses the English **List of Dirty, Naughty, Obscene, and Otherwise Bad
Words**, by [LDNOOBW contributors](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words),
under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Its license and attribution are distributed alongside the word files.
Changes to the ESDB-derived vocabulary: dialect/variant/category selection,
ASCII and length filtering, lowercasing, deduplication, profanity filtering,
and splitting by length with size annotations.

The in-app credits document is `/illucia/credits.html`. I4 should link it from
the Illucia page when the vocabulary is actually used there.
