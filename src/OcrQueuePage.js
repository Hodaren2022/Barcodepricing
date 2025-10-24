import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Trash2, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { db } from './firebase-config.js';
import { doc, setDoc, addDoc, collection, serverTimestamp, getDoc, query, where, getDocs } from "firebase/firestore";
import { calculateUnitPrice, calculateFinalPrice, formatUnitPrice } from './utils/priceCalculations';
import StoreSelector from './StoreSelector'; // 確保導入 StoreSelector

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

// 儲存確認對話框組件
function SaveConfirmation({ card, onClose, onConfirm }) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
                <h2 className="text-xl font-bold mb-4">確認儲存</h2>
                <p className="mb-4">您確定要儲存此待辨識項目嗎？</p>
                <div className="mb-4 p-3 bg-gray-50 rounded">
                    <h3 className="font-bold text-gray-800">{card.productName || '未命名產品'}</h3>
                    <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                        <div>
                            <span className="text-gray-500">條碼:</span>
                            <span className="ml-1">{card.scannedBarcode || 'N/A'}</span>
                        </div>
                        <div>
                            <span className="text-gray-500">商店:</span>
                            <span className="ml-1">{card.storeName || 'N/A'}</span>
                        </div>
                        {card.specialPrice ? (
                            <>
                                {card.originalPrice && (
                                    <div>
                                        <span className="text-gray-500">原價:</span>
                                        <span className="ml-1 line-through text-red-500">${parseFloat(card.originalPrice).toFixed(2)}</span>
                                    </div>
                                )}
                                <div>
                                    <span className="text-gray-500">特價:</span>
                                    <span className="ml-1 text-green-600 font-bold">${parseFloat(card.specialPrice).toFixed(2)}</span>
                                </div>
                            </>
                        ) : (
                            <div>
                                <span className="text-gray-500">價格:</span>
                                <span className="ml-1">${card.extractedPrice || '0'}</span>
                            </div>
                        )}
                        <div>
                            <span className="text-gray-500">數量:</span>
                            <span className="ml-1">{card.quantity || 'N/A'} {card.unitType || ''}</span>
                        </div>
                        <div>
                            <span className="text-gray-500">單價:</span>
                            <span className="ml-1">@{formatUnitPrice(card.unitPrice)}</span>
                        </div>
                        {card.discountDetails && (
                            <div className="col-span-2">
                                <span className="text-gray-500">優惠:</span>
                                <span className="ml-1 text-indigo-600 italic">{card.discountDetails}</span>
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex justify-end space-x-3">
                    <button 
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                    >
                        取消
                    </button>
                    <button 
                        onClick={onConfirm}
                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                    >
                        確認儲存
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
    
    // 新增狀態：儲存確認對話框
    const [saveConfirmation, setSaveConfirmation] = useState(null);
    
    // 新增狀態：正在編輯的卡片
    const [editingCard, setEditingCard] = useState(null);
    
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

    // 處理儲存操作
    const handleSaveClick = (card) => {
        setSaveConfirmation(card);
    };

    // 確認儲存
    const confirmSave = async () => {
        if (saveConfirmation) {
            try {
                // 儲存到 Firebase
                await saveOcrCardToFirebase(saveConfirmation);
                
                // 從待辨識序列中移除
                onRemoveCard(saveConfirmation.id);
                
                // 儲存後更新 localStorage 使用量
                setTimeout(() => {
                    setLocalStorageUsage(getLocalStorageUsage());
                }, 100);
                
                // 關閉對話框
                setSaveConfirmation(null);
            } catch (error) {
                console.error("儲存失敗:", error);
                alert("儲存失敗，請稍後再試");
            }
        }
    };

    // 取消儲存
    const cancelSave = () => {
        setSaveConfirmation(null);
    };

    // 處理卡片欄位變更
    const handleCardChange = (cardId, field, value) => {
        const updatedCards = pendingOcrCards.map(card => 
            card.id === cardId ? { ...card, [field]: value } : card
        );
        onStoreSelect(updatedCards);
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
    const handleStoreSelectForQueue = (selectedStore) => {
        if (editingCard) {
            handleCardChange(editingCard.id, 'storeName', selectedStore);
        }
        handleCloseStoreSelector(); // 自動關閉選擇器
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

    // 新增函數：檢查價格是否為歷史最低
    const checkIfBestPrice = useCallback(async (card) => {
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
            
            // 準備所有記錄以進行比較（包括當前記錄）
            const allRecordsForCompare = [...records, { 
                unitPrice: calculatedUnitPrice,
                timestamp: new Date()
            }];

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
                const result = await checkIfBestPrice(card);
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
                            className={`bg-white p-4 rounded-lg shadow border-l-4 border-blue-500 ${
                                priceComparisonResults[card.id]?.backgroundColor || ''
                            }`}
                        >
                            <div className="flex justify-between items-start">
                                <div className="flex-1">
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
                                        <div>
                                            <span className="text-gray-500">條碼:</span>
                                            <input
                                                type="text"
                                                value={card.scannedBarcode || ''}
                                                onChange={(e) => handleCardChange(card.id, 'scannedBarcode', e.target.value)}
                                                className="ml-1 p-1 border-b border-gray-300 focus:border-blue-500 focus:outline-none w-24"
                                                placeholder="條碼"
                                            />
                                        </div>
                                        
                                        {/* 商店欄位 */}
                                        <div>
                                            <span className="text-gray-500">商店:</span>
                                            <input
                                                type="text"
                                                value={card.storeName || ''}
                                                onChange={(e) => handleCardChange(card.id, 'storeName', e.target.value)}
                                                onClick={() => handleStoreClick(card)}
                                                className="ml-1 p-1 border-b border-gray-300 focus:border-blue-500 focus:outline-none w-24"
                                                placeholder="選擇商店"
                                            />
                                        </div>
                                        
                                        {/* 原價和特價信息 */}
                                        {card.specialPrice !== undefined ? (
                                            <>
                                                <div>
                                                    <span className="text-gray-500">原價:</span>
                                                    <input
                                                        type="number"
                                                        value={card.originalPrice || ''}
                                                        onChange={(e) => handleCardChange(card.id, 'originalPrice', e.target.value)}
                                                        className="ml-1 p-1 border-b border-gray-300 focus:border-blue-500 focus:outline-none w-20"
                                                        placeholder="原價"
                                                    />
                                                </div>
                                                <div>
                                                    <span className="text-gray-500">特價:</span>
                                                    <input
                                                        type="number"
                                                        value={card.specialPrice || ''}
                                                        onChange={(e) => handleCardChange(card.id, 'specialPrice', e.target.value)}
                                                        className="ml-1 p-1 border-b border-gray-300 focus:border-blue-500 focus:outline-none w-20 text-green-600 font-bold"
                                                        placeholder="特價"
                                                    />
                                                </div>
                                            </>
                                        ) : (
                                            <div>
                                                <span className="text-gray-500">價格:</span>
                                                <input
                                                    type="number"
                                                    value={card.extractedPrice || ''}
                                                    onChange={(e) => handleCardChange(card.id, 'extractedPrice', e.target.value)}
                                                    className="ml-1 p-1 border-b border-gray-300 focus:border-blue-500 focus:outline-none w-20"
                                                    placeholder="價格"
                                                />
                                            </div>
                                        )}
                                        
                                        {/* 數量和單位 */}
                                        <div>
                                            <span className="text-gray-500">數量:</span>
                                            <input
                                                type="text"
                                                value={card.quantity || ''}
                                                onChange={(e) => handleCardChange(card.id, 'quantity', e.target.value)}
                                                className="ml-1 p-1 border-b border-gray-300 focus:border-blue-500 focus:outline-none w-16"
                                                placeholder="數量"
                                            />
                                            <select
                                                value={card.unitType || 'pcs'}
                                                onChange={(e) => handleCardChange(card.id, 'unitType', e.target.value)}
                                                className="ml-1 p-1 border-b border-gray-300 focus:border-blue-500 focus:outline-none"
                                            >
                                                <option value="ml">ml</option>
                                                <option value="g">g</option>
                                                <option value="pcs">pcs</option>
                                            </select>
                                        </div>
                                        
                                        {/* 單價 */}
                                        <div>
                                            <span className="text-gray-500">單價:</span>
                                            <span className="ml-1">@{formatUnitPrice(card.unitPrice)}</span>
                                        </div>
                                        
                                        {/* 優惠資訊 */}
                                        <div className="col-span-2">
                                            <span className="text-gray-500">優惠:</span>
                                            <input
                                                type="text"
                                                value={card.discountDetails || ''}
                                                onChange={(e) => handleCardChange(card.id, 'discountDetails', e.target.value)}
                                                className="ml-1 p-1 border-b border-gray-300 focus:border-blue-500 focus:outline-none w-full"
                                                placeholder="優惠資訊"
                                            />
                                        </div>
                                    </div>
                                    
                                    {/* 新增比價結果顯示 */}
                                    {priceComparisonResults[card.id] && (
                                        <div className={`mt-2 p-2 rounded text-center text-sm font-medium ${
                                            priceComparisonResults[card.id].isBest 
                                                ? 'text-green-800 bg-green-200' 
                                                : 'text-yellow-800 bg-yellow-200'
                                        }`}>
                                            {priceComparisonResults[card.id].message}
                                        </div>
                                    )}
                                    
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
            
            {/* 刪除確認對話框 */}
            {deleteConfirmation && (
                <DeleteConfirmation 
                    card={deleteConfirmation}
                    onClose={cancelDelete}
                    onConfirm={confirmDelete}
                />
            )}
            
            {/* 儲存確認對話框 */}
            {saveConfirmation && (
                <SaveConfirmation 
                    card={saveConfirmation}
                    onClose={cancelSave}
                    onConfirm={confirmSave}
                />
            )}
            
            {/* 商店選擇器對話框 - 為待辨識序列管理頁面定制 */}
            {showStoreSelector && (
                <StoreSelector 
                    theme={theme} 
                    onSelect={handleStoreSelectForQueue} 
                    onClose={handleCloseStoreSelector} 
                />
            )}
        </div>
    );
}

export default OcrQueuePage;