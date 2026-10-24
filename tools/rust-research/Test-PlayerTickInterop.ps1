param(
    [Parameter(Mandatory = $true)][string]$ServerDirectory,
    [string]$Python = 'python',
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '../../work/player-tick-interop')
)
$ErrorActionPreference = 'Stop'
$taskManaged = Join-Path ([IO.Path]::GetFullPath($ServerDirectory)) 'RustDedicated_Data/Managed'
$taskOutput = [IO.Path]::GetFullPath($OutputDirectory)
$taskDotnet = (Get-Command dotnet -ErrorAction Stop).Source
$taskDotnetRoot = Split-Path $taskDotnet
$taskSdk = Get-ChildItem -LiteralPath (Join-Path $taskDotnetRoot 'sdk') -Directory |
    Where-Object { $_.Name -match '^10\.\d+\.\d+$' } | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
$taskRefPack = Get-ChildItem -LiteralPath (Join-Path $taskDotnetRoot 'packs/Microsoft.NETCore.App.Ref') -Directory |
    Where-Object { $_.Name -match '^10\.\d+\.\d+$' } | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
if (!$taskSdk -or !$taskRefPack) { throw 'The offline interoperability harness requires .NET 10 SDK/reference pack.' }
New-Item -ItemType Directory -Path $taskOutput -Force | Out-Null
$taskSource = Join-Path $PSScriptRoot 'PlayerTickInterop.cs'
$taskFixture = Join-Path $taskOutput 'fixtures'
& $Python -B (Join-Path $PSScriptRoot 'test_rust_player_tick.py') --write-interop $taskFixture
if ($LASTEXITCODE -ne 0) { throw 'Synthetic fixture generation failed.' }
$taskReferences = @(Get-ChildItem -LiteralPath (Join-Path $taskRefPack.FullName 'ref/net10.0') -Filter '*.dll' | ForEach-Object { $_.FullName })
$taskGameInputs = @('Rust.Data.dll', 'Rust.Global.dll', 'Facepunch.System.dll', 'UnityEngine.CoreModule.dll') | ForEach-Object {
    $taskPath = Join-Path $taskManaged $_
    @{ file = $_; path = $taskPath; sha256 = (Get-FileHash -LiteralPath $taskPath -Algorithm SHA256).Hash.ToLowerInvariant() }
}
$taskReferences += @($taskGameInputs | ForEach-Object { $_.path })
$taskProgram = Join-Path $taskOutput 'PlayerTickInterop.dll'
$taskRsp = Join-Path $taskOutput 'interop.rsp'
$taskArguments = @('/target:exe', '/nostdlib+', '/deterministic+', '/optimize+', '/parallel-', '/warn:4', ('/out:"' + $taskProgram + '"'))
$taskArguments += @($taskReferences | ForEach-Object { '/reference:"' + $_ + '"' })
$taskArguments += '"' + $taskSource + '"'
[IO.File]::WriteAllLines($taskRsp, $taskArguments, [Text.UTF8Encoding]::new($false))
& $taskDotnet (Join-Path $taskSdk.FullName 'Roslyn/bincore/csc.dll') /noconfig ('@' + $taskRsp)
if ($LASTEXITCODE -ne 0) { throw 'Interoperability harness compilation failed.' }
[IO.File]::WriteAllText((Join-Path $taskOutput 'PlayerTickInterop.runtimeconfig.json'),
    '{"runtimeOptions":{"tfm":"net10.0","framework":{"name":"Microsoft.NETCore.App","version":"10.0.0"}}}', [Text.UTF8Encoding]::new($false))
& $taskDotnet $taskProgram $taskManaged $taskFixture
$taskExit = $LASTEXITCODE
$taskUnchanged = $true
foreach ($taskInput in $taskGameInputs) {
    if ((Get-FileHash -LiteralPath $taskInput.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskInput.sha256) { $taskUnchanged = $false }
}
$taskResult = @{ success = ($taskExit -eq 0 -and $taskUnchanged); exitCode = $taskExit; inputsUnchanged = $taskUnchanged
    references = @($taskGameInputs | ForEach-Object { @{ file = $_.file; sha256 = $_.sha256 } }) }
[IO.File]::WriteAllText((Join-Path $taskOutput 'interop-safe.json'), ($taskResult | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
if (!$taskResult.success) { throw 'Real Rust.Data interoperability validation failed.' }
