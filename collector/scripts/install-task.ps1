# Windows 로그인 때 즉시 실행 + 이후 30분마다 반복 (겹쳐 실행되지 않음). 한 번만 실행.
$root = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node).Source
$action = New-ScheduledTaskAction -Execute $node -Argument 'src\run.js' -WorkingDirectory $root
$logon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$logon.Repetition = (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 30)).Repetition
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 20)
Register-ScheduledTask -TaskName 'ERP 수집기' -Action $action -Trigger $logon -Settings $settings -Description 'ERP 엑셀을 받아 Drive 업로드 폴더에 올림' -Force | Out-Null
Write-Host "등록 완료. 지금 한 번 실행하려면: Start-ScheduledTask -TaskName 'ERP 수집기'"
