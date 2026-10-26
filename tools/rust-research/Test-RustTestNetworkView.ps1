param([string]$OutputDirectory = (Join-Path $PSScriptRoot '../../work/network-view-test'))
$ErrorActionPreference = 'Stop'
$viewOutput = [IO.Path]::GetFullPath($OutputDirectory)
$viewCompiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$viewSource = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../server-upload/RustTestNetworkView.cs'))
$viewTests = Join-Path $PSScriptRoot 'TestRustTestNetworkView.cs'
New-Item -ItemType Directory -Force -Path $viewOutput | Out-Null
$viewExecutable = Join-Path $viewOutput 'NetworkViewTests.exe'
& $viewCompiler /nologo /target:exe /warnaserror+ ('/out:'+$viewExecutable) $viewTests $viewSource
if ($LASTEXITCODE -ne 0) { throw 'Isolated fixture compilation failed.' }
$viewResult = @(& $viewExecutable)
if ($LASTEXITCODE -ne 0) { throw 'Isolated checks failed.' }
$viewRecord = [ordered]@{
    completedUtc=[DateTime]::UtcNow.ToString('O'); success=$true; isolated=$true
    gameAssembliesExecuted=$false; remoteConnectionMade=$false
    sourceSha256=(Get-FileHash -LiteralPath $viewSource -Algorithm SHA256).Hash.ToLowerInvariant()
    fixtureSha256=(Get-FileHash -LiteralPath $viewTests -Algorithm SHA256).Hash.ToLowerInvariant()
    result=$viewResult
}
[IO.File]::WriteAllText((Join-Path $viewOutput 'tests-safe.json'),($viewRecord | ConvertTo-Json -Depth 4)+[Environment]::NewLine,[Text.UTF8Encoding]::new($false))
$viewResult
