/*
 * Wife's Bedroom desktop overlay launcher. This is a separate Win32 helper,
 * not part of DeskFur. Requires the accompanying data.win rendering patch.
 *
 * Contract with the game patch:
 *   --desktop-overlay requests character-only rendering after the Begin screen.
 *   F9 switches between character-only rendering and the regular game.
 *   Character-only rendering clears to RGB(1,2,3), and the window caption
 *   ends with " [Desktop Overlay]" only while that mode is active.
 *   A patched game otherwise ends its caption with " [Desktop Ready]".
 *   Before Begin, " [Desktop Waiting]" means automatic overlay is queued;
 *   F9 on that screen cancels or queues the automatic transition.
 *
 * Build (MinGW-w64):
 *   x86_64-w64-mingw32-gcc -std=c11 -O2 -Wall -Wextra -Werror -municode \
 *     -mwindows -o Start-Desktop-Overlay.exe desktop-overlay.c -luser32 -lshell32
 */
#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#define WIN32_LEAN_AND_MEAN
#define _WIN32_WINNT 0x0601
#include <windows.h>
#include <shellapi.h>
#include <wchar.h>
#include <stdlib.h>
#include <math.h>

#define APP_TITLE L"Wife's Bedroom Desktop Overlay"
#define OVERLAY_SUFFIX L" [Desktop Overlay]"
#define READY_SUFFIX L" [Desktop Ready]"
#define WAITING_SUFFIX L" [Desktop Waiting]"
#define TIMER_ID 1
#define TRAY_ID 1
#define WM_TRAY (WM_APP + 1)
#define HOTKEY_TOGGLE 1
#define HOTKEY_EXIT 2
#define MENU_SHOW 100
#define MENU_TOGGLE 101
#define MENU_FIT 102
#define MENU_HELP 103
#define MENU_EXIT 104
#define MENU_CLOSE_GAME 105
#define PATH_CAPACITY 32768

typedef enum {
    GAME_UNKNOWN,
    GAME_READY,
    GAME_WAITING,
    GAME_OVERLAY
} GameState;

static HWND g_helper;
static HWND g_game;
static HANDLE g_process;
static DWORD g_pid;
static HANDLE g_mutex;
static UINT g_taskbarCreated;
static NOTIFYICONDATAW g_tray;
static BOOL g_trayAdded;
static BOOL g_saved;
static BOOL g_applied;
static BOOL g_mode;
static GameState g_state;
static BOOL g_seenPatch;
static BOOL g_inTick;
static BOOL g_missingPatchShown;
static BOOL g_exiting;
static BOOL g_exitToggleSent;
static BOOL g_closeGame;
static BOOL g_keyHeld;
static BOOL g_keyReleaseWarned;
static BOOL g_togglePending;
static GameState g_previousState;
static BOOL g_hotkeyAvailable;
static LONG_PTR g_originalStyle;
static LONG_PTR g_originalExStyle;
static COLORREF g_originalColorKey;
static BYTE g_originalAlpha;
static DWORD g_originalLayerFlags;
static BOOL g_originalLayerAttributes;
static WINDOWPLACEMENT g_originalPlacement;
static double g_aspect = 880.0 / 512.0;
static ULONGLONG g_started;
static ULONGLONG g_windowFound;
static ULONGLONG g_keyDownAt;
static ULONGLONG g_toggleAt;
static ULONGLONG g_exitAt;

static BOOL keyUp(void);

static int showMessage(HWND owner, const wchar_t *message, const wchar_t *title, UINT flags) {
    /* Never intentionally leave the synthetic key held during a modal dialog. */
    keyUp();
    return MessageBoxW(owner, message, title, flags);
}

static void showError(const wchar_t *message, DWORD error) {
    wchar_t systemMessage[1024] = L"";
    wchar_t fullMessage[4096];
    if (error) {
        FormatMessageW(FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
                       NULL, error, 0, systemMessage, 1024, NULL);
        swprintf(fullMessage, 4096, L"%ls\n\nWindows error %lu: %ls",
                 message, (unsigned long)error, systemMessage);
    } else {
        swprintf(fullMessage, 4096, L"%ls", message);
    }
    showMessage(g_helper, fullMessage, APP_TITLE, MB_OK | MB_ICONERROR);
}

