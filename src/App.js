import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { PaintBucket, DollarSign, Barcode, ClipboardCheck, X, Camera, Zap, FileText, RotateCcw, Database } from 'lucide-react';
import AllRecordsPage from './AllRecordsPage';
import StoreSelector from './StoreSelector';
import AIOcrCaptureModal from './components/AIOcrCaptureModal';
import { db } from './firebase-config.js'; // <-- 引入 Firebase
import { getAuth, signInAnonymously } from "firebase/auth";
import { doc, getDoc, setDoc, collection, query, where, getDocs, addDoc, orderBy, serverTimestamp } from "firebase/firestore";
import { calculateUnitPrice, calculateFinalPrice, formatUnitPrice } from './utils/priceCalculations';
import OcrQueuePage from './OcrQueuePage';
import { showUserFriendlyError, handleFirestoreSaveError } from './utils/errorHandler'; // 導入錯誤處理工具

// ----------------------------------------------------------------------------
// 1. 核心設定與工具函數 (Core Setup & Utilities)
// ----------------------------------------------------------------------------

function djb2Hash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
    }
    return hash >>> 0;
}

// 以下函數已移至 src/components/AIOcrCaptureModal.js
// callGeminiApiWithRetry
// withExponentialBackoff


function generateProductId(barcode, productName, storeName) {
    if (barcode) {
        return djb2Hash(barcode).toString();
    } else {
        // Combine productName and storeName to create a unique ID for products without barcodes
        // This assumes productName + storeName is sufficiently unique for non-barcoded items
        return djb2Hash(`${productName}-${storeName}`).toString();
    }
}

// ----------------------------------------------------------------------------
// 2. UI 元件 (UI Components)
// ----------------------------------------------------------------------------

const CHART_WIDTH = 400;
const CHART_HEIGHT = 150;
const PADDING = 20;

function PriceTrendChart({ records, theme }) {
    const validRecords = records.map(r => ({
        ...r,
        timestamp: r.timestamp?.toDate ? r.timestamp.toDate() : new Date(r.timestamp),
        displayPrice: r.unitPrice !== undefined && r.unitPrice !== null ? r.unitPrice : r.price // Use unitPrice if available, else price
    })).filter(r => !isNaN(r.displayPrice) && r.timestamp);

    if (validRecords.length < 2) {
        return <p className="text-center text-sm text-gray-500">至少需要兩筆紀錄才能繪製趨勢圖。</p>;
    }

    const prices = validRecords.map(r => r.displayPrice);
    const minPrice = Math.min(...prices) * 0.95;
    const maxPrice = Math.max(...prices) * 1.05;
    const priceRange = maxPrice - minPrice;

    const timestamps = validRecords.map(r => r.timestamp.getTime());
    const minTimestamp = Math.min(...timestamps);
    const maxTimestamp = Math.max(...timestamps);
    const timeRange = maxTimestamp - minTimestamp;

    if (priceRange === 0 || timeRange === 0) {
        return <p className="text-center text-sm text-gray-500">價格或時間沒有足夠的變化來繪製趨勢圖。</p>;
    }

    const points = validRecords.map(record => {
        const xRatio = (record.timestamp.getTime() - minTimestamp) / timeRange;
        const x = PADDING + xRatio * (CHART_WIDTH - 2 * PADDING);
        const yRatio = (record.displayPrice - minPrice) / priceRange;
        const y = CHART_HEIGHT - PADDING - yRatio * (CHART_HEIGHT - 2 * PADDING);
        return `${x},${y}`;
    }).join(' ');

    return (
        <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
            <h3 className="text-base font-medium text-gray-700 mb-2 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1 text-gray-500"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                單價走勢
            </h3>
            <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="w-full h-auto" style={{maxWidth: `${CHART_WIDTH}px`}}>
                <line x1={PADDING} y1={PADDING} x2={PADDING} y2={CHART_HEIGHT - PADDING} stroke="#ddd" strokeWidth="1" />
                <line x1={PADDING} y1={CHART_HEIGHT - PADDING} x2={CHART_WIDTH - PADDING} y2={CHART_HEIGHT - PADDING} stroke="#ddd" strokeWidth="1" />
                <text x={PADDING - 5} y={PADDING + 5} textAnchor="end" fontSize="10" fill="#666">${maxPrice.toFixed(2)}</text>
                <text x={PADDING - 5} y={CHART_HEIGHT - PADDING} textAnchor="end" fontSize="10" fill="#666">${minPrice.toFixed(2)}</text>
                <polyline fill="none" stroke={theme.color === 'red' ? '#EF4444' : '#4F46E5'} strokeWidth="2" points={points} />
                {validRecords.map((record, index) => {
                    const [x, y] = points.split(' ')[index].split(',').map(Number);
                    return <circle key={index} cx={x} cy={y} r="3" fill={index === 0 ? '#10B981' : theme.primary.split('-')[1]} title={`$${record.displayPrice.toFixed(2)}`} />;
                })}
            </svg>
            <div className="text-xs text-gray-500 mt-2 flex justify-between px-3">
                <span>最早: {new Date(minTimestamp).toLocaleDateString()}</span>
                <span>最新: {new Date(maxTimestamp).toLocaleDateString()}</span>
            </div>
        </div>
    );
}

