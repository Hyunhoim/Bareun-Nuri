param([ValidateSet('serve','build','verify','score')][string]$Action = 'serve')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$runtimeRoot = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
if ($Action -in @('serve','build')) {
    $pythonExe = Join-Path $runtimeRoot 'python\python.exe'
    if (-not (Test-Path -LiteralPath $pythonExe)) {
        $pythonExe = (Get-Command python -ErrorAction Stop).Source
    }
    if ($Action -eq 'build') { & $pythonExe -X utf8 build.py @args }
    else { & $pythonExe -X utf8 serve.py @args }
} else {
    $nodeExe = Join-Path $runtimeRoot 'node\bin\node.exe'
    if (-not (Test-Path -LiteralPath $nodeExe)) { $nodeExe = (Get-Command node -ErrorAction Stop).Source }
    $bundledModules = Join-Path $runtimeRoot 'node\node_modules'
    if (Test-Path -LiteralPath $bundledModules) {
        $env:NODE_PATH = if ($env:NODE_PATH) { $env:NODE_PATH + [IO.Path]::PathSeparator + $bundledModules } else { $bundledModules }
    }
    & $nodeExe evaluate.cjs $Action @args
}
exit $LASTEXITCODE
