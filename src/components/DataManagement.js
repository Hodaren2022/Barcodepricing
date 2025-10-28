import React, { useState } from 'react';
import { Trash2, AlertCircle, RefreshCw, FileText } from 'lucide-react'; // 導入 Lucide 圖示

// ----------------------------------------------------
// 【核心邏輯：讀取所有 LocalStorage 數據】
// ----------------------------------------------------
const getLocalStorageData = () => {
    const data = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key);
        let parsedValue;
        let isJson = false;

        try {
            parsedValue = JSON.parse(value);
            isJson = true;
        } catch (e) {
            parsedValue = value;
        }

        data.push({
            key,
            value: isJson ? JSON.stringify(parsedValue, null, 2) : value, 
            size: (new TextEncoder().encode(value).length / 1024).toFixed(2), // KB
            type: isJson ? 'JSON' : 'String',
            count: isJson && Array.isArray(parsedValue) ? parsedValue.length : 1, 
        });
    }
    // 讓最大的佔用 Key 優先顯示
    return data.sort((a, b) => b.size - a.size); 
};

// ----------------------------------------------------
// 【DataManagement 元件】
// ----------------------------------------------------
const DataManagement = ({ onRefreshApp, themePrimary }) => {
    const [data, setData] = useState(getLocalStorageData());

    const handleClearKey = (key) => {
        if (window.confirm(`【警告】確定要清除 Key: ${key} 的數據嗎？這將會遺失該設定/數據。`)) {
            localStorage.removeItem(key);
            setData(getLocalStorageData()); // 刷新列表
            
            // 如果清除的 Key 影響了 App.js 的狀態 (例如 pendingOcrCards)，則通知 App 刷新
            if (onRefreshApp) {
                onRefreshApp(key);
            }
        }
    };
    
    // 一鍵清除所有 App 相關數據 (可根據 Key 前綴判斷)
    const handleClearAllAppData = () => {
         if (window.confirm('【極度警告】這將清除所有應用程式相關的本地數據。確定要繼續嗎？')) {
            // 這裡可以選擇性地只清除 App 相關的 Key，例如所有沒有特定前綴的
            // 由於我們不知道您的 Key 命名規則，最保險的做法是先讓用戶手動清除。
            // 或者： localStorage.clear(); (但這會清除所有網站數據，風險大)
            // 為了安全，我們讓用戶只能清除列表中的 Key。
            
            // 這裡實作一個安全的重設：只清除我們列出來的 key
            data.forEach(item => {
                 // 排除瀏覽器內部使用的 key，例如 'firebase:' 相關的
                 if (!item.key.startsWith('firebase:') && !item.key.startsWith('fbs_')) {
                    localStorage.removeItem(item.key);
                 }
            });
            setData(getLocalStorageData()); 
            if (onRefreshApp) onRefreshApp('ALL');
         }
    };


    return (
        <div className="p-4 bg-white rounded-lg shadow-md">
            <h3 className="text-xl font-bold mb-4 flex items-center">
                <FileText className="w-5 h-5 mr-2 text-blue-600" />數據與儲存管理 (LocalStorage)
            </h3>
            <p className="text-sm text-gray-600 mb-4">
                這裡顯示應用程式儲存在瀏覽器中的本地數據。異常佔用問題通常由大型陣列 (如待辨識卡片) 未清理導致。
            </p>

            <button 
                onClick={() => setData(getLocalStorageData())} 
                className={`flex items-center p-2 rounded-lg text-sm text-white font-semibold mb-4 ${themePrimary} hover:opacity-90 transition-opacity`}
            >
                <RefreshCw className="w-4 h-4 mr-2" /> 刷新列表
            </button>
            
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Key</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">類型</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">大小 (KB)</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">項目數</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">動作</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200 text-sm">
                        {data.map((item) => (
                            <tr key={item.key} className={item.size > 100 ? 'bg-yellow-50/50' : ''}>
                                <td className="px-3 py-2 font-medium text-gray-900 break-all">{item.key}</td>
                                <td className="px-3 py-2 text-gray-600">{item.type}</td>
                                <td className="px-3 py-2 text-gray-600">
                                    {item.size} KB
                                    {item.size > 100 && <AlertCircle className="w-4 h-4 text-red-500 inline-block ml-1" title="高佔用警告" />}
                                </td>
                                <td className="px-3 py-2 text-gray-600">{item.count}</td>
                                <td className="px-3 py-2 text-center">
                                    <button 
                                        onClick={() => handleClearKey(item.key)} 
                                        className="text-red-600 hover:text-red-800 p-1 rounded transition-colors"
                                        title="清除此 Key 的數據"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* 進階：一鍵重設按鈕 */}
            <div className="mt-6 border-t pt-4">
                 <button onClick={handleClearAllAppData} className="w-full p-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 mr-2" /> 清除所有 App 相關本地數據 (軟重設)
                 </button>
            </div>
        </div>
    );
};

export default DataManagement;