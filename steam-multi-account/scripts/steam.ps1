param(
    [Parameter(Position=0)]
    [ValidateSet('list','status','login','connect','logout','remove','stop')]
    [string]$Action = 'list',
    [Parameter(Position=1)] [string]$Id,
    [string]$BaseUrl = 'http://127.0.0.1:3210',
    [string]$DataDirectory
)
$ErrorActionPreference = 'Stop'
if (-not $DataDirectory) {
    if ($env:STEAM_DATA_DIR) { $DataDirectory = $env:STEAM_DATA_DIR }
    else { $DataDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) 'data' }
}
if ($Action -notin @('list','stop') -and $Id -notmatch '^[a-zA-Z0-9_-]{1,64}$') {
    throw 'Supply an account id using letters, numbers, _ or - (1-64 characters).'
}
$apiKey = (Get-Content -LiteralPath (Join-Path $DataDirectory 'api-key.txt') -Raw).Trim()
$headers = @{ Authorization = "Bearer $apiKey" }
function Invoke-SteamApi([string]$Method, [string]$Path, $Body) {
    $parameters = @{ Method=$Method; Uri="$BaseUrl$Path"; Headers=$headers; TimeoutSec=15 }
    if ($null -ne $Body) {
        $parameters.ContentType = 'application/json; charset=utf-8'
        $parameters.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Compress))
    }
    Invoke-RestMethod @parameters
}
switch ($Action) {
    'stop' { Invoke-SteamApi 'POST' '/v1/service/shutdown' @{} | ConvertTo-Json }
    'list' { Invoke-SteamApi 'GET' '/v1/accounts' $null | ConvertTo-Json -Depth 6 }
    'status' { Invoke-SteamApi 'GET' "/v1/accounts/$Id" $null | ConvertTo-Json -Depth 6 }
    'connect' { Invoke-SteamApi 'POST' "/v1/accounts/$Id/login" @{} | ConvertTo-Json -Depth 6 }
    'logout' { Invoke-SteamApi 'POST' "/v1/accounts/$Id/logout" @{} | ConvertTo-Json -Depth 6 }
    'remove' { Invoke-SteamApi 'DELETE' "/v1/accounts/$Id" $null | ConvertTo-Json -Depth 6 }
    'login' {
        $accountName = Read-Host 'Steam account name (not display name)'
        $securePassword = Read-Host 'Steam password' -AsSecureString
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
        try {
            $body = @{ accountName=$accountName; password=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
            $null = Invoke-SteamApi 'POST' "/v1/accounts/$Id/login" $body
        } finally {
            if ($body) { $body.password = $null }
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
            $securePassword.Dispose()
        }
        Write-Host 'Login started. Waiting up to 180 seconds; Ctrl+C stops polling, not the server login.'
        $deadline = (Get-Date).AddSeconds(180)
        do {
            $account = Invoke-SteamApi 'GET' "/v1/accounts/$Id" $null
            if ($account.state -eq 'guard_required') {
                if ($account.guard.retryAfterSeconds -gt 0) {
                    Write-Host 'Previous mobile code was incorrect. Wait for a new code.'
                    Start-Sleep -Seconds $account.guard.retryAfterSeconds
                }
                Write-Host "Steam Guard: $($account.guard.type) $($account.guard.emailDomain)"
                $code = Read-Host 'Enter five-character Steam Guard code'
                $null = Invoke-SteamApi 'POST' "/v1/accounts/$Id/guard" @{ code=$code }
                $code = $null
            } elseif ($account.state -in @('online','error','offline')) {
                $account | ConvertTo-Json -Depth 6
                return
            }
            Start-Sleep -Seconds 2
        } while ((Get-Date) -lt $deadline)
        Write-Host "Still connecting. Check later: .\scripts\steam.ps1 status $Id"
        $account | ConvertTo-Json -Depth 6
    }
}
