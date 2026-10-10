Reverse-cowgirl frame-count fix — 4K sprite edition v4

The old loader chose five or seven animation frames using the total PNG width.
A doubled five-frame strip crossed that width threshold and was wrongly split into
seven frames. This build uses logical dimensions and supports an explicit count.

INSTALL
1. Close the game and back up data.win and Joseph's custom_data.futa.
2. Replace data.win beside wifes_bedroom.exe with the file in this ZIP.
3. Replace custom_data.futa in your existing joseph - lover folder with the included
   file. Keep your upscaled PNGs and any separate-frame folders unchanged.
4. Fully restart and test the reverse-cowgirl pose.
Press F8 to confirm "4K sprite edition v4" is loaded.

If you customized other data-file settings, preserve them and merge these entries
under [resolution] instead of replacing your complete configuration:
  reverse_cowgirl_logical_width="160.000000"
  reverse_cowgirl_logical_height="168.000000"
  reverse_cowgirl_frames="5.000000"
Joseph's uploaded strip has five frames. Use 7 only for an actual seven-frame variant.
Separate-frame folders retain their actual consecutive frame count.

VALIDATION
Compiled and reloaded the patched archive. Existing 4K window/viewport and embedded
texture/audio data were checked. Re-decompiled the corrected loader call.
Tests cover five/seven-frame strips at 1x, 2x, 4x, 24x and 25.6x and explicit overrides.
Windows display testing with your failing upscaled file remains outstanding because
that edited file has not been uploaded. The width-based frame-count bug is confirmed;
additional issues in your local artwork are not yet ruled out.

REPRODUCE
Apply modding/fix-cowgirl-frames.csx to the previous 4K-sprite v3 archive with
UndertaleModTool CLI; keep custom-resolution-helpers.gml beside the script.
For a complete rebuild follow the earlier three-script sequence, then apply this script.
Run helper checks with: node modding/test-custom-resolution.cjs

Patched data.win SHA256: 6243827eb1d7b9788da9c541669b3d45430cc51ea25770d74acb41bdef144d46
