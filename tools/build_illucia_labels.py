"""Build Illucia's WordNet category labels from pinned OEWN and ESDB sources (Python 3.12+)."""
import argparse
from collections import Counter, defaultdict
from contextlib import closing
import gzip
import io
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import xml.etree.ElementTree as ET

from build_illucia_words import digest, publish, source_bytes

HERE = Path(__file__).resolve().parent
WORDS = HERE.parent / 'client/public/illucia/words'
OUTPUT = HERE.parent / 'client/public/illucia/labels'
LOCK = HERE / 'illucia-wordnet-sources.json'
ESDB_LOCK = HERE / 'illucia-sources.json'
CATEGORIES = HERE / 'illucia-categories.json'
EXCLUDE = HERE / 'illucia-wordnet-exclude.json'
FILTER = HERE / 'illucia-filter.json'
LENGTHS = range(4, 16)
CODE = re.compile(r'[a-zA-Z]')

# An ESDB inflection inherits the senses of its base word in these WordNet parts of
# speech only ('s' is an adjective satellite): "cranes" gets the noun and verb crane,
# "flying" gets the verb fly and never the insect.
INFLECTIONS = {'ns': 'n', 'nss': 'n', 'ms': 'nv',
               'vd': 'v', 'vd2': 'v', 'vn': 'v', 'vg': 'v', 'vs': 'v', 'vs2': 'v', 'vs3': 'v', 'vs4': 'v',
               'aj1': 'as', 'aj2': 'as', 'av1': 'r', 'av2': 'r', 'a1': 'asr', 'a2': 'asr'}


def parse_wordnet(stream):
    """WN-LMF XML -> ({(lemma, pos): [synset ids]}, {synset id: (lexfile, hypernyms, members)})."""
    entries, synsets = defaultdict(list), {}
    for _, element in ET.iterparse(stream):
        if element.tag == 'LexicalEntry':
            lemma = element.find('Lemma')
            # Lowercase like the word files: an accepted "turkey" stands for Turkey too.
            key = (lemma.get('writtenForm').lower(), lemma.get('partOfSpeech'))
            entries[key] += [sense.get('synset') for sense in element.iter('Sense')]
            element.clear()
        elif element.tag == 'Synset':
            hypernyms = tuple(relation.get('target') for relation in element.iter('SynsetRelation')
                              if relation.get('relType') in ('hypernym', 'instance_hypernym'))
            synsets[element.get('id')] = (element.get('lexfile'), hypernyms,
                                          tuple(element.get('members', '').split()))
            element.clear()
    return dict(entries), synsets


def named(synsets, synset, lemma, where):
    # Guards against a mistyped id: the reviewed lemma must be one of the synset's members.
    if synset not in synsets or f'oewn-{lemma}-{synset[-1]}' not in synsets[synset][2]:
        raise ValueError(f'{where}: {synset} is not a WordNet synset for {lemma!r}')


def check_categories(categories, synsets):
    codes = [c['code'] for c in categories]
    keys = [c['key'] for c in categories]
    if len(set(codes)) != len(codes) or len(set(keys)) != len(keys) or not all(map(CODE.fullmatch, codes)):
        raise ValueError('Category codes must be unique single letters and keys unique')
    lexfiles = {lexfile for lexfile, _, _ in synsets.values()}
    for category in categories:
        if bool(category.get('lexfiles')) == bool(category.get('kindOf')):
            raise ValueError(f'{category["key"]}: give exactly one of lexfiles or kindOf')
        for lexfile in category.get('lexfiles', ()):
            if lexfile not in lexfiles:
                raise ValueError(f'{category["key"]}: unknown lexfile {lexfile}')
        for synset, lemma in category.get('kindOf', {}).items():
            named(synsets, synset, lemma, category['key'])


def synset_coder(categories, synsets):
    """Return synset id -> the set of category codes that synset belongs to."""
    ancestors, codes = {}, {}

    def above(synset):
        if synset not in ancestors:
            found = {synset}
            for hypernym in synsets[synset][1]:
                found |= above(hypernym)
            ancestors[synset] = found
        return ancestors[synset]

    def code(synset):
        if synset not in codes:
            lexfile, mine = synsets[synset][0], above(synset)
            codes[synset] = {c['code'] for c in categories
                             if lexfile in c.get('lexfiles', ()) or mine & c.get('kindOf', {}).keys()}
        return codes[synset]
    return code


