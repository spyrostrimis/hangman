import hashlib
import io
import json
import re
import unittest

from build_illucia_labels import (CATEGORIES as CATEGORY_FILE, LOCK, OUTPUT, WORDS, check_categories,
                                  inflection_links, label_files, label_words, parse_wordnet,
                                  synset_coder)

# A tiny WN-LMF lexicon: crane is a machine first and a bird second; bat is a mammal
# and a club; fly is an insect (noun) and a way of moving (verb).
LMF = b'''<?xml version="1.0" encoding="UTF-8"?>
<LexicalResource><Lexicon id="oewn">
  <LexicalEntry id="oewn-crane-n"><Lemma writtenForm="crane" partOfSpeech="n"/>
    <Sense id="s1" synset="oewn-machine1-n"/><Sense id="s2" synset="oewn-crane2-n"/></LexicalEntry>
  <LexicalEntry id="oewn-bat-n"><Lemma writtenForm="bat" partOfSpeech="n"/>
    <Sense id="s3" synset="oewn-bat1-n"/><Sense id="s4" synset="oewn-club1-n"/></LexicalEntry>
  <LexicalEntry id="oewn-fly-n"><Lemma writtenForm="fly" partOfSpeech="n"/>
    <Sense id="s5" synset="oewn-fly1-n"/></LexicalEntry>
  <LexicalEntry id="oewn-fly-v"><Lemma writtenForm="fly" partOfSpeech="v"/>
    <Sense id="s6" synset="oewn-fly2-v"/></LexicalEntry>
  <LexicalEntry id="oewn-Turkey-n"><Lemma writtenForm="Turkey" partOfSpeech="n"/>
    <Sense id="s7" synset="oewn-turkey1-n"/></LexicalEntry>
  <LexicalEntry id="oewn-news-n"><Lemma writtenForm="news" partOfSpeech="n"/>
    <Sense id="s8" synset="oewn-news1-n"/></LexicalEntry>
  <LexicalEntry id="oewn-cum-v"><Lemma writtenForm="cum" partOfSpeech="v"/>
    <Sense id="s9" synset="oewn-fly2-v"/></LexicalEntry>
  <Synset id="oewn-bird1-n" members="oewn-bird-n" lexfile="noun.animal"/>
  <Synset id="oewn-mammal1-n" members="oewn-mammal-n" lexfile="noun.animal"/>
  <Synset id="oewn-insect1-n" members="oewn-insect-n" lexfile="noun.animal"/>
  <Synset id="oewn-crane2-n" members="oewn-crane-n" lexfile="noun.animal">
    <SynsetRelation relType="hypernym" target="oewn-bird1-n"/></Synset>
  <Synset id="oewn-machine1-n" members="oewn-crane-n" lexfile="noun.artifact"/>
  <Synset id="oewn-bat1-n" members="oewn-bat-n" lexfile="noun.animal">
    <SynsetRelation relType="hypernym" target="oewn-mammal1-n"/></Synset>
  <Synset id="oewn-club1-n" members="oewn-bat-n" lexfile="noun.artifact"/>
  <Synset id="oewn-fly1-n" members="oewn-fly-n" lexfile="noun.animal">
    <SynsetRelation relType="hypernym" target="oewn-insect1-n"/></Synset>
  <Synset id="oewn-fly2-v" members="oewn-fly-v oewn-cum-v" lexfile="verb.motion"/>
  <Synset id="oewn-turkey1-n" members="oewn-Turkey-n" lexfile="noun.location"/>
  <Synset id="oewn-news1-n" members="oewn-news-n" lexfile="noun.communication"/>
</Lexicon></LexicalResource>'''

CATEGORIES = [
    {'code': 'b', 'key': 'animal', 'lexfiles': ['noun.animal']},
    {'code': 'c', 'key': 'bird', 'kindOf': {'oewn-bird1-n': 'bird'}},
    {'code': 'd', 'key': 'mammal', 'kindOf': {'oewn-mammal1-n': 'mammal'}},
    {'code': 'f', 'key': 'insect', 'kindOf': {'oewn-insect1-n': 'insect'}},
    {'code': 'o', 'key': 'artifact', 'lexfiles': ['noun.artifact']},
    {'code': 'y', 'key': 'place', 'lexfiles': ['noun.location']},
    {'code': 'F', 'key': 'move', 'lexfiles': ['verb.motion']},
]
ORDER = [c['code'] for c in CATEGORIES]


