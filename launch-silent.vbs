' ============================================================================
'  Contract Manager - Silent Launcher
' ----------------------------------------------------------------------------
'  Runs launch.bat with NO visible console window, so starting the app feels
'  like clicking a normal program icon. Everything else is identical: it still
'  checks GitHub for updates, pulls them, installs/builds as needed, and
'  launches the app.
'
'  All output from launch.bat is captured to launch.log next to this file.
'  If the update/build fails, a dialog points you there.
'
'  Usage: double-click launch-silent.vbs (or make a shortcut to it).
' ============================================================================

Option Explicit

Dim Q, shell, fso, scriptDir, batPath, logPath, cmd, rc
Q = Chr(34)   ' a double-quote character, for building the command string

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Resolve paths relative to this .vbs file, so it works from anywhere.
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = fso.BuildPath(scriptDir, "launch.bat")
logPath = fso.BuildPath(scriptDir, "launch.log")

If Not fso.FileExists(batPath) Then
    MsgBox "Could not find launch.bat next to this file:" & vbCrLf & vbCrLf & _
           batPath, vbCritical, "Contract Manager Launcher"
    WScript.Quit 1
End If

' Tell launch.bat it is running headless so it won't call PAUSE (which would
' hang forever with no window to dismiss it).
shell.Environment("Process")("LAUNCHER_SILENT") = "1"

' Build:  cmd /c "  "<batPath>" > "<logPath>" 2>&1  "
cmd = "cmd /c " & Q & Q & batPath & Q & " > " & Q & logPath & Q & " 2>&1" & Q

' Run hidden (window style 0) and wait so we can report the exit code.
rc = shell.Run(cmd, 0, True)

' A non-zero exit means the update or build step failed before the app started.
If rc <> 0 Then
    MsgBox "Contract Manager could not start (the update or build step failed)." & vbCrLf & vbCrLf & _
           "See the log for details:" & vbCrLf & logPath, _
           vbExclamation, "Contract Manager Launcher"
    WScript.Quit rc
End If
