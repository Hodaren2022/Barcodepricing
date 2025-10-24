import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Trash2, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { db } from './firebase-config.js';
import { doc, setDoc, addDoc, collection, serverTimestamp, getDoc, query, where, getDocs } from "firebase/firestore";
import { calculateUnitPrice, calculateFinalPrice, formatUnitPrice } from './utils/priceCalculations';
import StoreSelector from './StoreSelector'; // 確保導入 StoreSelector
import { showUserFriendlyError, handleFirestoreSaveError } from './utils/errorHandler'; // 導入錯誤處理工具

// 計算 localStorage 使用量的函數
function getLocalStorageUsage() {
  let total = 0;
  for (let key in localStorage) {
    if (localStorage.hasOwnProperty(key)) {
      total += (localStorage[key].length + key.length) * 2; // 每個字符佔用 2 bytes
    }
  }
  const used = (total / 1024).toFixed(2); // 轉換為 KB
  const quota = 5120; // 大多数瀏覽器的 localStorage 限制約為 5MB
  const percentage = ((used / quota) * 100).toFixed(2);
  
  return {
    used: used,
    quota: quota,
    percentage: percentage
  };
}

// 刪除確認對話框組件
function DeleteConfirmation({ card, onClose, onConfirm }) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm">
                <h2 className="text-xl font-bold mb-4">確認刪除</h2>
                <p className="mb-4">您確定要刪除此待辨識項目嗎？</p>
                <p className="mb-4 font-semibold text-gray-800">{card.productName || '未命名產品'}</p>
                <div className="flex justify-end space-x-3">
                    <button 
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                    >
                        取消
                    </button>
                    <button 
                        onClick={onConfirm}
                        className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                    >
                        確認刪除
                    </button>
                </div>
            </div>
        </div>
    );
}

