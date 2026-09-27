; Register supported documents as Open with choices without changing defaults.
; SHCTX follows the installer's current-user / all-users installation scope.
!define BRICRIU_DOCUMENT "${BUNDLEID}.Document"
!define BRICRIU_APPLICATION "Software\Classes\Applications\${MAINBINARYNAME}.exe"

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Classes\${BRICRIU_DOCUMENT}" "" "Bricriu document"
  WriteRegStr SHCTX "Software\Classes\${BRICRIU_DOCUMENT}\DefaultIcon" "" '"$INSTDIR\${MAINBINARYNAME}.exe",0'
  WriteRegStr SHCTX "Software\Classes\${BRICRIU_DOCUMENT}\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  WriteRegStr SHCTX "${BRICRIU_APPLICATION}" "FriendlyAppName" "${PRODUCTNAME}"
  WriteRegStr SHCTX "${BRICRIU_APPLICATION}\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr SHCTX "${BRICRIU_APPLICATION}\SupportedTypes" ".md" ""
  WriteRegStr SHCTX "${BRICRIU_APPLICATION}\SupportedTypes" ".markdown" ""
  WriteRegStr SHCTX "${BRICRIU_APPLICATION}\SupportedTypes" ".typ" ""
  WriteRegStr SHCTX "${BRICRIU_APPLICATION}\SupportedTypes" ".txt" ""
  WriteRegStr SHCTX "${BRICRIU_APPLICATION}\SupportedTypes" ".csv" ""
  WriteRegStr SHCTX "${BRICRIU_APPLICATION}\SupportedTypes" ".json" ""
  WriteRegStr SHCTX "Software\Classes\.md\OpenWithProgids" "${BRICRIU_DOCUMENT}" ""
  WriteRegStr SHCTX "Software\Classes\.markdown\OpenWithProgids" "${BRICRIU_DOCUMENT}" ""
  WriteRegStr SHCTX "Software\Classes\.typ\OpenWithProgids" "${BRICRIU_DOCUMENT}" ""
  WriteRegStr SHCTX "Software\Classes\.txt\OpenWithProgids" "${BRICRIU_DOCUMENT}" ""
  WriteRegStr SHCTX "Software\Classes\.csv\OpenWithProgids" "${BRICRIU_DOCUMENT}" ""
  WriteRegStr SHCTX "Software\Classes\.json\OpenWithProgids" "${BRICRIU_DOCUMENT}" ""
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Tauri's optional app-data cleanup changes the context to current user.
  !if "${INSTALLMODE}" == "perMachine"
    SetShellVarContext all
  !else if "${INSTALLMODE}" == "both"
    ${If} $MultiUser.InstallMode == "AllUsers"
      SetShellVarContext all
    ${Else}
      SetShellVarContext current
    ${EndIf}
  !else
    SetShellVarContext current
  !endif
  ; An older installation must not remove a newer installation's registration.
  ReadRegStr $R0 SHCTX "Software\Classes\${BRICRIU_DOCUMENT}\shell\open\command" ""
  ${If} $R0 == '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
    DeleteRegValue SHCTX "Software\Classes\.md\OpenWithProgids" "${BRICRIU_DOCUMENT}"
    DeleteRegValue SHCTX "Software\Classes\.markdown\OpenWithProgids" "${BRICRIU_DOCUMENT}"
    DeleteRegValue SHCTX "Software\Classes\.typ\OpenWithProgids" "${BRICRIU_DOCUMENT}"
    DeleteRegValue SHCTX "Software\Classes\.txt\OpenWithProgids" "${BRICRIU_DOCUMENT}"
    DeleteRegValue SHCTX "Software\Classes\.csv\OpenWithProgids" "${BRICRIU_DOCUMENT}"
    DeleteRegValue SHCTX "Software\Classes\.json\OpenWithProgids" "${BRICRIU_DOCUMENT}"
    DeleteRegKey SHCTX "Software\Classes\${BRICRIU_DOCUMENT}"
  ${EndIf}
  ReadRegStr $R0 SHCTX "${BRICRIU_APPLICATION}\shell\open\command" ""
  ${If} $R0 == '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
    DeleteRegKey SHCTX "${BRICRIU_APPLICATION}"
  ${EndIf}
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
