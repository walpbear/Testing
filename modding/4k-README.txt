Wife's Bedroom — 4K display edition v2

This is the existing game upgraded for 3840 x 2160 output, not a new artwork remake.
Gameplay coordinates stay 880 x 512. A wider camera preserves the original aspect
ratio at 4K, with narrow side margins. Original artwork remains at its native detail.
Joseph's uploaded 2x artwork is retained without resampling.

INSTALL
Extract this ZIP into a NEW folder and run wifes_bedroom.exe inside it.
The executable, data archive, original external data, and Joseph folder are included.
Keep your old game folder as a backup. This edition can use the game's existing saves.
The 4K window may exceed a smaller desktop; use the game's fullscreen setting.

JOSEPH
Select Joseph in the custom character menu and test the edited pose.
Shared origin values stay 80,84 in logical coordinates.
The custom_data.futa file declares [resolution] deepthroat="2.000000".
The loader applies physical origin 160,168 and compensates draw scale by 1/2.
Do not double the shared origin values. Fully restart after editing custom images.

DIAGNOSTICS
Press F8 to toggle the display diagnostic.
For Joseph's edited pose expect:
  4K edition v2 | sprite 320x440 | scale 2 | origin 160,168
If alignment is still wrong, send a screenshot with this diagnostic visible.
The overlay is hidden by default.

VALIDATION AND LIMITS
Compiled and reloaded with UndertaleModTool.
Verified window/viewport dimensions, aspect-preserving camera setup, and unchanged
embedded texture/audio data. Re-decompiled to check startup and diagnostic code.
Tested helper logic with mocked drawing/file APIs for Windows paths, uppercase names,
explicit metadata overrides, origins, crop rectangles and original-size sprites.
The Windows game was not executed here. Final appearance, controls and the previously
reported displacement still require Windows runtime verification.

REPRODUCE
Start with the earlier 3x-only archive and apply modding/custom-resolution.csx,
then apply modding/4k-edition.csx using UndertaleModTool CLI.
Keep custom-resolution-helpers.gml beside both scripts. Do not apply twice.

Patched data.win SHA256: 5d16f888bb7ea3ff16a483c027f8c4842bdab6d422cef9ab69a957bb0224b7e1
