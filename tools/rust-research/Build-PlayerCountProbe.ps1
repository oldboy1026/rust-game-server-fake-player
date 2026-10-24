param(
    [Parameter(Mandatory = $true)][string]$ServerDirectory,
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '../../work/playercount-probe-build')
)
$ErrorActionPreference = 'Stop'
$taskManaged = Join-Path ([IO.Path]::GetFullPath($ServerDirectory)) 'RustDedicated_Data/Managed'
$taskOutput = [IO.Path]::GetFullPath($OutputDirectory)
$taskSource = Join-Path $PSScriptRoot 'PlayerCountProbe.cs'
$taskDotnet = (Get-Command dotnet -ErrorAction Stop).Source
$taskSdkRoot = Join-Path (Split-Path $taskDotnet) 'sdk'
$taskSdk = Get-ChildItem -LiteralPath $taskSdkRoot -Directory | Where-Object { $_.Name -match '^\d+\.\d+\.\d+$' } |
    Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
if (!$taskSdk) { throw 'A stable .NET SDK is required for compile-only validation.' }
$taskCompiler = Join-Path $taskSdk.FullName 'Roslyn/bincore/csc.dll'
$taskReferenceNames = @('mscorlib.dll','netstandard.dll','System.dll','System.Core.dll','System.Runtime.dll',
    'UnityEngine.CoreModule.dll','Assembly-CSharp.dll','Assembly-CSharp-firstpass.dll',
    'Facepunch.System.dll','Facepunch.UnityEngine.dll','Facepunch.Network.dll','Facepunch.Console.dll',
    'Facepunch.Steamworks.Win64.dll','Oxide.Core.dll','Oxide.CSharp.dll','Oxide.Rust.dll','Oxide.Unity.dll')
$taskReferences = @($taskReferenceNames | ForEach-Object {
    $taskPath = Join-Path $taskManaged $_
    [ordered]@{ file = $_; path = $taskPath; sha256 = (Get-FileHash -LiteralPath $taskPath -Algorithm SHA256).Hash.ToLowerInvariant() }
})
New-Item -ItemType Directory -Path $taskOutput -Force | Out-Null
$taskRsp = Join-Path $taskOutput 'PlayerCountProbe.rsp'
$taskDll = Join-Path $taskOutput 'PlayerCountProbe.dll'
$taskArguments = @('/target:library','/nostdlib+','/deterministic+','/optimize+','/parallel-','/warn:4',('/out:"' + $taskDll + '"'))
$taskArguments += @($taskReferences | ForEach-Object { '/reference:"' + $_.path + '"' })
$taskArguments += '"' + $taskSource + '"'
[IO.File]::WriteAllLines($taskRsp, $taskArguments, [Text.UTF8Encoding]::new($false))
$taskStarted = [DateTime]::UtcNow.ToString('O')
$taskSourceHash = (Get-FileHash -LiteralPath $taskSource -Algorithm SHA256).Hash.ToLowerInvariant()
$taskMessages = @(& $taskDotnet $taskCompiler /noconfig ('@' + $taskRsp) 2>&1 | ForEach-Object { [string]$_ })
$taskExit = $LASTEXITCODE
[IO.File]::WriteAllLines((Join-Path $taskOutput 'compiler-private.log'), $taskMessages, [Text.UTF8Encoding]::new($false))
$taskUnchanged = $taskSourceHash -eq (Get-FileHash -LiteralPath $taskSource -Algorithm SHA256).Hash.ToLowerInvariant()
foreach ($taskReference in $taskReferences) {
    if ($taskReference.sha256 -ne (Get-FileHash -LiteralPath $taskReference.path -Algorithm SHA256).Hash.ToLowerInvariant()) { $taskUnchanged = $false }
}
$taskRecord = [ordered]@{
    startedUtc = $taskStarted; completedUtc = [DateTime]::UtcNow.ToString('O')
    compileOnly = $true; success = ($taskExit -eq 0 -and $taskUnchanged); exitCode = $taskExit
    inputsUnchanged = $taskUnchanged; sdk = $taskSdk.Name
    source = @{ file = 'tools/rust-research/PlayerCountProbe.cs'; sha256 = $taskSourceHash }
    references = @($taskReferences | ForEach-Object { @{ file = $_.file; sha256 = $_.sha256 } })
    output = if ($taskExit -eq 0) { @{ file = 'PlayerCountProbe.dll'; sha256 = (Get-FileHash -LiteralPath $taskDll -Algorithm SHA256).Hash.ToLowerInvariant() } } else { $null }
}
[IO.File]::WriteAllText((Join-Path $taskOutput 'build-safe.json'), ($taskRecord | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))
[pscustomobject]@{ success = $taskRecord.success; exitCode = $taskExit; inputsUnchanged = $taskUnchanged }
if (!$taskRecord.success) { throw 'Offline compilation failed; inspect compiler-private.log.' }
