if (global.mod_desktop_launcher) {
    if (keyboard_check_pressed(vk_f9)) {
        if (global.mod_desktop_overlay) {
            global.mod_desktop_overlay = false;
            global.mod_desktop_waiting = false;
        } else if (global.mod_desktop_waiting) {
            // Cancellation wins even if the title transition just completed.
            global.mod_desktop_waiting = false;
        } else if (title == false && title_scale < 0.01 && start_timer < 1) {
            global.mod_desktop_overlay = true;
            global.mod_desktop_waiting = false;
        } else {
            // Allows the launcher to cancel a queued start before exiting.
            global.mod_desktop_waiting = !global.mod_desktop_waiting;
        }
    }
    if (global.mod_desktop_waiting && title == false
        && title_scale < 0.01 && start_timer < 1) {
        global.mod_desktop_overlay = true;
        global.mod_desktop_waiting = false;
    }
    if (global.mod_desktop_overlay && keyboard_check_pressed(vk_escape)) {
        global.mod_desktop_overlay = false;
        // Do not pass the same Escape press to the original title-screen action.
        keyboard_clear(vk_escape);
    }
    if (global.mod_desktop_overlay != global.mod_desktop_previous) {
        if (global.mod_desktop_overlay) {
            custom_menu = false;
            submenu = -1;
            global.mod_hd_debug = false;
            fullscreen = false;
            window_set_fullscreen(false);
            window_set_colour(make_color_rgb(1, 2, 3));
            window_set_cursor(cr_default);
            application_surface_draw_enable(true);
        } else {
            window_set_colour(global.mod_desktop_window_colour);
            window_set_cursor(cr_none);
        }
        global.mod_desktop_previous = global.mod_desktop_overlay;
    }
    var _desktop_suffix = " [Desktop Ready]";
    if (global.mod_desktop_waiting) _desktop_suffix = " [Desktop Waiting]";
    if (global.mod_desktop_overlay) _desktop_suffix = " [Desktop Overlay]";
    var _desktop_caption = global.mod_desktop_base_caption + _desktop_suffix;
    if (window_get_caption() != _desktop_caption) window_set_caption(_desktop_caption);
}
