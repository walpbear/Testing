using System;
using System.IO;
using UndertaleModLib.Compiler;

EnsureDataLoaded();
var group = new CodeImportGroup(Data) { ThrowOnNoOpFindReplace = true };
group.QueueReplace("gml_GlobalScript_scrCustomResolution",
    File.ReadAllText(Path.Combine(Path.GetDirectoryName(ScriptPath), "custom-resolution-helpers.gml")));
group.QueuePrepend("gml_Object_oFutaMatingPress_Create_0", "global.mod_sprite_frames = {};\n");
group.QueueFindReplace("gml_Object_oFutaMatingPress_Create_0",
    "arg0 = sprite_add(arg1, arg2, false, false, arg3, arg4);",
    "arg0 = mod_add_custom_sprite(arg1, arg2, arg3, arg4);");
group.QueueFindReplace("gml_Object_oFutaMatingPress_Create_0",
    "file_exists(file_check)", "mod_sprite_file_exists(file_check)");
group.QueueFindReplace("gml_Object_oFutaMatingPress_Create_0",
    "file_exists(mp_check)", "mod_sprite_file_exists(mp_check)");
group.QueueFindReplace("gml_Object_oFutaMatingPress_Create_0",
    "sprite_add(file_check, 1, false, false, sprite_origin_x, sprite_origin_y)",
    "mod_probe_custom_sprite(file_check, sprite_origin_x, sprite_origin_y)");
group.QueueFindReplace("gml_Object_oFutaMatingPress_Create_0",
    "sprite_get_texture(arg0, arg1)", "mod_sprite_get_texture(arg0, arg1)");
group.QueueFindReplace("gml_Object_oFutaMatingPress_Draw_0",
    "sprite_get_number(", "mod_sprite_get_number(");
group.QueueFindReplace("gml_Object_oFutaMatingPress_Draw_64", "4K edition v2", "4K sprite edition v3");
group.QueueFindReplace("gml_Object_oFutaMatingPress_Draw_64",
    "string(mod_sprite_resolution(_hd_s))",
    "string(mod_sprite_resolution(_hd_s)) + \"x\" + string(mod_sprite_resolution_y(_hd_s))");
group.Import();
ScriptMessage("Compiled arbitrary custom resolution factors and separate 4K animation-frame loading.");
