param([ValidateSet('serve','build','verify','score','coverage')][string]$Action='serve')
$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
if($Action -in @('serve','build')) {
    $pythonExe=Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
    if(-not(Test-Path -LiteralPath $pythonExe)) {$pythonExe=(Get-Command python -ErrorAction Stop).Source}
    if($Action -eq 'build') {& $pythonExe -X utf8 build.py @args}
    else {& $pythonExe -X utf8 ../local-benchmark/serve.py --dataset-root $PSScriptRoot --entry /advanced/ --port 8780 @args}
} else {
    if(-not(Test-Path node_modules/playwright)) {
        & npm.cmd ci --no-fund --no-audit
        if($LASTEXITCODE -ne 0){throw 'Dependency installation failed'}
    }
    & node evaluate.cjs $Action @args
}
exit $LASTEXITCODE
