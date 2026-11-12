# ERP 읽기 전용 계정을 이 PC · 이 Windows 사용자만 풀 수 있게 암호화해서 저장 (한 번만 실행)
$dir = Join-Path $env:LOCALAPPDATA 'erp-collector'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Get-Credential -Message 'ERP 읽기 전용 계정' | Export-Clixml -Path (Join-Path $dir 'erp-cred.xml')
Write-Host "저장 완료: $dir\erp-cred.xml (다른 PC · 다른 사용자는 열 수 없음)"
