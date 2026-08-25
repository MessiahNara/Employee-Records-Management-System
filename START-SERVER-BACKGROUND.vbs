Set WshShell = CreateObject("WScript.Shell")
strPath = WScript.ScriptFullName
Set objFSO = CreateObject("Scripting.FileSystemObject")
Set objFile = objFSO.GetFile(strPath)
strFolder = objFSO.GetParentFolderName(objFile)

' Run START-SERVER.bat completely hidden in background (0 = hidden)
WshShell.Run """" & strFolder & "\START-SERVER.bat""", 0, False
