[CmdletBinding()]
param(
    [ValidateSet('ProcessEnvironment', 'Clipboard')]
    [string]$InputSource = 'ProcessEnvironment'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$allowedCodes = @(
    'CLIPBOARD_INPUT_MISSING',
    'URL_PARSE_BLOCKED',
    'PROTOCOL_BLOCKED',
    'DATABASE_BLOCKED',
    'OPERATOR_BLOCKED',
    'PASSWORD_COMPONENT_MISSING',
    'DIRECT_TARGET_BLOCKED',
    'CHANNEL_BINDING_BLOCKED',
    'TLS_MODE_BLOCKED',
    'CA_BUNDLE_BLOCKED',
    'CI_MODE_BLOCKED',
    'ENVIRONMENT_BLOCKED',
    'CONFIRMATION_BLOCKED',
    'COMMIT_SHA_BLOCKED',
    'MANIFEST_BLOCKED',
    'SEQUENCE_BLOCKED',
    'UNAPPROVED_0010_BLOCKED'
)

function Stop-InputGuard {
    param([Parameter(Mandatory = $true)][string]$Code)
    if ($allowedCodes -notcontains $Code) { $Code = 'MANIFEST_BLOCKED' }
    throw [InvalidOperationException]::new($Code)
}

function Read-ConnectionInput {
    if ($InputSource -eq 'Clipboard') {
        $value = Get-Clipboard -Raw -ErrorAction SilentlyContinue
        Set-Clipboard -Value ''
        if ([string]::IsNullOrWhiteSpace($value)) { Stop-InputGuard 'CLIPBOARD_INPUT_MISSING' }
        return $value.Trim()
    }

    $value = [Environment]::GetEnvironmentVariable('DATABASE_MIGRATOR_URL', 'Process')
    if ([string]::IsNullOrWhiteSpace($value)) { Stop-InputGuard 'ENVIRONMENT_BLOCKED' }
    return $value.Trim()
}

function ConvertTo-VerifiedConnectionUri {
    param([Parameter(Mandatory = $true)][string]$Value)

    try { $uri = [Uri]::new($Value) } catch { Stop-InputGuard 'URL_PARSE_BLOCKED' }
    if ($uri.Scheme -notin @('postgres', 'postgresql')) { Stop-InputGuard 'PROTOCOL_BLOCKED' }
    if ([Uri]::UnescapeDataString($uri.AbsolutePath.Trim('/')) -ne 'neondb') { Stop-InputGuard 'DATABASE_BLOCKED' }

    $userInfoParts = $uri.UserInfo.Split(':', 2)
    if ($userInfoParts.Count -ne 2 -or [Uri]::UnescapeDataString($userInfoParts[0]) -ne 'neondb_owner') {
        Stop-InputGuard 'OPERATOR_BLOCKED'
    }
    if ([string]::IsNullOrWhiteSpace($userInfoParts[1])) { Stop-InputGuard 'PASSWORD_COMPONENT_MISSING' }
    if ([string]::IsNullOrWhiteSpace($uri.Host) -or $uri.Host -in @('localhost', '127.0.0.1', '::1') -or $uri.Host.Contains('-pooler.')) {
        Stop-InputGuard 'DIRECT_TARGET_BLOCKED'
    }

    $builder = [UriBuilder]::new($uri)
    $queryParts = [System.Collections.Generic.List[string]]::new()
    $sslModes = [System.Collections.Generic.List[string]]::new()
    $channelBindings = [System.Collections.Generic.List[string]]::new()
    foreach ($part in $builder.Query.TrimStart('?').Split('&')) {
        if ([string]::IsNullOrWhiteSpace($part)) { continue }
        $pair = $part.Split('=', 2)
        $key = [Uri]::UnescapeDataString($pair[0])
        $valuePart = if ($pair.Count -eq 2) { [Uri]::UnescapeDataString($pair[1]) } else { '' }
        if ($key.Equals('sslmode', [StringComparison]::OrdinalIgnoreCase)) {
            $sslModes.Add($valuePart)
            continue
        }
        if ($key.Equals('channel_binding', [StringComparison]::OrdinalIgnoreCase)) {
            $channelBindings.Add($valuePart)
        }
        $queryParts.Add($part)
    }
    if ($sslModes.Count -ne 1 -or $sslModes[0] -notin @('require', 'verify-full')) { Stop-InputGuard 'TLS_MODE_BLOCKED' }
    if ($channelBindings.Count -ne 1 -or $channelBindings[0] -ne 'require') { Stop-InputGuard 'CHANNEL_BINDING_BLOCKED' }

    $queryParts.Add('sslmode=verify-full')
    $builder.Query = $queryParts -join '&'
    return $builder.Uri.AbsoluteUri
}

function Assert-NonSecretInputs {
    if ($env:CI -ne 'true') { Stop-InputGuard 'CI_MODE_BLOCKED' }
    $environmentValid = $env:BANK_ENV -eq 'production' `
        -and $env:BANK_PRODUCTION_DATABASE_NAME -eq 'neondb' `
        -and $env:BANK_PRODUCTION_MIGRATION_OPERATOR_ROLE -eq 'neondb_owner' `
        -and $env:BANK_PRODUCTION_RESTORE_POINT_STATUS -eq 'EVENT_RESTORE_POINT_VERIFIED' `
        -and $env:BANK_PRODUCTION_MAINTENANCE_STATUS -eq 'EVENT_WRITES_DRAINED'
    if (-not $environmentValid) {
        Stop-InputGuard 'ENVIRONMENT_BLOCKED'
    }
    if ($env:BANK_PRODUCTION_MIGRATION_EVENT_CONFIRMATION -ne 'EXECUTE_BANKE_PRODUCTION_MIGRATION_EVENT') {
        Stop-InputGuard 'CONFIRMATION_BLOCKED'
    }
    if ($env:BANK_PRODUCTION_MIGRATION_COMMIT_SHA -notmatch '^[a-f0-9]{40}$') { Stop-InputGuard 'COMMIT_SHA_BLOCKED' }
}

function New-TemporaryCaBundle {
    try {
        $certificates = @(
            Get-ChildItem Cert:\CurrentUser\Root, Cert:\LocalMachine\Root, Cert:\CurrentUser\CA, Cert:\LocalMachine\CA -ErrorAction SilentlyContinue |
                Sort-Object Thumbprint -Unique
        )
        if ($certificates.Count -eq 0) { Stop-InputGuard 'CA_BUNDLE_BLOCKED' }
        $path = Join-Path ([IO.Path]::GetTempPath()) ('banke-production-ca-' + [guid]::NewGuid().ToString('N') + '.pem')
        $blocks = foreach ($certificate in $certificates) {
            $base64 = [Convert]::ToBase64String($certificate.RawData, [Base64FormattingOptions]::InsertLineBreaks)
            "-----BEGIN CERTIFICATE-----`n$base64`n-----END CERTIFICATE-----"
        }
        [IO.File]::WriteAllText($path, (($blocks -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))
        if (-not (Test-Path -LiteralPath $path)) { Stop-InputGuard 'CA_BUNDLE_BLOCKED' }
        return $path
    } catch [InvalidOperationException] {
        throw
    } catch {
        Stop-InputGuard 'CA_BUNDLE_BLOCKED'
    }
}

$temporaryCa = $null
$rawInput = $null
$verifiedUri = $null
$result = 'BLOCKED'
$errorCode = 'MANIFEST_BLOCKED'
$exitCode = 2

try {
    Assert-NonSecretInputs
    $rawInput = Read-ConnectionInput
    $verifiedUri = ConvertTo-VerifiedConnectionUri -Value $rawInput
    $temporaryCa = New-TemporaryCaBundle
    $env:DATABASE_MIGRATOR_URL = $verifiedUri
    $env:BANK_PRODUCTION_CA_BUNDLE = $temporaryCa

    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { Stop-InputGuard 'MANIFEST_BLOCKED' }
    $childOutput = @(& $node.Source (Join-Path $PSScriptRoot '..\database\production-migration-event.mjs') '--validation-only' 2>&1)
    $childExitCode = $LASTEXITCODE
    if ($childExitCode -ne 0) {
        $safeFailure = $childOutput | Where-Object { $_ -match '^PRODUCTION_MIGRATION_INPUT_GUARD_ERROR=([A-Z0-9_]+)$' } | Select-Object -First 1
        $safeMatch = [regex]::Match([string]$safeFailure, '^PRODUCTION_MIGRATION_INPUT_GUARD_ERROR=([A-Z0-9_]+)$')
        if ($safeMatch.Success -and $safeMatch.Groups[1].Value -in $allowedCodes) { Stop-InputGuard $safeMatch.Groups[1].Value }
        Stop-InputGuard 'MANIFEST_BLOCKED'
    }
    $childPassed = $childOutput -contains 'PRODUCTION_MIGRATION_INPUT_GUARD=PASS' `
        -and $childOutput -contains 'NETWORK_CONNECTION_ATTEMPTED=false' `
        -and $childOutput -contains 'PRODUCTION_MUTATION=false'
    if (-not $childPassed) {
        Stop-InputGuard 'MANIFEST_BLOCKED'
    }
    $result = 'PASS'
    $exitCode = 0
} catch {
    $candidate = [string]$_.Exception.Message
    $errorCode = if ($candidate -in $allowedCodes) { $candidate } else { 'MANIFEST_BLOCKED' }
} finally {
    foreach ($name in @('DATABASE_MIGRATOR_URL', 'BANK_PRODUCTION_CA_BUNDLE')) {
        Remove-Item -LiteralPath ("Env:\{0}" -f $name) -ErrorAction SilentlyContinue
    }
    $rawInput = $null
    $verifiedUri = $null
    if ($temporaryCa -and (Test-Path -LiteralPath $temporaryCa)) {
        Remove-Item -LiteralPath $temporaryCa -Force -ErrorAction SilentlyContinue
    }
}

if ($result -eq 'PASS') {
    Write-Output 'PRODUCTION_MIGRATION_INPUT_GUARD=PASS'
    Write-Output 'NETWORK_CONNECTION_ATTEMPTED=false'
    Write-Output 'PRODUCTION_MUTATION=false'
} else {
    Write-Output 'PRODUCTION_MIGRATION_INPUT_GUARD=BLOCKED'
    Write-Output ("PRODUCTION_MIGRATION_INPUT_GUARD_ERROR={0}" -f $errorCode)
    Write-Output 'NETWORK_CONNECTION_ATTEMPTED=false'
    Write-Output 'PRODUCTION_MUTATION=false'
}
exit $exitCode
