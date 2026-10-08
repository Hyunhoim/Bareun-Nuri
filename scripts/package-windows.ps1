param([switch]$SkipBuild)
$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $project
$env:npm_config_cache=Join-Path $project '.tools/npm-cache'
$release=Join-Path $project 'Bareun-Nuri 제출'
$run=Join-Path $release '01_실행'
$source=Join-Path $release '02_소스코드'
$exeName='바른누리_실행기.exe'
function CopyTree($from,$to) {
    New-Item -ItemType Directory -Force $to | Out-Null
    & robocopy $from $to /E /XD node_modules __pycache__ .git .runtime target dist graphify-out /XF .env *.pyc README.md package-model.py /NFL /NDL /NJH /NJS | Out-Null
    if($LASTEXITCODE -ge 8){throw "Copy failed: $from"}
}
if(-not $SkipBuild){& "$PSScriptRoot/run.ps1" -Action build;if($LASTEXITCODE -ne 0){throw 'Build failed'}}
if(-not(Test-Path "$run/runtime/python/python.exe")){
    $python=if(Test-Path '.runtime/klue-venv/Scripts/python.exe'){(Resolve-Path '.runtime/klue-venv/Scripts/python.exe').Path}else{(Get-Command python).Source}
    & $python "$PSScriptRoot/prepare-portable-python.py"
    if($LASTEXITCODE -ne 0){throw 'CPU Python preparation failed'}
}
$env:PLAYWRIGHT_BROWSERS_PATH=Join-Path $run 'runtime/chromium'
& node agent/node_modules/playwright/cli.js install chromium --only-shell
if($LASTEXITCODE -ne 0){throw 'Browser preparation failed'}
foreach($dir in @('runtime/node','app/backend','app/backend/scripts','config','logs','state')){New-Item -ItemType Directory -Force (Join-Path $run $dir) | Out-Null}
CopyTree "$project/agent/src" "$run/app/agent/src"
CopyTree "$project/agent/antispoof" "$run/app/agent/antispoof"
CopyTree "$project/agent/models" "$run/app/agent/models"
# Only runtime dependencies; never copy credentials, experiment data, or developer jobs.
Copy-Item agent/package*.json "$run/app/agent/"
$package=Get-Content -Raw agent/package.json | ConvertFrom-Json
$package.scripts=[pscustomobject]@{start='node src/worker.cjs'}
[IO.File]::WriteAllText("$run/app/agent/package.json",($package|ConvertTo-Json -Depth 20),[Text.UTF8Encoding]::new($false))
& npm.cmd ci --prefix "$run/app/agent" --omit=dev --ignore-scripts --no-fund --no-audit
if($LASTEXITCODE -ne 0){throw 'Agent dependency install failed'}
Copy-Item backend/target/public-ad-backend.jar "$run/app/backend/"
Copy-Item backend/scripts/env-key.cjs "$run/app/backend/scripts/"
if(Test-Path "$project/licenses"){CopyTree "$project/licenses" "$run/app/licenses"}
Copy-Item (Get-Command node).Source "$run/runtime/node/node.exe"
$jdk=(Get-ChildItem .tools/jdk -Directory | Select-Object -First 1).FullName
if(-not(Test-Path "$run/runtime/java/bin/java.exe")){
    & "$jdk/bin/jlink.exe" --add-modules java.se,jdk.unsupported,jdk.crypto.ec --strip-debug --no-header-files --no-man-pages --output "$run/runtime/java"
    if($LASTEXITCODE -ne 0){throw 'Java runtime creation failed'}
}
$empty="OPENAI_API_KEY=`nBROWSER_CHANNEL=chromium`n"
[IO.File]::WriteAllText("$run/config/.env.example",$empty,[Text.UTF8Encoding]::new($false))
if(-not(Test-Path "$run/config/.env")){[IO.File]::WriteAllText("$run/config/.env",$empty,[Text.UTF8Encoding]::new($false))}
& "$env:WINDIR/Microsoft.NET/Framework64/v4.0.30319/csc.exe" /nologo /target:winexe /platform:x64 "/win32icon:$PSScriptRoot\brand-logo.ico" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll "/out:$run\$exeName" "$PSScriptRoot\Launcher.cs"
if($LASTEXITCODE -ne 0){throw 'Launcher compilation failed'}
foreach($part in @('frontend','backend')){CopyTree "$project/$part" "$source/$part"}
if(Test-Path "$run/app/licenses"){CopyTree "$run/app/licenses" "$source/licenses"}
CopyTree "$project/agent/src" "$source/agent/src"
CopyTree "$project/agent/antispoof" "$source/agent/antispoof"
Copy-Item agent/package*.json "$source/agent/"
$package.scripts=[pscustomobject]@{start='node src/worker.cjs';test='node ../scripts/verify-submission.cjs --source'}
[IO.File]::WriteAllText("$source/agent/package.json",($package|ConvertTo-Json -Depth 20),[Text.UTF8Encoding]::new($false))
$readme=if(Test-Path "$project/docs/제출_소스코드_README.md"){"$project/docs/제출_소스코드_README.md"}else{"$project/README.md"}
Copy-Item -LiteralPath $readme -Destination "$source/README.md"
New-Item -ItemType Directory -Force "$source/scripts" | Out-Null
foreach($file in @('Launcher.cs','brand-logo.ico','package-windows.ps1','prepare-portable-python.py','requirements-windows.txt','verify-submission.cjs','run.ps1','bootstrap.cjs','open-browser.ps1')){
    if(Test-Path "$PSScriptRoot/$file"){Copy-Item "$PSScriptRoot/$file" "$source/scripts/"}
}
if(Test-Path "$project/docs/사용설명서.md"){Copy-Item -LiteralPath "$project/docs/사용설명서.md" -Destination "$release/사용설명서.md"}
Write-Host "Packaged: $run"
