"""Step 1 of the map pipeline: pick borders, merge odd features, emit one GeoJSON.

Reads Natural Earth 1:10m admin-0 editions (downloaded into tools/.cache/ne),
builds the base edition plus one diff per supported point of view (POV),
and writes tools/.cache/features.geojson + tools/.cache/povs.json for build.mjs.

Base edition: Natural Earth's Ukraine POV (Crimea in Ukraine, Western Sahara
separate, N. Cyprus / Somaliland / Baikonur merged into their UN states) with
Kosovo kept separate. Areas no feature covers become neutral land.
"""

import hashlib
import json
import os
import sys
import urllib.request

from shapely.geometry import mapping, shape
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '..', '.cache')
NE_DIR = os.path.join(CACHE, 'ne')
NE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/'

# Player home country (ISO A2) -> Natural Earth POV edition used for them.
POV_BY_HOME = {
    'IN': 'ind', 'PK': 'pak', 'CN': 'chn', 'MA': 'mar', 'AR': 'arg', 'TR': 'tur',
    'IL': 'isr', 'PS': 'pse', 'JP': 'jpn', 'NP': 'nep', 'EG': 'egy', 'KR': 'kor',
    'VN': 'vnm', 'SA': 'sau', 'ID': 'idn', 'GR': 'grc',
}

# Small pieces folded into the state players expect to see highlighted.
MERGE_INTO = {
    'ALD': 'FIN',
    'IMN': 'GBR', 'JEY': 'GBR', 'GGY': 'GBR',
    'WSB': 'CYP', 'ESB': 'CYP', 'CNM': 'CYP',
    'USG': 'CUB',
    'BRI': 'BRA',
    'ATC': 'AUS', 'CSI': 'AUS', 'IOA': 'AUS',
    'KAB': 'KAZ',
    'SOL': 'SOM',
}

# Never visible in play (far south, uninhabited reefs).
DROP = {'ATA', 'ATF', 'HMD', 'BJN', 'SER', 'SCR', 'PGA', 'CLP', 'SGS', 'BVT'}

# Codes for features without a usable ISO A2.
CUSTOM_CODE = {
    'KOS': 'XK', 'CYN': 'XC', 'BRT': 'XB', 'KAS': 'XS', 'SPI': 'XP',
    'SAH': 'EH', 'PSX': 'PS', 'B35': 'XA', 'B37': 'XO',
}


def ensure(edition):
    name = 'ne_10m_admin_0_countries' + ('' if edition == 'default' else '_' + edition) + '.geojson'
    path = os.path.join(NE_DIR, name)
    if not os.path.exists(path):
        os.makedirs(NE_DIR, exist_ok=True)
        print('downloading', name)
        urllib.request.urlretrieve(NE_URL + name, path)
    return path


def ghash(geom_json):
    return hashlib.md5(json.dumps(geom_json, separators=(',', ':')).encode()).hexdigest()[:12]


def load_edition(edition):
    """Returns {adm0_a3: {'props': {...}, 'raw': [geometry json...]}} after merges."""
    data = json.load(open(ensure(edition)))
    feats = {}
    for f in data['features']:
        p = f['properties']
        a3 = p['ADM0_A3']
        # Unassigned areas (null properties) are refilled as neutral land by find_gaps.
        if a3 is None or a3 in DROP:
            continue
        target = MERGE_INTO.get(a3, a3)
        entry = feats.setdefault(target, {'props': None, 'raw': []})
        entry['raw'].append((a3, f['geometry']))
        if target == a3:
            entry['props'] = p
    for a3, entry in feats.items():
        if entry['props'] is None:
            raise SystemExit(f'{edition}: merge target {a3} missing')
        entry['raw'].sort(key=lambda r: r[0])
        entry['hash'] = ghash([g for _, g in entry['raw']])
    return feats


def geom_of(entry):
    shapes = [shape(g) for _, g in entry['raw']]
    g = shapes[0] if len(shapes) == 1 else unary_union(shapes)
    return g.buffer(0) if not g.is_valid else g


