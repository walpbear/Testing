WIFE'S BEDROOM — DESKTOP OVERLAY (WINDOWS TEST BUILD)

This runs the original Wife's Bedroom game from this repository. It does not
use DeskFur. The included game patch hides the room and menus while keeping
the character and the original game running.

SETUP

1. Close Wife's Bedroom. Back up your existing data.win somewhere safe.
2. Put the supplied patched data.win and Start-Desktop-Overlay.exe beside
   wifes_bedroom.exe. Replace data.win when Windows asks.
3. Open Start-Desktop-Overlay.exe and start the game normally through its Begin
   screen. The desktop view appears after the game starts. Keep your existing
   character, dialogue, language, and other game files in their usual folders.

CONTROLS

F9 in the game: switch between the normal game and character-only desktop view.
F10: focus the game and switch views from another app.
Escape in desktop view: restore the normal game view.
Ctrl+Alt+F10: restore the window frame and stop the overlay helper.

Before Begin, F9/F10 cancels or queues the automatic desktop view instead.

Use the normal game view to change poses, open menus, and use the original UI.
Switch back to desktop view with F9 or F10. The character is interactive;
transparent parts of the window let mouse clicks reach your desktop.

Desktop view uses the original artwork colors. The game's palette filter is
bypassed so it cannot recolor the transparent area. Your selected palette
returns in normal game view. The small portrait and its controls are hidden.
Existing 4K sprite loading and pose fixes from this repository are retained.

Right-click the helper's Windows notification-area icon for Show game, Switch
view, Fit overlay to desktop, Help, and exit options. Windows may place this
icon under the small up-arrow beside the clock.

Exit helper keeps the game running and restores its original window style and
position. Close game and helper asks the game to close normally. The helper
never force-stops the game and saves no settings in the Windows registry.

CUSTOM GAME LOCATION

The helper looks for wifes_bedroom.exe beside itself and in the two parent
folders. You can also drag wifes_bedroom.exe onto the helper to choose it.
Its data.win must be in the same folder as the game's EXE.

TROUBLESHOOTING

If you still see the room, use the patched data.win from the same download.
The helper alone cannot remove the background from an unpatched game.

If the cleared area stays dark or the character disappears, press F9 or use
the tray's Exit helper option, then report what happened. Direct3D transparency
has not yet been tested on Windows; this download is a test build.

If F10 is unavailable, another app may use that shortcut. Use F9 while the
game is focused, or the helper's tray menu. Run both normally; do not start
one as administrator and the other normally.

If Windows reports that it blocked releasing the mode key, press and release
F9 manually. The helper retries release and still allows you to exit.

To undo the patch: close the game, stop the helper, then put your backed-up
data.win back. Open wifes_bedroom.exe normally.

SOURCE / BUILD

desktop-overlay.c is the complete Win32 helper source. Build with MinGW-w64:

x86_64-w64-mingw32-gcc -std=c11 -O2 -Wall -Wextra -Werror -municode -mwindows -o Start-Desktop-Overlay.exe desktop-overlay.c -luser32 -lshell32

The helper tracks only the game process it launches. It makes the patch's
RGB(1,2,3) cleared pixels transparent using Windows color-key transparency.
It preserves the game's aspect ratio when fitting to the primary work area.

The EXE compiles with warnings treated as errors. Live transparency still needs
checking on Windows. Color-key transparency uses a solid pixel mask; artwork
with soft edges may show a thin outline.

PATCH / VALIDATION

The separate download does not replace the repository's normal data.win.
Back up the data.win in your installed game before copying this test version.
Opening wifes_bedroom.exe normally keeps the original game presentation.

Rebuild the patch with UndertaleModTool 0.9.2 commit
f43e12c445c37d50dc6244caa12ccab232983f3f (CLI, .NET SDK 10.0.100):

UndertaleModCli load data.win -s modding/desktop-overlay/desktop-overlay.csx -o overlay-data.win

Input data.win SHA256:
6243827eb1d7b9788da9c541669b3d45430cc51ea25770d74acb41bdef144d46
The patch refuses repeated application and missing/ambiguous code anchors.

Run control-protocol checks: node modding/desktop-overlay/test-overlay.cjs
See VALIDATION.txt for checks completed and remaining Windows checks.
