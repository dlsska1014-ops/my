param([string]$BaseUrl = "https://ttokttok-accountbook.com")
$ErrorActionPreference = "Stop"

function Get-Result([string]$Path) {
  $response = Invoke-WebRequest -Uri ($BaseUrl.TrimEnd('/') + $Path) -Method Get -UseBasicParsing
  return [pscustomobject]@{
    Status       = $response.StatusCode
    ContentType  = $response.Headers['Content-Type']
    CacheControl = $response.Headers['Cache-Control']
    ETag         = $response.Headers['ETag']
    Content      = $response.Content
  }
}

$healthResult = Get-Result "/health"
$health = $healthResult.Content | ConvertFrom-Json
if ($healthResult.Status -ne 200 -or $health.alive -ne $true -or $health.version -ne "V22.8.50-UIUX-STAGE4-QUICK-DOCK-SAVE-FEEDBACK") {
  throw "health/version check failed"
}

$shell = Get-Result "/assets/accountbook-shell-v22850.css"
if ($shell.Status -ne 200 -or $shell.ContentType -notmatch "text/css" -or $shell.CacheControl -notmatch "immutable" -or $shell.ETag -ne '"accountbook-shell-v22850-css"' -or $shell.Content -notmatch "data-ab-quick-dock" -or $shell.Content -notmatch "abSaveFeedback") {
  throw "stage 4 shell asset check failed"
}

$v5 = Get-Result "/assets/accountbook-v5-v22850.js"
if ($v5.Status -ne 200 -or $v5.ContentType -notmatch "javascript" -or $v5.CacheControl -notmatch "immutable" -or $v5.ETag -ne '"accountbook-v5-v22850-js"' -or $v5.Content -notmatch "openAbQuickInput" -or $v5.Content -notmatch "data-ab-save-feedback" -or $v5.Content -notmatch "returnUrlForDate") {
  throw "stage 4 feedback runtime check failed"
}

$nav = Get-Result "/assets/accountbook-nav-v22850.js"
if ($nav.Status -ne 200 -or $nav.ContentType -notmatch "javascript" -or $nav.CacheControl -notmatch "immutable" -or $nav.ETag -ne '"accountbook-nav-v22850-js"' -or $nav.Content -notmatch "data-ab-quick-dock" -or $nav.Content -notmatch "data-ab-quick-open") {
  throw "stage 4 quick dock runtime check failed"
}

Write-Host "V22.8.50 UI/UX stage 4 deployment verification passed." -ForegroundColor Green
Write-Host "Manual check required: desktop dock, success day-detail return, error quick-input return, and mobile real-device layout." -ForegroundColor Yellow