static BOOL setStyle(HWND window, int index, LONG_PTR value) {
    SetLastError(ERROR_SUCCESS);
    LONG_PTR previous = SetWindowLongPtrW(window, index, value);
    return previous != 0 || GetLastError() == ERROR_SUCCESS;
}

static BOOL keyUp(void) {
    if (!g_keyHeld) return TRUE;
    INPUT input = {0};
    input.type = INPUT_KEYBOARD;
    input.ki.wVk = VK_F9;
    input.ki.dwFlags = KEYEVENTF_KEYUP;
    if (SendInput(1, &input, sizeof(input)) != 1) return FALSE;
    g_keyHeld = FALSE;
    return TRUE;
}

static void forgetWindowSnapshot(void) {
    g_saved = FALSE;
    g_applied = FALSE;
    g_originalStyle = 0;
    g_originalExStyle = 0;
    g_originalColorKey = 0;
    g_originalAlpha = 0;
    g_originalLayerFlags = 0;
    g_originalLayerAttributes = FALSE;
    ZeroMemory(&g_originalPlacement, sizeof(g_originalPlacement));
    g_aspect = 880.0 / 512.0;
}

static void restoreWindow(void) {
    if (!g_saved || !IsWindow(g_game)) {
        forgetWindowSnapshot();
        return;
    }
    BOOL restored = setStyle(g_game, GWL_STYLE, g_originalStyle);
    /* Reset the layered state before restoring attributes, including any
       alpha setting the runner had already applied before this helper. */
    if (g_originalExStyle & WS_EX_LAYERED) {
        if (!setStyle(g_game, GWL_EXSTYLE, g_originalExStyle & ~(LONG_PTR)WS_EX_LAYERED)) restored = FALSE;
    }
    if (!setStyle(g_game, GWL_EXSTYLE, g_originalExStyle)) restored = FALSE;
    if (g_originalLayerAttributes) {
        if (!SetLayeredWindowAttributes(g_game, g_originalColorKey,
                                        g_originalAlpha, g_originalLayerFlags)) restored = FALSE;
    }
    if (!SetWindowPos(g_game,
                 (g_originalExStyle & WS_EX_TOPMOST) ? HWND_TOPMOST : HWND_NOTOPMOST,
                 0, 0, 0, 0,
                 SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED)) restored = FALSE;
    if (!SetWindowPlacement(g_game, &g_originalPlacement)) restored = FALSE;
    RedrawWindow(g_game, NULL, NULL, RDW_INVALIDATE | RDW_FRAME | RDW_ALLCHILDREN);
    /* Capture the next normal window position/aspect afresh. Keep the snapshot
       after a failed restore so another tick or final cleanup can retry it. */
    if (restored || !IsWindow(g_game)) forgetWindowSnapshot();
    else g_applied = TRUE;
}

static BOOL fitToDesktop(void) {
    RECT work;
    if (!SystemParametersInfoW(SPI_GETWORKAREA, 0, &work, 0)) return FALSE;
    int availableWidth = (work.right - work.left) * 9 / 10;
    int availableHeight = (work.bottom - work.top) * 9 / 10;
    int width = availableWidth;
    int height = (int)(width / g_aspect + 0.5);
    if (height > availableHeight) {
        height = availableHeight;
        width = (int)(height * g_aspect + 0.5);
    }
    if (width < 1 || height < 1) return FALSE;
    int left = work.left + ((work.right - work.left) - width) / 2;
    int top = work.bottom - height;
    return SetWindowPos(g_game, HWND_TOPMOST, left, top, width, height,
                        SWP_NOACTIVATE | SWP_FRAMECHANGED);
}

