param([string]$BaseUrl = 'http://127.0.0.1:3210')
$ErrorActionPreference = 'Stop'
$localUri = [Uri]$BaseUrl
if ($localUri.Scheme -ne 'http' -or $localUri.Host -notin @('127.0.0.1','localhost')) {
    throw 'Only the local loopback dashboard can be opened with this key.'
}
$projectRoot = Split-Path $PSScriptRoot -Parent
$dataDirectory = if ($env:STEAM_DATA_DIR) { $env:STEAM_DATA_DIR } else { Join-Path $projectRoot 'data' }
$apiKey = (Get-Content -LiteralPath (Join-Path $dataDirectory 'api-key.txt') -Raw).Trim()
if ($apiKey -notmatch '^[a-f0-9]{64}$') { throw 'Invalid local API key.' }
Start-Process -FilePath ($BaseUrl.TrimEnd('/') + '/#key=' + $apiKey)
