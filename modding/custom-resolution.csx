using System;
using System.IO;
using System.Text.RegularExpressions;
using UndertaleModLib.Compiler;

EnsureDataLoaded();
var helpers = File.ReadAllText(Path.Combine(Path.GetDirectoryName(ScriptPath), "custom-resolution-helpers.gml"));
var group = new CodeImportGroup(Data) { ThrowOnNoOpFindReplace = true };
group.QueueReplace("gml_GlobalScript_scrCustomResolution", helpers);
group.QueuePrepend("gml_Object_oFutaMatingPress_Create_0", "global.mod_sprite_resolutions = {};\nglobal.mod_sprite_frames = {};\n");
group.QueueFindReplace("gml_Object_oFutaMatingPress_Create_0",
    "arg0 = sprite_add(arg1, arg2, false, false, arg3, arg4);",
    "arg0 = sprite_add(arg1, arg2, false, false, arg3, arg4);\nmod_register_sprite_resolution(arg0, arg1, arg3, arg4);");
foreach (var name in new[] { "draw_sprite_ext", "draw_sprite_part_ext", "sprite_get_width", "sprite_get_height", "sprite_get_xoffset", "sprite_get_yoffset" })
    group.QueueRegexFindReplace("gml_Object_oFutaMatingPress_Draw_0", @"\b" + name + @"\(", "mod_" + name + "(");
group.Import();
ScriptMessage("Compiled resolution-aware custom sprite loading and drawing.");
