$ErrorActionPreference = 'Stop'

$keys = Get-UninstallRegistryKey -SoftwareName 'Skriuw*'

if ($keys.Count -eq 1) {
  $key = $keys[0]
  Uninstall-ChocolateyPackage -PackageName $env:ChocolateyPackageName -FileType 'msi' `
    -SilentArgs "$($key.PSChildName) /qn /norestart" -File '' -ValidExitCodes @(0, 3010, 1605, 1614, 1641)
} elseif ($keys.Count -eq 0) {
  Write-Warning "$env:ChocolateyPackageName has already been uninstalled by other means."
} else {
  Write-Warning "$($keys.Count) matches found; refusing to uninstall automatically."
  $keys | ForEach-Object { Write-Warning "- $($_.DisplayName)" }
}
