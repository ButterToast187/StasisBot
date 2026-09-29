$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$startScript = Join-Path $PSScriptRoot 'start-stasisbot.cmd'
$taskName = 'StasisBot'

Write-Host "Installing Windows startup task '$taskName'..."
Write-Host "Project: $projectRoot"

$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$startScript`"" -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Days 0)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host "StasisBot autostart installed and task started."
Write-Host "To remove it later: Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
