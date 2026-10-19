using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using UndertaleModLib.Compiler;

EnsureDataLoaded();
if (Data.Code.ByName("gml_GlobalScript_scrCustomResolution") == null)
    throw new Exception("Expected the repository's 4K sprite edition v4 archive.");
if (Data.Strings.Any(s => s.Content == "mod_desktop_overlay"))
    throw new Exception("Desktop overlay patch is already installed; refusing to apply twice.");

var directory = Path.GetDirectoryName(ScriptPath);
var group = new CodeImportGroup(Data) { AutoCreateAssets = false };
// Apply each event's text edits before compiling it once. Intermediate open
// guards are intentionally incomplete until their matching closing edit.
var sources = new Dictionary<string, string>();
string Source(string name) {
    if (!sources.ContainsKey(name)) sources[name] = GetDecompiledText(name);
    return sources[name];
}
void Prepend(string name, string text) { sources[name] = text + "\n" + Source(name); }
void Append(string name, string text) { sources[name] = Source(name) + "\n" + text; }
void ReplaceCode(string name, string search, string replacement) {
    var source = Source(name);
    int first = source.IndexOf(search, StringComparison.Ordinal);
    if (first < 0 || source.IndexOf(search, first + search.Length, StringComparison.Ordinal) >= 0)
        throw new Exception("Expected exactly one patch anchor in " + name + ": " + search);
    sources[name] = source.Replace(search, replacement);
}
var main = "gml_Object_oFutaMatingPress_";
Prepend(main + "Create_0", "global.mod_desktop_overlay = false;\nglobal.mod_desktop_waiting = false;\n");
Append(main + "Create_0", File.ReadAllText(Path.Combine(directory, "overlay-create.gml")));
Prepend(main + "Step_0", File.ReadAllText(Path.Combine(directory, "overlay-step.gml")));

// Keep background metadata updates used by gameplay, but suppress its graphics.
ReplaceCode("gml_Object_oBackground_Draw_0",
    "draw_sprite_ext(background_sprite, 0, x, y, 2, 2, 0, c_white, 1);",
    "if (global.mod_desktop_overlay) { draw_clear_alpha(make_color_rgb(1, 2, 3), 1); exit; }\n"
    + "draw_sprite_ext(background_sprite, 0, x, y, 2, 2, 0, c_white, 1);");
ReplaceCode(main + "Draw_0",
    "if (foreground_front == true)",
    "if (foreground_front == true && !global.mod_desktop_overlay)");
ReplaceCode(main + "Draw_0",
    "if (instance_exists(oBackground) && condom_strip > 0 && oBackground.allow_condom_strip == true)",
    "if (!global.mod_desktop_overlay && instance_exists(oBackground) && condom_strip > 0 && oBackground.allow_condom_strip == true)");

// The original draw event also advances gameplay. Mask HUD pixels instead of
// exiting the event, and skip only the hidden portrait/menu interaction block.
ReplaceCode(main + "Draw_0",
    "draw_set_halign(fa_center);\ndraw_set_font(fntFontBig);\nvar shadow_color = 0;",
    "var _desktop_ui_visible = !global.mod_desktop_overlay;\n"
    + "gpu_set_colorwriteenable(_desktop_ui_visible, _desktop_ui_visible, _desktop_ui_visible, _desktop_ui_visible);\n"
    + "draw_set_halign(fa_center);\ndraw_set_font(fntFontBig);\nvar shadow_color = 0;");
ReplaceCode(main + "Draw_0",
    "if (((insert == false && orgasm == false) || show_portrait == true) && custom_menu == false)",
    "if (!global.mod_desktop_overlay) {\n"
    + "if (((insert == false && orgasm == false) || show_portrait == true) && custom_menu == false)");
ReplaceCode(main + "Draw_0",
    "draw_set_font(fntFontBig);\ndraw_set_halign(fa_left);\ndraw_set_valign(fa_middle);",
    "}\n"
    + "draw_set_font(fntFontBig);\ndraw_set_halign(fa_left);\ndraw_set_valign(fa_middle);");
ReplaceCode(main + "Draw_0",
    "draw_set_valign(fa_middle);\nwith (oCondom)",
    "gpu_set_colorwriteenable(true, true, true, true);\ndraw_set_valign(fa_middle);\nwith (oCondom)");
ReplaceCode(main + "Draw_0",
    "draw_text_color(plap_x, plap_y + 1 + (4 * plap_scale), plap_string, shadow_color, shadow_color, shadow_color, shadow_color, plap_scale);",
    "if (!global.mod_desktop_overlay) {\n"
    + "draw_text_color(plap_x, plap_y + 1 + (4 * plap_scale), plap_string, shadow_color, shadow_color, shadow_color, shadow_color, plap_scale);");
ReplaceCode(main + "Draw_0",
    "draw_text_color(plap_x, plap_y + (4 * plap_scale), plap_string, c_white, c_white, c_white, c_white, plap_scale);",
    "draw_text_color(plap_x, plap_y + (4 * plap_scale), plap_string, c_white, c_white, c_white, c_white, plap_scale);\n}");
ReplaceCode(main + "Draw_0", "if (draw_cursor == true)",
    "if (draw_cursor == true && !global.mod_desktop_overlay)");
ReplaceCode(main + "Draw_0", "if (banner_scale > 0.01)",
    "if (banner_scale > 0.01 && !global.mod_desktop_overlay)");

// The palette shader recolors every pixel, including the transparency key.
// Preserve the selected palette setting; bypass it only in desktop mode.
Prepend(main + "Draw_64", @"
if (global.mod_desktop_overlay) {
    application_surface_draw_enable(true);
    shader_reset();
    exit;
}
");
foreach (var source in sources) group.QueueReplace(source.Key, source.Value);
group.Import();
ScriptMessage("Compiled separate desktop-overlay rendering and launcher mode. Original artwork and character composition are preserved.");
