using System;
using System.Linq;
using UndertaleModLib.Compiler;

EnsureDataLoaded();
if (Data.GeneralInfo.DefaultWindowWidth != 880 || Data.GeneralInfo.DefaultWindowHeight != 512)
    throw new Exception("Expected the original 880x512 game; refusing to apply twice.");
Data.GeneralInfo.DefaultWindowWidth = 2640;
Data.GeneralInfo.DefaultWindowHeight = 1536;
int changedViews = 0;
foreach (var room in Data.Rooms)
{
    foreach (var view in room.Views.Where(v => v.Enabled))
    {
        if (view.ViewWidth != 880 || view.ViewHeight != 512 || view.PortWidth != 880 || view.PortHeight != 512)
            throw new Exception("Unexpected active viewport dimensions.");
        view.PortWidth = 2640;
        view.PortHeight = 1536;
        changedViews++;
    }
}
if (changedViews != 1) throw new Exception("Expected exactly one active view.");
var imports = new CodeImportGroup(Data) { AutoCreateAssets = false, ThrowOnNoOpFindReplace = true };
imports.QueueFindReplace("gml_Object_oFutaMatingPress_Draw_64",
    "draw_surface_ext(application_surface, 0, 0, 1, 1, 0, c_white, 1);",
    "draw_surface_stretched(application_surface, 0, 0, display_get_gui_width(), display_get_gui_height());");
imports.Import();
ScriptMessage("Patched window and active viewport to 2640x1536; kept camera at 880x512 and adapted palette GUI rendering.");
