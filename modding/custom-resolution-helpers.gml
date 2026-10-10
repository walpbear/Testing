// Keep logical sprite coordinates while drawing full-resolution textures.
function mod_sprite_resolution(_sprite) {
    var _key = string(_sprite);
    if (variable_struct_exists(global.mod_sprite_resolutions, _key))
        return variable_struct_get(global.mod_sprite_resolutions, _key);
    return 1;
}
function mod_register_sprite_resolution(_sprite, _path, _ox, _oy) {
    // Normalize paths ourselves: avoid relying on filename helpers for detection.
    var _path_normalized = string_lower(string_replace_all(_path, "\\", "/"));
    var _base = 0;
    var _key = "";
    var _names = ["portrait", "portrait_alt", "mating_press", "mating_press_alt",
        "reverse_cowgirl", "reverse_cowgirl_alt", "deepthroat", "deepthroat_alt",
        "condom", "condom_broken", "xray", "xray_alt", "xray_broken"];
    for (var _i = 0; _i < array_length(_names); _i++) {
        if (string_pos("/custom_" + _names[_i] + ".png", "/" + _path_normalized) > 0) {
            _key = _names[_i];
            _base = (_key == "portrait" || _key == "portrait_alt") ? 128 : 160;
            break;
        }
    }
    var _scale = 1;
    if (_base > 0) {
        var _ratio = sprite_get_width(_sprite) / _base;
        if (_ratio >= 1 && abs(_ratio - round(_ratio)) < 0.0001)
            _scale = round(_ratio);
        // Explicit per-sheet settings take precedence over inference.
        var _config = filename_dir(_path) + "custom_data.futa";
        if (!file_exists(_config)) _config = filename_dir(_path) + "custom_data.spouse";
        if (file_exists(_config)) {
            ini_open(_config);
            var _configured = ini_read_real("resolution", _key, _scale);
            ini_close();
            if (_configured >= 1 && _configured <= 8) _scale = _configured;
        }
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
