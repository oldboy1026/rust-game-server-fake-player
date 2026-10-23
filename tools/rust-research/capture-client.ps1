param(
    [Parameter(Mandatory = $true)][string]$RustDirectory,
    [ValidateRange(10, 900)][int]$DurationSeconds = 90,
    [int]$RustProcessId = 0,
    [string]$GameServerIp = '',
    [string]$UserStage = 'not specified',
    [string]$OutputDirectory = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path $repoRoot ('captures\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
}
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$allowedRoots = @('captures', 'work') | ForEach-Object { (Join-Path $repoRoot $_) + [IO.Path]::DirectorySeparatorChar }
if (-not ($allowedRoots | Where-Object { $OutputDirectory.StartsWith($_, [StringComparison]::OrdinalIgnoreCase) })) {
    throw 'Raw observations must be saved inside the repository captures/ or work/ directory.'
}
if ((Test-Path -LiteralPath $OutputDirectory) -and (Get-ChildItem -LiteralPath $OutputDirectory -Force | Select-Object -First 1)) {
    throw 'Choose a new or empty output directory so observations cannot be mixed or overwritten.'
}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'pktmon requires administrator privileges.' }
$status = (& pktmon status 2>&1 | Out-String)
if ($status -notmatch '(?i)not running|没有运行|未运行') { throw 'pktmon may already be running; existing sessions were left alone.' }
$filters = (& pktmon filter list 2>&1 | Out-String)
if ($filters -notmatch '(?im)^\s*(none|无)\s*$') { throw 'Existing pktmon filters found; review them before capturing.' }
if (-not $RustProcessId) {
    $processes = @(Get-Process -Name RustClient -ErrorAction Stop)
    if ($processes.Count -ne 1) { throw 'Specify RustProcessId when more than one Rust client exists.' }
    $RustProcessId = $processes[0].Id
}
if ((Get-Process -Id $RustProcessId).ProcessName -ne 'RustClient') { throw 'The selected PID is not RustClient.' }
$logPath = Join-Path $RustDirectory 'output_log.txt'
if (-not $GameServerIp -and (Test-Path -LiteralPath $logPath)) {
    $matches = [regex]::Matches((Get-Content -LiteralPath $logPath -Raw), 'Connecting:\s+(\d{1,3}(?:\.\d{1,3}){3}):\d+\s+\(Raknet\)', 'IgnoreCase')
    if ($matches.Count) { $GameServerIp = $matches[$matches.Count - 1].Groups[1].Value }
}
if ($GameServerIp) {
    $parsedIp = $null
    if (-not [Net.IPAddress]::TryParse($GameServerIp, [ref]$parsedIp)) { throw 'GameServerIp must be a literal IP address.' }
}

function Save-EndpointSnapshot([string]$Name) {
    $udp = @(Get-NetUDPEndpoint -OwningProcess $RustProcessId -ErrorAction SilentlyContinue |
        Select-Object LocalAddress, LocalPort, CreationTime, OwningProcess)
    $tcp = @(Get-NetTCPConnection -OwningProcess $RustProcessId -ErrorAction SilentlyContinue |
        Select-Object LocalAddress, LocalPort, RemoteAddress, RemotePort, State, CreationTime, OwningProcess)
    $snapshot = [ordered]@{ observedAt = (Get-Date -Format o); processId = $RustProcessId; udp = $udp; tcp = $tcp }
    $snapshot | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $OutputDirectory $Name) -Encoding UTF8
    return $snapshot
}

function Save-OptionalLog([string]$Name) {
    if (Test-Path -LiteralPath $logPath) {
        try { Copy-Item -LiteralPath $logPath -Destination (Join-Path $OutputDirectory $Name) }
        catch { Write-Warning ('Could not snapshot the client log; capture processing will continue. ' + $_.Exception.Message) }
    }
}

$initial = Save-EndpointSnapshot 'endpoints-start.json'
Save-OptionalLog 'output-log-start.txt'
$selectedUdp = @($initial.udp | Sort-Object CreationTime -Descending | Select-Object -First 24 -ExpandProperty LocalPort -Unique)
$selectedTcp = @($initial.tcp | Where-Object { $_.RemoteAddress -notin @('0.0.0.0', '::', '127.0.0.1', '::1') } |
    Select-Object -ExpandProperty LocalPort -Unique | Select-Object -First 7)