static BOOL applyOverlay(void) {
    if (!IsWindow(g_game)) return FALSE;
    if (!g_saved) {
        ULONG_PTR classStyle = GetClassLongPtrW(g_game, GCL_STYLE);
        if (classStyle & (CS_OWNDC | CS_CLASSDC)) {
            showError(L"This game window uses a rendering style that Windows cannot make "
                      L"transparent safely. The game will return to its regular view.", 0);
            return FALSE;
        }
        g_originalStyle = GetWindowLongPtrW(g_game, GWL_STYLE);
        g_originalExStyle = GetWindowLongPtrW(g_game, GWL_EXSTYLE);
        g_originalLayerAttributes = FALSE;
        if (g_originalExStyle & WS_EX_LAYERED) {
            if (!GetLayeredWindowAttributes(g_game, &g_originalColorKey,
                                            &g_originalAlpha, &g_originalLayerFlags)) {
                showError(L"The game's existing transparency settings could not be saved. "
                          L"The helper will leave those settings unchanged and return to the regular game.",
                          GetLastError());
                return FALSE;
            }
            g_originalLayerAttributes = TRUE;
        }
        ZeroMemory(&g_originalPlacement, sizeof(g_originalPlacement));
        g_originalPlacement.length = sizeof(g_originalPlacement);
        if (!GetWindowPlacement(g_game, &g_originalPlacement)) {
            showError(L"The original game window position could not be saved. "
                      L"The helper will leave the window unchanged.", GetLastError());
            return FALSE;
        }
        RECT client;
        if (GetClientRect(g_game, &client) && client.right > 0 && client.bottom > 0) {
            double aspect = (double)client.right / client.bottom;
            if (aspect >= 0.25 && aspect <= 4.0) g_aspect = aspect;
        }
        g_saved = TRUE;
    }
    LONG_PTR style = g_originalStyle &
        ~(LONG_PTR)(WS_CAPTION | WS_THICKFRAME | WS_BORDER | WS_DLGFRAME |
                    WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_MAXIMIZE | WS_MINIMIZE);
    LONG_PTR exStyle = (g_originalExStyle | WS_EX_LAYERED) &
        ~(LONG_PTR)(WS_EX_DLGMODALFRAME | WS_EX_WINDOWEDGE | WS_EX_CLIENTEDGE | WS_EX_STATICEDGE);
    if (!setStyle(g_game, GWL_STYLE, style) ||
        !setStyle(g_game, GWL_EXSTYLE, exStyle) ||
        !SetLayeredWindowAttributes(g_game, RGB(1, 2, 3), 255, LWA_COLORKEY) ||
        !fitToDesktop()) {
        DWORD error = GetLastError();
        restoreWindow();
        showError(L"Windows could not enable the transparent desktop overlay. "
                  L"The game will keep running in its normal window.", error);
        return FALSE;
    }
    g_applied = TRUE;
    return TRUE;
}

static BOOL gameHasCaptionSuffix(const wchar_t *suffix) {
    wchar_t caption[2048];
    int length = GetWindowTextW(g_game, caption, 2048);
    size_t suffixLength = wcslen(suffix);
    return length >= (int)suffixLength &&
           wcscmp(caption + length - suffixLength, suffix) == 0;
}

static GameState gameState(void) {
    if (gameHasCaptionSuffix(OVERLAY_SUFFIX)) return GAME_OVERLAY;
    if (gameHasCaptionSuffix(WAITING_SUFFIX)) return GAME_WAITING;
    if (gameHasCaptionSuffix(READY_SUFFIX)) return GAME_READY;
    return GAME_UNKNOWN;
}

static BOOL stateNeedsCancel(GameState state) {
    return state == GAME_OVERLAY || state == GAME_WAITING;
}

static void showGame(void) {
    if (!IsWindow(g_game)) return;
    if (IsIconic(g_game)) ShowWindow(g_game, SW_RESTORE);
    SetForegroundWindow(g_game);
}

