param(
    [Parameter(Mandatory=$true)][string]$ReferenceDirectory,
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '../../work/network-view-build')
)
$ErrorActionPreference = 'Stop'
$viewRefs = [IO.Path]::GetFullPath($ReferenceDirectory)
$viewOutput = [IO.Path]::GetFullPath($OutputDirectory)
$viewCompiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$viewSource = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../server-upload/RustTestNetworkView.cs'))
$viewNames = @('Oxide.Core.dll','Oxide.CSharp.dll','Oxide.Rust.dll','Facepunch.Console.dll','Facepunch.Network.dll')
$viewInputs = @($viewNames | ForEach-Object {
    $viewPath = Join-Path $viewRefs $_
    [ordered]@{ file=$_; path=$viewPath; sha256=(Get-FileHash -LiteralPath $viewPath -Algorithm SHA256).Hash.ToLowerInvariant() }
})
$viewSourceHash = (Get-FileHash -LiteralPath $viewSource -Algorithm SHA256).Hash.ToLowerInvariant()
New-Item -ItemType Directory -Force -Path $viewOutput | Out-Null
$viewDll = Join-Path $viewOutput 'RustTestNetworkView.dll'
$viewArgs = @('/nologo','/target:library','/warnaserror+',('/out:'+$viewDll))
$viewArgs += @($viewInputs | ForEach-Object { '/reference:'+$_.path })
$viewArgs += $viewSource
& $viewCompiler @viewArgs
if ($LASTEXITCODE -ne 0) { throw 'Compile-only validation failed.' }
if ((Get-FileHash -LiteralPath $viewSource -Algorithm SHA256).Hash.ToLowerInvariant() -ne $viewSourceHash) { throw 'Source changed during compilation.' }
foreach ($viewInput in $viewInputs) {
    if ((Get-FileHash -LiteralPath $viewInput.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $viewInput.sha256) { throw 'Reference changed during compilation.' }
}
$viewRecord = [ordered]@{
    version='0.1.0'; compiledUtc=[DateTime]::UtcNow.ToString('O'); compileOnly=$true; success=$true; inputsUnchanged=$true
    compiler=@{ file='Framework64/v4.0.30319/csc.exe'; sha256=(Get-FileHash -LiteralPath $viewCompiler -Algorithm SHA256).Hash.ToLowerInvariant() }
    source=@{ file='server-upload/RustTestNetworkView.cs'; sha256=$viewSourceHash }
    references=@($viewInputs | ForEach-Object { @{ file=$_.file; sha256=$_.sha256 } })
    output=@{ file='RustTestNetworkView.dll'; sha256=(Get-FileHash -LiteralPath $viewDll -Algorithm SHA256).Hash.ToLowerInvariant() }
    targetServerLoaded=$false; connectionFieldsChanged=$false; publicCountChangeVerified=$false
}
[IO.File]::WriteAllText((Join-Path $viewOutput 'build-safe.json'),($viewRecord | ConvertTo-Json -Depth 6)+[Environment]::NewLine,[Text.UTF8Encoding]::new($false))
[pscustomobject]@{ success=$true; compileOnly=$true; inputsUnchanged=$true }
