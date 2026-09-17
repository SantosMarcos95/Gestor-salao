$ErrorActionPreference = 'Stop'

$taskName = 'SalaoGestaoBackup'
$windowsUser = "$env:USERDOMAIN\$env:USERNAME"
$wsl = Join-Path $env:WINDIR 'System32\wsl.exe'
$node = '/home/marcos_paulo/.nvm/versions/node/v20.20.2/bin/node'
$script = '/home/marcos_paulo/salao-gestao/scripts/backup-local.mjs'
$action = New-ScheduledTaskAction -Execute $wsl -Argument "-d Ubuntu -u marcos_paulo --exec $node $script run-if-due"
$daily = New-ScheduledTaskTrigger -Daily -At '03:00'
$logon = New-ScheduledTaskTrigger -AtLogOn -User $windowsUser
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$principal = New-ScheduledTaskPrincipal -UserId $windowsUser -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($daily, $logon) -Settings $settings -Principal $principal -Force
Get-ScheduledTask -TaskName $taskName | Select-Object TaskName, State