def wordnet():
    entries, synsets = parse_wordnet(io.BytesIO(LMF))
    check_categories(CATEGORIES, synsets)
    return entries, synsets


def labels(words, rows=(), blocked=(), exclude=frozenset(), entries=None):
    default, synsets = wordnet()
    links = inflection_links(rows, set(words), set(blocked))
    return label_words(words, default if entries is None else entries, links,
                       synset_coder(CATEGORIES, synsets), exclude)


class IlluciaLabelsTests(unittest.TestCase):
    def test_any_sense_makes_crane_a_bird_and_bat_not(self):
        result = labels(['crane', 'bat'])
        self.assertEqual(result['crane'], {'b', 'c', 'o'})  # bird through its second sense
        self.assertEqual(result['bat'], {'b', 'd', 'o'})    # a mammal and a club, never a bird
        # Positive control: without the bird sense, crane is no longer a bird.
        entries, _ = wordnet()
        entries[('crane', 'n')] = ['oewn-machine1-n']
        self.assertEqual(labels(['crane'], entries=entries)['crane'], {'o'})

    def test_inflections_use_the_base_word_in_their_part_of_speech_only(self):
        rows = [('cranes', 'ms', 'crane'), ('flying', 'vg', 'fly'), ('flies', 'ns', 'fly'),
                ('Flies', 'vs', 'fly')]
        result = labels(['cranes', 'flying', 'flies'], rows)
        self.assertEqual(result['cranes'], {'b', 'c', 'o'})
        self.assertEqual(result['flying'], {'F'})           # the verb fly, never the insect
        self.assertEqual(result['flies'], {'b', 'f', 'F'})  # plural noun and present verb
        self.assertEqual(label_files(result, ORDER)['5.txt'], b'flies bfF\n')  # category order
        # Positive control: without links the inflections are unknown, not "no".
        self.assertEqual(labels(['cranes', 'flying', 'flies']), {})

    def test_blocked_base_words_are_never_followed(self):
        rows = [('came', 'vd', 'cum')]
        self.assertEqual(labels(['came'], rows, blocked=['cum']), {})
        self.assertEqual(labels(['came'], rows), {'came': {'F'}})  # positive control

    def test_known_without_category_differs_from_unknown(self):
        result = labels(['news', 'zzzz', 'turkey'])
        self.assertEqual(result['news'], set())
        self.assertNotIn('zzzz', result)
        self.assertEqual(result['turkey'], {'y'})  # WordNet's "Turkey", matched without case
        self.assertEqual(label_files(result, ORDER)['4.txt'], b'news -\n')
        self.assertEqual(label_files(result, ORDER)['6.txt'], b'turkey y\n')

    def test_excluded_senses_lose_categories_not_the_word(self):
        self.assertEqual(labels(['bat'], exclude={'oewn-club1-n'})['bat'], {'b', 'd'})
        self.assertEqual(labels(['bat'], exclude={'oewn-bat1-n', 'oewn-club1-n'})['bat'], set())
        self.assertEqual(labels(['bat'])['bat'], {'b', 'd', 'o'})  # positive control

    def test_files_are_sorted_ordered_and_deterministic(self):
        result = labels(['crane', 'bat', 'news', 'zzzz'])
        first = label_files(result, ORDER)
        self.assertEqual(first, label_files(dict(reversed(result.items())), ORDER))
        self.assertEqual(first['4.txt'], b'news -\n')
        self.assertEqual(first['5.txt'], b'crane bco\n')
        self.assertEqual(set(first), {f'{n}.txt' for n in range(4, 16)})
        self.assertNotIn('3.txt', first)

    def test_category_spec_is_validated(self):
        _, synsets = wordnet()
        for bad in ([{**CATEGORIES[0], 'code': 'c'}, CATEGORIES[1]],                       # duplicate code
                    [{'code': '1', 'key': 'x', 'lexfiles': ['noun.animal']}],              # not a letter
                    [{'code': 'x', 'key': 'x', 'lexfiles': ['noun.nothing']}],             # unknown lexfile
                    [{'code': 'x', 'key': 'x', 'kindOf': {'oewn-bird1-n': 'mammal'}}],     # mistyped id
                    [{'code': 'x', 'key': 'x'}]):                                          # no rule
            with self.assertRaises(ValueError):
                check_categories(bad, synsets)
        check_categories(CATEGORIES, synsets)  # positive control


