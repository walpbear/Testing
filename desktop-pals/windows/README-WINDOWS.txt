DESKFUR — WINDOWS QUICK START

1. Extract the entire ZIP to a folder you want to keep.
2. Double-click Start-DeskFur.cmd inside that folder.
3. First launch downloads the official Electron 44.9.0 runtime (about 151 MiB),
   verifies its pinned SHA-256, then opens DeskFur. Allow several minutes.

Requires 64-bit Windows 10 or newer and an internet connection for first setup.
No administrator rights, developer tools, Node.js, or game editor are needed.
Keep Start-DeskFur.cmd, start.ps1, and app.asar together. Do not open the launcher
from inside the ZIP viewer; extract the ZIP first.

The runtime is saved under %LOCALAPPDATA%\DeskFur\runtime-44.9.0. Later launches
use that local copy without downloading it. Every launch refreshes app.asar from
your extracted folder, so close DeskFur before launching an updated download.
Electron's LICENSE and Chromium notices remain in the installed runtime.

CUSTOM SPRITES
Use Import Sprite in the app. A transparent PNG works immediately. For animation
choose a character.json pack; keep its PNG in the same folder. The sprites folder
contains an original Mochi example and EDITING-GUIDE.txt. You can use Notepad and
your usual image editor to make your own pets.

PLAYING WITH A FRIEND
Offline pets work without a server. To share a room across different computers,
both people need the same reachable DeskFur relay server address and room code.
This download does not include an always-online public server. One person must
host the included project relay on an internet-accessible service or reachable
machine, then share its HTTPS/WSS address. localhost works only on your own PC.
See the project's multiplayer hosting guide for setup details.

IF THE APP DOES NOT OPEN
Read the launcher window: it stays open when setup fails. Make sure app.asar is
beside start.ps1 and that your internet connection can reach GitHub releases.
A failed checksum is never bypassed; run the launcher again for a fresh download.
If application files are in use, close DeskFur and try again.
Detailed launcher errors are saved to %LOCALAPPDATA%\DeskFur\launcher-error.log.

To move this download, move the complete extracted folder. To remove the runtime,
close DeskFur and remove %LOCALAPPDATA%\DeskFur\runtime-44.9.0. User preferences
are managed separately by the app; removing the runtime is not a settings reset.