def inflection_links(rows, words, blocked):
    """ESDB (word, pos, lemma) rows -> {accepted word: {(base word, WordNet pos)}}."""
    links = defaultdict(set)
    for word, pos, lemma in rows:
        word, lemma = word.lower(), lemma.lower()
        # Never label a clean word through a blocked base (came -/-> cum).
        if word in words and lemma != word and pos in INFLECTIONS and lemma not in blocked:
            links[word] |= {(lemma, part) for part in INFLECTIONS[pos]}
    return links


def label_words(words, entries, links, code, exclude=frozenset()):
    """Return {word: codes} for every word WordNet knows; a word it doesn't know is absent.

    YES if ANY sense fits: the word's own entries in every part of speech, plus the
    linked base words' entries. Excluded synsets lose their categories, not the word.
    """
    labels = {}
    for word in words:
        sources = [(word, part) for part in 'nvasr'] + sorted(links.get(word, ()))
        senses = [synset for source in sources for synset in entries.get(source, ())]
        if senses:
            labels[word] = set().union(*(code(s) for s in senses if s not in exclude))
    return labels


def label_files(labels, order):
    rank = {code: i for i, code in enumerate(order)}
    return {f'{length}.txt': ''.join(
        f'{word} {"".join(sorted(labels[word], key=rank.get)) or "-"}\n'
        for word in sorted(labels) if len(word) == length
    ).encode('ascii') for length in LENGTHS}


def read_words(folder):
    words, inputs = {}, {}
    for length in LENGTHS:
        data = (folder / f'{length}.txt').read_bytes()
        inputs[f'{length}.txt'] = digest(data)
        for line in data.decode('ascii').splitlines():
            word, size = line.split(' ')
            words[word] = int(size)
    return words, inputs


def esdb_rows(archive, commit):
    """Build the pinned ESDB database and return its (word, pos, lemma) rows and flagged words."""
    with tempfile.TemporaryDirectory(prefix='illucia-labels-esdb-') as temporary:
        root = Path(temporary)
        (root / 'source.tar.gz').write_bytes(archive)
        with tarfile.open(root / 'source.tar.gz') as tar:
            tar.extractall(root, members=[m for m in tar if m.isfile()], filter='data')
        source = root / ('wordlist-' + commit)
        result = subprocess.run([sys.executable, 'combine.py', 'create-db', 'scowl.db'],
                                cwd=source, env={**os.environ, 'PYTHONUTF8': '1'},
                                capture_output=True, text=True, encoding='utf-8')
        if result.returncode:
            raise RuntimeError(result.stderr)
        with closing(sqlite3.connect(source / 'scowl.db')) as db:
            rows = db.execute('select word, pos, lemma from entries').fetchall()
            flagged = [row[0] for row in db.execute(
                "select word from words join groups using (group_id) "
                "where usage_note like 'offensive-%' or usage_note like 'vulgar-%'")]
    return rows, flagged


def band(size):
    return '35' if size <= 35 else '40-50' if size <= 50 else '55-70'


def coverage(words, labels, categories):
    def share(group):
        known = sum(w in labels for w in group)
        return {'words': len(group), 'known': known, 'percent': round(100 * known / len(group), 1)}
    return {
        'byLength': {str(n): share([w for w in words if len(w) == n]) for n in LENGTHS},
        'bySize': {b: share([w for w in words if band(words[w]) == b]) for b in ('35', '40-50', '55-70')},
        'all': share(list(words)),
        'yesByCategory': {c['key']: sum(c['code'] in codes for codes in labels.values()) for c in categories},
    }


