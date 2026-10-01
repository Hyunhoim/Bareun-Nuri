"""Inventory saved real contexts; no inferred gold, training, or final-set access."""
import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path('.runtime/dual-technique-v1')
SOURCE = Path('.runtime/nuri10-filter-collected-v1')


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    sources = read(SOURCE / 'sources.json')
    for source in sources:
        assert digest(Path(source['path'])) == source['sha256'], source['path']
    rows = [r for r in read(SOURCE / 'inputs.json') if r['panel'] == 'real']
    groups = {}
    for row in rows:
        normalized = re.sub(r'\s+', ' ', row['raw']).strip()
        if not normalized:
            continue
        key = hashlib.sha256(normalized.encode()).hexdigest()
        entry = groups.setdefault(key, {'group': key, 'occurrences': []})
        entry['occurrences'].append({
            'id': row['id'], 'url': row['url'], 'selector': row['selector'],
            'area': row['area'], 'raw': row['raw'], 'input': row['input'],
        })
    bank = list(groups.values())
    assert sum(len(g['occurrences']) for g in bank) == sum(bool(r['raw'].strip()) for r in rows)
    lengths = Counter()
    domains = Counter()
    cross_domain = 0
    for group in bank:
        text = group['occurrences'][0]['raw']
        n = len(re.sub(r'\s+', ' ', text).strip())
        lengths['under20' if n < 20 else '20to350' if n <= 350 else 'over350'] += 1
        hosts = {urlsplit(r['url']).hostname for r in group['occurrences']}
        domains.update(hosts)
        cross_domain += len(hosts) > 1
        group['technique_gold'] = None
        group['review_status'] = 'unreviewed for character technique and ownership'
    old_hashes = read(ROOT / 'production-before.json')
    assert all(digest(Path(path)) == sha for path, sha in old_hashes.items())
    out = ROOT / 'source-audit'
    out.mkdir(exist_ok=True)
    summary = {
        'real_candidates': len(rows), 'pages': len({r['url'] for r in rows}),
        'unique_whitespace_normalized_texts': len(bank), 'length_groups_characters_not_tokens': dict(lengths),
        'unique_texts_per_host_nonexclusive': dict(domains), 'cross_host_duplicate_groups': cross_domain,
        'source_snapshot_hashes_verified': len(sources),
        'inputs_sha256': digest(SOURCE / 'inputs.json'),
        'training_ready': False, 'technique_labels_inferred': 0, 'new_training': 0,
        'final_access': False, 'api_calls': 0, 'production_files_unchanged': len(old_hashes),
        'limitations': ['Saved material is previously observed, not a new holdout.',
                       'Ad-intent normal labels do not establish character-technique absence.',
                       'Same text across hosts must stay in one split; host split alone is insufficient.',
                       'Length bins are inventory only, not a collection or inference filter.',
                       'Local review bank retains original text; do not publish it as synthetic data.'],
    }
    for name, obj in [('review-bank.json', bank), ('summary.json', summary)]:
        (out / name).write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
