/**
 * 錯誤處理工具的測試檔案
 */

import { parseFirebaseError, handleFirestoreSaveError } from './errorHandler';

// 模擬 Firebase 錯誤物件
const mockFirebaseErrors = [
    { code: 'permission-denied', message: 'Missing or insufficient permissions.' },
    { code: 'unavailable', message: 'The service is currently unavailable.' },
    { code: 'deadline-exceeded', message: 'Deadline exceeded.' },
    { code: 'unknown', message: 'Network error' },
    { code: 'internal', message: 'Internal server error' }
];

// 測試 parseFirebaseError 函數
console.log('測試 parseFirebaseError 函數:');
mockFirebaseErrors.forEach((error, index) => {
    const result = parseFirebaseError(error);
    console.log(`測試 ${index + 1}:`, result);
});

// 測試 handleFirestoreSaveError 函數
console.log('\n測試 handleFirestoreSaveError 函數:');
const testError = { code: 'permission-denied', message: 'Missing or insufficient permissions.' };
const result = handleFirestoreSaveError(testError, "儲存產品資訊");
console.log('結果:', result);

console.log('\n所有測試完成');