"""Rebuild Illucia's static vocabulary using pinned ESDB sources (Python 3.12+)."""
import argparse
from contextlib import closing
import hashlib
import importlib
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
from urllib.request import urlopen

HERE = Path(__file__).resolve().parent
OUTPUT = HERE.parent / 'client/public/illucia/words'
LOCK = HERE / 'illucia-sources.json'
FILTER = HERE / 'illucia-filter.json'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def verify(data, expected):
    if digest(data) != expected:
        raise ValueError('Source checksum mismatch; refusing to build')
    return data


def source_bytes(name, spec, cache, download):
    path = cache / (name + '-' + spec['sha256'])
    if path.exists():
        return verify(path.read_bytes(), spec['sha256'])
    if not download:
        raise ValueError(f'Missing {name} source; run once with --download')
    with urlopen(spec['url'], timeout=60) as response:
        data = verify(response.read(), spec['sha256'])
    cache.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return data


def normalized(word):
    # Reject punctuation/accents before lowercasing (no Unicode-to-ASCII folding).
    return word.lower() if re.fullmatch(r'[A-Za-z]{3,15}', word) else None


def compile_words(rows, flagged, blocklist, lemmas=(), block=(), allow=()):
    terms = {word.strip().lower() for word in blocklist.splitlines() if word.strip()}
    terms.update(word.lower() for word in block)
    blocked = terms | {word.lower() for word in flagged}
    # Exact matching misses inflections (faggot -> faggots), so also block every
    # word whose ESDB lemma is a term. A lemma-derived form that also belongs to
    # a clean lemma (came: come/cum) stays only through an explicit allow entry.
    derived = {word.lower() for word, lemma in lemmas if lemma.lower() in terms} - blocked
    for word in allow:
        if word in blocked or word not in derived:
            raise ValueError(f'Allow entry {word!r} is stale or overrides a direct block')
    blocked |= derived - set(allow)
    accepted = {}
    for word, size in rows:
        word = normalized(word)
        if word is None or word in blocked or not 35 <= size <= 70:
            continue
        accepted[word] = min(size, accepted.get(word, size))
    return accepted


def word_files(accepted):
    return {f'{length}.txt': ''.join(
        f'{word} {accepted[word]}\n' for word in sorted(accepted) if len(word) == length
    ).encode('ascii') for length in range(3, 16)}


def extract_words(source):
    # Use the release's own query builder to preserve region/variant/override rules.
    sys.path.insert(0, str(source))
    scowl = importlib.import_module('libscowl')
    query = scowl.queryString(size=70, spellings=['A'], variantLevel=1, categories=[])
    with closing(sqlite3.connect(source / 'scowl.db')) as db:
        rows = db.execute(' '.join(('select word, size', query.from_, query.where))).fetchall()
        # Block every inflection of every flagged group, even if another sense is clean.
        flagged = [row[0] for row in db.execute(
            "select word from words join groups using (group_id) "
            "where usage_note like 'offensive-%' or usage_note like 'vulgar-%'")]
        lemmas = db.execute(
            'select w.word, l.word from words w join words l on l.word_id = w.lemma_id').fetchall()
    return rows, flagged, lemmas


def build(inputs, lock, project_filter):
    rules = json.loads(project_filter)
    if any(not re.fullmatch(r'[a-z]+', word) for word in [*rules['block'], *rules['allow']]):
        raise ValueError('Filter entries must be lowercase a-z words')
    with tempfile.TemporaryDirectory(prefix='illucia-esdb-') as temporary:
        root = Path(temporary)
        archive = root / 'source.tar.gz'
        archive.write_bytes(inputs['esdb'])
        with tarfile.open(archive) as tar:
            # PostgreSQL symlinks aren't needed; regular files work on Windows too.
            tar.extractall(root, members=[m for m in tar if m.isfile()], filter='data')
        source = root / ('wordlist-' + lock['esdb']['commit'])
        result = subprocess.run([sys.executable, 'combine.py', 'create-db', 'scowl.db'],
                                cwd=source, env={**os.environ, 'PYTHONUTF8': '1'},
                                capture_output=True, text=True, encoding='utf-8')
        if result.returncode:
            raise RuntimeError(result.stderr)
        rows, flagged, lemmas = extract_words(source)
        accepted = compile_words(rows, flagged, inputs['blocklist'].decode('utf-8'),
                                 lemmas, rules['block'], rules['allow'])
        files = word_files(accepted)
        if any(not data for data in files.values()):
            raise ValueError('Unexpected empty length bucket')
        files['ESDB-Copyright.txt'] = (source / 'Copyright').read_bytes()
    files['LDNOOBW-LICENSE.txt'] = inputs['blocklist_license']
    files['CREDITS.txt'] = (
        'Illucia vocabulary: English Speller Database (ESDB/SCOWL v2).\n'
        'Copyright 2000-2026 by Kevin Atkinson. See ESDB-Copyright.txt.\n'
        'https://github.com/en-wl/wordlist\n\n'
        'Filtered using the English List of Dirty, Naughty, Obscene, and Otherwise Bad Words\n'
        'by LDNOOBW contributors, licensed under CC BY 4.0. See LDNOOBW-LICENSE.txt.\n'
        'https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words\n'
        'https://creativecommons.org/licenses/by/4.0/\n'
        'Changes: American English, normal variants, no special categories, ASCII letters,\n'
        '3-15 characters, lowercase, deduplication, profanity filtering, length/tier files.\n'
    ).encode('utf-8')
    report = {
        'sources': lock,
        'policy': {'spelling': 'A', 'variantLevel': 1, 'categories': [''],
                   'lengths': [3, 15], 'maximumSize': 70, 'blockLemmaForms': True,
                   'projectFilter': {'file': 'tools/illucia-filter.json',
                                     'sha256': digest(project_filter)}},
        'acceptedWords': len(accepted),
        'cumulativeSizes': {str(t): sum(s <= t for s in accepted.values()) for t in (35, 50, 70)},
        'files': {name: {'sha256': digest(data), 'bytes': len(data),
                         'words': len(data.splitlines())}
                  for name, data in files.items() if re.fullmatch(r'\d+\.txt', name)},
    }
    files['manifest.json'] = (json.dumps(report, indent=2) + '\n').encode('utf-8')
    return files, report


def publish(files, output, check=False):
    if check:
        for name, data in files.items():
            if not (output / name).exists() or (output / name).read_bytes() != data:
                raise ValueError(f'Generated file differs: {name}')
    else:
        output.mkdir(parents=True, exist_ok=True)
        for name, data in files.items():
            (output / name).write_bytes(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--download', action='store_true', help='Allow fetching missing pinned inputs')
    parser.add_argument('--check', action='store_true', help='Rebuild and compare without writing output')
    parser.add_argument('--cache-dir', type=Path, default=HERE / 'cache/illucia')
    parser.add_argument('--output-dir', type=Path, default=OUTPUT)
    args = parser.parse_args()
    lock = json.loads(LOCK.read_text(encoding='utf-8'))
    inputs = {name: source_bytes(name, spec, args.cache_dir, args.download)
              for name, spec in lock.items()}
    files, report = build(inputs, lock, FILTER.read_bytes())
    publish(files, args.output_dir, args.check)
    print(json.dumps({'checked' if args.check else 'built': report['acceptedWords'],
                      'cumulativeSizes': report['cumulativeSizes']}, indent=2))


if __name__ == '__main__':
    main()
