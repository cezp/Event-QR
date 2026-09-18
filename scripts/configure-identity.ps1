param(
  [string]$AppId = '8776ed2d-0a43-4f48-9935-8b57dde55715',
  [string]$ObjectId = 'ee0a6646-ccba-4fb1-bfcc-255d4c86aef5',
  [string]$SubscriptionId = '8295b712-9347-47d9-bf03-541fbb3155be'
)
$ErrorActionPreference = 'Stop'
$federated = @{
  name = 'github-production'
  issuer = 'https://token.actions.githubusercontent.com'
  subject = 'repo:cezp/Event-QR:environment:production'
  audiences = @('api://AzureADTokenExchange')
}
New-Item -ItemType Directory -Force -Path '.local' | Out-Null
$federated | ConvertTo-Json | Set-Content -LiteralPath '.local/federated.json' -Encoding utf8
$existing = az ad app federated-credential list --id $AppId --query "[?name=='github-production'].id" -o tsv
if (-not $existing) {
  az ad app federated-credential create --id $AppId --parameters '@.local/federated.json' --output none
  if ($LASTEXITCODE -ne 0) { throw 'Cannot create OIDC credential' }
}
az role assignment create --assignee-object-id $ObjectId --assignee-principal-type ServicePrincipal --role Contributor --scope "/subscriptions/$SubscriptionId/resourceGroups/rg-eventy-samychswoich" --output none
if ($LASTEXITCODE -ne 0) { throw 'Cannot assign resource-group role' }
az role assignment create --assignee-object-id $ObjectId --assignee-principal-type ServicePrincipal --role 'DNS Zone Contributor' --scope "/subscriptions/$SubscriptionId/resourceGroups/cloud-shell-storage-westeurope/providers/Microsoft.Network/dnsZones/samychswoich.pl" --output none
if ($LASTEXITCODE -ne 0) { throw 'Cannot assign DNS role' }
$env:DEPLOY_CLIENT_ID = $AppId
$env:DEPLOY_TENANT_ID = 'd68003ed-5359-4430-a421-fc65596ed4eb'
$env:DEPLOY_SUBSCRIPTION_ID = $SubscriptionId
node scripts/configure-ci.mjs
if ($LASTEXITCODE -ne 0) { throw 'Cannot configure GitHub Actions variables' }
