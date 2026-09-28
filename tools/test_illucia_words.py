import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from build_illucia_words import compile_words, word_files, verify, source_bytes, publish, OUTPUT, FILTER


class IlluciaWordsTests(unittest.TestCase):
    def test_whole_word_filters_and_flagged_duplicate_senses(self):
        rows = [('ass', 35), ('ASS', 50), ('class', 35), ('grass', 50),
                ('rude', 35), ('Rude', 50), ('kind', 35)]
        self.assertEqual(compile_words(rows, ['Rude'], ' ASS \n'),
                         {'class': 35, 'grass': 50, 'kind': 35})
        self.assertEqual(compile_words(rows, [], ''),
                         {'ass': 35, 'class': 35, 'grass': 50, 'rude': 35, 'kind': 35})

    def test_lemma_forms_of_blocked_terms_are_blocked(self):
        rows = [('faggot', 35), ('faggots', 35), ('fingering', 35), ('fingers', 35),
                ('chink', 35), ('chinks', 35), ('chinwag', 35)]
        lemmas = [('faggots', 'faggot'), ('fingers', 'finger'), ('chinks', 'chink')]
        # Positive control: exact matching alone lets the inflections through.
        self.assertEqual(compile_words(rows, [], 'faggot\nfingering', [], ['chink']),
                         {'faggots': 35, 'fingers': 35, 'chinks': 35, 'chinwag': 35})
        # A blocked -ing entry must not reach its innocent lemma (fingering -/-> fingers).
        self.assertEqual(compile_words(rows, [], 'faggot\nfingering', lemmas, ['chink']),
                         {'fingers': 35, 'chinwag': 35})

    def test_allow_keeps_forms_with_a_clean_lemma_and_rejects_misuse(self):
        rows = [('came', 35), ('cums', 60), ('cum', 60)]
        lemmas = [('came', 'come'), ('came', 'cum'), ('cums', 'cum')]
        self.assertEqual(compile_words(rows, [], 'cum', lemmas), {})
        self.assertEqual(compile_words(rows, [], 'cum', lemmas, allow=['came']), {'came': 35})
        for bad in (['cum'], ['cat']):  # direct block, and an entry that is not needed
            with self.assertRaisesRegex(ValueError, 'stale or overrides'):
                compile_words(rows, [], 'cum', lemmas, allow=bad)

    def test_ascii_length_and_size_boundaries(self):
        rows = [(w, 35) for w in ['ab', 'abc', 'A' * 15, 'a' * 16, 'naïve',
                                  'a-b', 'a b', "cat's", 'abc.', 'Kelvin']]
        rows += [('below', 34), ('above', 75), ('upper', 70), ('middle', 50)]
        self.assertEqual(compile_words(rows, [], ''),
                         {'abc': 35, 'a' * 15: 35, 'upper': 70, 'middle': 50})

    def test_minimum_original_size_and_deterministic_bytes(self):
        rows = [('Zebra', 60), ('zebra', 35), ('apple', 50), ('tiger', 40), ('cat', 70)]
        first = word_files(compile_words(rows, [], ''))
        second = word_files(compile_words(reversed(rows * 2), [], ''))
        self.assertEqual(first, second)
        self.assertEqual(first['5.txt'], b'apple 50\ntiger 40\nzebra 35\n')
        self.assertEqual(first['3.txt'], b'cat 70\n')
        self.assertEqual(set(first), {f'{n}.txt' for n in range(3, 16)})

    def test_checksum_and_offline_failure(self):
        good = b'known source'
        sha = hashlib.sha256(good).hexdigest()
        self.assertEqual(verify(good, sha), good)
        with self.assertRaisesRegex(ValueError, 'checksum'):
            verify(b'changed source', sha)
        with tempfile.TemporaryDirectory() as folder:
            cache = Path(folder)
            spec = {'sha256': sha, 'url': 'https://invalid.example'}
            with self.assertRaisesRegex(ValueError, 'Missing'):
                source_bytes('fixture', spec, cache, False)
            (cache / ('fixture-' + sha)).write_bytes(good)
            self.assertEqual(source_bytes('fixture', spec, cache, False), good)

    def test_check_does_not_overwrite_drift(self):
        with tempfile.TemporaryDirectory() as folder:
            out = Path(folder)
            publish({'3.txt': b'cat 35\n'}, out)
            publish({'3.txt': b'cat 35\n'}, out, True)
            with self.assertRaisesRegex(ValueError, 'differs'):
                publish({'3.txt': b'dog 35\n'}, out, True)
            self.assertEqual((out / '3.txt').read_bytes(), b'cat 35\n')

    def test_committed_corpus_contract_and_checksums(self):
        manifest = json.loads((OUTPUT / 'manifest.json').read_text())
        words = {}
        for length in range(3, 16):
            data = (OUTPUT / f'{length}.txt').read_bytes()
            self.assertEqual(hashlib.sha256(data).hexdigest(),
                             manifest['files'][f'{length}.txt']['sha256'])
            lines = data.decode('ascii').splitlines()
            self.assertEqual(lines, sorted(set(lines)))
            for line in lines:
                self.assertRegex(line, rf'^[a-z]{{{length}}} (35|40|50|55|60|65|70)$')
                word, size = line.split(' ')
                words[word] = int(size)
        self.assertEqual(len(words), manifest['acceptedWords'])
        self.assertTrue({'cat', 'dog', 'class', 'grass', 'hello', 'color'} <= words.keys())
        self.assertFalse({'fuck', 'shit', 'ass', 'colour'} & words.keys())
        rules = json.loads(FILTER.read_text())
        self.assertEqual(manifest['policy']['projectFilter']['sha256'],
                         hashlib.sha256(FILTER.read_bytes()).hexdigest())
        leaks = {'faggots', 'fagots', 'spics', 'kikes', 'wetbacks', 'sluts', 'whores', 'twats',
                 'pakis', 'darkies', 'jigaboos', 'chinks', 'homos', 'honkies', 'gooks', 'japs'}
        self.assertFalse((leaks | set(rules['block'])) & words.keys())
        innocent = {'finger', 'throat', 'shrimp', 'scissors', 'butter', 'scatter', 'spicy',
                    'cocktail', 'retard', 'queer', 'gay'}
        self.assertLessEqual(innocent | set(rules['allow']), words.keys())
        self.assertEqual({str(t): sum(s <= t for s in words.values()) for t in (35, 50, 70)},
                         manifest['cumulativeSizes'])


if __name__ == '__main__':
    unittest.main()
