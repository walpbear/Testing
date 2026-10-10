4K-per-frame sprite edition v3

INSTALL
Extract this ZIP into a NEW folder and run wifes_bedroom.exe.
It includes the original executable/data and Joseph's supplied artwork.
It does not include newly created 4K artwork: the loader now accepts your 4K frames.
Keep your previous folder as a backup.

FRAME FOLDERS
For Joseph's nine-frame edited pose, put separate PNGs here:
  joseph - lover/custom_deepthroat/frame_00.png
  joseph - lover/custom_deepthroat/frame_01.png
  ...
  joseph - lover/custom_deepthroat/frame_08.png
A folder containing frame_00.png takes precedence over custom_deepthroat.png.
Number frames consecutively starting at 00. Preserve their original order.
Every frame in a folder must have the same canvas dimensions.
Transparent frames still count: keep blank frames rather than omitting them.
The loader supports up to 32 frames per folder and loads frames when needed.
Use the same folder convention for the other custom PNG names (remove .png).
Legacy strip PNGs still work when no frame folder exists.
Separate files avoid exceeding the texture-width limit of a huge horizontal strip.

LOGICAL SIZE / ORIGINS
The supplied custom_data.futa declares original logical dimensions for Joseph's sheets.
For this pose they are:
  [resolution]
  deepthroat_logical_width="160.000000"
  deepthroat_logical_height="220.000000"
The actual PNG dimensions determine independent horizontal and vertical scale factors.
3840x2160 and 4096x4096 canvases are supported by this coordinate mapping.
Keep origin_x="80.000000" and origin_y="84.000000" in logical coordinates.
Do not double origins. Physical origins and crop rectangles are adjusted at runtime.
Author the artwork to fit its logical canvas; adding empty margins changes alignment.
To preserve artwork proportions, keep the original frame aspect ratio when scaling.
Different canvas aspect ratios map back to the declared logical aspect ratio.
All source PNG pixels are retained; the loader does not downsample or generate artwork.
Existing deepthroat="2" metadata is superseded by the logical width/height settings.
Use the corresponding *_logical_width and *_logical_height keys for other sheets.
Fully restart after editing images/settings because loaded sprites are cached.

MEMORY
A 4096x4096 RGBA frame alone uses roughly 64 MiB before engine overhead.
Many simultaneously visible frames can therefore require hundreds of MiB of GPU memory.
This build defers loading individual frames until they are used.

DIAGNOSTICS
Press F8 to show/hide sprite size, horizontal/vertical scale, and physical origin.
For Joseph's current 320x440 sheet, expect scale 2x2 and origin 160,168.
For a 4096x4096 frame, expect scale about 25.6x18.618 and origin about 2048,1564.
If alignment is wrong, send a screenshot with F8 diagnostics visible.

VALIDATION
Compiled and reloaded the archive using UndertaleModTool.
Verified 3840x2160 output and preserved embedded texture/audio data.
Re-decompiled the output to verify loading, frame counts, texture selection and drawing hooks.
Executed the actual JavaScript-compatible GML helper functions with mocked GameMaker APIs:
2x/1x drawing, Windows paths, metadata, 3840x2160 and 4096x4096 frames,
lazy loading, frame caching, index wrap, inconsistent-canvas rejection, crop coordinates.
Run these checks with: node modding/test-custom-resolution.cjs
Mocked checks are not GameMaker runtime or GPU tests. Windows gameplay and actual
4K-frame loading/alignment still require verification with your assets and hardware.

REPRODUCE
Start from the earlier 3x-only archive.
Apply custom-resolution.csx, then 4k-edition.csx, then 4k-sprite-support.csx with
UndertaleModTool CLI. Keep the current custom-resolution-helpers.gml alongside scripts.
Do not apply any script twice.

Patched data.win SHA256: ea1a9e1691517657da692354bad6c4bcf301aa228568db2fe71316e6de2eb86b