def build(inputs, lock, esdb_lock, category_spec, exclude_spec, project_filter, word_folder):
    categories = json.loads(category_spec)['categories']
    exclusions = json.loads(exclude_spec)['exclude']
    if any(not e.get('reason') for e in exclusions):
        raise ValueError('Every exclusion needs a reason')
    entries, synsets = parse_wordnet(io.BytesIO(gzip.decompress(inputs['oewn'])))
    check_categories(categories, synsets)
    for e in exclusions:
        named(synsets, e['synset'], e['lemma'], 'exclusion')
    words, word_inputs = read_words(word_folder)
    rows, flagged = esdb_rows(inputs['esdb'], esdb_lock['esdb']['commit'])
    rules = json.loads(project_filter)
    blocked = {w.strip().lower() for w in inputs['blocklist'].decode('utf-8').splitlines() if w.strip()}
    blocked |= {w.lower() for w in [*flagged, *rules['block']]}
    links = inflection_links(rows, words, blocked)
    labels = label_words(words, entries, links, synset_coder(categories, synsets),
                         frozenset(e['synset'] for e in exclusions))
    files = label_files(labels, [c['code'] for c in categories])
    files['categories.json'] = category_spec
    files['OEWN-LICENSE.md'] = inputs['oewn_license']
    files['WordNet-LICENSE.txt'] = inputs['wordnet_license']
    files['CREDITS.txt'] = (
        'Illucia question labels: Open English WordNet 2025 (english-wordnet-2025.xml.gz).\n'
        'Copyright (c) 2019-present, The Open English WordNet Team, licensed under CC BY 4.0.\n'
        'Derived from Princeton WordNet: WordNet 3.1 Copyright 2011 by Princeton University.\n'
        'See OEWN-LICENSE.md and WordNet-LICENSE.txt.\n'
        'https://github.com/globalwordnet/english-wordnet\n'
        'https://creativecommons.org/licenses/by/4.0/\n'
        'Changes: senses reduced to yes/no category labels for the Illucia vocabulary\n'
        '(see categories.json); inflections mapped to base words using ESDB; a reviewed\n'
        'list of senses excluded; split by word length.\n'
    ).encode('utf-8')
    report = {
        'sources': {'wordnet': lock, 'esdb': esdb_lock['esdb'],
                    'blocklist': esdb_lock['blocklist']},
        'inputs': {'words': word_inputs,
                   'categories': {'file': 'tools/illucia-categories.json', 'sha256': digest(category_spec)},
                   'exclude': {'file': 'tools/illucia-wordnet-exclude.json', 'sha256': digest(exclude_spec)},
                   'projectFilter': {'file': 'tools/illucia-filter.json', 'sha256': digest(project_filter)}},
        'policy': {'yes': 'any sense of the word, or of its ESDB base word in the inflected part of speech',
                   'line': 'word codes; "-" = known to WordNet with no category; absent = unknown',
                   'caseInsensitive': True, 'lengths': [LENGTHS[0], LENGTHS[-1]],
                   'inflections': {pos: list(parts) for pos, parts in INFLECTIONS.items()}},
        'coverage': coverage(words, labels, categories),
        'files': {name: {'sha256': digest(data), 'bytes': len(data), 'words': len(data.splitlines())}
                  for name, data in files.items() if re.fullmatch(r'\d+\.txt', name)},
    }
    files['manifest.json'] = (json.dumps(report, indent=2) + '\n').encode('utf-8')
    return files, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--download', action='store_true', help='Allow fetching missing pinned inputs')
    parser.add_argument('--check', action='store_true', help='Rebuild and compare without writing output')
    parser.add_argument('--cache-dir', type=Path, default=HERE / 'cache/illucia-wordnet')
    parser.add_argument('--esdb-cache-dir', type=Path, default=HERE / 'cache/illucia')
    parser.add_argument('--output-dir', type=Path, default=OUTPUT)
    args = parser.parse_args()
    lock = json.loads(LOCK.read_text(encoding='utf-8'))
    esdb_lock = json.loads(ESDB_LOCK.read_text(encoding='utf-8'))
    inputs = {name: source_bytes(name, spec, args.cache_dir, args.download) for name, spec in lock.items()}
    inputs |= {name: source_bytes(name, esdb_lock[name], args.esdb_cache_dir, args.download)
               for name in ('esdb', 'blocklist')}
    files, report = build(inputs, lock, esdb_lock, CATEGORIES.read_bytes(), EXCLUDE.read_bytes(),
                          FILTER.read_bytes(), WORDS)
    publish(files, args.output_dir, args.check)
    print(json.dumps({'checked' if args.check else 'built': report['coverage']['all'],
                      'bySize': report['coverage']['bySize']}, indent=2))


if __name__ == '__main__':
    main()
