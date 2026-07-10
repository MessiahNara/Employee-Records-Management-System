# Show LAN IP and URLs for Record Management System
$ips = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object {
    $_.IPAddress -notlike '127.*' -and
    $_.IPAddress -notlike '169.*' -and
    $_.PrefixOrigin -ne 'WellKnown'
  }

if (-not $ips -or $ips.Count -eq 0) {
  Write-Host 'No LAN IPv4 address found.' -ForegroundColor Red
  exit 1
}

$ip = $ips[0].IPAddress

Write-Host "Your LAN IP: $ip" -ForegroundColor Cyan
Write-Host ''
Write-Host "Frontend (Vite HTTPS):   https://${ip}:5174/" -ForegroundColor Green
Write-Host "Backend (API):           http://${ip}:5000/" -ForegroundColor Green
Write-Host ''
Write-Host 'If you want to open firewall ports automatically, run this script as Administrator.'

# Open firewall ports if running as admin
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object System.Security.Principal.WindowsPrincipal -ArgumentList $identity
$isAdmin = $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)

if ($isAdmin) {
  Write-Host 'Opening firewall ports 5174 and 5000 for LAN access...' -ForegroundColor Yellow
  New-NetFirewallRule -DisplayName 'RecordMS Frontend 5174' -Direction Inbound -LocalPort 5174 -Protocol TCP -Action Allow -Profile Private -ErrorAction SilentlyContinue
  New-NetFirewallRule -DisplayName 'RecordMS Backend 5000' -Direction Inbound -LocalPort 5000 -Protocol TCP -Action Allow -Profile Private -ErrorAction SilentlyContinue
  Write-Host 'Firewall rules added (if not already present).' -ForegroundColor Green
}
else {
  Write-Host 'Run PowerShell as Administrator to auto-open firewall ports if needed.' -ForegroundColor Yellow
}
