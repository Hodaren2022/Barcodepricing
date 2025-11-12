# Firebase Firestore Data Contracts

## Collection Structure

### products
```javascript
{
  // Document ID: generated hash from barcode + name + store
  id: string,
  barcode: string,           // Required: EAN-13, UPC-A format
  name: string,              // Required: min 2 characters
  brand: string,             // Optional
  image: string,             // Optional: Firebase Storage URL
  specifications: string,    // Optional
  category: string,          // Optional
  createdAt: Timestamp,      // Auto-generated
  updatedAt: Timestamp       // Auto-updated
}
```

**Indexes**:
- `barcode` (single field, ascending)
- `name` (single field, ascending)
- `createdAt` (single field, descending)

### priceRecords
```javascript
{
  // Document ID: UUID
  id: string,
  productId: string,         // Reference to products collection
  price: number,             // Required: positive number
  unitPrice: number,         // Calculated field
  unit: string,              // "per kg", "per item", etc.
  quantity: number,          // Package quantity
  storeName: string,         // Required: min 2 characters
  storeType: string,         // Store category
  photoLocalPath: string,    // Required: Local storage path (photos not uploaded to Firebase)
  location: {                // Embedded location object
    county: string,          // 縣市名稱
    township: string,        // 鄉鎮名稱 (optional)
    acquisitionMethod: string, // "GPS_AUTO" | "MANUAL_SELECT" | "FAILED"
    accuracy: number,        // GPS accuracy in meters (optional)
    timestamp: Timestamp,    // When location was acquired
    coordinates: {           // Optional, for internal use only
      lat: number,
      lng: number
    }
  },
  scanTimestamp: Timestamp,  // Required
  isLowestPrice: boolean,    // Calculated field
  isAnomaly: boolean,        // Flagged as suspicious
  confidence: number,        // OCR confidence 0-1
  source: string,            // "OCR_AUTO" | "USER_MANUAL"
  syncStatus: string,        // "LOCAL" | "SYNCING" | "SYNCED" | "FAILED"
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**Indexes**:
- `productId` (single field, ascending)
- `scanTimestamp` (single field, descending)
- `isLowestPrice` (single field, descending)
- `syncStatus` (single field, ascending)
- Composite: `productId` + `scanTimestamp` (descending)
- Composite: `location.county` + `scanTimestamp` (descending)

### scanHistory
```javascript
{
  // Document ID: UUID
  id: string,
  productId: string,         // Reference to products collection
  priceRecordId: string,     // Reference to priceRecords collection
  scanTimestamp: Timestamp,  // Required
  wasLowestPrice: boolean,   // Price comparison result at scan time
  sessionId: string,         // Groups scans from same shopping session
  createdAt: Timestamp
}
```

**Indexes**:
- `scanTimestamp` (single field, descending)
- `sessionId` (single field, ascending)
- Composite: `sessionId` + `scanTimestamp` (descending)

### storeSessions
```javascript
{
  // Document ID: UUID
  id: string,
  storeName: string,         // Required: current store
  storeType: string,         // Store category
  startTime: Timestamp,      // Session start
  lastActivity: Timestamp,   // Last scan activity
  location: {                // Same structure as priceRecords.location
    county: string,
    township: string,
    acquisitionMethod: string,
    accuracy: number,
    timestamp: Timestamp
  },
  status: string,            // "ACTIVE" | "PAUSED" | "ENDED"
  scanCount: number,         // Number of scans in session
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**Indexes**:
- `status` (single field, ascending)
- `startTime` (single field, descending)
- `lastActivity` (single field, descending)

### ocrResults
```javascript
{
  // Document ID: UUID
  id: string,
  imageUrl: string,          // Source image Firebase Storage URL
  recognizedBarcode: string, // Extracted barcode
  recognizedPrice: number,   // Extracted price
  recognizedStore: string,   // Extracted store name
  confidence: number,        // Overall confidence 0-1
  processingTime: number,    // Processing time in milliseconds
  preprocessingApplied: [    // Array of image enhancements applied
    "brightness_adjustment",
    "contrast_enhancement",
    "noise_reduction"
  ],
  rawOcrText: string,        // Full OCR output text
  timestamp: Timestamp,      // Processing timestamp
  createdAt: Timestamp
}
```

**Indexes**:
- `timestamp` (single field, descending)
- `confidence` (single field, descending)

### dailyScanSummaries
```javascript
{
  // Document ID: date string (YYYY-MM-DD)
  id: string,                // Date in YYYY-MM-DD format
  date: Timestamp,           // Date of summary
  totalScans: number,        // Total scans for the day
  uniqueProducts: number,    // Unique products scanned
  lowestPricesFound: number, // Number of new lowest prices discovered
  totalSavingsEstimate: number, // Estimated savings from price comparisons
  averageConfidence: number, // Average OCR confidence for the day
  topStores: [               // Top 5 stores by scan count
    {
      storeName: string,
      scanCount: number
    }
  ],
  lastUpdated: Timestamp     // Last update time
}
```

**Indexes**:
- `date` (single field, descending)
- `totalScans` (single field, descending)

## Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow anonymous read/write for all collections
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
    
    // Specific rules for price records
    match /priceRecords/{recordId} {
      allow create: if request.auth != null 
        && validatePriceRecord(request.resource.data);
      allow read: if request.auth != null;
      allow update: if request.auth != null 
        && validatePriceRecordUpdate(request.resource.data);
    }
    
    // Validation functions
    function validatePriceRecord(data) {
      return data.keys().hasAll(['productId', 'price', 'storeName', 'photoLocalPath'])
        && data.price is number
        && data.price > 0
        && data.storeName is string
        && data.storeName.size() >= 2;
    }
    
    function validatePriceRecordUpdate(data) {
      return validatePriceRecord(data)
        && data.createdAt == resource.data.createdAt; // Prevent createdAt modification
    }
  }
}
```

## Data Validation Constraints

### Field Validation
- All timestamps use Firestore Timestamp type
- Numeric fields must be non-negative where specified
- String fields have minimum length requirements
- Required fields must be present in all documents

### Business Logic Constraints
- `isLowestPrice` calculated automatically on price record creation/update
- `unitPrice` calculated from price and quantity
- `confidence` scores between 0 and 1
- `syncStatus` follows state machine pattern
- Location coordinates stored but never exposed in API responses

### Performance Constraints
- Maximum 500 price records per product for efficient queries
- Daily summaries aggregated in real-time with batch updates
- OCR results archived after 30 days to manage storage
- Scan history limited to 1000 entries per user session