# Data Model: 條碼掃描價格比較

**Date**: 2025-01-27  
**Feature**: Barcode Price Comparison  
**Branch**: 001-barcode-price-comparison

## Core Entities

### Product (商品)
Represents a scanned product with barcode identification.

**Fields**:
- `id`: string (generated from barcode + product name + store name hash)
- `barcode`: string (EAN-13, UPC-A, etc.)
- `name`: string (product name)
- `brand`: string (product brand)
- `image`: string (product image URL, optional)
- `specifications`: string (product specifications, optional)
- `category`: string (product category, optional)
- `createdAt`: timestamp
- `updatedAt`: timestamp

**Validation Rules**:
- `barcode` must be valid format (EAN-13, UPC-A)
- `name` is required, minimum 2 characters
- `brand` is optional but recommended
- `id` must be unique across system

**Relationships**:
- One-to-many with PriceRecord
- One-to-many with ScanHistory

### PriceRecord (價格記錄)
Represents user-scanned price information for a product.

**Fields**:
- `id`: string (UUID)
- `productId`: string (foreign key to Product)
- `price`: number (product price)
- `unitPrice`: number (calculated unit price)
- `unit`: string (pricing unit: per kg, per item, etc.)
- `quantity`: number (package quantity)
- `storeName`: string (store name)
- `storeType`: string (store category)
- `photoLocalPath`: string (local photo path, photos not uploaded to cloud)
- `location`: LocationRecord (embedded location data)
- `scanTimestamp`: timestamp
- `isLowestPrice`: boolean (calculated field)
- `isAnomaly`: boolean (flagged as suspicious price)
- `confidence`: number (OCR confidence score 0-1)
- `source`: string ("OCR_AUTO" | "USER_MANUAL")
- `syncStatus`: string ("LOCAL" | "SYNCING" | "SYNCED" | "FAILED")

**Validation Rules**:
- `price` must be positive number
- `unitPrice` calculated automatically
- `storeName` required, minimum 2 characters
- `photoLocalPath` required for all records (local storage only)
- `scanTimestamp` defaults to current time
- `confidence` between 0 and 1

**State Transitions**:
- CREATED → PROCESSING → SYNCING → SYNCED
- CREATED → PROCESSING → FAILED (with retry mechanism)

### LocationRecord (地理位置記錄)
Embedded within PriceRecord for geographic information.

**Fields**:
- `county`: string (縣市名稱)
- `township`: string (鄉鎮名稱, optional)
- `acquisitionMethod`: string ("GPS_AUTO" | "MANUAL_SELECT" | "FAILED")
- `accuracy`: number (GPS accuracy in meters, optional)
- `timestamp`: timestamp (when location was acquired)
- `coordinates`: object (lat/lng, optional for privacy)

**Validation Rules**:
- `county` required if acquisition successful
- `acquisitionMethod` must be valid enum value
- `accuracy` only present for GPS_AUTO method
- `coordinates` stored but not displayed to users

### StoreData (商店資料)
Represents store information with standardization.

**Fields**:
- `id`: string (UUID)
- `standardName`: string (standardized store name)
- `displayName`: string (user-friendly display name)
- `storeType`: string (store category)
- `isPresetStore`: boolean (in default store list)
- `aliases`: array of strings (alternative names)
- `createdAt`: timestamp

**Validation Rules**:
- `standardName` must be unique
- `storeType` from predefined categories
- `aliases` help with name matching

### ScanHistory (掃描歷史)
Represents user's scanning activity record.

**Fields**:
- `id`: string (UUID)
- `productId`: string (foreign key to Product)
- `priceRecordId`: string (foreign key to PriceRecord)
- `scanTimestamp`: timestamp
- `wasLowestPrice`: boolean (price comparison result at time of scan)
- `sessionId`: string (groups scans from same shopping session)

**Validation Rules**:
- `productId` and `priceRecordId` must exist
- `scanTimestamp` required
- `sessionId` groups related scans

### StoreSession (商店會話)
Represents current shopping session context.

**Fields**:
- `id`: string (UUID)
- `storeName`: string (current store)
- `storeType`: string (store category)
- `startTime`: timestamp
- `lastActivity`: timestamp
- `location`: LocationRecord (session location)
- `status`: string ("ACTIVE" | "PAUSED" | "ENDED")
- `scanCount`: number (scans in this session)

**Validation Rules**:
- `storeName` required
- `startTime` defaults to session creation
- `lastActivity` updated on each scan
- `status` manages session lifecycle

### OCRRecognitionResult (OCR識別結果)
Represents OCR processing results and metadata.

**Fields**:
- `id`: string (UUID)
- `imageUrl`: string (source image URL)
- `recognizedBarcode`: string (extracted barcode)
- `recognizedPrice`: number (extracted price)
- `recognizedStore`: string (extracted store name)
- `confidence`: number (overall confidence 0-1)
- `processingTime`: number (milliseconds)
- `preprocessingApplied`: array of strings (image enhancements)
- `rawOcrText`: string (full OCR output)
- `timestamp`: timestamp

**Validation Rules**:
- `imageUrl` required
- `confidence` between 0 and 1
- `processingTime` positive number
- At least one recognized field required

### DailyScanSummary (今日掃描摘要)
Aggregated daily scanning statistics.

**Fields**:
- `id`: string (date-based: YYYY-MM-DD)
- `date`: date
- `totalScans`: number
- `uniqueProducts`: number
- `lowestPricesFound`: number
- `totalSavingsEstimate`: number
- `averageConfidence`: number
- `topStores`: array of objects (store name + scan count)
- `lastUpdated`: timestamp

**Validation Rules**:
- `date` must be valid date
- All numeric fields non-negative
- `topStores` limited to top 5
- Updated in real-time with each scan

## Entity Relationships

```
Product (1) ←→ (many) PriceRecord
Product (1) ←→ (many) ScanHistory
PriceRecord (1) ←→ (1) ScanHistory
StoreSession (1) ←→ (many) ScanHistory
OCRRecognitionResult (1) ←→ (1) PriceRecord
```

## Data Flow Patterns

### Scan-to-Save Flow
1. User captures price tag photo
2. OCRRecognitionResult created with processing status
3. Product entity created/updated
4. PriceRecord created with OCR data
5. ScanHistory entry created
6. DailyScanSummary updated
7. Background sync to Firebase

### Price Comparison Flow
1. Query PriceRecord by productId
2. Calculate lowest price across all records
3. Update isLowestPrice flags
4. Return comparison results with location data

### Offline Sync Flow
1. Local records stored in localStorage
2. Network detection triggers sync attempts
3. Batch upload with conflict resolution
4. Update syncStatus fields
5. Cleanup local storage after successful sync

## Performance Considerations

- Index on `productId` for fast price lookups
- Index on `scanTimestamp` for history queries
- Composite index on `date` + `syncStatus` for sync operations
- Limit localStorage to 5 pending records maximum (due to 5MB total limit)
- Implement data archival for old records

## Privacy and Security

- No personally identifiable information stored
- Location data limited to county/township level
- Photo URLs use Firebase security rules
- Anonymous authentication only
- Local data encrypted in localStorage