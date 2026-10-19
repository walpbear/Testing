// Runs after the original game's initialization and custom character loading.
global.mod_desktop_base_caption = window_get_caption();
global.mod_desktop_window_colour = window_get_colour();
global.mod_desktop_previous = false;
global.mod_desktop_launcher = false;
for (var _desktop_arg = 1; _desktop_arg <= parameter_count(); _desktop_arg++) {
    if (parameter_string(_desktop_arg) == "--desktop-overlay") {
        global.mod_desktop_launcher = true;
    }
}
if (global.mod_desktop_launcher) {
    // Keep the original title/start flow. Enable the overlay after Begin.
    global.mod_desktop_waiting = true;
    fullscreen = false;
    window_set_fullscreen(false);
    var _desktop_width = min(1280, floor(display_get_width() * 0.8));
    var _desktop_height = floor(_desktop_width * 9 / 16);
    if (_desktop_height > display_get_height() * 0.8) {
        _desktop_height = floor(display_get_height() * 0.8);
        _desktop_width = floor(_desktop_height * 16 / 9);
    }
    window_set_size(_desktop_width, _desktop_height);
    window_set_caption(global.mod_desktop_base_caption + " [Desktop Waiting]");
}
