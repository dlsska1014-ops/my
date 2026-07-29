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
    ETag = [string]$response.Headers.ETag
  }
}

try {
  $healthResult = Get-Result "/health"
  if ($healthResult.Status -ne 200) { throw "/health HTTP $($healthResult.Status): $($healthResult.Body)" }
  $health = $healthResult.Body | ConvertFrom-Json
  if ($health.alive -ne $true -or $health.missing_count -ne 0 -or $health.version -ne "V22.8.45-MEMBER-ROLE-SAFE-UPDATE") { throw "/health mismatch: $($healthResult.Body)" }

  $readyResult = Get-Result "/ready"
  if ($readyResult.Status -ne 200) { throw "/ready HTTP $($readyResult.Status): $($readyResult.Body)" }
  $ready = $readyResult.Body | ConvertFrom-Json
  if ($ready.ready -ne $true -or @($ready.failed_tables).Count -ne 0 -or @($ready.missing_rpcs).Count -ne 0) { throw "/ready mismatch: $($readyResult.Body)" }

  $shell = Get-Result "/assets/accountbook-shell-v22844.css"
  if ($shell.Status -ne 200 -or $shell.ContentType -notmatch "text/css" -or $shell.CacheControl -notmatch "immutable" -or $shell.ETag -ne '"accountbook-shell-v22844-css"') { throw "shell asset mismatch" }

  $ads = Get-Result "/ads.txt"
  if ($ads.Status -ne 200 -or $ads.ContentType -notmatch "text/plain" -or $ads.Body.Trim() -ne "google.com, pub-8422696710972974, DIRECT, f08c47fec0942fa0") { throw "ads.txt mismatch" }

  foreach ($check in @(
    @{ Path = "/kakao-skill-test-payload.json"; Status = 404 },
    @{ Path = "/cron/recurring/apply?key=v22845-no-secret"; Status = 404 },
    @{ Path = "/ops-snapshot.json?key=v22845-no-secret"; Status = 401 }
  )) {
    $result = Get-Result $check.Path
    if ($result.Status -ne $check.Status) { throw "$($check.Path) expected $($check.Status), actual $($result.Status): $($result.Body)" }
  }

  Write-Host "PASS: V22.8.45 member role safe update"
  Write-Host "Version:" $health.version
  Write-Host "Checked RPCs:" $ready.checked_rpcs
}
finally {
  $client.Dispose()
}
