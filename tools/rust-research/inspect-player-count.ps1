param(
    [Parameter(Mandatory = $true)][string]$ManagedDirectory,
    [Parameter(Mandatory = $true)][string]$DnlibPath,
    [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = 'Stop'
# dnlib parses game assemblies as data; no game assembly is loaded for execution.
Add-Type -Path (Resolve-Path -LiteralPath $DnlibPath).Path
$researchTargets = @(
    @{ Assembly = 'Assembly-CSharp.dll'; Type = 'BasePlayer'; Method = 'PlayerInit' },
    @{ Assembly = 'Assembly-CSharp.dll'; Type = 'ServerMgr'; Method = 'StartSteamServer' },
    @{ Assembly = 'Assembly-CSharp.dll'; Type = 'ServerMgr'; Method = 'UpdateServerInformation' },
    @{ Assembly = 'Assembly-CSharp.dll'; Type = 'Auth_Steam/<Run>d__1'; Method = 'MoveNext' },
    @{ Assembly = 'Rust.Platform.Steam.dll'; Type = 'Rust.Platform.Steam.SteamPlatform'; Method = 'BeginPlayerSession' },
    @{ Assembly = 'Rust.Platform.Steam.dll'; Type = 'Rust.Platform.Steam.SteamPlatform'; Method = 'UpdatePlayerSession' },
    @{ Assembly = 'Rust.Platform.Steam.dll'; Type = 'Rust.Platform.Steam.SteamPlatform'; Method = 'EndPlayerSession' },
    @{ Assembly = 'Facepunch.Steamworks.Win64.dll'; Type = 'Steamworks.SteamServer'; Method = 'UpdatePlayer' },
    @{ Assembly = 'Facepunch.Steamworks.Win64.dll'; Type = 'Steamworks.ISteamGameServer'; Method = 'BUpdateUserData' }
)
$researchPattern = 'activePlayerList|ListHashSet.*::Add|UpdateServerInformation|InvokeRepeating|cp\{1\}|set_GameTags|censorplayerlist|BeginPlayerSession|UpdatePlayerSession|EndPlayerSession|SteamServer::(BeginAuthSession|UpdatePlayer|EndSession)|BUpdateUserData'
$researchModules = @()
foreach ($researchName in @($researchTargets.Assembly | Select-Object -Unique)) {
    $researchPath = Join-Path $ManagedDirectory $researchName
    $researchModule = [dnlib.DotNet.ModuleDefMD]::Load($researchPath)
    try {
        $researchMethods = @()
        foreach ($researchTarget in @($researchTargets | Where-Object { $_.Assembly -eq $researchName })) {
            $researchType = $researchModule.Find($researchTarget.Type, $false)
            if (!$researchType) { throw "Missing type: $($researchTarget.Type)" }
            $researchMatches = @($researchType.Methods | Where-Object { $_.Name -eq $researchTarget.Method -and $_.HasBody })
            if ($researchMatches.Count -ne 1) { throw "Method selection is ambiguous or missing: $($researchTarget.Type)::$($researchTarget.Method)" }
            $researchMethod = $researchMatches[0]
            $researchInstructions = $researchMethod.Body.Instructions
            $researchIndices = New-Object 'System.Collections.Generic.SortedSet[int]'
            for ($researchIndex = 0; $researchIndex -lt $researchInstructions.Count; $researchIndex++) {
                if ([string]$researchInstructions[$researchIndex] -notmatch $researchPattern) { continue }
                $researchFirst = [Math]::Max(0, $researchIndex - 4)
                $researchLast = [Math]::Min($researchInstructions.Count - 1, $researchIndex + 3)
                for ($researchContext = $researchFirst; $researchContext -le $researchLast; $researchContext++) {
                    [void]$researchIndices.Add($researchContext)
                }
            }
            $researchMethods += [ordered]@{
                method = [string]$researchMethod.FullName
                metadataToken = ('0x{0:x8}' -f $researchMethod.MDToken.Raw)
                instructionCount = $researchInstructions.Count
                selectedInstructions = @($researchIndices | ForEach-Object {
                    [ordered]@{ index = $_; il = [string]$researchInstructions[$_] }
                })
            }
        }
        $researchModules += [ordered]@{
            assembly = $researchName
            sha256 = (Get-FileHash -LiteralPath $researchPath -Algorithm SHA256).Hash.ToLowerInvariant()
            mvid = [string]$researchModule.Mvid
            size = (Get-Item -LiteralPath $researchPath).Length
            methods = $researchMethods
        }
    } finally { $researchModule.Dispose() }
}
$researchResult = [ordered]@{
    generatedAt = [DateTime]::UtcNow.ToString('o')
    scope = 'Static player-count publication evidence; no player login or live server administration.'
    provenance = [ordered]@{ appId = 258550; depotId = 258551; manifestId = '93946663446561466'; parser = 'dnlib 4.5.0' }
    limitation = 'The manifest identifies the research download, not independently verified binaries on the target server. Native SDK player-count behavior and Rust client browser field selection are not established by these excerpts.'
    modules = $researchModules
}
[IO.File]::WriteAllText([IO.Path]::GetFullPath($OutputPath), ($researchResult | ConvertTo-Json -Depth 12), (New-Object Text.UTF8Encoding($false)))
Write-Output "Saved static evidence for $($researchModules.Count) modules."
