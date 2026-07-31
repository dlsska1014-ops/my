param(
  [string]$BaseUrl = "https://ttokttok-accountbook.com"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Net.Http
$client = New-Object System.Net.Http.HttpClient
$client.Timeout = [TimeSpan]::FromSeconds(30)

function Get-Result([string]$Path, [string]$Method = "GET") {
  $uri = $BaseUrl.TrimEnd('/') + $Path
  if ($Method -eq "HEAD") {
    $request = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Head, $uri)
    try { $response = $client.SendAsync($request).GetAwaiter().GetResult() }
    finally { $request.Dispose() }
  }
  else {
    $response = $client.GetAsync($uri).GetAwaiter().GetResult()
  }
  try {
    $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    [pscustomobject]@{
      Path = $Path
      Status = [int]$response.StatusCode
      Body = $body
      ContentType = [string]$response.Content.Headers.ContentType
      CacheControl = [string]$response.Headers.CacheControl
    }
  }
  finally { $response.Dispose() }
}

try {
  $healthResult = Get-Result "/health"
  if ($healthResult.Status -ne 200) { throw "/health HTTP $($healthResult.Status): $($healthResult.Body)" }
  $health = $healthResult.Body | ConvertFrom-Json
  if ($health.alive -ne $true -or $health.missing_count -ne 0 -or $health.version -ne "V22.8.60-FUNCTIONAL-UI-RELIABILITY") {
    throw "/health mismatch: $($healthResult.Body)"
  }

  $readyResult = Get-Result "/ready"
  if ($readyResult.Status -ne 200) { throw "/ready HTTP $($readyResult.Status): $($readyResult.Body)" }
  $ready = $readyResult.Body | ConvertFrom-Json
  if ($ready.ready -ne $true -or @($ready.failed_tables).Count -ne 0 -or @($ready.missing_rpcs).Count -ne 0 -or $ready.checked_rpcs -ne 17) {
    throw "/ready mismatch: $($readyResult.Body)"
  }

  foreach ($assetCheck in @(
    @{ Path = "/assets/accountbook-shell-v22860.css"; Type = "text/css" },
    @{ Path = "/assets/accountbook-nav-v22860.js"; Type = "javascript" },
    @{ Path = "/assets/accountbook-v5-v22860.js"; Type = "javascript" }
  )) {
    $asset = Get-Result $assetCheck.Path
    if ($asset.Status -ne 200 -or $asset.ContentType -notmatch $assetCheck.Type -or $asset.CacheControl -notmatch "immutable") {
      throw "$($assetCheck.Path) mismatch: status=$($asset.Status), type=$($asset.ContentType), cache=$($asset.CacheControl)"
    }
  }

  foreach ($headPath in @("/", "/ads.txt")) {
    $head = Get-Result $headPath "HEAD"
    if ($head.Status -ne 200 -or $head.Body.Length -ne 0) { throw "HEAD $headPath mismatch: HTTP $($head.Status)" }
  }

  $login = Get-Result "/my"
  if ($login.Status -ne 200 -or $login.Body -notmatch "새 계정 만들기") { throw "account login/signup page mismatch" }

  $anonymousRail = Get-Result "/u/api/recent-transactions?month=2026-07"
  if ($anonymousRail.Status -ne 401) { throw "anonymous recent transaction guard mismatch: HTTP $($anonymousRail.Status)" }

  Write-Host "PASS: V22.8.60 functional UI reliability"
  Write-Host "Version:" $health.version
  Write-Host "Checked RPCs:" $ready.checked_rpcs
  Write-Host "Next: verify 7-to-8 day challenge inline save and one account create/sign-out/sign-in flow."
}
finally {
  $client.Dispose()
}
