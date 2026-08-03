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
  if ($health.alive -ne $true -or $health.missing_count -ne 0 -or $health.version -ne "V22.8.69-KAKAO-MEMO-REPEAT-FIX") {
    throw "/health mismatch: $($healthResult.Body)"
  }

  $readyResult = Get-Result "/ready"
  if ($readyResult.Status -ne 200) { throw "/ready HTTP $($readyResult.Status): $($readyResult.Body)" }
  $ready = $readyResult.Body | ConvertFrom-Json
  if ($ready.ready -ne $true -or @($ready.failed_tables).Count -ne 0 -or @($ready.missing_rpcs).Count -ne 0 -or $ready.checked_rpcs -ne 17) {
    throw "/ready mismatch: $($readyResult.Body)"
  }

  foreach ($assetCheck in @(
    @{ Path = "/assets/accountbook-shell-v22868.css"; Type = "text/css" },
    @{ Path = "/assets/accountbook-nav-v22862.js"; Type = "javascript" },
    @{ Path = "/assets/accountbook-v5-v22861.js"; Type = "javascript" }
  )) {
    $asset = Get-Result $assetCheck.Path
    if ($asset.Status -ne 200 -or $asset.ContentType -notmatch $assetCheck.Type -or $asset.CacheControl -notmatch "immutable") {
      throw "$($assetCheck.Path) mismatch: status=$($asset.Status), type=$($asset.ContentType), cache=$($asset.CacheControl)"
    }
  }

  foreach ($iconCheck in @(
    @{ Path = "/favicon.ico"; Type = "image/x-icon" },
    @{ Path = "/apple-touch-icon.png"; Type = "image/png" },
    @{ Path = "/apple-touch-icon-precomposed.png"; Type = "image/png" },
    @{ Path = "/icon-192.png"; Type = "image/png" },
    @{ Path = "/icon-512.png"; Type = "image/png" },
    @{ Path = "/manifest.json"; Type = "application/manifest\+json" }
  )) {
    $icon = Get-Result $iconCheck.Path
    if ($icon.Status -ne 200 -or $icon.ContentType -notmatch [regex]::Escape($iconCheck.Type)) {
      throw "$($iconCheck.Path) mismatch: status=$($icon.Status), type=$($icon.ContentType)"
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

  Write-Host "PASS: V22.8.69 kakao memo and repeat guard"
  Write-Host "Version:" $health.version
  Write-Host "Checked RPCs:" $ready.checked_rpcs
  Write-Host "Next: in KakaoTalk send 자동차점검 6만원 and 타이어교체 15만원, then confirm both are saved with the memo text unchanged."
}
finally {
  $client.Dispose()
}