def sha(data):
    return hashlib.sha256(data).hexdigest()


class CommittedLabelsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((OUTPUT / 'manifest.json').read_text())
        cls.categories = json.loads((OUTPUT / 'categories.json').read_text())['categories']
        cls.code = {c['key']: c['code'] for c in cls.categories}
        cls.labels, cls.words = {}, {}
        for length in range(4, 16):
            cls.words[length] = {line.split(' ')[0] for line in
                                 (WORDS / f'{length}.txt').read_text().splitlines()}
            for line in (OUTPUT / f'{length}.txt').read_text().splitlines():
                word, codes = line.split(' ')
                cls.labels[word] = '' if codes == '-' else codes

    def test_files_match_manifest_inputs_and_contract(self):
        order = ''.join(c['code'] for c in self.categories)
        rank = {c: i for i, c in enumerate(order)}
        self.assertFalse((OUTPUT / '3.txt').exists())
        for length in range(4, 16):
            data = (OUTPUT / f'{length}.txt').read_bytes()
            self.assertEqual(sha(data), self.manifest['files'][f'{length}.txt']['sha256'])
            # The labels were built from exactly these word files; rebuild when they change.
            self.assertEqual(sha((WORDS / f'{length}.txt').read_bytes()),
                             self.manifest['inputs']['words'][f'{length}.txt'])
            lines = data.decode('ascii').splitlines()
            self.assertEqual(lines, sorted(set(lines)))
            for line in lines:
                self.assertRegex(line, rf'^[a-z]{{{length}}} ([{order}]+|-)$')
                word, codes = line.split(' ')
                self.assertIn(word, self.words[length])
                if codes != '-':
                    self.assertEqual(list(codes), sorted(set(codes), key=rank.get))
        self.assertEqual((OUTPUT / 'categories.json').read_bytes(), CATEGORY_FILE.read_bytes())
        lock = json.loads(LOCK.read_text())
        self.assertEqual(sha((OUTPUT / 'OEWN-LICENSE.md').read_bytes()), lock['oewn_license']['sha256'])
        self.assertEqual(sha((OUTPUT / 'WordNet-LICENSE.txt').read_bytes()), lock['wordnet_license']['sha256'])
        self.assertEqual(self.manifest['sources']['wordnet'], lock)
        self.assertEqual(sum(f['words'] for f in self.manifest['files'].values()), len(self.labels))

    def has(self, word, key):
        return self.code[key] in self.labels[word]

    def test_known_cases(self):
        self.assertTrue(self.has('crane', 'bird') and self.has('cranes', 'bird'))
        self.assertTrue(self.has('bats', 'mammal'))
        self.assertFalse(self.has('bats', 'bird'))
        self.assertTrue(self.has('robin', 'bird') and self.has('apple', 'fruit'))
        self.assertTrue(self.has('spider', 'animal'))
        self.assertFalse(self.has('spider', 'insect'))
        self.assertTrue(self.has('whale', 'mammal') and self.has('tomato', 'vegetable'))
        self.assertTrue(self.has('flies', 'insect'))
        self.assertFalse(self.has('flying', 'insect'))
        # Known with no category, versus unknown (absent): the "no bonus possible" case.
        self.assertEqual(self.labels['news'], '')
        self.assertIn('because', self.words[7])
        self.assertNotIn('because', self.labels)

    def test_reviewed_exclusions_hold(self):
        self.assertFalse(self.has('tool', 'body'))
        self.assertTrue(self.has('tool', 'artifact'))  # the word keeps its clean categories
        self.assertFalse(self.has('queer', 'person'))
        self.assertTrue(self.has('taco', 'food'))
        self.assertFalse(self.has('taco', 'person'))


if __name__ == '__main__':
    unittest.main()
