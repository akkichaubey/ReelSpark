# Run in your PowerShell terminal before npm commands if standalone Node shadows nvm.
$ErrorActionPreference = 'Stop'
$projectNodeVersion = (Get-Content -LiteralPath (Join-Path $PSScriptRoot '..\.nvmrc') -Raw).Trim()
$projectNvmCommand = Get-Command nvm.exe -ErrorAction Stop
& $projectNvmCommand.Source use $projectNodeVersion
if ($LASTEXITCODE -ne 0) { throw 'nvm could not select the project Node version.' }
$projectNvmShim = Join-Path (Split-Path -Parent $projectNvmCommand.Source) '.nodejs'
if (-not (Test-Path -LiteralPath (Join-Path $projectNvmShim 'node.exe'))) {
  throw 'nvm shim directory was not found. Check nvm configuration before proceeding.'
}
$env:Path = $projectNvmShim + ';' + $env:Path
$projectActualNodeVersion = (& node --version).Trim().TrimStart('v')
if ($projectActualNodeVersion -ne $projectNodeVersion) { throw 'The selected Node runtime does not match .nvmrc.' }
Write-Host "Using nvm Node $projectActualNodeVersion for this terminal."
