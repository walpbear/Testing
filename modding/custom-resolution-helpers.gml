// Keep logical sprite coordinates while drawing full-resolution textures.
function mod_sprite_resolution(_sprite) {
    var _key = string(_sprite);
    if (variable_struct_exists(global.mod_sprite_resolutions, _key))
        return variable_struct_get(global.mod_sprite_resolutions, _key).x;
    return 1;
}
function mod_sprite_resolution_y(_sprite) {
    var _key = string(_sprite);
    if (variable_struct_exists(global.mod_sprite_resolutions, _key))
        return variable_struct_get(global.mod_sprite_resolutions, _key).y;
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
    var _scale_y = 1;
    if (_base > 0) {
        var _ratio = sprite_get_width(_sprite) / _base;
        if (_ratio > 0) _scale = _ratio;
        // Explicit per-sheet settings take precedence over inference.
        var _config = filename_dir(_path) + "custom_data.futa";
        if (!file_exists(_config)) _config = filename_dir(_path) + "custom_data.spouse";
        _scale_y = _scale;
        if (file_exists(_config)) {
            ini_open(_config);
            var _configured = ini_read_real("resolution", _key, _scale);
            if (_configured > 0) _scale = _configured;
            _scale_y = _scale;
            var _logical_w = ini_read_real("resolution", _key + "_logical_width", 0);
            var _logical_h = ini_read_real("resolution", _key + "_logical_height", 0);
            if (_logical_w > 0) _scale = sprite_get_width(_sprite) / _logical_w;
            if (_logical_h > 0) _scale_y = sprite_get_height(_sprite) / _logical_h;
            ini_close();
        }
    }
    variable_struct_set(global.mod_sprite_resolutions, string(_sprite), {x: _scale, y: _scale_y});
    sprite_set_offset(_sprite, _ox * _scale, _oy * _scale_y);
    if (variable_struct_exists(global.mod_sprite_frames, string(_sprite))) {
        var _frames = variable_struct_get(global.mod_sprite_frames, string(_sprite));
        _frames.ox = _ox * _scale;
        _frames.oy = _oy * _scale_y;
    }
}
function mod_sprite_get_width(_s) { return sprite_get_width(_s) / mod_sprite_resolution(_s); }
function mod_sprite_get_height(_s) { return sprite_get_height(_s) / mod_sprite_resolution_y(_s); }
function mod_sprite_get_xoffset(_s) { return sprite_get_xoffset(_s) / mod_sprite_resolution(_s); }
function mod_sprite_get_yoffset(_s) { return sprite_get_yoffset(_s) / mod_sprite_resolution_y(_s); }
function mod_draw_sprite_ext(_s, _f, _x, _y, _xs, _ys, _rot, _col, _alpha) {
    var _scale = mod_sprite_resolution(_s);
    var _scale_y = mod_sprite_resolution_y(_s);
    var _frame_sprite = mod_sprite_frame(_s, _f);
    var _frame_index = (_frame_sprite == _s && !variable_struct_exists(global.mod_sprite_frames, string(_s))) ? _f : 0;
    draw_sprite_ext(_frame_sprite, _frame_index, _x, _y, _xs / _scale, _ys / _scale_y, _rot, _col, _alpha);
}
function mod_draw_sprite_part_ext(_s, _f, _l, _t, _w, _h, _x, _y, _xs, _ys, _col, _alpha) {
    var _scale = mod_sprite_resolution(_s);
    var _scale_y = mod_sprite_resolution_y(_s);
    var _frame_sprite = mod_sprite_frame(_s, _f);
    var _frame_index = (_frame_sprite == _s && !variable_struct_exists(global.mod_sprite_frames, string(_s))) ? _f : 0;
    draw_sprite_part_ext(_frame_sprite, _frame_index, _l * _scale, _t * _scale_y, _w * _scale, _h * _scale_y,
        _x, _y, _xs / _scale, _ys / _scale_y, _col, _alpha);
}

// Optional separate-frame folders bypass very wide animation strips.
function mod_sprite_file_exists(_path) {
    return file_exists(_path) || file_exists(filename_change_ext(_path, "") + "/frame_00.png");
}
function mod_frame_path(_folder, _index) {
    return _folder + "/frame_" + ((_index < 10) ? "0" : "") + string(_index) + ".png";
}
function mod_add_custom_sprite(_path, _count, _ox, _oy) {
    var _folder = filename_change_ext(_path, "");
    // A frame folder takes precedence over the legacy strip.
    if (!file_exists(_folder + "/frame_00.png"))
        return sprite_add(_path, _count, false, false, _ox, _oy);
    var _paths = [];
    var _loaded = [];
    var _i = 0;
    while (_i < 32 && file_exists(mod_frame_path(_folder, _i))) {
        array_push(_paths, mod_frame_path(_folder, _i));
        array_push(_loaded, -1);
        _i++;
    }
    var _first = sprite_add(_paths[0], 1, false, false, _ox, _oy);
    if (_first == -1) return -1;
    _loaded[0] = _first;
    variable_struct_set(global.mod_sprite_frames, string(_first), {
        paths: _paths, loaded: _loaded, ox: _ox, oy: _oy
    });
    return _first;
}
function mod_probe_custom_sprite(_path, _ox, _oy) {
    var _first = filename_change_ext(_path, "") + "/frame_00.png";
    if (file_exists(_first)) return sprite_add(_first, 1, false, false, _ox, _oy);
    return sprite_add(_path, 1, false, false, _ox, _oy);
}
function mod_sprite_frame(_s, _f) {
    if (!variable_struct_exists(global.mod_sprite_frames, string(_s))) return _s;
    var _frames = variable_struct_get(global.mod_sprite_frames, string(_s));
    var _count = array_length(_frames.paths);
    var _index = ((floor(_f) % _count) + _count) % _count;
    if (_frames.loaded[_index] == -1) {
        var _loaded = sprite_add(_frames.paths[_index], 1, false, false, _frames.ox, _frames.oy);
        if (_loaded == -1) return _s;
        // Reject mismatched frame canvases instead of silently changing geometry.
        if (sprite_get_width(_loaded) != sprite_get_width(_s) || sprite_get_height(_loaded) != sprite_get_height(_s)) {
            sprite_delete(_loaded);
            show_debug_message("HD frame has mismatched dimensions: " + _frames.paths[_index]);
            return _s;
        }
        _frames.loaded[_index] = _loaded;
    }
    return _frames.loaded[_index];
}
function mod_sprite_get_number(_s) {
    if (variable_struct_exists(global.mod_sprite_frames, string(_s)))
        return array_length(variable_struct_get(global.mod_sprite_frames, string(_s)).paths);
    return sprite_get_number(_s);
}
function mod_sprite_get_texture(_s, _f) {
    var _frame_sprite = mod_sprite_frame(_s, _f);
    var _index = variable_struct_exists(global.mod_sprite_frames, string(_s)) ? 0 : _f;
    return sprite_get_texture(_frame_sprite, _index);
}
