; A per-user, offline installer. The payload is produced by electron-builder.
Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"

Name "DeskFur"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\DeskFur"
InstallDirRegKey HKCU "Software\DeskFur" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 64
SetDatablockOptimize on
AutoCloseWindow true
ShowInstDetails nevershow
ShowUninstDetails nevershow
VIProductVersion "${APP_VERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName" "DeskFur"
VIAddVersionKey /LANG=1033 "FileDescription" "DeskFur offline setup"
VIAddVersionKey /LANG=1033 "ProductVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=1033 "FileVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=1033 "LegalCopyright" "DeskFur contributors"
!define MUI_ICON "${APP_ICON}"
!define MUI_UNICON "${APP_ICON}"
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

!macro RequireClosed prefix
Function ${prefix}.onInit
  SetShellVarContext current
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "DeskFur needs 64-bit Windows 10 or newer."
    Abort
  ${EndIf}
  retry:
    FindWindow $0 "Chrome_WidgetWin_1" "DeskFur"
    ${If} $0 != 0
      MessageBox MB_RETRYCANCEL|MB_ICONINFORMATION "DeskFur is open. Choose Quit DeskFur from its tray menu, then click Retry. Your pet settings will be kept." IDRETRY retry
      Abort
    ${EndIf}
FunctionEnd
!macroend
!insertmacro RequireClosed ""
!insertmacro RequireClosed "un"

Section "Install"
  SetOutPath "$INSTDIR"
  SetOverwrite on
  File /r "${APP_SOURCE}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall DeskFur.exe"
  CreateDirectory "$SMPROGRAMS\DeskFur"
  CreateShortcut "$DESKTOP\DeskFur.lnk" "$INSTDIR\DeskFur.exe" "" "$INSTDIR\resources\deskfur.ico"
  CreateShortcut "$SMPROGRAMS\DeskFur\DeskFur.lnk" "$INSTDIR\DeskFur.exe" "" "$INSTDIR\resources\deskfur.ico"
  WriteRegStr HKCU "Software\DeskFur" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeskFur" "DisplayName" "DeskFur"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeskFur" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeskFur" "Publisher" "DeskFur contributors"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeskFur" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeskFur" "DisplayIcon" "$INSTDIR\resources\deskfur.ico"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeskFur" "UninstallString" '$\"$INSTDIR\Uninstall DeskFur.exe$\"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeskFur" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeskFur" "NoRepair" 1
  Exec '$\"$INSTDIR\DeskFur.exe$\"'
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\DeskFur.lnk"
  Delete "$SMPROGRAMS\DeskFur\DeskFur.lnk"
  RMDir "$SMPROGRAMS\DeskFur"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeskFur"
  DeleteRegKey HKCU "Software\DeskFur"
  ; Only the install directory is removed. Roaming\deskfur pet preferences remain.
  RMDir /r "$INSTDIR"
SectionEnd
