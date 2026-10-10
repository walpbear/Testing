// Keep logical sprite coordinates while drawing full-resolution textures.
function mod_sprite_resolution(_sprite) {
    var _key = string(_sprite);
    if (variable_struct_exists(global.mod_sprite_resolutions, _key))
        return variable_struct_get(global.mod_sprite_resolutions, _key);
    return 1;
}
function mod_register_sprite_resolution(_sprite, _path, _ox, _oy) {
    var _file = filename_name(_path);
    var _base = 0;
    switch (_file) {
        case "custom_portrait.png": case "custom_portrait_alt.png": _base = 128; break;
        case "custom_mating_press.png": case "custom_mating_press_alt.png":
        case "custom_reverse_cowgirl.png": case "custom_reverse_cowgirl_alt.png":
        case "custom_deepthroat.png": case "custom_deepthroat_alt.png":
        case "custom_condom.png": case "custom_condom_broken.png":
        case "custom_xray.png": case "custom_xray_alt.png":
        case "custom_xray_broken.png": _base = 160; break;
    }
    var _scale = 1;
    if (_base > 0) {
        var _ratio = sprite_get_width(_sprite) / _base;
        if (_ratio >= 1 && abs(_ratio - round(_ratio)) < 0.0001)
            _scale = round(_ratio);
    }
    variable_struct_set(global.mod_sprite_resolutions, string(_sprite), _scale);
    sprite_set_offset(_sprite, _ox * _scale, _oy * _scale);
}
function mod_sprite_get_width(_s) { return sprite_get_width(_s) / mod_sprite_resolution(_s); }
function mod_sprite_get_height(_s) { return sprite_get_height(_s) / mod_sprite_resolution(_s); }
function mod_sprite_get_xoffset(_s) { return sprite_get_xoffset(_s) / mod_sprite_resolution(_s); }
function mod_sprite_get_yoffset(_s) { return sprite_get_yoffset(_s) / mod_sprite_resolution(_s); }
function mod_draw_sprite_ext(_s, _f, _x, _y, _xs, _ys, _rot, _col, _alpha) {
    var _scale = mod_sprite_resolution(_s);
    draw_sprite_ext(_s, _f, _x, _y, _xs / _scale, _ys / _scale, _rot, _col, _alpha);
}
function mod_draw_sprite_part_ext(_s, _f, _l, _t, _w, _h, _x, _y, _xs, _ys, _col, _alpha) {
    var _scale = mod_sprite_resolution(_s);
    draw_sprite_part_ext(_s, _f, _l * _scale, _t * _scale, _w * _scale, _h * _scale,
        _x, _y, _xs / _scale, _ys / _scale, _col, _alpha);
}
