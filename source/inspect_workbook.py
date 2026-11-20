import json, re, zipfile, xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
with zipfile.ZipFile(ROOT / 'hero-source.xlsx') as z:
    strings = [''.join(n.itertext()) for n in ET.fromstring(z.read('xl/sharedStrings.xml'))]
    relationships = {r.attrib['Id']: r.attrib['Target'] for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    sheets = {}
    for sheet in ET.fromstring(z.read('xl/workbook.xml')).find('s:sheets', NS):
        target = relationships[sheet.attrib[REL]]
        target = target.lstrip('/') if target.startswith('/') else 'xl/' + target
        cells = {}
        for c in ET.fromstring(z.read(target)).findall('.//s:sheetData/s:row/s:c', NS):
            value = c.find('s:v', NS)
            formula = c.find('s:f', NS)
            v = value.text if value is not None else None
            if c.get('t') == 's': v = strings[int(v)]
            elif c.get('t') == 'inlineStr': v = ''.join(c.find('s:is', NS).itertext())
            elif v is not None and c.get('t') not in ['str', 'e']:
                try: v = float(v); v = int(v) if v.is_integer() else v
                except ValueError: pass
            if v is not None or formula is not None:
                cells[c.attrib['r']] = {'v': v, **({'f': formula.text} if formula is not None else {})}
        sheets[sheet.attrib['name']] = cells
    # The public data rebuild uses only the roster, its column headers, and
    # the two provenance cells. Keep the complete workbook dump local.
    records = {}
    for address, entry in sheets['Data'].items():
        column, row = re.fullmatch(r'([A-Z]+)([0-9]+)', address).groups()
        if int(row) <= 43 and (len(column), column) <= (2, 'DW') and entry['v'] is not None:
            records[address] = entry['v']
    public_input = {'Introduction': {cell: sheets['Introduction'][cell]['v'] for cell in ('C25', 'C28')}, 'Data': records}
    (ROOT / 'hero-records.json').write_text(json.dumps(public_input, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (ROOT / 'workbook.json').write_text(json.dumps(sheets, ensure_ascii=False, indent=2), encoding='utf-8')
    for name, cells in sheets.items():
        lines = [f'{cell}: {entry}' for cell,entry in cells.items()]
        (ROOT / (name + '.txt')).write_text('\n'.join(lines), encoding='utf-8')
        print(name, len(cells))
