; Установщик «Планер» для Windows (NSIS)
Unicode true
!include "MUI2.nsh"
!addplugindir /x86-unicode "${RES}/plugins/x86-unicode"

!define APPNAME "Планер"
!define APPEXE "Planer.exe"
!define APPID "local.d.planer"
!define VERSION "3.7.1"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Planer"

Name "${APPNAME}"
Caption "Установка — ${APPNAME} ${VERSION}"
OutFile "../dist/Planer-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\Planer"
InstallDirRegKey HKCU "${UNINSTKEY}" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "${APPNAME} ${VERSION}"

VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1049 "ProductName" "${APPNAME}"
VIAddVersionKey /LANG=1049 "FileDescription" "Установщик ${APPNAME}"
VIAddVersionKey /LANG=1049 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1049 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1049 "LegalCopyright" "© 2026 D"

!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Установка «${APPNAME}»"
!define MUI_WELCOMEPAGE_TEXT "Задачи, календарь, проекты и бюджет в одной программе.$\r$\n$\r$\nВсе данные хранятся только на этом компьютере. Права администратора не нужны.$\r$\n$\r$\nНажмите «Далее», чтобы продолжить."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APPEXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Запустить «${APPNAME}»"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Russian"

Section "Install"
  ; если планер запущен (в том числе в трее) — закрываем его перед обновлением
  nsExec::Exec 'taskkill /IM "${APPEXE}" /F'
  Sleep 800
  SetOutPath "$INSTDIR"
  File /r "../dist/win-unpacked/*"
  File "/oname=icon.ico" "icon.ico"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateShortCut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${APPEXE}" "" "$INSTDIR\icon.ico" 0
  CreateShortCut "$SMPROGRAMS\${APPNAME}.lnk" "$INSTDIR\${APPEXE}" "" "$INSTDIR\icon.ico" 0
  ; идентификатор приложения на ярлыке — без него Windows не показывает уведомления
  WinShell::SetLnkAUMI "$SMPROGRAMS\${APPNAME}.lnk" "${APPID}"
  WinShell::SetLnkAUMI "$DESKTOP\${APPNAME}.lnk" "${APPID}"

  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "D"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "EstimatedSize" 280000
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /IM "${APPEXE}" /F'
  Sleep 800
  WinShell::UninstAppUserModelId "${APPID}"
  Delete "$DESKTOP\${APPNAME}.lnk"
  Delete "$SMPROGRAMS\${APPNAME}.lnk"
  ; убираем автозапуск, если был включён
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APPID}"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.${APPNAME}"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTKEY}"
  ; данные пользователя (%APPDATA%\Планер) не удаляются — задачи сохранятся при переустановке
SectionEnd
