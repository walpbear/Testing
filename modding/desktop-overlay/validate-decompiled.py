#!/usr/bin/env python3
"""Check decompiled code scope and preservation without rendering artwork."""
from pathlib import Path
import hashlib
import json
import re
import sys

build = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/overlay-build')
base = build / 'decompiled/CodeEntries'
patched = build / 'patched-decompiled/CodeEntries'
expected = {
    'gml_Object_oFutaMatingPress_Create_0.gml',
    'gml_Object_oFutaMatingPress_Step_0.gml',
    'gml_Object_oFutaMatingPress_Draw_0.gml',
    'gml_Object_oFutaMatingPress_Draw_64.gml',
    'gml_Object_oBackground_Draw_0.gml',
}
before = {p.name: p.read_text() for p in base.glob('*.gml')}
after = {p.name: p.read_text() for p in patched.glob('*.gml')}
assert set(before) == set(after), 'Code entry set changed'
assert all('DECOMPILER FAILED!' not in text for text in after.values()), 'Decompilation failed'
changed = {name for name in before if before[name] != after[name]}
assert changed == expected, f'Unexpected changed root code entries: {changed ^ expected}'

draw = 'gml_Object_oFutaMatingPress_Draw_0.gml'
preserved = {}
for function in ('mod_draw_sprite_ext', 'mod_draw_sprite_part_ext', 'mod_sprite_get_number'):
    pattern = re.compile(r'\b' + function + r'\(')
    old = [line.strip() for line in before[draw].splitlines() if pattern.search(line)]
    new = [line.strip() for line in after[draw].splitlines() if pattern.search(line)]
    assert old == new, f'Character rendering expressions changed: {function}'
    preserved[function] = len(old)

mask = after[draw].index('gpu_set_colorwriteenable(_desktop_ui_visible, _desktop_ui_visible, _desktop_ui_visible, _desktop_ui_visible)')
first_hud = after[draw].index('var shadow_color = 0;')
restore = after[draw].index('gpu_set_colorwriteenable(true, true, true, true)')
assert mask < first_hud < restore, 'HUD color-write mask does not cover HUD from its first draw'
assert 'gpu_set_colorwriteenable(true, true, true, true);\ndraw_set_valign(fa_middle);\nwith (oCondom)' in after[draw], 'Color writes are not restored before original subsequent object drawing'
background = after['gml_Object_oBackground_Draw_0.gml']
assert background.index('draw_clear_alpha(make_color_rgb(1, 2, 3), 1)') < background.index('draw_sprite_ext(background_sprite, 0,'), 'Background guard is too late'
assert background.index('background_allow_condom_strip') < background.index('draw_clear_alpha(make_color_rgb(1, 2, 3), 1)'), 'Background metadata updates were skipped'

report = {
    'passed': True,
    'targetSha256': hashlib.sha256((build / 'data.win').read_bytes()).hexdigest(),
    'decompiledRootEntries': len(after),
    'changedRootEntries': sorted(changed),
    'preservedOrderedCharacterExpressions': preserved,
    'checks': ['All root bytecode entries decompile, including their nested functions.',
               'Only the five intended root event sources changed.',
               'Character drawing, scaling, and frame-selection expressions remain identical.',
               'HUD pixel masking begins before its first draw and restores color writes before subsequent object rendering.',
               'Background metadata continues to update before background-only rendering exits.'],
}
(build / 'decompiled-validation-report.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