static BOOL requestToggle(void) {
    if (!IsWindow(g_game) || g_togglePending) return FALSE;
    showGame();
    if (GetForegroundWindow() != g_game) {
        if (!g_exiting) {
            showMessage(g_helper,
                        L"Windows did not let the helper focus the game. "
                        L"Click the game, then press F9 to switch modes.",
                        APP_TITLE, MB_OK | MB_ICONINFORMATION);
        }
        return FALSE;
    }
    INPUT input = {0};
    input.type = INPUT_KEYBOARD;
    input.ki.wVk = VK_F9;
    GameState previousState = gameState();
    if (SendInput(1, &input, sizeof(input)) != 1) {
        if (!g_exiting) {
            showMessage(g_helper,
                        L"Windows blocked the mode key. Click the game and press F9. "
                        L"Run both the game and this helper normally, without Run as administrator.",
                        APP_TITLE, MB_OK | MB_ICONINFORMATION);
        }
        return FALSE;
    }
    g_keyHeld = TRUE;
    g_keyDownAt = GetTickCount64();
    g_toggleAt = g_keyDownAt;
    g_previousState = previousState;
    g_togglePending = TRUE;
    return TRUE;
}

static BOOL CALLBACK findGameWindow(HWND window, LPARAM parameter) {
    DWORD processId;
    GetWindowThreadProcessId(window, &processId);
    if (processId != g_pid || !IsWindowVisible(window) || GetWindow(window, GW_OWNER)) return TRUE;
    wchar_t className[128];
    if (!GetClassNameW(window, className, ARRAYSIZE(className)) ||
        wcscmp(className, L"YYGameMakerYY") != 0) return TRUE;
    RECT client;
    if (!GetClientRect(window, &client) || client.right < 160 || client.bottom < 100) return TRUE;
    *(HWND *)parameter = window;
    return FALSE;
}

static void updateTray(void) {
    if (!g_trayAdded) return;
    swprintf(g_tray.szTip, ARRAYSIZE(g_tray.szTip), L"Wife's Bedroom — %ls",
             g_state == GAME_OVERLAY ? L"desktop overlay" :
             g_state == GAME_WAITING ? L"waiting for Begin" : L"regular game");
    g_tray.uFlags = NIF_TIP;
    Shell_NotifyIconW(NIM_MODIFY, &g_tray);
}

static void addTray(void) {
    ZeroMemory(&g_tray, sizeof(g_tray));
    g_tray.cbSize = sizeof(g_tray);
    g_tray.hWnd = g_helper;
    g_tray.uID = TRAY_ID;
    g_tray.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP;
    g_tray.uCallbackMessage = WM_TRAY;
    g_tray.hIcon = LoadIconW(NULL, IDI_APPLICATION);
    wcscpy(g_tray.szTip, APP_TITLE);
    g_trayAdded = Shell_NotifyIconW(NIM_ADD, &g_tray);
    if (g_trayAdded) updateTray();
}

static void showHelp(void) {
    showMessage(g_helper,
                L"F9 in the game: show the regular game or return to the character-only overlay.\n"
                L"F10: focus the game and switch modes.\n"
                L"Ctrl+Alt+F10: restore the normal frame and stop this helper.\n\n"
                L"Start the game through its normal Begin screen first. "
                L"F9 before Begin cancels or queues automatic desktop view. "
                L"Use the regular game view to access its menus and change poses. "
                L"The character remains clickable in desktop mode; transparent areas let clicks through.\n\n"
                L"Right-click this tray icon for controls. Exit helper keeps the game running. "
                L"Close game and helper asks the game to close normally.",
                APP_TITLE, MB_OK | MB_ICONINFORMATION);
}

