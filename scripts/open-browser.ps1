$ErrorActionPreference='Stop'
for($attempt=0;$attempt -lt 45;$attempt++) {
    try {
        $health=Invoke-RestMethod -Uri 'http://127.0.0.1:8766/api/health' -TimeoutSec 2
        if($health.app -eq 'public-ad-baseline') { Start-Process 'http://127.0.0.1:8766'; exit }
    } catch { }
    Start-Sleep -Seconds 1
}
