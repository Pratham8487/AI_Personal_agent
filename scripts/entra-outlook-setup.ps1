<#
.SYNOPSIS
  Creates the Microsoft Entra app registration behind Aster's Outlook
  integration and prints MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET.

.DESCRIPTION
  Five things have to be true before Outlook can connect, and this script does
  all of them:

    1. The Work IQ MCP server service principals exist in the tenant. They are
       NOT provisioned by default - until they are, the APIs do not even appear
       in the portal's permission picker and sign-in fails with AADSTS650052.
       App IDs are taken from Microsoft's own Enable-WorkIQToolsForTenant.ps1.
    2. An app registration exists, multi-tenant, with the callback redirect URI.
    3. It requests the delegated permissions for Mail, Calendar and Work IQ.
    4. An admin has consented to them for the whole tenant.
    5. A client secret exists.

  Idempotent: re-running reuses the existing app and only adds what is missing.
  A new secret is minted on every run, because Entra shows a secret's value
  exactly once.

.PARAMETER AppName
  Display name of the app registration. Reused if it already exists.

.PARAMETER RedirectUri
  Must exactly match where the app is served, e.g.
  https://aster.example.com/api/integrations/outlook/callback

.PARAMETER SingleTenant
  Restrict sign-in to your own tenant. Default is multi-tenant, which is what
  you want if anyone outside your organization will ever connect Outlook.

.PARAMETER ProvisionOnly
  Only do step 1 (create the Work IQ service principals) and stop.

.EXAMPLE
  ./scripts/entra-outlook-setup.ps1
  ./scripts/entra-outlook-setup.ps1 -RedirectUri https://aster.example.com/api/integrations/outlook/callback

.NOTES
  Requires the Microsoft.Graph PowerShell module and one of: Global
  Administrator, Privileged Role Administrator, or Cloud Application
  Administrator (granting tenant-wide consent needs one of the first two).

    Install-Module Microsoft.Graph -Scope CurrentUser
#>

[CmdletBinding()]
param(
    [string] $AppName     = 'Aster Outlook Integration',
    [string] $RedirectUri = 'http://localhost:3000/api/integrations/outlook/callback',
    [switch] $SingleTenant,
    [switch] $ProvisionOnly,
    [switch] $UseDeviceCode,
    [int]    $SecretValidMonths = 12
)

$ErrorActionPreference = 'Stop'

# Resource app IDs, from microsoft/work-iq Enable-WorkIQToolsForTenant.ps1.
$Resources = @(
    @{ Key = 'mail';     Name = 'Work IQ Mail (mcp_MailTools)';         AppId = '16b1878d-62c7-4009-aa25-68989d63bbad' }
    @{ Key = 'calendar'; Name = 'Work IQ Calendar (mcp_CalendarTools)'; AppId = '910333d2-47e9-43ca-981f-6df2f4531ef4' }
    @{ Key = 'workiq';   Name = 'Work IQ (universal MCP)';              AppId = 'fdcc1f02-fc51-4226-8753-f668596af7f7' }
)

$GraphAppId  = '00000003-0000-0000-c000-000000000000'
$GraphScopes = @('openid', 'profile', 'offline_access')

function Write-Step { param([string] $Text) Write-Host "`n$Text" -ForegroundColor Cyan }
function Write-Ok   { param([string] $Text) Write-Host "  $Text" -ForegroundColor Green }
function Write-Note { param([string] $Text) Write-Host "  $Text" -ForegroundColor Yellow }

if (-not (Get-Module -ListAvailable -Name Microsoft.Graph.Applications)) {
    throw "Microsoft.Graph module not found. Run: Install-Module Microsoft.Graph -Scope CurrentUser"
}

Import-Module Microsoft.Graph.Applications -ErrorAction Stop

$connect = @{
    Scopes    = 'Application.ReadWrite.All', 'DelegatedPermissionGrant.ReadWrite.All'
    NoWelcome = $true
}
if ($UseDeviceCode) { $connect['UseDeviceCode'] = $true }
Connect-MgGraph @connect

