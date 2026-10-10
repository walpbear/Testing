Wife's Bedroom — 3x resolution patch

Window and active viewport: 2640 x 1536 (original: 880 x 512).
The logical camera and room remain 880 x 512, preserving layout and mouse-coordinate mapping.
The palette GUI pass stretches the application surface to the GUI dimensions.
Existing artwork is preserved; this does not add detail to the source sprites.

INSTALL ON WINDOWS
1. Close the game.
2. Back up data.win from the folder containing wifes_bedroom.exe.
3. Extract the data.win in this ZIP into that folder, replacing the old file.
4. Launch wifes_bedroom.exe. Test menus, mouse clicks, palette changes, and fullscreen.
The 2640 x 1536 window can exceed your desktop size; use the game's fullscreen setting when necessary.
To undo the patch, restore your backed-up data.win.

VALIDATION
The patched archive was reloaded by UndertaleModTool without errors.
Window/viewport dimensions and unchanged logical camera/room dimensions were checked.
All 20 code entries were re-decompiled; only the palette GUI rendering event changed.
Texture and audio data were verified unchanged.
The Windows executable was not run in the Linux build environment; runtime display/input testing is outstanding.

REPRODUCE
Use UndertaleModTool 0.9.2 source commit f43e12c445c37d50dc6244caa12ccab232983f3f with its CLI:
UndertaleModCli load original-data.win -s resolution-3x.csx -o data.win
The script requires the original 880 x 512 archive and refuses to apply twice.
Do not apply the script to the already-patched archive.

Patched data.win SHA256: c7ca75bcbeb4a3b82f3d638ee1cab4546ebe3add957e90714a6a198e2c4aada7