static void showMenu(void) {
    HMENU menu = CreatePopupMenu();
    if (!menu) return;
    AppendMenuW(menu, MF_STRING, MENU_SHOW, L"Show game");
    AppendMenuW(menu, MF_STRING | (g_togglePending ? MF_GRAYED : 0), MENU_TOGGLE,
                g_state == GAME_OVERLAY ? L"Show regular game\tF10" :
                g_state == GAME_WAITING ? L"Cancel automatic desktop view\tF10" :
                L"Show character on desktop\tF10");
    AppendMenuW(menu, MF_STRING | (g_mode ? 0 : MF_GRAYED), MENU_FIT, L"Fit overlay to desktop");
    AppendMenuW(menu, MF_SEPARATOR, 0, NULL);
    AppendMenuW(menu, MF_STRING, MENU_HELP, L"Help");
    AppendMenuW(menu, MF_STRING, MENU_EXIT, L"Exit helper (keep game open)");
    AppendMenuW(menu, MF_STRING, MENU_CLOSE_GAME, L"Close game and helper");
    POINT cursor;
    GetCursorPos(&cursor);
    SetForegroundWindow(g_helper);
    TrackPopupMenu(menu, TPM_RIGHTBUTTON, cursor.x, cursor.y, 0, g_helper, NULL);
    PostMessageW(g_helper, WM_NULL, 0, 0);
    DestroyMenu(menu);
}

static void finishExit(void) {
    BOOL released = keyUp();
    restoreWindow();
    if (!released && !g_keyReleaseWarned) {
        g_keyReleaseWarned = TRUE;
        showMessage(g_helper,
                    L"Windows blocked the release of the mode key. Press and release F9 manually "
                    L"to clear it. The helper will still stop; the game will remain open.",
                    APP_TITLE, MB_OK | MB_ICONINFORMATION);
    }
    if (g_closeGame && IsWindow(g_game)) PostMessageW(g_game, WM_CLOSE, 0, 0);
    DestroyWindow(g_helper);
}

static void requestExit(BOOL closeGame) {
    if (g_exiting) return;
    g_exiting = TRUE;
    g_closeGame = closeGame;
    g_exitAt = GetTickCount64();
    /* A preceding F10 may still be turning the mode on. Let that key finish
       before requesting the final transition back to the ordinary game. */
    if (g_togglePending || g_keyHeld) return;
    /* During startup the game can still be queuing --desktop-overlay. Wait
       for its patched caption before deciding there is nothing to cancel. */
    if (!IsWindow(g_game) || gameState() == GAME_UNKNOWN) return;
    if (stateNeedsCancel(gameState())) {
        g_exitToggleSent = TRUE;
        requestToggle();
    } else {
        finishExit();
    }
}

