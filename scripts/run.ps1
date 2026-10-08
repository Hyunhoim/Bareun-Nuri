param([ValidateSet('run','build')][string]$Action='run', [switch]$NoBrowser)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22.12+ or 24 first.' }
$env:npm_config_cache=Join-Path $projectRoot '.tools\npm-cache'
$env:APP_ROOT=$projectRoot
$env:NODE_EXECUTABLE=(Get-Command node).Source
& node scripts/bootstrap.cjs
if ($LASTEXITCODE -ne 0) { throw 'Runtime preparation failed.' }
$jdk=Get-ChildItem -LiteralPath (Join-Path $projectRoot '.tools\jdk') -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin\java.exe') } | Select-Object -First 1
$env:JAVA_HOME=$jdk.FullName
$env:Path=(Join-Path $env:JAVA_HOME 'bin')+[IO.Path]::PathSeparator+$env:Path
$tmpDir=Join-Path $projectRoot '.runtime\tmp'
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
$env:TEMP=$tmpDir
$env:TMP=$tmpDir
foreach($part in @('agent','frontend')) {
    if(-not(Test-Path -LiteralPath (Join-Path $projectRoot "$part\node_modules"))) {
        if(Test-Path -LiteralPath (Join-Path $projectRoot "$part\package-lock.json")) { & npm.cmd ci --prefix $part --no-fund --no-audit }
        else { & npm.cmd install --prefix $part --no-fund --no-audit }
        if($LASTEXITCODE -ne 0) { throw "Dependency installation failed: $part" }
    }
}
& npm.cmd run build --prefix frontend
if($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
$maven=Join-Path $projectRoot '.tools\apache-maven-3.9.11\bin\mvn.cmd'
$repository=Join-Path $projectRoot '.tools\m2'
& $maven "-Dmaven.repo.local=$repository" -B -ntp -f backend/pom.xml clean package
if($LASTEXITCODE -ne 0) { throw 'Backend build failed.' }
if($Action -eq 'build') { exit 0 }
try {
    $response=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8766/api/health' -TimeoutSec 2
    if($response.StatusCode -eq 200) { throw 'Port 8766 already has a running service. Close the old run before starting again.' }
} catch {
    if($_.Exception.Message -like 'Port 8766*') { throw }
}
if(-not $NoBrowser) {
    Start-Process -FilePath powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+(Join-Path $PSScriptRoot 'open-browser.ps1')+'"')) | Out-Null
}
Write-Host 'Open http://127.0.0.1:8766  (Ctrl+C stops the backend and its agent)'
& (Join-Path $env:JAVA_HOME 'bin\java.exe') '-Dfile.encoding=UTF-8' -jar backend/target/public-ad-backend.jar
exit $LASTEXITCODE
