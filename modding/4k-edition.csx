using System;
using System.IO;
using UndertaleModLib.Compiler;

EnsureDataLoaded();
if (Data.Code.ByName("gml_GlobalScript_scrCustomResolution") == null)
    throw new Exception("Apply this upgrade to the previous HD-character patch.");
Data.GeneralInfo.DefaultWindowWidth = 3840;
Data.GeneralInfo.DefaultWindowHeight = 2160;
foreach (var room in Data.Rooms)
    foreach (var view in room.Views)
        if (view.Enabled)
        {
            view.PortWidth = 3840;
            view.PortHeight = 2160;
            view.ViewWidth = 910;
            view.ViewHeight = 512;
            view.ViewX = -15;
        }
var group = new CodeImportGroup(Data);
group.QueueReplace("gml_GlobalScript_scrCustomResolution",
    File.ReadAllText(Path.Combine(Path.GetDirectoryName(ScriptPath), "custom-resolution-helpers.gml")));
group.QueueAppend("gml_Object_oFutaMatingPress_Create_0", @"
global.mod_hd_debug = false;
var _hd_camera_width = 512 * (3840 / 2160);
camera_set_view_size(view_camera[0], _hd_camera_width, 512);
camera_set_view_pos(view_camera[0], (880 - _hd_camera_width) / 2, 0);
if (!window_get_fullscreen()) window_set_size(3840, 2160);
");
group.QueueAppend("gml_Object_oFutaMatingPress_Draw_64", @"
if (keyboard_check_pressed(vk_f8)) global.mod_hd_debug = !global.mod_hd_debug;
if (global.mod_hd_debug) {
    var _hd_s = top_deepthroat;
    draw_set_font(fntFontSmall);
    draw_set_halign(fa_left);
    draw_set_valign(fa_top);
    draw_set_color(c_white);
    draw_text_transformed(24, 24, ""4K edition v2 | sprite "" + string(sprite_get_width(_hd_s)) + ""x"" + string(sprite_get_height(_hd_s))
        + "" | scale "" + string(mod_sprite_resolution(_hd_s))
        + "" | origin "" + string(sprite_get_xoffset(_hd_s)) + "","" + string(sprite_get_yoffset(_hd_s)), 3, 3, 0);
}
");
group.Import();
ScriptMessage("Built 3840x2160 edition with aspect-preserving camera, explicit sprite resolution metadata, and F8 diagnostics.");