static void tick(void) {
    ULONGLONG now = GetTickCount64();
    if (g_keyHeld && now - g_keyDownAt >= 80) keyUp();
    if (g_process && WaitForSingleObject(g_process, 0) == WAIT_OBJECT_0) {
        finishExit();
        return;
    }
    if (!IsWindow(g_game)) {
        if (g_game) {
            g_game = NULL;
            forgetWindowSnapshot();
        }
        EnumWindows(findGameWindow, (LPARAM)&g_game);
        if (!g_game) {
            if (now - g_started >= 45000) {
                showError(L"The game started, but its window was not found after 45 seconds. "
                          L"The helper will stop. The game process has not been closed. "
                          L"If its window appears later, press F9 before Begin to cancel automatic desktop view.", 0);
                finishExit();
            }
            return;
        }
        g_windowFound = now;
    }
    GameState state = gameState();
    BOOL mode = state == GAME_OVERLAY;
    if (g_togglePending) {
        BOOL acknowledged = state != GAME_UNKNOWN && state != g_previousState;
        if (stateNeedsCancel(g_previousState)) acknowledged = state == GAME_READY;
        if (acknowledged) g_togglePending = FALSE;
    }
    if (g_togglePending && now - g_toggleAt >= 2000) {
        g_togglePending = FALSE;
        if (!g_exiting) {
            showMessage(g_helper,
                        L"The game did not confirm a mode change. Start through its Begin screen "
                        L"first, then click its window and press F9. "
                        L"Make sure the desktop-overlay data.win patch is installed.",
                        APP_TITLE, MB_OK | MB_ICONINFORMATION);
        }
    }
    if (state != GAME_UNKNOWN) g_seenPatch = TRUE;
    if (state != g_state) {
        g_state = state;
        g_mode = mode;
        updateTray();
    }
    if (g_exiting) {
        if (state == GAME_UNKNOWN) {
            if (now - g_started >= 45000) {
                restoreWindow();
                showMessage(g_helper,
                            L"The game did not confirm its desktop mode within 45 seconds. "
                            L"The helper will stop. If automatic desktop view is still queued, "
                            L"press F9 before Begin to cancel it. If already playing, press F9 "
                            L"to restore the regular scene.",
                            APP_TITLE, MB_OK | MB_ICONINFORMATION);
                finishExit();
            }
            return;
        }
        if (g_togglePending || g_keyHeld) {
            if (now - g_exitAt >= 4000) finishExit();
            return;
        }
        if (stateNeedsCancel(state) && !g_exitToggleSent) {
            g_exitToggleSent = TRUE;
            g_exitAt = now;
            requestToggle();
            return;
        }
        if (!stateNeedsCancel(state) || now - g_exitAt >= 2000) {
            if (stateNeedsCancel(state) && !g_closeGame) {
                restoreWindow();
                showMessage(g_helper,
                            L"The window frame has been restored. The game did not confirm leaving "
                            L"or cancelling desktop mode; press F9 in the game to restore its scene "
                            L"or cancel automatic desktop view before Begin.",
                            APP_TITLE, MB_OK | MB_ICONINFORMATION);
            }
            finishExit();
        }
        return;
    }
    if (now - g_windowFound < 500) return;
    if (mode && !g_applied) {
        if (!applyOverlay()) requestExit(FALSE);
    } else if (!mode && g_applied) {
        restoreWindow();
    }
    if (!g_seenPatch && !g_missingPatchShown && now - g_windowFound >= 7000) {
        g_missingPatchShown = TRUE;
        showMessage(g_helper,
                    L"The game has not enabled desktop-overlay rendering. Make sure the patched "
                    L"data.win from the same download is beside wifes_bedroom.exe, then close and "
                    L"restart the game with Start-Desktop-Overlay.exe.\n\n"
                    L"A normal, unpatched game cannot hide its room with this helper alone.",
                    APP_TITLE, MB_OK | MB_ICONINFORMATION);
    }
}

static LRESULT CALLBACK windowProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
    if (g_taskbarCreated && message == g_taskbarCreated) {
        addTray();
        return 0;
    }
    switch (message) {
        case WM_TIMER:
            if (wParam == TIMER_ID && !g_inTick) {
                g_inTick = TRUE;
                tick();
                g_inTick = FALSE;
            }
            return 0;
        case WM_HOTKEY:
            if (wParam == HOTKEY_TOGGLE && !g_exiting) requestToggle();
            if (wParam == HOTKEY_EXIT) requestExit(FALSE);
            return 0;
        case WM_TRAY:
            if (lParam == WM_RBUTTONUP || lParam == WM_CONTEXTMENU) showMenu();
            if (lParam == WM_LBUTTONUP || lParam == WM_LBUTTONDBLCLK) showGame();
            return 0;
        case WM_COMMAND:
            switch (LOWORD(wParam)) {
                case MENU_SHOW: showGame(); break;
                case MENU_TOGGLE: if (!g_exiting) requestToggle(); break;
                case MENU_FIT: if (g_applied) fitToDesktop(); break;
                case MENU_HELP: showHelp(); break;
                case MENU_EXIT: requestExit(FALSE); break;
                case MENU_CLOSE_GAME: requestExit(TRUE); break;
            }
            return 0;
        case WM_CLOSE:
            requestExit(FALSE);
            return 0;
        case WM_QUERYENDSESSION:
            keyUp();
            restoreWindow();
            return TRUE;
        case WM_DESTROY:
            KillTimer(window, TIMER_ID);
            UnregisterHotKey(window, HOTKEY_TOGGLE);
            UnregisterHotKey(window, HOTKEY_EXIT);
            if (g_trayAdded) Shell_NotifyIconW(NIM_DELETE, &g_tray);
            PostQuitMessage(0);
            return 0;
    }
    return DefWindowProcW(window, message, wParam, lParam);
}

