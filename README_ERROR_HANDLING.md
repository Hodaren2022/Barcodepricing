# 錯誤處理機制說明

## 概述

本專案實現了一個全域的錯誤處理機制，位於 `src/utils/errorHandler.js`，提供更具體的錯誤訊息給使用者，並可讓整個程式調用。

## 主要功能

### 1. parseFirebaseError(error)
解析 Firebase 錯誤並返回使用者友好的錯誤訊息。

### 2. showUserFriendlyError(error, context)
顯示錯誤訊息給使用者，支援上下文資訊。

### 3. handleFirestoreSaveError(error, operation)
處理 Firestore 儲存操作的錯誤，提供操作類型的上下文。

## 使用方式

在任何需要錯誤處理的組件中，引入並使用：

```javascript
import { showUserFriendlyError, handleFirestoreSaveError } from './utils/errorHandler';

try {
  // 執行某些操作
  await someOperation();
} catch (error) {
  const userMessage = handleFirestoreSaveError(error, "執行某項操作");
  showUserFriendlyError(userMessage);
}
```

## 錯誤類型對應訊息

- `permission-denied`: 權限不足，無法儲存資料
- `unavailable`: Firebase 服務暫時無法使用
- `deadline-exceeded`: 請求超時
- `resource-exhausted`: 系統資源已滿
- `unauthenticated`: 身份驗證失敗
- 網路錯誤: 網路連線異常
- 其他: 通用錯誤訊息

## 已整合的組件

- App.js
- OcrQueuePage.js
- AllRecordsPage.js
- AIOcrCaptureModal.js