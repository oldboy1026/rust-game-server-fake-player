param(
    [Parameter(Mandatory=$true)][string]$ReferenceDirectory,
    [string]$OutputDirectory = (Join-Path $PSScriptRoot 'dist')
)
$ErrorActionPreference='Stop'
$taskRefs=[IO.Path]::GetFullPath($ReferenceDirectory)
$taskOutput=[IO.Path]::GetFullPath($OutputDirectory)
$taskCompiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (!(Test-Path -LiteralPath $taskCompiler)) { throw '.NET Framework C# compiler not found.' }
$taskNames=@('Oxide.Core.dll','Oxide.Rust.dll','Facepunch.Console.dll','Facepunch.Network.dll')
$taskReferences=@($taskNames | ForEach-Object {
    $taskPath=Join-Path $taskRefs $_
    [ordered]@{file=$_;path=$taskPath;sha256=(Get-FileHash -LiteralPath $taskPath -Algorithm SHA256).Hash.ToLowerInvariant()}
})
$taskSources=@('Extension.cs','RuntimeAdapter.cs','Json.cs') | ForEach-Object {
    $taskPath=Join-Path $PSScriptRoot $_
    [ordered]@{file=$_;path=$taskPath;sha256=(Get-FileHash -LiteralPath $taskPath -Algorithm SHA256).Hash.ToLowerInvariant()}
}
New-Item -ItemType Directory -Force -Path $taskOutput | Out-Null
$taskDll=Join-Path $taskOutput 'Oxide.Ext.RustPresenceBridge.dll'
$taskArgs=@('/nologo','/target:library','/platform:anycpu','/optimize+','/warnaserror+',('/out:'+ $taskDll))
$taskArgs+=@($taskReferences | ForEach-Object { '/reference:'+$_.path })
$taskArgs+=@($taskSources | ForEach-Object { $_.path })
& $taskCompiler @taskArgs
if ($LASTEXITCODE -ne 0) { throw 'Compilation failed.' }
$taskAll=@($taskReferences)+@($taskSources)
foreach($taskInput in $taskAll) {
    if((Get-FileHash -LiteralPath $taskInput.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskInput.sha256) { throw 'Input changed during compilation.' }
}
$taskRecord=[ordered]@{
    version='0.1.0'; compileOnly=$true; success=$true; inputsUnchanged=$true
    compiledAt=[DateTime]::UtcNow.ToString('O')
    compiler=@{file='Framework64/v4.0.30319/csc.exe';sha256=(Get-FileHash -LiteralPath $taskCompiler -Algorithm SHA256).Hash.ToLowerInvariant()}
    references=@($taskReferences | ForEach-Object { @{file=$_.file;sha256=$_.sha256} })
    sources=@($taskSources | ForEach-Object { @{file=$_.file;sha256=$_.sha256} })
    output=@{file='Oxide.Ext.RustPresenceBridge.dll';sha256=(Get-FileHash -LiteralPath $taskDll -Algorithm SHA256).Hash.ToLowerInvariant();bytes=(Get-Item -LiteralPath $taskDll).Length}
    serverLoaded=$false; publicCountChangeVerified=$false
}
[IO.File]::WriteAllText((Join-Path $taskOutput 'build.json'),($taskRecord | ConvertTo-Json -Depth 6)+[Environment]::NewLine,[Text.UTF8Encoding]::new($false))
$taskRecord.output
