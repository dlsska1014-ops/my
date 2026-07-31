param(
  [string]$BaseUrl = "https://ttokttok-accountbook.com"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Net.Http
$client = New-Object System.Net.Http.HttpClient
$client.Timeout = [TimeSpan]::FromSeconds(30)

function Get-Result([string]$Path) {
  $response = $client.GetAsync($BaseUrl.TrimEnd('/') + $Path).GetAwaiter().GetResult()
  $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  [pscustomobject]@{
    Path = $Path
    Status = [int]$response.StatusCode
    Body = $body
    ContentType = [string]$response.Content.Headers.ContentType
    CacheControl = [string]$response.Headers.CacheControl
  }
}

try {
  $healthResult = Get-Result "/health"
  if ($healthResult.Status -ne 200) { throw "/health HTTP $($healthResult.Status): $($healthResult.Body)" }
  $health = $healthResult.Body | ConvertFrom-Json
  if ($health.alive -ne $true -or $health.missing_count -ne 0 -or $health.version -ne "V22.8.58-CHALLENGE-ACTIVITY-UX") {
    throw "/health mismatch: $($healthResult.Body)"
  }

  $readyResult = Get-Result "/ready"
  if ($readyResult.Status -ne 200) { throw "/ready HTTP $($readyResult.Status): $($readyResult.Body)" }
  $ready = $readyResult.Body | ConvertFrom-Json
  if ($ready.ready -ne $true -or @($ready.failed_tables).Count -ne 0 -or @($ready.missing_rpcs).Count -ne 0) {
    throw "/ready mismatch: $($readyResult.Body)"
  }

  foreach ($assetCheck in @(
    @{ Path = "/assets/accountbook-shell-v22858.css"; Type = "text/css" },
    @{ Path = "/assets/accountbook-nav-v22850.js"; Type = "javascript" },
    @{ Path = "/assets/accountbook-v5-v22858.js"; Type = "javascript" }
  )) {
    $asset = Get-Result $assetCheck.Path
    if ($asset.Status -ne 200 -or $asset.ContentType -notmatch $assetCheck.Type -or $asset.CacheControl -notmatch "immutable") {
      throw "$($assetCheck.Path) mismatch: status=$($asset.Status), type=$($asset.ContentType), cache=$($asset.CacheControl)"
    }
  }

  $ads = Get-Result "/ads.txt"
  if ($ads.Status -ne 200 -or $ads.ContentType -notmatch "text/plain" -or $ads.Body.Trim() -ne "google.com, pub-8422696710972974, DIRECT, f08c47fec0942fa0") {
    throw "ads.txt mismatch"
  }

  $anonymousRail = Get-Result "/u/api/recent-transactions?month=2026-07"
  if ($anonymousRail.Status -ne 401) {
    throw "anonymous recent transaction guard mismatch: HTTP $($anonymousRail.Status)"
  }

  Write-Host "PASS: V22.8.58 challenge and activity UX"
  Write-Host "Version:" $health.version
  Write-Host "Checked RPCs:" $ready.checked_rpcs
  Write-Host "Next: verify 7-day cells, 8+ day percent mode, category SVG icons, dark mode, and 390px layout while signed in."
}
finally {
  $client.Dispose()
}
