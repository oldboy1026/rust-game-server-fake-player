$ErrorActionPreference = 'Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'managed\dnlib.dll')
$researchFile = Join-Path $PSScriptRoot 'steam-server-files\RustDedicated_Data\Managed\Assembly-CSharp-firstpass.dll'
$researchModule = [dnlib.DotNet.ModuleDefMD]::Load($researchFile)
try {
    $researchEnums = @($researchModule.GetTypes() | Where-Object { $_.FullName -in @('Epic.OnlineServices.ExternalCredentialType', 'Epic.OnlineServices.AntiCheatCommon.AntiCheatCommonClientAuthStatus', 'Epic.OnlineServices.AntiCheatCommon.AntiCheatCommonClientType') } | ForEach-Object {
        [ordered]@{ name = [string]$_.FullName; values = @($_.Fields | Where-Object { $_.HasConstant } | ForEach-Object { [ordered]@{ name = [string]$_.Name; value = $_.Constant.Value } }) }
    })
    $researchEnums | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'sdk-enums.json') -Encoding UTF8
    $researchEnums | ConvertTo-Json -Depth 6
} finally { $researchModule.Dispose() }
