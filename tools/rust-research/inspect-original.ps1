$ErrorActionPreference = 'Stop'
$researchRoot = [IO.Path]::GetFullPath($PSScriptRoot)
Add-Type -Path (Join-Path $researchRoot 'managed\dnlib.dll')
$researchOriginals = Join-Path $researchRoot 'steam-server-files\RustDedicated_Data\Managed'
$researchRecords = @()
foreach ($researchFile in (Get-ChildItem -LiteralPath $researchOriginals -File -Filter '*.dll')) {
    $researchModule = [dnlib.DotNet.ModuleDefMD]::Load($researchFile.FullName)
    try {
        $researchAllTypes = @($researchModule.GetTypes())
        $researchSelectedTypes = @($researchAllTypes | Where-Object {
            $_.FullName -match '^(ServerMgr|ConnectionAuth|ConnectionQueue|EACServer|EACClient|Auth_Steam|Auth_EAC|EOS|EAC|Bootstrap|PlayerTick|InputState|InputMessage|ModelState)(/|$)' -or
            $_.FullName -match '^Network\.' -or
            $_.FullName -match '^ProtoBuf\.(ClientReady|Approval|Entity|BaseEntity|BaseNetworkable|BasePlayer)(/|$)' -or
            ($researchFile.Name -match 'Raknet|SteamNetworking')
        })
        $researchRecords += [ordered]@{
            assembly = $researchFile.Name
            size = $researchFile.Length
            sha256 = (Get-FileHash -LiteralPath $researchFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
            mvid = [string]$researchModule.Mvid
            references = @($researchModule.GetAssemblyRefs() | ForEach-Object { $_.FullName })
            types = @($researchSelectedTypes | ForEach-Object {
                [ordered]@{
                    name = [string]$_.FullName
                    token = $_.MDToken.Raw
                    fields = @($_.Fields | ForEach-Object { [ordered]@{ name = [string]$_.Name; type = [string]$_.FieldType; constant = $(if ($_.HasConstant) { $_.Constant.Value } else { $null }) } })
                    methods = @($_.Methods | ForEach-Object { [string]$_.FullName })
                }
            })
        }
        $researchDump = New-Object Text.StringBuilder
        foreach ($researchType in $researchAllTypes) {
            foreach ($researchMethod in $researchType.Methods) {
                if (!$researchMethod.HasBody) { continue }
                $researchFullName = [string]$researchMethod.FullName
                $researchSelected = $researchType.FullName -match '^(ConnectionAuth|ConnectionQueue|EACServer|EACClient|Auth_Steam|Auth_EAC|EOS|EAC|PlayerTick|InputState|InputMessage|ModelState)(/|$)' -or
                    $researchType.FullName -match '^ProtoBuf\.(Approval|ClientReady)(/|$)' -or
                    $researchFullName -match 'ServerMgr::(OnGiveUserInformation|ClientReady|OnNetworkMessage|OnPlayerTick|JoinGame|OpenConnection|DoHeartbeat)|BasePlayer::(OnReceivedTick|OnReceiveTick|OnServerTick|PlayerInit)|Network\..*::(Crypt|Encrypt|Decrypt|PacketID|String|UInt|BytesWithSize|WriteUInt32|OnNewConnection)|Network\.Message::.cctor|Bootstrap::.*Network' -or
                    ($researchFile.Name -match 'Raknet|SteamNetworking')
                if ($researchSelected) {
                    [void]$researchDump.AppendLine(('METHOD ' + $researchFullName + ' TOKEN ' + $researchMethod.MDToken.Raw))
                    foreach ($researchInstruction in $researchMethod.Body.Instructions) { [void]$researchDump.AppendLine([string]$researchInstruction) }
                    [void]$researchDump.AppendLine()
                }
            }
        }
        [IO.File]::WriteAllText((Join-Path $researchRoot ('original-' + $researchFile.Name + '.il.txt')), $researchDump.ToString(), [Text.Encoding]::UTF8)
        [pscustomobject]@{ assembly = $researchFile.Name; selectedTypes = $researchSelectedTypes.Count; totalTypes = $researchAllTypes.Count; ilCharacters = $researchDump.Length }
    } finally { $researchModule.Dispose() }
}
[IO.File]::WriteAllText((Join-Path $researchRoot 'original-metadata.json'), ($researchRecords | ConvertTo-Json -Depth 14), [Text.Encoding]::UTF8)
