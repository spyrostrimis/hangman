import io
import unittest

from build_illucia_labels import (check_categories, inflection_links, label_files, label_words,
                                  parse_wordnet, synset_coder)

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


if __name__ == '__main__':
    unittest.main()
