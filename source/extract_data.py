"""Extract the source sheet's hero records into the offline app's data bundle.

The checked-in hero-records.json contains the roster and provenance cells.
Run inspect_workbook.py to refresh those records from a local source workbook.
"""
import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
workbook = json.loads((ROOT / 'hero-records.json').read_text(encoding='utf-8'))
data = workbook['Data']
intro = workbook['Introduction']

def val(address):
    return data.get(address)

def col(address):
    return re.match(r'[A-Z]+', address).group()

def colnum(letters):
    result = 0
    for letter in letters:
        result = result * 26 + ord(letter) - ord('A') + 1
    return result

def slug(name):
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')

headers = {}
for address, entry in data.items():
    if re.fullmatch(r'[A-Z]+1', address):
        # DV repeats s16.global; BY is the original column beside s16.value.
        headers.setdefault(str(entry).lower(), col(address))

names = {val(f'A{r}'): slug(val(f'A{r}')) for r in range(2, 44)}
assert len(names) == 42 and len(set(names.values())) == 42
name_lookup = {name.casefold(): hero_id for name, hero_id in names.items()}

levels = sorted(int(re.fullmatch(r'm\.(\d+)\.value', h)[1])
                for h in headers if re.fullmatch(r'm\.(\d+)\.value', h))
heroes = []
stats = set()

def fields(prefix, row):
    value = val(f'{headers[prefix + ".value"]}{row}')
    kind = val(f'{headers[prefix + ".type"]}{row}')
    global_value = val(f'{headers[prefix + ".global"]}{row}')
    assert isinstance(value, (int, float)), (prefix, row, 'value', value)
    assert isinstance(kind, str) and kind, (prefix, row, 'type', kind)
    assert global_value in (0, 1), (prefix, row, 'global', global_value)
    stats.add(kind)
    return {'value': value, 'type': kind, 'global': bool(global_value)}

for row in range(2, 44):
    name = val(f'A{row}')
    hero = {'id': names[name], 'name': name, 'sourceRow': row,
            'attackSpeed': val(f'DW{row}'), 'synergies': [], 'milestones': []}
    assert isinstance(hero['attackSpeed'], (int, float))
    for index in range(1, 17):
        prefix = f's{index}'
        req_cols = sorted([c for h, c in headers.items()
                           if re.fullmatch(prefix + r'(?:\.[123])?', h)], key=colnum)
        requirements = [val(f'{c}{row}') for c in req_cols]
        assert requirements and all(isinstance(n, str) and n.casefold() in name_lookup for n in requirements), (row, index, requirements)
        hero['synergies'].append({
            'index': index,
            'tier': (index + 1) // 2 if index <= 14 else index - 7,
            'requires': [name_lookup[n.casefold()] for n in requirements],
            'requiresNames': requirements,
            **fields(prefix, row),
            'source': f'Data!{req_cols[0]}{row}:{headers[prefix + ".global"]}{row}',
        })
    for level in levels:
        prefix = f'm.{level}'
        hero['milestones'].append({
            'level': level, **fields(prefix, row),
            'source': f'Data!{headers[prefix + ".value"]}{row}:{headers[prefix + ".global"]}{row}',
        })
    heroes.append(hero)

aliases = {
    'Ultra Crit Chnce': 'Ultra Crit Chance',
    'Ultra Crit Dmage': 'Ultra Crit Damage',
    'Ultra Ctir Damage': 'Ultra Crit Damage',
    'Ultra Energe Chance': 'Ultra Energy Chance',
    'Bp Exp': 'Battle Pass Exp',
}
updated_serial = intro['C25']
payload = {
    'meta': {
        'sourceURL': 'https://docs.google.com/spreadsheets/d/1fhCvf0yoFYqoTic86KpcjGmAFDYv-RHGCAas8sG1B6U/edit?gid=63100333#gid=63100333',
        'title': 'Mana / Osto Hero Synergy Sheet',
        'gameVersion': intro['C28'],
        'sourceUpdated': (dt.date(1899, 12, 30) + dt.timedelta(days=updated_serial)).isoformat(),
        'sourceUpdatedExcelSerial': updated_serial,
        'importedAt': '2026-11-02',
        'credits': ['Mana', 'Osto', 'devilkk'],
        'statAliases': aliases,
        'sourceRange': 'Data!A2:DW43',
    },
    'heroes': heroes,
    'stats': sorted(stats),
    'milestoneLevels': levels,
}
output = ROOT.parent / 'data.js'
output.write_text('// Generated from the linked spreadsheet by source/extract_data.py.\n'
                  + 'window.HERO_DATA = ' + json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
                  + ';\n', encoding='utf-8', newline='\n')
print(f'Extracted {len(heroes)} heroes, {sum(len(h["synergies"]) for h in heroes)} synergies, '
      f'{sum(len(h["milestones"]) for h in heroes)} milestones, {len(stats)} raw stat names.')
print(f'Source updated {payload["meta"]["sourceUpdated"]}, game {payload["meta"]["gameVersion"]}.')
print('All prerequisite references, numeric values and global flags validated.')
print(f'Wrote {output}')
calibration_path = ROOT / 'milestone-review' / 'calibration.json'
if calibration_path.exists() and json.loads(calibration_path.read_text(encoding='utf-8')).get('status') == 'active-calibrated':
    # Baseline transcriptions establish the inferred bases. Deployed-team capture
    # audits depend on those bases and must run only after their activation.
    # Run as scripts so sibling helpers resolve just as in a direct build.
    for script, arguments in (('build_review.py', ['--defer-capture-review']),
                              ('activate_milestones.py', []),
                              ('build_review.py', [])):
        subprocess.run([sys.executable, '-X', 'utf8', str(ROOT / 'milestone-review' / script), *arguments], check=True)
if (ROOT / 'synergy-review' / 'confirmed-overrides.json').exists():
    subprocess.run([sys.executable, '-X', 'utf8', str(ROOT / 'synergy-review' / 'apply_verified.py')], check=True)
