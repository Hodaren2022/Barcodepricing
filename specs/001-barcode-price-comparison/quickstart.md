# Quick Start Guide: 條碼掃描價格比較

**Feature**: Barcode Price Comparison  
**Branch**: 001-barcode-price-comparison  
**Date**: 2025-01-27

## Overview

This guide provides a quick start for implementing the enhanced barcode scanning price comparison feature. The implementation builds upon the existing React + Firebase architecture with focus on offline-first design and performance optimization.

## Prerequisites

- Node.js 16+ installed
- Firebase project configured
- Gemini API key for OCR processing
- Mobile device or browser with camera access for testing

## Development Setup

### 1. Environment Configuration

Create or update `.env.local`:
```bash
REACT_APP_FIREBASE_API_KEY=your_firebase_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
REACT_APP_GEMINI_API_KEY=your_gemini_api_key
```

### 2. Install Dependencies

```bash
npm install
```

Key dependencies already included:
- React 18.2.0
- Firebase 10.14.1
- Tailwind CSS 3.3.3
- Quagga (barcode scanning)
- Lucide React (icons)
- UUID (ID generation)

### 3. Firebase Setup

Configure Firestore collections and indexes:

```bash
# Deploy Firestore rules
firebase deploy --only firestore:rules

# Create required indexes
firebase firestore:indexes
```

Required indexes (see `contracts/firestore.md` for details):
- `priceRecords`: `productId` + `scanTimestamp`
- `priceRecords`: `location.county` + `scanTimestamp`
- `scanHistory`: `sessionId` + `scanTimestamp`

## Core Implementation Flow

### 1. Barcode Scanning Process

```javascript
// User captures price tag photo
const capturePhoto = async () => {
  const imageFile = await camera.capture();
  const localPhotoPath = await savePhotoLocally(imageFile); // Save photo to localStorage only
  const ocrResult = await processOCR(imageFile);
  const priceRecord = await createPriceRecord(ocrResult, localPhotoPath);
  await savePriceRecord(priceRecord); // Save record to Firebase (without photo)
};
```

### 2. OCR Processing Pipeline

```javascript
// Enhanced OCR with preprocessing
const processOCR = async (imageFile) => {
  const preprocessedImage = await enhanceImage(imageFile);
  const ocrResult = await callGeminiAPI(preprocessedImage);
  return {
    barcode: extractBarcode(ocrResult),
    price: extractPrice(ocrResult),
    store: extractStore(ocrResult),
    confidence: calculateConfidence(ocrResult)
  };
};
```

### 3. Price Comparison Logic

```javascript
// Compare prices and determine lowest
const comparePrices = async (productId) => {
  const priceRecords = await getPriceRecords(productId);
  const lowestPrice = Math.min(...priceRecords.map(r => r.price));
  
  return {
    lowestPrice,
    isCurrentLowest: currentPrice === lowestPrice,
    savings: currentPrice - lowestPrice,
    location: getLowestPriceLocation(priceRecords, lowestPrice)
  };
};
```

## Key Components to Implement

### 1. Enhanced OCR Component
- **File**: `src/components/EnhancedOCRCapture.js`
- **Purpose**: Improved image preprocessing and OCR accuracy
- **Features**: Auto-brightness, contrast adjustment, noise reduction

### 2. Store Session Manager
- **File**: `src/components/StoreSessionManager.js`
- **Purpose**: Manage shopping session context
- **Features**: Auto-detect store changes, session persistence

### 3. Price Comparison Display
- **File**: `src/components/PriceComparisonDisplay.js`
- **Purpose**: Show price comparison results
- **Features**: Lowest price highlighting, savings calculation

### 4. Daily Scan Summary
- **File**: `src/components/DailyScanSummary.js`
- **Purpose**: Today's scanning activity overview
- **Features**: Scan count, savings summary, top stores

### 5. Offline Sync Manager
- **File**: `src/utils/offlineSync.js`
- **Purpose**: Handle offline data synchronization
- **Features**: Queue management, network detection, batch upload

## Performance Optimization

### 1. Image Processing
```javascript
// Optimize image before OCR
const optimizeImage = (imageFile) => {
  return {
    maxWidth: 1024,
    maxHeight: 768,
    quality: 0.8,
    format: 'jpeg'
  };
};
```

### 2. Parallel Processing
```javascript
// Run OCR and GPS in parallel
const processInParallel = async (imageFile) => {
  const [ocrResult, location] = await Promise.all([
    processOCR(imageFile),
    getCurrentLocation()
  ]);
  return { ocrResult, location };
};
```

### 3. Local Storage Management
```javascript
// Manage localStorage limits (5MB total)
const manageLocalStorage = () => {
  const pendingRecords = getLocalPendingRecords();
  if (pendingRecords.length >= 12) {
    forceSyncToFirebase();
  }
};
```

## Testing Strategy

### 1. Unit Tests
```bash
# Run existing tests
npm test

# Test specific components
npm test -- --testPathPattern=OCR
npm test -- --testPathPattern=PriceComparison
```

### 2. Integration Tests
```javascript
// Test complete scan-to-save flow
describe('Barcode Scanning Flow', () => {
  it('should complete scan to save in under 5 seconds', async () => {
    const startTime = Date.now();
    await completeScanFlow();
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(5000);
  });
});
```

### 3. Performance Tests
```javascript
// Test performance requirements
describe('Performance Requirements', () => {
  it('should achieve <2 second cold start', async () => {
    const startTime = performance.now();
    await initializeApp();
    const loadTime = performance.now() - startTime;
    expect(loadTime).toBeLessThan(2000);
  });
});
```

## Deployment

### 1. Build for Production
```bash
npm run build
```

### 2. Deploy to Firebase Hosting
```bash
firebase deploy --only hosting
```

### 3. Deploy Firestore Rules and Indexes
```bash
firebase deploy --only firestore
```

## Monitoring and Analytics

### 1. Performance Monitoring
- Track OCR processing times
- Monitor offline sync success rates
- Measure user engagement metrics

### 2. Error Tracking
- OCR failure rates
- Network connectivity issues
- Storage quota management

### 3. User Analytics
- Scan frequency patterns
- Price comparison usage
- Feature adoption rates

## Troubleshooting

### Common Issues

1. **Camera Permission Denied**
   - Provide clear instructions for enabling camera access
   - Implement graceful fallback to manual input

2. **OCR Accuracy Issues**
   - Enhance image preprocessing
   - Provide user correction interface
   - Implement confidence thresholds

3. **Offline Sync Failures**
   - Check network connectivity
   - Verify Firebase configuration
   - Monitor localStorage usage

### Debug Tools

```javascript
// Enable debug logging
localStorage.setItem('DEBUG_MODE', 'true');

// Monitor performance
console.time('OCR_PROCESSING');
await processOCR(image);
console.timeEnd('OCR_PROCESSING');
```

## Next Steps

1. Implement enhanced OCR component with preprocessing
2. Add store session management
3. Create daily scan summary dashboard
4. Optimize offline synchronization
5. Implement comprehensive error handling
6. Add performance monitoring
7. Conduct user acceptance testing

## Support

For implementation questions or issues:
- Review existing codebase in `src/` directory
- Check Firebase console for data structure
- Test with real barcode samples
- Monitor browser console for errors

This quick start guide provides the foundation for implementing the enhanced barcode scanning price comparison feature while maintaining the existing architecture and performance standards.