3x window + high-resolution custom-character patch

INSTALL
1. Close the game and back up data.win and your Joseph custom_data.futa.
2. Replace data.win beside wifes_bedroom.exe with the file from this ZIP.
3. Replace custom_data.futa inside your existing joseph - lover folder with the file from this ZIP.
   Keep your existing PNG files. Do not put custom_data.futa beside the executable.
4. Fully restart the game, select Joseph, and test the doubled-resolution pose, other poses, palettes, mouse clicks, and fullscreen.

ORIGINS AND RESOLUTION
The shared sprite origin is back to logical 80,84.
The loader detects integer resolution multiples from each animation frame width:
160 pixels for body sprites, 128 for portraits.
For Joseph's 2880x440 nine-frame sheet, each frame is 320x440: 2x resolution.
The loader sets its physical origin to 160,168 and drawing compensates by 1/2.
Other Joseph sheets remain at their existing resolution and use origin 80,84.
Use logical origin values in custom data files; do not double them for higher-resolution PNGs.
Uniformly scale the full horizontal strip, preserving frame counts and proportions.
PNG pixels are not resized or changed by this patch.
Changing files while the game is running requires a full restart because custom sprites are cached.
This fixes the uploaded doubled sheet; it is not a complete artwork remake.

VALIDATION
GameMaker code compiled and the written archive reloaded successfully.
The 2640x1536 window and viewport and 880x512 logical camera were verified.
Embedded texture/audio data is unchanged.
The actual helper functions were tested with mocked drawing APIs for 2x and 1x sprites,
including origins, logical dimensions and cropped rendering.
The compiled loader/drawing hooks were checked by re-decompiling the output.
This is not Windows runtime testing; final appearance, pose alignment and mouse checks remain necessary.

REPRODUCE
Apply modding/custom-resolution.csx to the earlier 3x-only data.win using UndertaleModTool CLI.
Keep custom-resolution-helpers.gml beside the script.
Do not apply this patch twice.
Patched data.win SHA256: 5a71f5dd1826d2136c507636c9412f87dd6c85515e38974996b8e9ad9ede6513
