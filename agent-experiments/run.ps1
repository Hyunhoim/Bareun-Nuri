param([ValidateSet('run','test','verify','verify-flow','benchmark')][string]$Action = 'run')
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$runtimeRoot = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
$nodeExe = Join-Path $runtimeRoot 'node\bin\node.exe'
if (-not (Test-Path -LiteralPath $nodeExe)) { $nodeExe = (Get-Command node -ErrorAction Stop).Source }
$bundledModules = Join-Path $runtimeRoot 'node\node_modules'
if (Test-Path -LiteralPath $bundledModules) {
    $env:NODE_PATH = if ($env:NODE_PATH) { $env:NODE_PATH + [IO.Path]::PathSeparator + $bundledModules } else { $bundledModules }
}
if ($Action -eq 'test') { & $nodeExe test.cjs @args }
elseif ($Action -eq 'verify') { & $nodeExe verify-architectures.cjs @args }
elseif ($Action -eq 'verify-flow') { & $nodeExe verify-hcx.cjs @args }
elseif ($Action -eq 'benchmark') { & $nodeExe benchmark.cjs @args }
else { & $nodeExe run.cjs @args }
exit $LASTEXITCODE
