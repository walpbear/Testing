using System;
using System.IO;
using UndertaleModLib.Compiler;

EnsureDataLoaded();
var group = new CodeImportGroup(Data) { ThrowOnNoOpFindReplace = true };
group.QueueReplace("gml_GlobalScript_scrCustomResolution",
    File.ReadAllText(Path.Combine(Path.GetDirectoryName(ScriptPath), "custom-resolution-helpers.gml")));
group.QueueTrimmedLinesFindReplace("gml_Object_oFutaMatingPress_Create_0",
    "if (sprite_get_width(temp_sprite) > (sprite_origin_x * 10))\n{\nfile_frames = 7;\n}",
    "file_frames = mod_cowgirl_frame_count(file_check, temp_sprite);");
group.QueueFindReplace("gml_Object_oFutaMatingPress_Draw_64", "4K sprite edition v3", "4K sprite edition v4");
group.Import();
ScriptMessage("Patched reverse-cowgirl frame-count detection for upscaled strips.");