function PriceHistoryDisplay({ historyRecords, theme }) {
    if (historyRecords.length === 0) {
        return <div className="text-center p-6 text-gray-500 bg-white rounded-xl shadow-md">尚無歷史價格紀錄。</div>;
    }

    const formattedRecords = historyRecords.map(record => ({
        ...record,
        timestamp: record.timestamp?.toDate ? record.timestamp.toDate() : new Date(record.timestamp),
        displayPrice: record.unitPrice !== undefined && record.unitPrice !== null ? record.unitPrice : record.price // Use unitPrice if available, else price
    }));

    return (
        <div className={`p-6 rounded-xl shadow-2xl bg-white border-t-4 ${theme.border} mt-8`}>
            <h2 className={`text-xl font-semibold ${theme.text} mb-4`}>價格紀錄 ({formattedRecords.length} 筆)</h2>
            <div className="mb-6"><PriceTrendChart records={formattedRecords} theme={theme} /></div>
            <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                {formattedRecords.map((record, index) => (
                    <div key={index} className={`p-3 rounded-lg shadow-sm border border-gray-100 ${index === 0 ? theme.light : 'bg-white'}`}>
                        <div className="flex justify-between items-start font-bold">
                            {/* 顯示原價和特價信息 */}
                            {record.specialPrice ? (
                                <span className="text-[22px]">
                                    {record.originalPrice && (
                                        <span className="text-gray-500 line-through">${record.originalPrice.toFixed(2)}</span>
                                    )}
                                    <span className="text-red-600 ml-2">${record.specialPrice.toFixed(2)}</span>
                                    <span className="text-gray-500 ml-2">@{formatUnitPrice(record.unitPrice)}</span>
                                </span>
                            ) : (
                                <span className="text-[22px] text-red-600">{`$${(record.price || 0).toFixed(2)} @${formatUnitPrice(record.unitPrice)}`}</span>
                            )}
                            <span className="text-xs text-gray-500">{record.timestamp.toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-gray-700 mt-1">商店: {record.storeName || '未標註'}</p>
                        {/* 顯示數量和單位資訊 */}
                        {record.quantity && record.unitType && <p className="text-xs text-gray-600">數量: {record.quantity} {record.unitType} (總價: ${(record.price || 0).toFixed(2)})</p>}
                        {record.discountDetails && <p className="text-xs text-indigo-600 italic">優惠: {record.discountDetails}</p>}
                        {index === 0 && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full text-white ${theme.primary}`}>最新紀錄</span>}
                    </div>
                ))}
            </div>
        </div>
    );
}

const THEMES = {
    'Default (Indigo)': { primary: 'bg-indigo-600', light: 'bg-indigo-100', hover: 'hover:bg-indigo-700', border: 'border-indigo-600', text: 'text-indigo-600', color: 'indigo' },
    '海洋藍 (Ocean Blue)': { primary: 'bg-blue-600', light: 'bg-blue-100', hover: 'hover:bg-blue-700', border: 'border-blue-600', text: 'text-blue-600', color: 'blue' },
    '森林綠 (Forest Green)': { primary: 'bg-green-600', light: 'bg-green-100', hover: 'hover:bg-green-700', border: 'border-green-600', text: 'text-green-600', color: 'green' },
    '夕陽紅 (Sunset Red)': { primary: 'bg-red-600', light: 'bg-red-100', hover: 'hover:bg-red-700', border: 'border-red-600', text: 'text-red-600', color: 'red' },
    '活力橙 (Vibrant Orange)': { primary: 'bg-orange-600', light: 'bg-orange-100', hover: 'hover:bg-orange-700', border: 'border-orange-600', text: 'text-orange-600', color: 'orange' },
    '薰衣草紫 (Lavender)': { primary: 'bg-purple-600', light: 'bg-purple-100', hover: 'hover:bg-purple-700', border: 'border-purple-600', text: 'text-purple-600', color: 'purple' },
};
const DEFAULT_THEME_KEY = 'Default (Indigo)';

function ThemeSelector({ theme, saveTheme, onClose }) {
    const handleThemeChange = (themeKey) => { saveTheme(themeKey); };
    const handleReset = () => { saveTheme(DEFAULT_THEME_KEY); };

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 transform transition-all">
                <h3 className={`text-xl font-bold ${theme.text} mb-4 border-b pb-2`}><PaintBucket className="inline-block w-5 h-5 mr-2" />介面配色選項</h3>
                <div className="grid grid-cols-2 gap-4 mb-6">
                    {Object.keys(THEMES).map((themeKey) => {
                        const themeData = THEMES[themeKey];
                        const isSelected = theme.color === themeData.color;
                        return (
                            <button key={themeKey} onClick={() => handleThemeChange(themeKey)}
                                className={`p-3 rounded-lg text-white font-medium shadow-md transition-all ${themeData.primary} ${themeData.hover} ${isSelected ? 'ring-4 ring-offset-2 ring-opacity-70 ring-gray-400' : ''}`}
                                style={{ transform: isSelected ? 'scale(1.05)' : 'scale(1)' }}>
                                {themeKey}
                            </button>
                        );
                    })}
                </div>
                <div className="flex justify-between items-center pt-4 border-t">
                    <button onClick={handleReset} className="flex items-center text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                        <RotateCcw className="w-4 h-4 mr-1" />清除還原 (預設)
                    </button>
                    <button onClick={onClose} className={`px-4 py-2 text-white font-semibold rounded-lg shadow-lg ${theme.primary} ${theme.hover} transition-all`}>關閉</button>
                </div>
            </div>
        </div>
    );
}

// AIOcrCaptureModal 組件已移至獨立檔案 src/components/AIOcrCaptureModal.js


// ----------------------------------------------------------------------------
// 3. Firebase 身份驗證與主題設定 (Firebase Auth & Theming)
// ----------------------------------------------------------------------------

function useFirebaseAuthentication() {
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);

    useEffect(() => {
        const auth = getAuth();
        signInAnonymously(auth)
            .then((userCredential) => {
                setUserId(userCredential.user.uid);
                setIsAuthReady(true);
            })
            .catch((error) => {
                console.error("Firebase 匿名登入失敗:", error);
            });
    }, []);

    const [currentTheme, setCurrentTheme] = useState(() => {
        const savedKey = localStorage.getItem('appTheme') || DEFAULT_THEME_KEY;
        return THEMES[savedKey] || THEMES[DEFAULT_THEME_KEY];
    });

    const saveUserTheme = useCallback((themeKey) => {
        localStorage.setItem('appTheme', themeKey);
        setCurrentTheme(THEMES[themeKey] || THEMES[DEFAULT_THEME_KEY]);
    }, []);

    return { userId, isAuthReady, currentTheme, saveUserTheme };
}

// ----------------------------------------------------------------------------
// 4. 結果提示框 (Result Toast)
// ----------------------------------------------------------------------------
function SaveResultToast({ result, onClose }) {
    useEffect(() => {
        let timer;
        if (result) {
            timer = setTimeout(onClose, 5000);
        }
        return () => clearTimeout(timer);
    }, [result, onClose]);

    if (!result) {
        return null;
    }

    const { status, message, productName } = result;

    const theme = {
        success: { bg: 'bg-green-500', text: 'text-white', icon: <ClipboardCheck className="w-6 h-6 mr-3" /> },
        warning: { bg: 'bg-yellow-400', text: 'text-gray-800', icon: <DollarSign className="w-6 h-6 mr-3" /> },
        error: { bg: 'bg-red-500', text: 'text-white', icon: <X className="w-6 h-6 mr-3" /> },
    };

    const currentTheme = theme[status];

    return (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 max-w-md w-full p-4 rounded-xl shadow-2xl z-[100] ${currentTheme.bg} ${currentTheme.text} transition-all duration-300 ease-in-out`}>
            <div className="flex items-center">
                {currentTheme.icon}
                <div className="flex-grow">
                    <p className="font-bold text-lg">{productName}</p>
                    <p className="text-sm">{message}</p>
                    <p className="text-sm font-semibold mt-1">
                        資料儲存: {status === 'error' ? '失敗' : '成功'} | 
                        比價結果: {status === 'success' ? '是最低價' : (status === 'warning' ? '非最低價' : 'N/A')}
                    </p>
                </div>
                <button onClick={onClose} className="ml-4 p-1 rounded-full hover:bg-white/20"><X className="w-5 h-5" /></button>
            </div>
        </div>
    );
}


// ----------------------------------------------------------------------------
// 5. 主應用程式元件 (App Component)
// ----------------------------------------------------------------------------

function App() {
    const { userId, isAuthReady, currentTheme, saveUserTheme } = useFirebaseAuthentication();
    const streamRef = useRef(null);
    
    const [saveResultToast, setSaveResultToast] = useState(null);

    // UI 狀態
    const [barcode, setBarcode] = useState('');
    const [productName, setProductName] = useState('');
    const [currentPrice, setCurrentPrice] = useState('');
    const [quantity, setQuantity] = useState('');
    const [unitType, setUnitType] = useState('pcs'); // 'g', 'ml', 'pcs'
    const [unitPrice, setUnitPrice] = useState(null);
    const [discountDetails, setDiscountDetails] = useState('');
    const [storeName, setStoreName] = useState('');
    const [productHistory, setProductHistory] = useState([]);
    const [comparisonResult, setComparisonResult] = useState({ message: '等待比價數據...' });
    const [statusMessage, setStatusMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [lookupStatus, setLookupStatus] = useState('ready');
    
    // Modal and Page 狀態
    const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
    const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false);
    const [isStoreSelectorOpen, setIsStoreSelectorOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState('main'); // 'main', 'allRecords', 'ocrQueue'
    const [ocrResult, setOcrResult] = useState(null);
    const [capturedImage, setCapturedImage] = useState(null); // 新增的狀態
    
    // 新增狀態：待辨識序列
    const [pendingOcrCards, setPendingOcrCards] = useState([]);
    
    useEffect(() => {
        // 使用新的價格計算函數來確定最終價格
        const finalPrice = calculateFinalPrice(currentPrice, ocrResult?.specialPrice);
        const price = parseFloat(finalPrice);
        const qty = parseFloat(quantity);

        if (!isNaN(price) && !isNaN(qty) && qty > 0) {
            // 使用 calculateUnitPrice 函數計算單價
            const calculatedUnitPrice = calculateUnitPrice(price, qty, unitType);
            setUnitPrice(calculatedUnitPrice);
        } else {
            setUnitPrice(null);
        }
    }, [currentPrice, quantity, unitType, ocrResult]);
    const clearForm = useCallback(() => {
        setBarcode('');
        setProductName('');
        setCurrentPrice('');
        setQuantity('');
        setUnitType('pcs'); // Reset to default unit type
        setUnitPrice(null);
        setDiscountDetails('');
        setStoreName('');
        setProductHistory([]);
        setComparisonResult({ message: '等待比價數據...' });
        setOcrResult(null);
        setLookupStatus('ready');
        setCapturedImage(null); // 清除擷取的圖片
    }, []);

    const stopCameraStream = useCallback(() => {
        console.log("stopCameraStream: Attempting to stop camera.");
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
            console.log("stopCameraStream: Camera stream stopped.");
        }
    }, []);

    useEffect(() => {
        // Add a cleanup function to stop the camera when the component unmounts
        return () => {
            console.log("useEffect cleanup: Running camera cleanup.");
            stopCameraStream();
            // 清除捕獲的圖像
            setCapturedImage(null);
        };
    }, [stopCameraStream, setCapturedImage]);

    const startCameraStream = async () => {
        console.log("startCameraStream: Attempting to start camera.");
        if (streamRef.current) {
            return streamRef.current;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } });
            streamRef.current = stream;
            console.log("startCameraStream: Camera started successfully.");
            return stream;
        } catch (err) {
            console.error("無法存取攝影機:", err);
            setStatusMessage(`無法存取攝影機: ${err.name}`);
            return null;
        }
    };

    const lookupProduct = useCallback(async (barcodeData, currentProductName, currentStoreName) => {
        const numericalID = generateProductId(barcodeData, currentProductName, currentStoreName);

        // Adjust early exit condition:
        // If no barcode and no product name, or if barcode is too short and no product name,
        // then we can't look up a product.
        if (!numericalID) { // If numericalID couldn't be generated, then we can't look up a product.
            setProductName('');
            setLookupStatus('ready');
            setProductHistory([]);
            return;
        }
        
        try {
            const productRef = doc(db, "products", numericalID.toString());
            const productSnap = await getDoc(productRef);

            if (productSnap.exists()) {
                setProductName(productSnap.data().productName);
                setLookupStatus('found');
            } else {
                setLookupStatus('new');
            }

            const recordsQueryString = query(
                collection(db, "priceRecords"),
                where("numericalID", "==", numericalID), // numericalID is already a string
                orderBy("timestamp", "desc")
            );
            const recordsSnapString = await getDocs(recordsQueryString);
            let records = recordsSnapString.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Attempt to query for numericalID as a number, if it's a valid number string
            const numericalIDAsNumber = parseInt(numericalID, 10);
            if (!isNaN(numericalIDAsNumber) && numericalIDAsNumber.toString() === numericalID) { // Check if it's a pure number string
                const recordsQueryNumber = query(
                    collection(db, "priceRecords"),
                    where("numericalID", "==", numericalIDAsNumber),
                    orderBy("timestamp", "desc")
                );
                const recordsSnapNumber = await getDocs(recordsQueryNumber);
                const recordsNumber = recordsSnapNumber.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                // Merge and deduplicate records
                const mergedRecordsMap = new Map();
                records.forEach(record => mergedRecordsMap.set(record.id, record));
                recordsNumber.forEach(record => mergedRecordsMap.set(record.id, record));
                records = Array.from(mergedRecordsMap.values()).sort((a, b) => (b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0) - (a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0));
            }
            setProductHistory(records);

        } catch (error) {
            console.error("查詢產品失敗 (Firestore):", error);
            setStatusMessage("查詢產品資料時發生錯誤。");
            setLookupStatus('ready');
            setProductHistory([]);
        }
    }, [setProductName, setLookupStatus, setProductHistory, setStatusMessage]);

    useEffect(() => {
        if (isAuthReady) { // Only run if auth is ready
            const timer = setTimeout(() => {
                // Pass current productName and storeName from state
                lookupProduct(barcode, productName, storeName);
            }, 500);
            return () => clearTimeout(timer);
        } else if (barcode.length === 0) {
            clearForm();
        }
    }, [barcode, isAuthReady, lookupProduct, clearForm, productName, storeName]);

    useEffect(() => {
        if (statusMessage) {
            const timer = setTimeout(() => { setStatusMessage(''); }, 3000);
            return () => clearTimeout(timer);
        }
    }, [statusMessage]);

    const handleAiCaptureSuccess = useCallback((result) => {
        const { scannedBarcode, productName, extractedPrice, storeName, discountDetails, quantity, unitType, specialPrice, capturedImage: receivedImage } = result;
        setOcrResult(result);
        
        // 設置捕獲的圖像
        if (receivedImage) {
            setCapturedImage(receivedImage);
        }
        
        const newBarcode = scannedBarcode || '';
        setBarcode(newBarcode);

        if (!newBarcode) {
            setStatusMessage("AI 未能識別條碼，請手動輸入或確保條碼清晰！");
        } else {
            setStatusMessage(`AI 分析成功！`);
        }

        setProductName(productName || '');
        
        // 優先使用特價，如果有的話
        const finalPrice = specialPrice && !isNaN(parseFloat(specialPrice)) ? specialPrice : extractedPrice;
        setCurrentPrice(finalPrice || '');
        
        setStoreName(storeName || '');
        setDiscountDetails(discountDetails || '');

        setQuantity(quantity || '');
        setUnitType(unitType || 'pcs');

        if (productName && newBarcode) {
            setLookupStatus('found');
        } else {
            setLookupStatus('new');
        }
    }, [setBarcode, setProductName, setCurrentPrice, setStoreName, setDiscountDetails, setOcrResult, setStatusMessage, setLookupStatus, setQuantity, setUnitType, setCapturedImage]);

    // 新增函數：將辨識結果加入待確認序列
    const handleQueueNextCapture = useCallback((result) => {
        // 將結果加入待確認的辨識卡片中
        setPendingOcrCards(prev => [...prev, { ...result, id: Date.now() }]);
        setStatusMessage(`已將辨識結果加入待確認序列！`);
    }, []);

    // 新增函數：移除待確認的辨識卡片
    const handleRemovePendingOcrCard = useCallback((cardId) => {
        setPendingOcrCards(prev => prev.filter(item => item.id !== cardId));
    }, []);

    const saveAndComparePrice = useCallback(async (selectedStore) => {
        const finalStoreName = selectedStore || storeName;
        const numericalID = generateProductId(barcode, productName, finalStoreName);
        
        // 使用新的價格計算函數來確定最終價格
        const finalPrice = calculateFinalPrice(currentPrice, ocrResult?.specialPrice);
        const priceValue = parseFloat(finalPrice);

        // 使用 calculateUnitPrice 函數計算單價
        const calculatedUnitPrice = calculateUnitPrice(priceValue, quantity, unitType);

        if (!userId || !productName || isNaN(priceValue) || isNaN(parseFloat(quantity)) || parseFloat(quantity) <= 0 || calculatedUnitPrice === null) {
            showUserFriendlyError("請確保已輸入條碼、產品名稱、有效總價、數量和單位！", "資料驗證");
            return;
        }
        if (!finalStoreName.trim()) {
            setIsStoreSelectorOpen(true);
            return;
        }

        setIsLoading(true);
        
        try {
            const productRef = doc(db, "products", numericalID.toString());
            const productSnap = await getDoc(productRef);
            
            // 準備產品文檔數據
            const productData = {
                numericalID,
                barcodeData: barcode,
                productName,
                createdAt: productSnap.exists() ? productSnap.data().createdAt : serverTimestamp(),
                lastUpdatedBy: userId,
            };

            // 準備價格記錄數據
            const priceRecord = {
                numericalID,
                productName,
                storeName: finalStoreName,
                price: priceValue, // 總價
                quantity: parseFloat(quantity),
                unitType: unitType,
                unitPrice: calculatedUnitPrice, // 單價
                discountDetails: discountDetails || '',
                timestamp: serverTimestamp(),
                recordedBy: userId,
                // 保存原價和特價信息（如果有的話）
                originalPrice: ocrResult?.originalPrice ? parseFloat(ocrResult.originalPrice) : null,
                specialPrice: ocrResult?.specialPrice ? parseFloat(ocrResult.specialPrice) : null
            };

            // 儲存價格記錄
            const priceRecordDocRef = await addDoc(collection(db, "priceRecords"), priceRecord);
            
            // 檢查是否需要更新產品文檔中的最佳單價
            let isBestPrice = false;
            if (productSnap.exists()) {
                const existingProductData = productSnap.data();
                // 如果產品文檔中沒有 bestUnitPrice 或新價格更低，則更新
                if (existingProductData.bestUnitPrice === undefined || calculatedUnitPrice < existingProductData.bestUnitPrice) {
                    productData.bestUnitPrice = calculatedUnitPrice;
                    productData.bestPriceRecordRef = priceRecordDocRef.path; // 儲存指向最佳價格記錄的引用路徑
                    isBestPrice = true;
                } else {
                    // 保持現有的最佳價格信息
                    productData.bestUnitPrice = existingProductData.bestUnitPrice;
                    productData.bestPriceRecordRef = existingProductData.bestPriceRecordRef;
                }
            } else {
                // 新產品，當前價格就是最佳價格
                productData.bestUnitPrice = calculatedUnitPrice;
                productData.bestPriceRecordRef = priceRecordDocRef.path;
                isBestPrice = true;
            }
            
            // 儲存或更新產品文檔
            await setDoc(productRef, productData);

            // 準備比價結果
            let toastStatus, toastMessage, isBest, bestPrice, bestStore;

            if (isBestPrice) {
                isBest = true;
                bestPrice = calculatedUnitPrice;
                bestStore = finalStoreName;
                toastStatus = 'success';
                toastMessage = '恭喜！這是目前紀錄中的最低單價！';
            } else {
                isBest = false;
                bestPrice = productData.bestUnitPrice;
                
                // 從 Firestore 獲取最佳價格記錄的商店名稱
                try {
                    const bestPriceRecordDoc = await getDoc(doc(db, productData.bestPriceRecordRef));
                    if (bestPriceRecordDoc.exists()) {
                        bestStore = bestPriceRecordDoc.data().storeName;
                    } else {
                        bestStore = '未知商店';
                    }
                } catch (error) {
                    console.error("獲取最佳價格記錄失敗:", error);
                    bestStore = '未知商店';
                }
                
                toastStatus = 'warning';
                toastMessage = `非最低單價。歷史最低單價為 $${formatUnitPrice(productData.bestUnitPrice)} (${bestStore})`;
            }

            setComparisonResult({ isBest, bestPrice, bestStore, message: toastMessage });
            // 儲存成功時顯示提示訊息
            setSaveResultToast({ status: toastStatus, message: toastMessage, productName: productName });
            
            lookupProduct(barcode, productName, finalStoreName);

        } catch (error) {
            console.error("儲存或比價失敗 (Firestore):", error);
            const userMessage = handleFirestoreSaveError(error, "儲存價格資訊");
            showUserFriendlyError(userMessage);
        } finally {
            setIsLoading(false);
        }
    }, [userId, barcode, productName, currentPrice, discountDetails, storeName, lookupProduct, quantity, unitType, setSaveResultToast, setComparisonResult, setIsLoading, setIsStoreSelectorOpen, ocrResult]);

    const handleStoreSelect = useCallback((selectedStore) => {
        setStoreName(selectedStore);
        setIsStoreSelectorOpen(false);
        saveAndComparePrice(selectedStore);
    }, [saveAndComparePrice]);

    const handleCaptureModalClose = useCallback(() => {
        setIsCaptureModalOpen(false);
        stopCameraStream();
    }, [stopCameraStream]);

    const handleNewScanClick = async () => {
        clearForm();
        const stream = await startCameraStream();
        if (stream) {
            setIsCaptureModalOpen(true);
        } else {
            // 如果無法啟動相機，顯示錯誤訊息
            setStatusMessage("無法啟動相機，請檢查權限設置");
        }
    };

    const themePrimary = currentTheme.primary;
    const themeText = currentTheme.text;
    const themeLight = currentTheme.light;
    const themeBorder = currentTheme.border;
    const themeHover = currentTheme.hover; // 添加這一行來定義 themeHover

    const productNamePlaceholder = useMemo(() => {
        switch(lookupStatus) {
            case 'searching': return '正在查詢產品資料...';
            case 'found': return '產品名稱已自動載入';
            case 'new': return '產品不存在，請手動輸入名稱';
            default: return '請先輸入條碼或掃描條碼';
        }
    }, [lookupStatus]);

    if (!isAuthReady) {
        return <div className="flex items-center justify-center min-h-screen bg-gray-50"><p className="text-xl text-gray-700">正在連線至雲端服務...</p></div>;
    }

    if (currentPage === 'allRecords') {
        return <AllRecordsPage theme={currentTheme} onBack={() => setCurrentPage('main')} db={db} />;
    }

    return (
        <div className={`min-h-screen p-4 sm:p-8 ${themeLight}`}>
            <SaveResultToast result={saveResultToast} onClose={() => setSaveResultToast(null)} />
            
            {/* 根據 currentPage 狀態渲染不同頁面 */}
            {currentPage === 'main' && (
                <div className="max-w-xl mx-auto">
                    <header className="flex justify-between items-center mb-6 border-b pb-4">
                        <h1 className={`text-3xl font-extrabold ${themeText} flex items-center`}><Barcode className="w-8 h-8 mr-2" />條碼比價神器 (Cloud)</h1>
                        <div className="flex items-center space-x-3">
                            {/* 新增待辨識的按鈕 */}
                            <button 
                                onClick={() => setCurrentPage('ocrQueue')}
                                className={`relative p-2 rounded-full text-white shadow-md transition-all ${themePrimary} hover:opacity-80`}
                                title={`待辨識 (${pendingOcrCards.length})`}
                            >
                                <Zap className="w-5 h-5" />
                                {pendingOcrCards.length > 0 && (
                                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                                        {pendingOcrCards.length}
                                    </span>
                                )}
                            </button>
                            <button onClick={() => setCurrentPage('allRecords')} className={`p-2 rounded-full text-white shadow-md transition-all ${themePrimary} hover:opacity-80`} title="查看所有記錄"><Database className="w-5 h-5" /></button>
                            <button onClick={() => setIsThemeModalOpen(true)} className={`p-2 rounded-full text-white shadow-md transition-all ${themePrimary} hover:opacity-80`} title="設定介面主題"><PaintBucket className="w-5 h-5" /></button>
                            <p className="text-sm text-gray-500 hidden sm:block">User: {userId.slice(0, 8)}...</p>
                        </div>
                    </header>

                    {statusMessage && <div className="bg-blue-500 text-white p-3 rounded-lg shadow-md mb-4 text-center font-medium">{statusMessage}</div>}

                    {ocrResult && (
                        <div className="bg-yellow-100 border border-yellow-300 rounded-lg p-4 mb-6">
                            <h3 className="text-lg font-semibold text-yellow-800 mb-2">AI 辨識結果 (開發者確認區)</h3>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <div>條碼:</div><div>{ocrResult.scannedBarcode || 'N/A'}</div>
                                <div>品名:</div><div>{ocrResult.productName || 'N/A'}</div>
                                {/* 顯示原價和特價信息 */}
                                {ocrResult.specialPrice ? (
                                    <>
                                        {ocrResult.originalPrice && (
                                            <>
                                                <div>原價:</div><div className="line-through text-red-500">${ocrResult.originalPrice.toFixed(2)}</div>
                                            </>
                                        )}
                                        <div>特價:</div><div className="text-green-600 font-bold">${ocrResult.specialPrice.toFixed(2)}</div>
                                    </>
                                ) : (
                                    <>
                                        <div>價格:</div><div>${ocrResult.extractedPrice || 'N/A'}</div>
                                    </>
                                )}
                                <div>數量:</div><div>{ocrResult.quantity || 'N/A'}</div>
                                <div>商店:</div><div>{ocrResult.storeName || 'N/A'}</div>
                                <div>折扣:</div><div>{ocrResult.discountDetails || '無'}</div>
                            </div>
                            <button onClick={() => setOcrResult(null)} className="mt-3 px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 text-sm">關閉</button>
                        </div>
                    )}

                    <div className={`p-6 rounded-xl shadow-2xl bg-white border-t-4 ${themeBorder}`}>
                        <h2 className={`text-xl font-semibold ${themeText} mb-6 flex items-center`}><Zap className="w-5 h-5 mr-2" />步驟 1: AI 視覺自動擷取</h2>
                        <button className={`w-full p-4 rounded-lg text-white font-bold text-lg shadow-xl transition-all ${themePrimary} hover:opacity-80 flex items-center justify-center`} onClick={handleNewScanClick}>
                            <Camera className="inline-block w-6 h-6 mr-3" />開啟鏡頭擷取
                        </button>
                        <hr className="my-6 border-gray-200" />
                        <h2 className={`text-xl font-semibold text-gray-700 mb-4 flex items-center`}><FileText className="w-5 h-5 mr-2" />步驟 2: 檢查或手動輸入</h2>
                        
                        {/* 新增的擷取畫面顯示區塊 */}
                        {capturedImage && (
                            <div className="mb-6">
                                <label className="block text-gray-700 font-medium mb-2">擷取畫面 (請確認辨識資料是否正確)</label>
                                <div className="border-2 border-dashed border-gray-300 rounded-lg p-2 bg-gray-50 relative overflow-hidden">
                                    <div className="relative w-full aspect-video">
                                        {capturedImage.startsWith('data:image') ? (
                                            <img src={capturedImage} alt="擷取畫面" className="w-full h-full object-cover" />
                                        ) : (
                                            <img src={capturedImage} alt="擷取畫面" className="w-full h-full object-cover" />
                                        )}
                                    </div>
                                </div>
                                <p className="text-sm text-gray-500 mt-2">此圖片將持續顯示直到進行下一次辨識或退出應用程式</p>
                            </div>
                        )}
                        
                        <div className="mb-4">
                            <label className="block text-gray-700 font-medium mb-1">條碼數據</label>
                            <input type="text" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="AI 自動填入，或手動輸入" className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div className="mb-4">
                            <label className="block text-gray-700 font-medium mb-1">產品名稱</label>
                            <input type="text" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder={productNamePlaceholder} className={`w-full p-3 border border-gray-300 rounded-lg ${lookupStatus === 'found' ? 'bg-green-50' : lookupStatus === 'new' ? 'bg-yellow-50' : ''}`} readOnly={lookupStatus === 'found' && !ocrResult} />
                            <p className="text-sm text-gray-500 mt-1">ID (Hash): {barcode ? djb2Hash(barcode) : 'N/A'}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-gray-700 font-medium mb-1">總價 ($) <span className="text-red-500">*</span></label>
                                <input type="number" value={currentPrice} onChange={(e) => setCurrentPrice(e.target.value)} placeholder="AI 擷取" className="w-full p-3 border border-gray-300 rounded-lg" />
                            </div>
                            <div>
                                <label className="block text-gray-700 font-medium mb-1">商店名稱</label>
                                <input 
                                    type="text" 
                                    value={storeName} 
                                    onFocus={() => setIsStoreSelectorOpen(true)}
                                    readOnly
                                    placeholder="點擊選擇商店"
                                    className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50 cursor-pointer"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 mb-4">
                            <div>
                                <label className="block text-gray-700 font-medium mb-1">數量 <span className="text-red-500">*</span></label>
                                <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="例如: 500" className="w-full p-3 border border-gray-300 rounded-lg" />
                            </div>
                            <div>
                                <label className="block text-gray-700 font-medium mb-1">單位 <span className="text-red-500">*</span></label>
                                <select value={unitType} onChange={(e) => setUnitType(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg">
                                    <option value="ml">ml (毫升)</option>
                                    <option value="g">g (克)</option>
                                    <option value="pcs">pcs (個/包/支/條)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-gray-700 font-medium mb-1">單價 (每100g/ml)</label>
                                <input type="text" value={formatUnitPrice(unitPrice)} readOnly className="w-full p-3 border border-gray-300 rounded-lg bg-gray-100" />
                            </div>
                        </div>
                        <div className="mb-6">
                            <label className="block text-gray-700 font-medium mb-1">優惠細節</label>
                            <input type="text" value={discountDetails} onChange={(e) => setDiscountDetails(e.target.value)} placeholder="例如: 買二送一" className="w-full p-3 border border-gray-300 rounded-lg" />
                        </div>
                        <button className={`w-full mt-4 p-3 rounded-lg text-white font-semibold shadow-lg transition-all bg-emerald-500 hover:bg-emerald-600`} onClick={() => saveAndComparePrice()} disabled={isLoading}>
                            <ClipboardCheck className="inline-block w-5 h-5 mr-2" />{isLoading ? '處理中...' : '步驟 3: 儲存紀錄並比價'}
                        </button>
                    </div>

                    <div className="mt-8">
                        <h2 className={`text-xl font-semibold ${themeText} mb-4 flex items-center`}>
                            <DollarSign className="w-5 h-5 mr-2" />
                            比價結果 {productName && <span className="ml-2 font-normal text-gray-500">- {productName}</span>}
                        </h2>
                        <div className={`p-6 rounded-xl shadow-xl border-2 ${comparisonResult.isBest ? 'border-green-500 bg-green-50' : 'border-yellow-500 bg-yellow-50'}`}>
                            <p className={`text-lg font-bold ${comparisonResult.isBest ? 'text-green-700' : 'text-yellow-700'}`}>{comparisonResult.message}</p>
                            {comparisonResult.bestPrice && <p className="text-sm text-gray-600 mt-2">歷史最低標價: ${comparisonResult.bestPrice}</p>}
                            <p className="text-xs text-gray-500 mt-2">**附註:** 您的紀錄已安全儲存在雲端。</p>
                        </div>
                    </div>

                    {(lookupStatus === 'found' || lookupStatus === 'new') && <PriceHistoryDisplay historyRecords={productHistory} theme={currentTheme} />}
                    
                    {/* 在主介面添加一個快捷處理待辨識卡片的按鈕 */}
                    {pendingOcrCards.length > 0 && (
                        <div className="mt-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h3 className="font-bold text-yellow-800">有待辨識的項目</h3>
                                    <p className="text-sm text-yellow-600">您有 {pendingOcrCards.length} 個待辨識的項目等待處理</p>
                                </div>
                                <button 
                                    onClick={() => {
                                        // 處理第一個待辨識的卡片
                                        const firstCard = pendingOcrCards[0];
                                        
                                        // 設置表單數據
                                        setOcrResult(firstCard);
                                        setCapturedImage(firstCard.capturedImage);
                                        setBarcode(firstCard.scannedBarcode || '');
                                        setProductName(firstCard.productName || '');
                                        setCurrentPrice(firstCard.extractedPrice || '');
                                        setStoreName(firstCard.storeName || '');
                                        setDiscountDetails(firstCard.discountDetails || '');
                                        setQuantity(firstCard.quantity || '');
                                        setUnitType(firstCard.unitType || 'pcs');
                                        
                                        // 計算單價
                                        const priceValue = parseFloat(firstCard.extractedPrice);
                                        const qty = parseFloat(firstCard.quantity);
                                        if (!isNaN(priceValue) && !isNaN(qty) && qty > 0) {
                                            const calculatedUnitPrice = calculateUnitPrice(priceValue, qty, firstCard.unitType);
                                            setUnitPrice(calculatedUnitPrice);
                                        }
                                        
                                        // 更新狀態
                                        if (firstCard.productName && firstCard.scannedBarcode) {
                                            setLookupStatus('found');
                                        } else {
                                            setLookupStatus('new');
                                        }
                                        
                                        // 從待辨識序列中移除該卡片
                                        setPendingOcrCards(prev => prev.filter(item => item.id !== firstCard.id));
                                        
                                        // 顯示提示訊息
                                        setStatusMessage(`已載入待辨識項目: ${firstCard.productName || '未命名產品'}`);
                                    }}
                                    className={`px-4 py-2 rounded-lg text-white font-medium ${themePrimary} ${themeHover}`}
                                >
                                    處理第一個待辨識項目
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
            
            {currentPage === 'allRecords' && (
                <AllRecordsPage theme={currentTheme} onBack={() => setCurrentPage('main')} db={db} />
            )}
            
            {currentPage === 'ocrQueue' && (
                <OcrQueuePage 
                    theme={currentTheme} 
                    onBack={() => setCurrentPage('main')} 
                    pendingOcrCards={pendingOcrCards}
                    onRemoveCard={handleRemovePendingOcrCard}
                    onStoreSelect={setPendingOcrCards}
                />
            )}

            {isThemeModalOpen && <ThemeSelector theme={currentTheme} saveTheme={saveUserTheme} onClose={() => setIsThemeModalOpen(false)} />}
            {isCaptureModalOpen && <AIOcrCaptureModal theme={currentTheme} onAnalysisSuccess={handleAiCaptureSuccess} onClose={handleCaptureModalClose} stream={streamRef.current} onQueueNextCapture={handleQueueNextCapture} />}
            {isStoreSelectorOpen && <StoreSelector theme={currentTheme} onSelect={handleStoreSelect} onClose={() => setIsStoreSelectorOpen(false)} />}
        </div>
    );
}

export default App;
