$ErrorActionPreference='Stop'
$run=Join-Path (Split-Path -Parent $PSScriptRoot) 'Bareun-Nuri 제출/01_실행'
$exe=if(Test-Path "$run/바른누리_실행기.exe"){"$run/바른누리_실행기.exe"}else{"$run/Bareun-Nuri.exe"}
$before=$null;$ready=$false
for($i=0;$i -lt 60;$i++){
 try {$before=Get-Content "$run/state/launcher.json"|ConvertFrom-Json;$health=Invoke-RestMethod ($before.url+'/api/health');if($health.status -eq 'ok'){$ready=$true;break}}catch{}
 Start-Sleep -Milliseconds 500
}
if(-not $ready){throw 'Launcher is not ready'}
$logFile=Join-Path $run 'logs/backend.log'
$beforeOpened=@(Select-String -LiteralPath $logFile -Pattern '^Browser opened using ').Count
$p=Start-Process -FilePath $exe -WindowStyle Hidden -PassThru
if(-not $p.WaitForExit(10000)){throw 'Duplicate launch did not exit'}
for($i=0;$i -lt 20 -and (Test-Path "$run/state/open.request");$i++){Start-Sleep -Milliseconds 250}
if(Test-Path "$run/state/open.request"){throw 'Existing launcher did not consume open request'}
$after=Get-Content "$run/state/launcher.json"|ConvertFrom-Json
if($before.pid -ne $after.pid -or $before.launcherPid -ne $after.launcherPid){throw 'Server was restarted'}
Invoke-RestMethod ($after.url+'/api/health') | Out-Null
for($i=0;$i -lt 20;$i++){
 $afterOpened=@(Select-String -LiteralPath $logFile -Pattern '^Browser opened using ').Count
 if($afterOpened -gt $beforeOpened){break}
 Start-Sleep -Milliseconds 250
}
if($afterOpened -le $beforeOpened){throw 'Duplicate launch did not open the browser'}
'PASS: duplicate exits; browser opens even from a no-browser instance; server PID preserved'