static BOOL fileExists(const wchar_t *file) {
    DWORD attributes = GetFileAttributesW(file);
    return attributes != INVALID_FILE_ATTRIBUTES && !(attributes & FILE_ATTRIBUTE_DIRECTORY);
}

static BOOL parentDirectory(wchar_t *path) {
    wchar_t *separator = wcsrchr(path, L'\\');
    if (!separator || separator == path) return FALSE;
    if (separator == path + 2 && path[1] == L':') {
        if (separator[1] == L'\0') return FALSE;
        separator[1] = L'\0';
        return TRUE;
    }
    *separator = L'\0';
    return TRUE;
}

static BOOL locateGame(wchar_t *game, wchar_t *directory) {
    int count;
    wchar_t **arguments = CommandLineToArgvW(GetCommandLineW(), &count);
    if (arguments && count > 1) {
        DWORD length = GetFullPathNameW(arguments[1], PATH_CAPACITY, game, NULL);
        LocalFree(arguments);
        if (length == 0 || length >= PATH_CAPACITY || !fileExists(game)) return FALSE;
        wcscpy(directory, game);
        return parentDirectory(directory);
    }
    if (arguments) LocalFree(arguments);
    DWORD length = GetModuleFileNameW(NULL, directory, PATH_CAPACITY);
    if (length == 0 || length >= PATH_CAPACITY || !parentDirectory(directory)) return FALSE;
    for (int level = 0; level < 3; ++level) {
        if (wcslen(directory) + wcslen(L"\\wifes_bedroom.exe") + 1 >= PATH_CAPACITY) return FALSE;
        swprintf(game, PATH_CAPACITY, L"%ls\\wifes_bedroom.exe", directory);
        if (fileExists(game)) return TRUE;
        if (!parentDirectory(directory)) break;
    }
    return FALSE;
}

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE previous, PWSTR commandLine, int showCommand) {
    (void)previous;
    (void)commandLine;
    (void)showCommand;
    HMODULE user32 = GetModuleHandleW(L"user32.dll");
    typedef BOOL (WINAPI *SetDpiContext)(HANDLE);
    SetDpiContext setDpi = (SetDpiContext)(void *)GetProcAddress(user32, "SetProcessDpiAwarenessContext");
    if (setDpi) setDpi((HANDLE)(INT_PTR)-4); /* Per-monitor DPI aware v2. */
    else SetProcessDPIAware();

    g_mutex = CreateMutexW(NULL, FALSE, L"Local\\WifesBedroomDesktopOverlayHelper");
    if (g_mutex && GetLastError() == ERROR_ALREADY_EXISTS) {
        showMessage(NULL, L"The desktop-overlay helper is already running. "
                    L"Use its icon in the Windows notification area.",
                    APP_TITLE, MB_OK | MB_ICONINFORMATION);
        CloseHandle(g_mutex);
        return 0;
    }
    wchar_t *game = calloc(PATH_CAPACITY, sizeof(wchar_t));
    wchar_t *directory = calloc(PATH_CAPACITY, sizeof(wchar_t));
    wchar_t *launch = calloc(PATH_CAPACITY + 64, sizeof(wchar_t));
    if (!game || !directory || !launch) {
        showError(L"There was not enough memory to start the helper.", ERROR_NOT_ENOUGH_MEMORY);
        free(game); free(directory); free(launch);
        if (g_mutex) CloseHandle(g_mutex);
        return 1;
    }
    if (!locateGame(game, directory)) {
        showError(L"Place Start-Desktop-Overlay.exe in the same folder as wifes_bedroom.exe "
                  L"and the patched data.win, then open it again.\n\n"
                  L"You can also drag wifes_bedroom.exe onto this helper.", 0);
        free(game); free(directory); free(launch);
        if (g_mutex) CloseHandle(g_mutex);
        return 1;
    }
    wchar_t *data = calloc(PATH_CAPACITY, sizeof(wchar_t));
    if (!data || wcslen(directory) + 10 >= PATH_CAPACITY) {
        showError(L"The game folder path could not be read.", ERROR_NOT_ENOUGH_MEMORY);
        free(data); free(game); free(directory); free(launch);
        if (g_mutex) CloseHandle(g_mutex);
        return 1;
    }
    swprintf(data, PATH_CAPACITY, L"%ls\\data.win", directory);
    if (!fileExists(data)) {
        showError(L"data.win is missing from the game folder. Extract the game files, "
                  L"then copy in the desktop-overlay patch before starting this helper.", 0);
        free(data); free(game); free(directory); free(launch);
        if (g_mutex) CloseHandle(g_mutex);
        return 1;
    }
    free(data);
    swprintf(launch, PATH_CAPACITY + 64, L"\"%ls\" --desktop-overlay", game);
    STARTUPINFOW startup = {0};
    PROCESS_INFORMATION process = {0};
    startup.cb = sizeof(startup);
    startup.dwFlags = STARTF_USESHOWWINDOW;
    startup.wShowWindow = SW_SHOWNORMAL;
    BOOL launched = CreateProcessW(game, launch, NULL, NULL, FALSE, 0, NULL, directory, &startup, &process);
    DWORD launchError = GetLastError();
    free(game); free(directory); free(launch);
    if (!launched) {
        showError(L"The game could not be started.", launchError);
        if (g_mutex) CloseHandle(g_mutex);
        return 1;
    }
    g_process = process.hProcess;
    g_pid = process.dwProcessId;
    CloseHandle(process.hThread);
    WNDCLASSW windowClass = {0};
    windowClass.hInstance = instance;
    windowClass.lpfnWndProc = windowProc;
    windowClass.lpszClassName = L"WifesBedroomDesktopOverlayHelperWindow";
    if (!RegisterClassW(&windowClass)) {
        showError(L"The overlay controls could not be created. The game is still running.", GetLastError());
        CloseHandle(g_process);
        if (g_mutex) CloseHandle(g_mutex);
        return 1;
    }
    g_helper = CreateWindowExW(WS_EX_TOOLWINDOW, windowClass.lpszClassName, APP_TITLE,
                               WS_POPUP, 0, 0, 0, 0, NULL, NULL, instance, NULL);
    if (!g_helper) {
        showError(L"The overlay controls could not be created. The game is still running.", GetLastError());
        CloseHandle(g_process);
        if (g_mutex) CloseHandle(g_mutex);
        return 1;
    }
    g_taskbarCreated = RegisterWindowMessageW(L"TaskbarCreated");
    addTray();
    g_hotkeyAvailable = RegisterHotKey(g_helper, HOTKEY_TOGGLE, MOD_NOREPEAT, VK_F10);
    BOOL emergencyAvailable = RegisterHotKey(g_helper, HOTKEY_EXIT, MOD_NOREPEAT | MOD_CONTROL | MOD_ALT, VK_F10);
    if (!g_trayAdded && !emergencyAvailable) {
        showError(L"Windows could not create the tray controls or register the recovery shortcut. "
                  L"The helper will stop and leave the game running. Close other overlay helpers and try again.", 0);
        finishExit();
    } else {
        if (!g_hotkeyAvailable) {
            showMessage(g_helper, L"F10 is already used by another application. "
                        L"Press F9 while the game is focused, or use this helper's tray menu.",
                        APP_TITLE, MB_OK | MB_ICONINFORMATION);
        }
        g_started = GetTickCount64();
        if (!SetTimer(g_helper, TIMER_ID, 40, NULL)) {
            showError(L"The overlay timer could not be started. The helper will stop. "
                      L"Press F9 in the game to cancel automatic desktop view before Begin.",
                      GetLastError());
            finishExit();
        }
    }
    MSG message;
    int result;
    while ((result = GetMessageW(&message, NULL, 0, 0)) > 0) {
        TranslateMessage(&message);
        DispatchMessageW(&message);
    }
    keyUp();
    restoreWindow();
    CloseHandle(g_process);
    if (g_mutex) CloseHandle(g_mutex);
    return result == -1 ? 1 : 0;
}
