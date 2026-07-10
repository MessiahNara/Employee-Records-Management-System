; ERMS Service Hooks for NSIS installer
; Uses NSSM (bundled) to register the backend as a proper Windows Service

!macro customInstall
  DetailPrint "Installing ERMS Backend Service (NSSM)..."

  ; Remove any previously registered service first
  nsExec::ExecToLog '"$SYSDIR\sc.exe" stop ERMSBackendServer'
  Pop $0
  nsExec::ExecToLog '"$SYSDIR\sc.exe" delete ERMSBackendServer'
  Pop $0

  ; Small delay to let sc.exe finish
  Sleep 2000

  ; Install service via NSSM
  nsExec::ExecToLog '"$INSTDIR\resources\service\nssm.exe" install ERMSBackendServer "$INSTDIR\resources\service\nssm.exe"'
  Pop $0

  ; Use node.exe to run the runner script
  nsExec::ExecToLog 'cmd.exe /C ""$INSTDIR\resources\service\nssm.exe" install ERMSBackendServer node.exe"'
  Pop $0
  nsExec::ExecToLog '"$INSTDIR\resources\service\nssm.exe" set ERMSBackendServer AppParameters "\"$INSTDIR\resources\service\service-runner.cjs\""'
  Pop $0
  nsExec::ExecToLog '"$INSTDIR\resources\service\nssm.exe" set ERMSBackendServer AppDirectory "$INSTDIR\resources"'
  Pop $0
  nsExec::ExecToLog '"$INSTDIR\resources\service\nssm.exe" set ERMSBackendServer DisplayName "ERMS Backend Server"'
  Pop $0
  nsExec::ExecToLog '"$INSTDIR\resources\service\nssm.exe" set ERMSBackendServer Description "Employee Records Management System - Backend API Server"'
  Pop $0
  nsExec::ExecToLog '"$INSTDIR\resources\service\nssm.exe" set ERMSBackendServer Start SERVICE_AUTO_START'
  Pop $0
  nsExec::ExecToLog '"$INSTDIR\resources\service\nssm.exe" set ERMSBackendServer ObjectName LocalSystem'
  Pop $0
  nsExec::ExecToLog '"$INSTDIR\resources\service\nssm.exe" set ERMSBackendServer AppExit Default Restart'
  Pop $0
  nsExec::ExecToLog '"$INSTDIR\resources\service\nssm.exe" set ERMSBackendServer AppRestartDelay 5000'
  Pop $0

  ; Create logs directory
  CreateDirectory "$INSTDIR\logs"
  nsExec::ExecToLog '"$INSTDIR\resources\service\nssm.exe" set ERMSBackendServer AppStdout "$INSTDIR\logs\erms-service.log"'
  Pop $0
  nsExec::ExecToLog '"$INSTDIR\resources\service\nssm.exe" set ERMSBackendServer AppStderr "$INSTDIR\logs\erms-service-error.log"'
  Pop $0
  nsExec::ExecToLog '"$INSTDIR\resources\service\nssm.exe" set ERMSBackendServer AppRotateFiles 1'
  Pop $0

  ; Start the service
  nsExec::ExecToLog '"$INSTDIR\resources\service\nssm.exe" start ERMSBackendServer'
  Pop $0

  DetailPrint "ERMS Backend Service installation complete."
!macroend

!macro customUnInstall
  DetailPrint "Stopping and removing ERMS Backend Service..."
  nsExec::ExecToLog '"$INSTDIR\resources\service\nssm.exe" stop ERMSBackendServer'
  Pop $0
  nsExec::ExecToLog '"$INSTDIR\resources\service\nssm.exe" remove ERMSBackendServer confirm'
  Pop $0
  DetailPrint "ERMS Backend Service removed."
!macroend