function OcrQueuePage({ theme, onBack, pendingOcrCards, onRemoveCard, onStoreSelect }) {
    const [queueStats, setQueueStats] = useState({
        total: 0,
        oldest: null,
        newest: null
    });
    
    // 新增狀態：localStorage 使用量
    const [localStorageUsage, setLocalStorageUsage] = useState({
        used: 0,
        quota: 5120,
        percentage: 0
    });
    
    // 新增狀態：刪除確認對話框
    const [deleteConfirmation, setDeleteConfirmation] = useState(null);
    
    // 新增狀態：正在編輯的卡片
    const [editingCard, setEditingCard] = useState(null);
    
    // 新增狀態：待儲存的卡片
    const [cardToSave, setCardToSave] = useState(null);
    
    // 新增狀態：商店選擇器顯示狀態
    const [showStoreSelector, setShowStoreSelector] = useState(false);
    
    // 新增狀態：比價結果
    const [priceComparisonResults, setPriceComparisonResults] = useState({});

    useEffect(() => {
        if (pendingOcrCards.length > 0) {
            const timestamps = pendingOcrCards.map(card => card.id);
            setQueueStats({
                total: pendingOcrCards.length,
                oldest: Math.min(...timestamps),
                newest: Math.max(...timestamps)
            });
        } else {
            setQueueStats({
                total: 0,
                oldest: null,
                newest: null
            });
        }
        
        // 更新 localStorage 使用量
        setLocalStorageUsage(getLocalStorageUsage());
    }, [pendingOcrCards]);

    const formatTime = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleString('zh-TW');
    };

    const calculateDuration = (timestamp) => {
        const now = Date.now();
        const diffMs = now - timestamp;
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        
        if (diffHours > 0) {
            return `${diffHours}小時前`;
        } else if (diffMins > 0) {
            return `${diffMins}分鐘前`;
        } else {
            return `${diffSecs}秒前`;
        }
    };

    // 處理刪除操作
    const handleDeleteClick = (card) => {
        setDeleteConfirmation(card);
    };

    // 確認刪除
    const confirmDelete = () => {
        if (deleteConfirmation) {
            onRemoveCard(deleteConfirmation.id);
            setDeleteConfirmation(null);
            // 刪除後更新 localStorage 使用量
            setTimeout(() => {
                setLocalStorageUsage(getLocalStorageUsage());
            }, 100);
        }
    };

    // 取消刪除
    const cancelDelete = () => {
        setDeleteConfirmation(null);
    };

    // 處理儲存操作 - 檢查商店名稱
    const handleSaveClick = async (card) => {
        // 檢查商店名稱是否為空白
        if (!card.storeName || card.storeName.trim() === '') {
            // 如果商店名稱為空白，顯示商店選擇器
            setCardToSave(card);
            setShowStoreSelector(true);
        } else {
            // 如果商店名稱不為空白，直接儲存（不再彈出確認對話框）
            try {
                // 儲存到 Firebase
                await saveOcrCardToFirebase(card);
                
                // 從待辨識序列中移除
                onRemoveCard(card.id);
                
                // 儲存後更新 localStorage 使用量
                setTimeout(() => {
                    setLocalStorageUsage(getLocalStorageUsage());
                }, 100);
                
                // 儲存成功時不顯示任何訊息
            } catch (error) {
                console.error("儲存失敗:", error);
                const userMessage = handleFirestoreSaveError(error, "儲存待辨識卡片");
                showUserFriendlyError(userMessage);
            }
        }
    };

    // 處理卡片欄位變更
    const handleCardChange = (cardId, field, value) => {
        const updatedCards = pendingOcrCards.map(card => 
            card.id === cardId ? { ...card, [field]: value } : card
        );
        onStoreSelect(updatedCards);
        
        // 當價格相關欄位變更時，重新計算比價結果
        if (field === 'extractedPrice' || field === 'specialPrice' || field === 'originalPrice' || field === 'quantity' || field === 'unitType') {
            // 延遲一點時間再重新計算，確保狀態已更新
            setTimeout(() => {
                const fetchPriceComparisonResults = async () => {
                    const results = {};
                    for (const card of updatedCards) {
                        const result = await checkIfBestPrice(card, updatedCards);
                        results[card.id] = result;
                    }
                    setPriceComparisonResults(results);
                };
                
                fetchPriceComparisonResults();
            }, 0);
        }
    };

    // 處理商店欄位點擊
    const handleStoreClick = (card) => {
        setEditingCard(card);
        setShowStoreSelector(true);
    };

    // 處理商店選擇器關閉
    const handleCloseStoreSelector = () => {
        setShowStoreSelector(false);
        setEditingCard(null);
    };

    // 處理商店選擇（自動套用選擇並關閉選擇器）
    const handleStoreSelectForQueue = async (selectedStore) => {
        if (editingCard) {
            // 這是手動編輯卡片時的商店選擇
            handleCardChange(editingCard.id, 'storeName', selectedStore);
            handleCloseStoreSelector();
        } else {
            // 這是儲存時的商店選擇
            const updatedCard = { ...cardToSave, storeName: selectedStore };
            
            // 直接儲存（不再彈出確認對話框）
            try {
                // 儲存到 Firebase
                await saveOcrCardToFirebase(updatedCard);
                
                // 從待辨識序列中移除
                onRemoveCard(updatedCard.id);
                
                // 儲存後更新 localStorage 使用量
                setTimeout(() => {
                    setLocalStorageUsage(getLocalStorageUsage());
                }, 100);
                
                // 儲存成功時不顯示任何訊息
            } catch (error) {
                console.error("儲存失敗:", error);
                const userMessage = handleFirestoreSaveError(error, "儲存待辨識卡片");
                showUserFriendlyError(userMessage);
            }
            
            setShowStoreSelector(false);
            setCardToSave(null);
        }
    };

    // 儲存 OCR 卡片到 Firebase
    const saveOcrCardToFirebase = async (card) => {
        // 生成產品 ID
        const numericalID = generateProductId(card.scannedBarcode, card.productName, card.storeName);
        
        // 使用新的價格計算函數來確定最終價格
        const finalPrice = calculateFinalPrice(card.extractedPrice, card.specialPrice);
        const priceValue = parseFloat(finalPrice);
        
        // 使用 calculateUnitPrice 函數計算單價
        const calculatedUnitPrice = calculateUnitPrice(priceValue, card.quantity, card.unitType);
        
        // 儲存產品資訊
        const productRef = doc(db, "products", numericalID.toString());
        const productSnap = await getDoc(productRef);
        if (!productSnap.exists()) {
            await setDoc(productRef, {
                numericalID,
                barcodeData: card.scannedBarcode,
                productName: card.productName,
                createdAt: serverTimestamp(),
                lastUpdatedBy: "ocr-queue", // 標記為來自 OCR 隊列
            });
        }
        
        // 儲存價格記錄
        const priceRecord = {
            numericalID,
            productName: card.productName,
            storeName: card.storeName,
            price: priceValue, // 總價
            quantity: parseFloat(card.quantity),
            unitType: card.unitType,
            unitPrice: calculatedUnitPrice, // 單價
            discountDetails: card.discountDetails || '',
            timestamp: serverTimestamp(),
            recordedBy: "ocr-queue", // 標記為來自 OCR 隊列
            // 保存原價和特價信息（如果有的話）
            originalPrice: card.originalPrice ? parseFloat(card.originalPrice) : null,
            specialPrice: card.specialPrice ? parseFloat(card.specialPrice) : null
        };
        
        await addDoc(collection(db, "priceRecords"), priceRecord);
    };

    // 生成產品 ID 的函數
    function generateProductId(barcode, productName, storeName) {
        function djb2Hash(str) {
            let hash = 5381;
            for (let i = 0; i < str.length; i++) {
                hash = ((hash << 5) + hash) + str.charCodeAt(i);
            }
            return hash >>> 0;
        }
        
        if (barcode) {
            return djb2Hash(barcode).toString();
        } else {
            // Combine productName and storeName to create a unique ID for products without barcodes
            return djb2Hash(`${productName}-${storeName}`).toString();
        }
    }

    // 新增函數：檢查價格是否為歷史最低（包含待辨識序列中的卡片）
    const checkIfBestPrice = useCallback(async (card, allCards) => {
        try {
            // 生成產品 ID
            const numericalID = generateProductId(card.scannedBarcode, card.productName, card.storeName);
            
            if (!numericalID) return null;
            
            // 使用新的價格計算函數來確定最終價格
            const finalPrice = calculateFinalPrice(card.extractedPrice, card.specialPrice);
            const priceValue = parseFloat(finalPrice);
            
            // 使用 calculateUnitPrice 函數計算單價
            const calculatedUnitPrice = calculateUnitPrice(priceValue, card.quantity, card.unitType);
            
            if (calculatedUnitPrice === null) return null;
            
            // 查詢 Firebase 中該產品的所有價格記錄
            const recordsQuery = query(
                collection(db, "priceRecords"),
                where("numericalID", "==", numericalID)
            );
            
            const recordsSnap = await getDocs(recordsQuery);
            const records = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // 準備所有記錄以進行比較（包括當前記錄和待辨識序列中的相同產品）
            let allRecordsForCompare = [...records, { 
                unitPrice: calculatedUnitPrice,
                timestamp: new Date()
            }];
            
            // 添加待辨識序列中相同產品的卡片（排除當前卡片）
            const sameProductCards = allCards.filter(c => 
                c.id !== card.id && 
                generateProductId(c.scannedBarcode, c.productName, c.storeName) === numericalID
            );
            
            // 將相同產品的卡片添加到比較列表中
            sameProductCards.forEach(c => {
                const cardFinalPrice = calculateFinalPrice(c.extractedPrice, c.specialPrice);
                const cardPriceValue = parseFloat(cardFinalPrice);
                const cardUnitPrice = calculateUnitPrice(cardPriceValue, c.quantity, c.unitType);
                
                if (cardUnitPrice !== null) {
                    allRecordsForCompare.push({
                        unitPrice: cardUnitPrice,
                        timestamp: new Date(c.id) // 使用卡片 ID 作為時間戳
                    });
                }
            });

            // 如果沒有歷史記錄，則當前價格就是最低價
            if (allRecordsForCompare.length <= 1) {
                return { isBest: true, message: "歷史最低價", backgroundColor: "bg-green-100" };
            }
            
            // 使用與主頁面相同的比價邏輯
            const bestDeal = allRecordsForCompare.reduce((best, cur) => {
                const curUnitPrice = cur.unitPrice !== undefined && cur.unitPrice !== null ? cur.unitPrice : Infinity;
                const bestUnitPrice = best.unitPrice !== undefined && best.unitPrice !== null ? best.unitPrice : Infinity;
                return curUnitPrice < bestUnitPrice ? cur : best;
            });

            const isBest = calculatedUnitPrice <= (bestDeal.unitPrice !== undefined && bestDeal.unitPrice !== null ? bestDeal.unitPrice : Infinity);
            
            if (isBest) {
                return { isBest: true, message: "歷史最低價", backgroundColor: "bg-green-100" };
            } else {
                return { isBest: false, message: "非歷史最低價", backgroundColor: "bg-yellow-100" };
            }
        } catch (error) {
            console.error("比價檢查失敗:", error);
            return null;
        }
    }, []);

    // 當待辨識卡片列表改變時，重新計算比價結果
    useEffect(() => {
        const fetchPriceComparisonResults = async () => {
            const results = {};
            for (const card of pendingOcrCards) {
                const result = await checkIfBestPrice(card, pendingOcrCards);
                results[card.id] = result;
            }
            setPriceComparisonResults(results);
        };
        
        if (pendingOcrCards.length > 0) {
            fetchPriceComparisonResults();
        } else {
            setPriceComparisonResults({});
        }
    }, [pendingOcrCards, checkIfBestPrice]);

    return (
        <div className={`min-h-screen p-4 sm:p-8 ${theme.light}`}>
            <div className="max-w-2xl mx-auto">
                <div className="flex items-center mb-6 border-b pb-4">
                    <button onClick={onBack} className="flex items-center text-indigo-600 hover:text-indigo-800 mr-4">
                        <ArrowLeft className="mr-1" size={20} />返回
                    </button>
                    <h1 className={`text-2xl font-bold ${theme.text} flex items-center`}>
                        <Clock className="w-6 h-6 mr-2" />待辨識序列管理
                    </h1>
                </div>

                {queueStats.total > 0 ? (
                    <div className="mb-6 p-4 bg-white rounded-lg shadow">
                        <h2 className="text-lg font-semibold mb-3">序列統計</h2>
                        {/* 改為橫式條列呈現 */}
                        <div className="flex flex-wrap gap-4">
                            <div className="flex items-center">
                                <div className="bg-blue-100 p-2 rounded-full mr-2">
                                    <span className="text-blue-600 font-bold">{queueStats.total}</span>
                                </div>
                                <span className="text-gray-600">總數</span>
                            </div>
                            
                            <div className="flex items-center">
                                <div className="bg-green-100 p-2 rounded-full mr-2">
                                    <span className="text-green-600 font-bold">{queueStats.oldest ? formatTime(queueStats.oldest) : 'N/A'}</span>
                                </div>
                                <span className="text-gray-600">最早</span>
                            </div>
                            
                            <div className="flex items-center">
                                <div className="bg-purple-100 p-2 rounded-full mr-2">
                                    <span className="text-purple-600 font-bold">{queueStats.newest ? formatTime(queueStats.newest) : 'N/A'}</span>
                                </div>
                                <span className="text-gray-600">最新</span>
                            </div>
                        </div>
                        
                        {/* localStorage 使用量顯示 */}
                        <div className="mt-4 pt-4 border-t border-gray-200">
                            <h3 className="text-md font-semibold mb-2">儲存空間使用量</h3>
                            <div className="flex items-center">
                                <div className="flex-1 mr-4">
                                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                                        <div 
                                            className="bg-blue-600 h-2.5 rounded-full" 
                                            style={{ width: `${localStorageUsage.percentage > 100 ? 100 : localStorageUsage.percentage}%` }}
                                        ></div>
                                    </div>
                                </div>
                                <div className="text-sm text-gray-600 whitespace-nowrap">
                                    <span>{localStorageUsage.used} KB</span>
                                    <span className="mx-1">/</span>
                                    <span>{localStorageUsage.quota} KB</span>
                                    <span className="ml-1">({localStorageUsage.percentage}%)</span>
                                </div>
                            </div>
                            {localStorageUsage.percentage > 90 && (
                                <div className="mt-2 text-sm text-yellow-600">
                                    ⚠️ 儲存空間使用率已超過 90%，請及時清理不需要的項目
                                </div>
                            )}
                            {localStorageUsage.percentage > 100 && (
                                <div className="mt-2 text-sm text-red-600">
                                    ❌ 儲存空間已滿，無法新增更多項目
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-10 bg-white rounded-xl shadow">
                        <AlertCircle size={48} className="mx-auto text-gray-400 mb-4" />
                        <h3 className="text-xl font-semibold text-gray-700 mb-2">無待辨識項目</h3>
                        <p className="text-gray-500">目前沒有任何待確認的辨識卡片</p>
                        
                        {/* localStorage 使用量顯示（即使沒有項目也顯示） */}
                        <div className="mt-6 pt-4 border-t border-gray-200">
                            <h3 className="text-md font-semibold mb-2">儲存空間使用量</h3>
                            <div className="flex items-center">
                                <div className="flex-1 mr-4">
                                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                                        <div 
                                            className="bg-blue-600 h-2.5 rounded-full" 
                                            style={{ width: `${localStorageUsage.percentage > 100 ? 100 : localStorageUsage.percentage}%` }}
                                        ></div>
                                    </div>
                                </div>
                                <div className="text-sm text-gray-600 whitespace-nowrap">
                                    <span>{localStorageUsage.used} KB</span>
                                    <span className="mx-1">/</span>
                                    <span>{localStorageUsage.quota} KB</span>
                                    <span className="ml-1">({localStorageUsage.percentage}%)</span>
                                </div>
                            </div>
                            {localStorageUsage.percentage > 90 && (
                                <div className="mt-2 text-sm text-yellow-600">
                                    ⚠️ 儲存空間使用率已超過 90%，請及時清理不需要的項目
                                </div>
                            )}
                            {localStorageUsage.percentage > 100 && (
                                <div className="mt-2 text-sm text-red-600">
                                    ❌ 儲存空間已滿，無法新增更多項目
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="space-y-4">
                    {pendingOcrCards.map((card) => (
                        <div 
                            key={card.id} 
                            className={`bg-white p-4 rounded-lg shadow ${
                                priceComparisonResults[card.id]?.isBest 
                                    ? 'border-6 border-green-500' 
                                    : 'border-6 border-yellow-500'
                            }`}
                        >
                            <div className="flex justify-between items-start">
                                <div className="flex-1">
                                    {/* 將比價結果移到卡片頂部 */}
                                    {priceComparisonResults[card.id] && (
                                        <div className={`mb-3 p-2 rounded text-center text-base font-bold ${
                                            priceComparisonResults[card.id].isBest 
                                                ? 'bg-green-500 text-white' 
                                                : 'bg-yellow-500 text-pink-800'
                                        }`}>
                                            {priceComparisonResults[card.id].message}
                                        </div>
                                    )}
                                    
                                    <input
                                        type="text"
                                        value={card.productName || ''}
                                        onChange={(e) => handleCardChange(card.id, 'productName', e.target.value)}
                                        className="font-bold text-lg text-gray-800 w-full p-1 mb-2 border-b border-gray-300 focus:border-blue-500 focus:outline-none"
                                        placeholder="產品名稱"
                                    />
                                    
                                    {/* 擷取畫面顯示 */}
                                    {card.capturedImage && (
                                        <div className="mt-3 mb-3">
                                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-2 bg-gray-50 relative overflow-hidden">
                                                <div className="relative w-full aspect-video">
                                                    {card.capturedImage.startsWith('data:image') ? (
                                                        <img src={card.capturedImage} alt="擷取畫面" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <img src={card.capturedImage} alt="擷取畫面" className="w-full h-full object-cover" />
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    
                                    <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                                        {/* 條碼欄位 */}
                                        <div className="col-span-2">
                                            <label className="block text-gray-700 font-medium mb-0.5">條碼數據</label>
                                            <input
                                                type="text"
                                                value={card.scannedBarcode || ''}
                                                onChange={(e) => handleCardChange(card.id, 'scannedBarcode', e.target.value)}
                                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                                placeholder="條碼"
                                            />
                                        </div>
                                        
                                        {/* 產品名稱欄位 */}
                                        <div className="col-span-2">
                                            <label className="block text-gray-700 font-medium mb-0.5">產品名稱</label>
                                            <input
                                                type="text"
                                                value={card.productName || ''}
                                                onChange={(e) => handleCardChange(card.id, 'productName', e.target.value)}
                                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                                placeholder="產品名稱"
                                            />
                                        </div>
                                        
                                        {/* 商店欄位 */}
                                        <div className="col-span-2">
                                            <label className="block text-gray-700 font-medium mb-0.5">商店名稱</label>
                                            <input
                                                type="text"
                                                value={card.storeName || ''}
                                                onChange={(e) => handleCardChange(card.id, 'storeName', e.target.value)}
                                                onClick={() => handleStoreClick(card)}
                                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-gray-50 cursor-pointer"
                                                placeholder="點擊選擇商店"
                                            />
                                        </div>
                                        
                                        {/* 價格欄位 */}
                                        {card.specialPrice !== undefined ? (
                                            <>
                                                <div>
                                                    <label className="block text-gray-700 font-medium mb-0.5">原價 ($)</label>
                                                    <input
                                                        type="number"
                                                        value={card.originalPrice || ''}
                                                        onChange={(e) => handleCardChange(card.id, 'originalPrice', e.target.value)}
                                                        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                                        placeholder="原價"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-gray-700 font-medium mb-0.5">特價 ($)</label>
                                                    <input
                                                        type="number"
                                                        value={card.specialPrice || ''}
                                                        onChange={(e) => handleCardChange(card.id, 'specialPrice', e.target.value)}
                                                        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-green-600 font-bold"
                                                        placeholder="特價"
                                                    />
                                                </div>
                                            </>
                                        ) : (
                                            <div className="col-span-2">
                                                <label className="block text-gray-700 font-medium mb-0.5">總價 ($)</label>
                                                <input
                                                    type="number"
                                                    value={card.extractedPrice || ''}
                                                    onChange={(e) => handleCardChange(card.id, 'extractedPrice', e.target.value)}
                                                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                                    placeholder="價格"
                                                />
                                            </div>
                                        )}
                                        
                                        {/* 數量和單位 */}
                                        <div>
                                            <label className="block text-gray-700 font-medium mb-0.5">數量</label>
                                            <input
                                                type="text"
                                                value={card.quantity || ''}
                                                onChange={(e) => handleCardChange(card.id, 'quantity', e.target.value)}
                                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                                placeholder="數量"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-gray-700 font-medium mb-0.5">單位</label>
                                            <select
                                                value={card.unitType || 'pcs'}
                                                onChange={(e) => handleCardChange(card.id, 'unitType', e.target.value)}
                                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                            >
                                                <option value="ml">ml (毫升)</option>
                                                <option value="g">g (克)</option>
                                                <option value="pcs">pcs (個/包/支/條)</option>
                                            </select>
                                        </div>
                                        
                                        {/* 單價 */}
                                        <div className="col-span-2">
                                            <label className="block text-gray-700 font-medium mb-0.5">單價 (每100g/ml)</label>
                                            <input
                                                type="text"
                                                value={formatUnitPrice(card.unitPrice)}
                                                readOnly
                                                className="w-full p-2 border border-gray-300 rounded-lg bg-gray-100"
                                            />
                                        </div>
                                        
                                        {/* 優惠資訊 */}
                                        <div className="col-span-2">
                                            <label className="block text-gray-700 font-medium mb-0.5">優惠細節</label>
                                            <input
                                                type="text"
                                                value={card.discountDetails || ''}
                                                onChange={(e) => handleCardChange(card.id, 'discountDetails', e.target.value)}
                                                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                                placeholder="優惠資訊"
                                            />
                                        </div>
                                    </div>
                                    
                                    <div className="mt-2 text-xs text-gray-500">
                                        <p>加入時間: {formatTime(card.id)}</p>
                                        <p>運行時間: {calculateDuration(card.id)}</p>
                                    </div>
                                </div>
                                <div className="flex flex-col">
                                    <button 
                                        onClick={() => handleSaveClick(card)}
                                        className="p-2 text-green-500 hover:text-green-700 hover:bg-green-50 rounded-full"
                                        title="確認儲存"
                                    >
                                        <CheckCircle size={20} />
                                    </button>
                                    <button 
                                        onClick={() => handleDeleteClick(card)}
                                        className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full mt-5"
                                        title="刪除"
                                    >
                                        <Trash2 size={20} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            
            {/* 刪除確認對話框 - 保留 */}
            {deleteConfirmation && (
                <DeleteConfirmation 
                    card={deleteConfirmation}
                    onClose={cancelDelete}
                    onConfirm={confirmDelete}
                />
            )}
            
            {/* 商店選擇器對話框 - 為待辨識序列管理頁面定制 */}
            {showStoreSelector && (
                <StoreSelector 
                    theme={theme} 
                    onSelect={handleStoreSelectForQueue} 
                    onClose={handleCloseStoreSelector} 
                    isOcrQueueStoreSelector={true}
                />
            )}
        </div>
    );
}

export default OcrQueuePage;