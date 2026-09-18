targetScope = 'resourceGroup'
@description('Region for managed API and stored data. Static assets use Azure edge.')
param location string = 'westeurope'
@description('Global administrator Microsoft account email.')
param bootstrapAdminEmail string
@allowed(['Free', 'Standard'])
param hostingPlan string = 'Free'
param appName string = 'swa-eventy-samychswoich'
param storageName string = concat('steventy', uniqueString(resourceGroup().id))

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true
    publicNetworkAccess: 'Enabled'
    accessTier: 'Hot'
    encryption: {
      services: {
        table: { keyType: 'Account' }
        blob: { keyType: 'Account' }
      }
      keySource: 'Microsoft.Storage'
      requireInfrastructureEncryption: true
    }
  }
  tags: { application: 'Event-QR', owner: 'Samych Swoich', dataRegion: location }
}
resource tables 'Microsoft.Storage/storageAccounts/tableServices@2023-05-01' = {
  parent: storage
  name: 'default'
}
resource table 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = {
  parent: tables
  name: 'eventqr'
}
resource blobs 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    deleteRetentionPolicy: { enabled: true, days: 14 }
    containerDeleteRetentionPolicy: { enabled: true, days: 14 }
  }
}
resource backups 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobs
  name: 'backups'
  properties: { publicAccess: 'None' }
}
resource site 'Microsoft.Web/staticSites@2023-12-01' = {
  name: appName
  location: location
  sku: { name: hostingPlan, tier: hostingPlan }
  properties: { allowConfigFileUpdates: true }
  tags: { application: 'Event-QR', owner: 'Samych Swoich', environment: 'production' }
}
resource appSettings 'Microsoft.Web/staticSites/config@2023-12-01' = {
  parent: site
  name: 'appsettings'
  properties: {
    STORAGE_CONNECTION_STRING: concat('DefaultEndpointsProtocol=https;AccountName=', storage.name, ';AccountKey=', storage.listKeys().keys[0].value, ';EndpointSuffix=', environment().suffixes.storage)
    BOOTSTRAP_ADMIN_EMAIL: bootstrapAdminEmail
  }
}
output siteName string = site.name
output siteHostname string = site.properties.defaultHostname
output storageAccountName string = storage.name
output resourceGroupName string = resourceGroup().name
