/**
 * 全域錯誤處理工具函數
 * 提供更具體的錯誤訊息給使用者
 */

/**
 * 解析 Firebase 錯誤並返回使用者友好的錯誤訊息
 * @param {Error} error - Firebase 錯誤物件
 * @returns {string} 使用者友好的錯誤訊息
 */
export function parseFirebaseError(error) {
    if (!error || !error.code) {
        return "發生未知錯誤，請稍後再試";
    }

    // 根據 Firebase 錯誤碼提供具體的錯誤訊息
    switch (error.code) {
        case 'permission-denied':
            return "權限不足，無法儲存資料。請聯繫系統管理員";
        
        case 'unavailable':
            return "Firebase 服務暫時無法使用，請檢查網路連線後再試";
            
        case 'deadline-exceeded':
            return "請求超時，請檢查網路連線後再試";
            
        case 'resource-exhausted':
            return "系統資源已滿，請稍後再試";
            
        case 'failed-precondition':
            return "資料格式錯誤，無法儲存";
            
        case 'aborted':
            return "操作被中斷，請重新嘗試";
            
        case 'out-of-range':
            return "資料超出允許範圍";
            
        case 'unimplemented':
            return "此功能尚未實作";
            
        case 'internal':
            return "系統內部錯誤，請稍後再試";
            
        case 'data-loss':
            return "資料遺失，請重新輸入";
            
        case 'unauthenticated':
            return "身份驗證失敗，請重新整理頁面";
            
        default:
            // 對於其他錯誤，提供通用但具體的訊息
            if (error.message.includes('offline') || error.message.includes('network')) {
                return "網路連線異常，請檢查網路設定後再試";
            }
            if (error.message.includes('quota')) {
                return "超過使用配額，請稍後再試";
            }
            return `操作失敗: ${error.message || '未知錯誤'}`;
    }
}

/**
 * 顯示錯誤訊息給使用者
 * @param {Error|string} error - 錯誤物件或錯誤訊息
 * @param {string} context - 錯誤發生的上下文（可選）
 */
export function showUserFriendlyError(error, context = '') {
    let message = '';
    
    if (typeof error === 'string') {
        message = error;
    } else if (error && error.message) {
        // 如果是 Firebase 錯誤，使用專門的解析函數
        if (error.code) {
            message = parseFirebaseError(error);
        } else {
            message = error.message;
        }
    } else {
        message = "發生未知錯誤，請稍後再試";
    }
    
    // 如果有上下文資訊，添加到訊息中
    if (context) {
        message = `[${context}] ${message}`;
    }
    
    // 顯示錯誤訊息給使用者
    alert(message);
}

/**
 * 處理 Firestore 儲存操作的錯誤
 * @param {Error} error - 錯誤物件
 * @param {string} operation - 操作類型（如 "儲存產品資訊"、"儲存價格記錄"）
 * @returns {string} 使用者友好的錯誤訊息
 */
export function handleFirestoreSaveError(error, operation = '儲存資料') {
    const userMessage = parseFirebaseError(error);
    const fullMessage = `${operation}失敗: ${userMessage}`;
    
    console.error(`[${operation}錯誤]`, error);
    return fullMessage;
}

// 建立一個導出物件而不是匿名導出
const errorHandler = {
    parseFirebaseError,
    showUserFriendlyError,
    handleFirestoreSaveError
};

export default errorHandler;