param(
    [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
$taskRepo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$taskWork = [IO.Path]::GetFullPath((Join-Path $taskRepo 'work'))
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $taskWork ('query-proxy-package-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))
}
if (![IO.Path]::IsPathRooted($OutputDirectory)) {
    $OutputDirectory = Join-Path $taskRepo $OutputDirectory
}
$taskOutput = [IO.Path]::GetFullPath($OutputDirectory)
$taskWorkPrefix = $taskWork.TrimEnd([char[]]'\/') + [IO.Path]::DirectorySeparatorChar
if (!$taskOutput.StartsWith($taskWorkPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'OutputDirectory must be inside this repository work directory.'
}
if (Test-Path -LiteralPath $taskOutput) {
    throw 'OutputDirectory already exists. Choose a new directory; this script never overwrites or removes packages.'
}

$taskSources = @(
    @{ Source = 'tools/rust-research/run-query-proxy.mjs'; Destination = 'tools/rust-research/run-query-proxy.mjs' },
    @{ Source = 'steam-multi-account/src/rust-query-proxy.js'; Destination = 'steam-multi-account/src/rust-query-proxy.js' },
    @{ Source = 'rust-research/query-server.mjs'; Destination = 'rust-research/query-server.mjs' },
    @{ Source = 'server-upload/query-proxy/README.zh-CN.md'; Destination = 'README.zh-CN.md' }
)
foreach ($taskFile in $taskSources) {
    $taskSource = Join-Path $taskRepo $taskFile.Source
    if (!(Test-Path -LiteralPath $taskSource -PathType Leaf)) {
        throw ('Required public source is missing: ' + $taskFile.Source)
    }
}

$null = New-Item -ItemType Directory -Path $taskOutput
$taskUtf8 = New-Object Text.UTF8Encoding($false)
$taskManifest = @()
foreach ($taskFile in $taskSources) {
    $taskSource = Join-Path $taskRepo $taskFile.Source
    $taskDestination = Join-Path $taskOutput $taskFile.Destination
    $null = [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($taskDestination))
    [IO.File]::Copy($taskSource, $taskDestination, $false)
    $taskHash = (Get-FileHash -LiteralPath $taskDestination -Algorithm SHA256).Hash.ToLowerInvariant()
    $taskSourceHash = (Get-FileHash -LiteralPath $taskSource -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($taskHash -ne $taskSourceHash) { throw 'Copied public source hash mismatch.' }
    $taskManifest += [ordered]@{ path = $taskFile.Destination; sha256 = $taskHash }
}

$taskPackage = [ordered]@{
    name = 'rust-a2s-query-proxy-test'
    version = '0.1.0'
    private = $true
    type = 'module'
    engines = @{ node = '>=22' }
    description = 'Bounded A2S query reply test proxy; no Steam account data or npm dependencies.'
}
$taskPackagePath = Join-Path $taskOutput 'package.json'
[IO.File]::WriteAllText($taskPackagePath, (($taskPackage | ConvertTo-Json -Depth 4) + [Environment]::NewLine), $taskUtf8)
$taskManifest += [ordered]@{ path = 'package.json'; sha256 = (Get-FileHash -LiteralPath $taskPackagePath -Algorithm SHA256).Hash.ToLowerInvariant() }
$taskResult = [ordered]@{
    createdAt = [DateTime]::UtcNow.ToString('o')
    node = '>=22'
    npmInstallRequired = $false
    files = $taskManifest
}
[IO.File]::WriteAllText((Join-Path $taskOutput 'manifest.json'), (($taskResult | ConvertTo-Json -Depth 6) + [Environment]::NewLine), $taskUtf8)
[ordered]@{ packageDirectory = $taskOutput; sourceFileCount = $taskSources.Count; npmInstallRequired = $false; deployed = $false } | ConvertTo-Json