def code_of(a3, props):
    if a3 in CUSTOM_CODE:
        return CUSTOM_CODE[a3]
    for key in ('ISO_A2_EH', 'ISO_A2'):
        v = props.get(key)
        if v and v != '-99':
            return v
    raise SystemExit(f'no code for {a3}')


def build_base():
    base = load_edition('ukr')
    default = load_edition('default')
    base['SRB'] = default['SRB']
    base['KOS'] = default['KOS']
    return base, default


def find_gaps(edition_feats, reference_feats):
    """Land covered in the reference but by no feature of this edition."""
    ours = {e['hash'] for e in edition_feats.values()}
    changed = [e for e in reference_feats.values() if e['hash'] not in ours]
    if not changed:
        return []
    ref_union = unary_union([geom_of(e) for e in changed])
    minx, miny, maxx, maxy = ref_union.bounds
    near = []
    for e in edition_feats.values():
        g = geom_of(e)
        bx = g.bounds
        if bx[2] >= minx and bx[0] <= maxx and bx[3] >= miny and bx[1] <= maxy:
            near.append(g)
    gaps = ref_union.difference(unary_union(near)) if near else ref_union
    parts = list(getattr(gaps, 'geoms', [gaps]))
    # Drop slivers from tiny linework differences (about 1 km^2 and below).
    return [p for p in parts if p.area > 1e-4]


def main():
    base, default = build_base()
    base_gaps = find_gaps(base, default)
    print('base features', len(base), 'gaps', [round(g.area, 4) for g in base_gaps])

    out_features = []
    ids_by_hash = {}

    def emit(a3, entry, geom=None, neutral=False):
        g = geom if geom is not None else geom_of(entry)
        h = entry['hash'] if entry else ghash(mapping(g))
        if h in ids_by_hash:
            return ids_by_hash[h]
        p = entry['props'] if entry else {}
        code = code_of(a3, p) if entry else 'Z' + str(len([f for f in out_features if f['properties']['neutral']]) + 1)
        fid = code if not any(f['properties']['code'] == code for f in out_features) else f'{code}#{h[:6]}'
        props = {
            'id': fid,
            'code': code,
            'a3': a3,
            'neutral': neutral,
            'type': p.get('TYPE', 'Indeterminate'),
            'sov': p.get('SOV_A3', ''),
            'name': p.get('NAME_EN') or p.get('ADMIN') or 'Disputed',
            'continent': p.get('CONTINENT', ''),
            'subregion': p.get('SUBREGION', ''),
            'label': [p.get('LABEL_X', 0), p.get('LABEL_Y', 0)],
            'pop': p.get('POP_EST', 0),
            'labelrank': p.get('LABELRANK', 9),
        }
        out_features.append({'type': 'Feature', 'properties': props, 'geometry': mapping(g)})
        ids_by_hash[h] = fid
        return fid

    base_ids = {}
    for a3 in sorted(base):
        base_ids[a3] = emit(a3, base[a3], neutral=a3 in ('BRT', 'SAH'))
    for g in base_gaps:
        base_ids['GAP' + str(len(base_ids))] = emit('GAP', None, geom=g, neutral=True)
    base_set = set(base_ids.values())

    povs = {}
    for home, edition in sorted(POV_BY_HOME.items()):
        feats = load_edition(edition)
        gaps = find_gaps(feats, default)
        ids = set()
        for a3 in sorted(feats):
            ids.add(emit(a3, feats[a3], neutral=a3 in ('BRT', 'SAH')))
        for g in gaps:
            ids.add(emit('GAP', None, geom=g, neutral=True))
        add = sorted(ids - base_set)
        remove = sorted(base_set - ids)
        povs[home] = {'edition': edition, 'add': add, 'remove': remove}
        print(f'{home} ({edition}): +{add} -{remove} gaps={len(gaps)}')

    json.dump({'type': 'FeatureCollection', 'features': out_features},
              open(os.path.join(CACHE, 'features.geojson'), 'w'))
    json.dump({'base': sorted(base_set), 'povs': povs}, open(os.path.join(CACHE, 'povs.json'), 'w'), indent=1)
    print('features written', len(out_features))


if __name__ == '__main__':
    sys.exit(main())