$names = [Collections.Generic.List[string]]::new()
$started = $false
$stopConfirmed = $false
$cleanupErrors = [Collections.Generic.List[string]]::new()
$metadata = [ordered]@{
    startedAt = $null; stoppedAt = $null; requestedSeconds = $DurationSeconds; processId = $RustProcessId
    userStage = $UserStage; gameServerIpFromLogOrArgument = $GameServerIp
    selectedUdpPorts = $selectedUdp; selectedTcpPorts = $selectedTcp
    allUdpSocketCount = $initial.udp.Count; packetSnapshotBytes = 0; components = 'nics'
    scope = 'Game-server IP plus selected existing Rust socket ports. pktmon has no PID filter; this is not complete process attribution. New sockets and loopback may be absent.'
    capacityLimit = 'Best-effort visible ETL length check at 256 MiB; ETW buffering/allocation can exceed this. Duration is the primary bound; multi-file segment size is not a total limit.'
    stopReason = $null; stopConfirmed = $false; cleanupErrors = @()
}
try {
    if ($GameServerIp) {
        $name = 'RustObservationGame'
        & pktmon filter add $name -i $GameServerIp | Out-Null
        if ($LASTEXITCODE) { throw 'Could not add game-server filter.' }
        $names.Add($name)
    }
    foreach ($port in $selectedUdp) {
        $name = 'RustObservationU' + $port
        & pktmon filter add $name -t UDP -p $port | Out-Null
        if ($LASTEXITCODE) { throw 'Could not add UDP filter.' }
        $names.Add($name)
    }
    foreach ($port in $selectedTcp) {
        $name = 'RustObservationT' + $port
        & pktmon filter add $name -t TCP -p $port | Out-Null
        if ($LASTEXITCODE) { throw 'Could not add TCP filter.' }
        $names.Add($name)
    }
    if (-not $names.Count) { throw 'No attributable endpoints found; refusing an unfiltered capture.' }
    $startOutput = & pktmon start --capture --comp nics --pkt-size 0 --log-mode multi-file --file-size 128 --file-name (Join-Path $OutputDirectory 'rust.etl') 2>&1
    if ($LASTEXITCODE) { throw 'pktmon start failed.' }
    $started = $true
    try { $startOutput | Set-Content -LiteralPath (Join-Path $OutputDirectory 'pktmon-start.txt') -Encoding UTF8 }
    catch { Write-Warning 'Could not write the startup log; capture cleanup remains enabled.' }
    $metadata.startedAt = Get-Date -Format o
    $metadata | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'session.json') -Encoding UTF8
    Write-Output ('Capture started: ' + $OutputDirectory)
    $timer = [Diagnostics.Stopwatch]::StartNew()
    while ($timer.Elapsed.TotalSeconds -lt $DurationSeconds) {
        Start-Sleep -Seconds 1
        if (-not (Get-Process -Id $RustProcessId -ErrorAction SilentlyContinue)) { $metadata.stopReason = 'client exited'; break }
        $size = (Get-ChildItem -LiteralPath $OutputDirectory -Filter '*.etl' | Measure-Object Length -Sum).Sum
        if ($size -ge 256MB) { $metadata.stopReason = 'best-effort visible ETL size threshold'; break }
    }
    if (-not $metadata.stopReason) { $metadata.stopReason = 'requested duration reached' }
} finally {
    if ($started) {
        try { & pktmon counters | Set-Content -LiteralPath (Join-Path $OutputDirectory 'pktmon-counters.txt') -Encoding UTF8 }
        catch { Write-Warning 'Could not write counters; stopping the capture will still be attempted.' }
        try {
            $stopOutput = & pktmon stop 2>&1
            if ($LASTEXITCODE -ne 0) { $cleanupErrors.Add('pktmon stop returned a failure status.') }
            else { $stopConfirmed = $true }
            try { $stopOutput | Set-Content -LiteralPath (Join-Path $OutputDirectory 'pktmon-stop.txt') -Encoding UTF8 }
            catch { Write-Warning 'Could not write the stop log; filter cleanup will still be attempted.' }
        } catch { $cleanupErrors.Add('pktmon stop failed: ' + $_.Exception.Message) }
    }
    foreach ($name in $names) {
        try {
            & pktmon filter remove $name | Out-Null
            if ($LASTEXITCODE -ne 0) { $cleanupErrors.Add('Could not remove filter: ' + $name) }
        } catch { $cleanupErrors.Add('Filter cleanup failed: ' + $name) }
    }
    if ($stopConfirmed) { $metadata.stoppedAt = Get-Date -Format o }
    $metadata.stopConfirmed = $stopConfirmed
    $metadata.cleanupErrors = @($cleanupErrors.ToArray())
    try { $metadata | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'session.json') -Encoding UTF8 }
    catch { Write-Warning 'Could not update session.json; inspect pktmon status directly.' }
}
if ($cleanupErrors.Count) { throw ($cleanupErrors -join ' ') }
try { $null = Save-EndpointSnapshot 'endpoints-end.json' }
catch { Write-Warning 'Could not save final endpoints; conversion will still be attempted.' }
Save-OptionalLog 'output-log-end.txt'
foreach ($etl in Get-ChildItem -LiteralPath $OutputDirectory -Filter '*.etl') {
    & pktmon etl2pcap $etl.FullName --out ([IO.Path]::ChangeExtension($etl.FullName, '.pcapng')) |
        Add-Content -LiteralPath (Join-Path $OutputDirectory 'conversion.txt') -Encoding UTF8
    if ($LASTEXITCODE) { throw 'ETL to pcapng conversion failed; raw ETL preserved.' }
}
Write-Output ('Capture completed: ' + $metadata.stopReason)