try {
    $context = Get-MgContext
    Write-Host "Tenant:  $($context.TenantId)" -ForegroundColor Green
    Write-Host "Account: $($context.Account)"  -ForegroundColor Green

    # ------------------------------------------------------------ step 1
    Write-Step 'Step 1/5  Provisioning Work IQ service principals'
    $resourceSps = @{}
    foreach ($resource in $Resources) {
        $sp = Get-MgServicePrincipal -Filter "appId eq '$($resource.AppId)'" -ErrorAction SilentlyContinue |
              Select-Object -First 1
        if ($sp) {
            Write-Ok "$($resource.Name) already present"
        } else {
            Write-Note "creating $($resource.Name)..."
            $sp = New-MgServicePrincipal -AppId $resource.AppId
            Write-Ok "$($resource.Name) created"
        }
        $resourceSps[$resource.Key] = $sp
    }

    if ($ProvisionOnly) {
        Write-Host "`nService principals are in place. Re-run without -ProvisionOnly to create the app." -ForegroundColor Green
        return
    }

    # ------------------------------------------------------------ step 2
    Write-Step 'Step 2/5  App registration'
    $audience = if ($SingleTenant) { 'AzureADMyOrg' } else { 'AzureADMultipleOrgs' }

    $app = Get-MgApplication -Filter "displayName eq '$AppName'" -ErrorAction SilentlyContinue |
           Select-Object -First 1

    if ($app) {
        Write-Ok "reusing existing app '$AppName' ($($app.AppId))"
        $uris = @($app.Web.RedirectUris)
        if ($uris -notcontains $RedirectUri) {
            $uris += $RedirectUri
            Update-MgApplication -ApplicationId $app.Id -Web @{ RedirectUris = $uris }
            Write-Ok "added redirect URI $RedirectUri"
        } else {
            Write-Ok "redirect URI already registered"
        }
    } else {
        $app = New-MgApplication -DisplayName $AppName `
                                 -SignInAudience $audience `
                                 -Web @{ RedirectUris = @($RedirectUri) }
        Write-Ok "created '$AppName' ($($app.AppId)), audience $audience"
    }

    # ------------------------------------------------------------ step 3
    Write-Step 'Step 3/5  Requesting delegated permissions'
    $required = @()
    $grants   = @{}

    foreach ($resource in $Resources) {
        $sp = $resourceSps[$resource.Key]
        # Scope names are Microsoft's to choose and have changed during
        # preview, so read them off the service principal instead of assuming.
        $scopes = @($sp.Oauth2PermissionScopes)
        if (-not $scopes -or $scopes.Count -eq 0) {
            Write-Note "$($resource.Name): exposes no delegated scopes - skipping"
            continue
        }
        $required += @{
            ResourceAppId  = $sp.AppId
            ResourceAccess = @($scopes | ForEach-Object { @{ Id = $_.Id; Type = 'Scope' } })
        }
        $grants[$resource.Key] = ($scopes | ForEach-Object { $_.Value }) -join ' '
        Write-Ok "$($resource.Name): $($grants[$resource.Key])"
    }

    $graphSp = Get-MgServicePrincipal -Filter "appId eq '$GraphAppId'" | Select-Object -First 1
    $graphScopeObjects = @($graphSp.Oauth2PermissionScopes | Where-Object { $GraphScopes -contains $_.Value })
    $required += @{
        ResourceAppId  = $GraphAppId
        ResourceAccess = @($graphScopeObjects | ForEach-Object { @{ Id = $_.Id; Type = 'Scope' } })
    }
    Write-Ok "Microsoft Graph: $($GraphScopes -join ' ')"

    Update-MgApplication -ApplicationId $app.Id -RequiredResourceAccess $required
    Write-Ok 'permissions written to the app registration'

    # ------------------------------------------------------------ step 4
    Write-Step 'Step 4/5  Granting tenant-wide admin consent'
    $appSp = Get-MgServicePrincipal -Filter "appId eq '$($app.AppId)'" -ErrorAction SilentlyContinue |
             Select-Object -First 1
    if (-not $appSp) {
        $appSp = New-MgServicePrincipal -AppId $app.AppId
        Write-Ok 'created the enterprise application (service principal)'
    }

    function Grant-Consent {
        param($ResourceSp, [string] $Scope, [string] $Label)
        if (-not $Scope) { return }
        $existing = Get-MgOauth2PermissionGrant -Filter "clientId eq '$($appSp.Id)'" -ErrorAction SilentlyContinue |
                    Where-Object { $_.ResourceId -eq $ResourceSp.Id } | Select-Object -First 1
        if ($existing) {
            $current = (($existing.Scope -split ' ' | Where-Object { $_ } | Sort-Object) -join ' ')
            $desired = (($Scope        -split ' ' | Where-Object { $_ } | Sort-Object) -join ' ')
            if ($current -eq $desired) {
                Write-Ok "$Label already consented"
            } else {
                Update-MgOauth2PermissionGrant -OAuth2PermissionGrantId $existing.Id -Scope $Scope
                Write-Ok "$Label consent updated"
            }
        } else {
            New-MgOauth2PermissionGrant -BodyParameter @{
                ClientId    = $appSp.Id
                ConsentType = 'AllPrincipals'
                ResourceId  = $ResourceSp.Id
                Scope       = $Scope
            } | Out-Null
            Write-Ok "$Label consented"
        }
    }

    foreach ($resource in $Resources) {
        if ($grants.ContainsKey($resource.Key)) {
            Grant-Consent -ResourceSp $resourceSps[$resource.Key] -Scope $grants[$resource.Key] -Label $resource.Name
        }
    }
    Grant-Consent -ResourceSp $graphSp -Scope ($GraphScopes -join ' ') -Label 'Microsoft Graph'

    # ------------------------------------------------------------ step 5
    Write-Step 'Step 5/5  Client secret'
    $secret = Add-MgApplicationPassword -ApplicationId $app.Id -PasswordCredential @{
        DisplayName = "aster-$(Get-Date -Format 'yyyyMMdd')"
        EndDateTime = (Get-Date).AddMonths($SecretValidMonths)
    }
    Write-Ok "secret created, expires $($secret.EndDateTime.ToString('yyyy-MM-dd'))"

    # ------------------------------------------------------------ output
    Write-Host "`n$('=' * 72)" -ForegroundColor Green
    Write-Host 'Paste these into ai-personal-assistant/.env.local' -ForegroundColor Green
    Write-Host "$('=' * 72)`n" -ForegroundColor Green
    Write-Host "MICROSOFT_CLIENT_ID=$($app.AppId)"
    Write-Host "MICROSOFT_CLIENT_SECRET=$($secret.SecretText)"
    Write-Host "`n$('=' * 72)" -ForegroundColor Green
    Write-Host 'The secret is shown ONCE. Copy it now.' -ForegroundColor Yellow
    Write-Host "Redirect URI registered: $RedirectUri" -ForegroundColor Yellow
    Write-Host "Secret expires: $($secret.EndDateTime.ToString('yyyy-MM-dd')) - set a reminder." -ForegroundColor Yellow
    Write-Host "`nThen run:  npm run verify:outlook" -ForegroundColor Cyan
}
finally {
    Disconnect-MgGraph | Out-Null
}
