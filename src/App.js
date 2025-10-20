import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { PaintBucket, DollarSign, Barcode, ClipboardCheck, X, Camera, Zap, FileText, RotateCcw, Database } from 'lucide-react';
import AllRecordsPage from './AllRecordsPage';
import StoreSelector from './StoreSelector';
import { db } from './firebase-config.js'; // <-- 引入 Firebase
import { getAuth, signInAnonymously } from "firebase/auth";
import { doc, getDoc, setDoc, collection, query, where, getDocs, addDoc, orderBy, serverTimestamp } from "firebase/firestore";

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

async function callGeminiApiWithRetry(payload, apiUrl, maxRetries = 3) {
    let lastError = null;
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorBody = await response.json();
                throw new Error(`API response error: ${response.status} - ${errorBody.error?.message || 'Unknown error'}`);
            }

            const result = await response.json();
            const candidate = result.candidates?.[0];

            if (candidate && candidate.content?.parts?.[0]?.text) {
                const jsonText = candidate.content.parts[0].text;
                try {
                    return JSON.parse(jsonText);
                } catch (parseError) {
                    console.error("JSON Parse Error:", jsonText, parseError);
                    throw new Error("AI 輸出格式錯誤，無法解析 JSON。");
                }
            } else {
                throw new Error("AI 無法生成有效內容。");
            }

        } catch (error) {
            lastError = error;
            console.warn(`API call failed (Attempt ${i + 1}/${maxRetries}):`, error.message);
            if (i < maxRetries - 1) {
                const delay = Math.pow(2, i) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError;
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
                            <span className="text-2xl text-red-600">{isNaN(record.displayPrice) || record.displayPrice === null ? 'N/A' : `$${record.displayPrice.toFixed(2)}`}</span>
                            <span className="text-xs text-gray-500">{record.timestamp.toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-gray-700 mt-1">商店: {record.storeName || '未標註'}</p>
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

function AIOcrCaptureModal({ theme, onAnalysisSuccess, onClose, stream }) {
    const videoRef = useRef(null);
    const [scanError, setScanError] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [capturedImage, setCapturedImage] = useState(null);

    const resetState = () => {
        setScanError('');
        setCapturedImage(null);
        setIsAnalyzing(false);
    };

    useEffect(() => {
        resetState();
        if (stream && videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(err => {
                console.error("Video play failed:", err);
                setScanError("無法播放相機影像。");
            });
        }
    }, [stream]);

    const handleCapture = useCallback(() => {
        if (!videoRef.current || !videoRef.current.srcObject) return;
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        const renderedVideoWidth = video.offsetWidth;
        const renderedVideoHeight = video.offsetHeight;
        const targetCanvasWidth = renderedVideoWidth * 0.75;
        const targetCanvasHeight = renderedVideoHeight * 0.75;
        const scaleFactor = Math.max(renderedVideoWidth / video.videoWidth, renderedVideoHeight / video.videoHeight);
        const scaledIntrinsicWidth = video.videoWidth * scaleFactor;
        const scaledIntrinsicHeight = video.videoHeight * scaleFactor;
        const offsetX = (renderedVideoWidth - scaledIntrinsicWidth) / 2;
        const offsetY = (renderedVideoHeight - scaledIntrinsicHeight) / 2;
        const captureX_rendered = (renderedVideoWidth - targetCanvasWidth) / 2;
        const captureY_rendered = (renderedVideoHeight - targetCanvasHeight) / 2;
        const sx = (captureX_rendered - offsetX) / scaleFactor;
        const sy = (captureY_rendered - offsetY) / scaleFactor;
        const sWidth = targetCanvasWidth / scaleFactor;
        const sHeight = targetCanvasHeight / scaleFactor;
        canvas.width = sWidth;
        canvas.height = sHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
        const base64Data = canvas.toDataURL('image/jpeg', 0.9);
        setCapturedImage(base64Data);
        
        // Stop video playback after capture
        if (videoRef.current) {
            videoRef.current.pause();
        }
    }, []);

    const handleRetake = () => {
        resetState();
        if (videoRef.current) {
            videoRef.current.play().catch(err => console.error("Video play failed:", err));
        }
    };

    const handleAnalyze = useCallback(async () => {
        if (!capturedImage) { setScanError("沒有可分析的影像。"); return; }
        setIsAnalyzing(true);
        setScanError('');
        try {
            const base64Image = capturedImage.split(',')[1];
            const systemPrompt = "You are a data extractor. Your sole purpose is to extract information from the provided image and return it in the requested JSON format. Do not use any introductory or explanatory text.";
            const userPrompt = "分析此產品或價目標籤的影像，並提取所需的結構化資訊。請在 discountDetails 中提供所有相關的促銷訊息，例如買一送一、有效期限等。";
            const apiUrl = `/.netlify/functions/gemini-proxy`;
            const payload = { systemPrompt, userPrompt, base64Image };
            const analysisResult = await callGeminiApiWithRetry(payload, apiUrl);
            onAnalysisSuccess(analysisResult);
            onClose();
        } catch (error) {
            console.error("AI 分析失敗:", error);
            setScanError(`AI 分析錯誤: ${error.message}`);
        } finally {
            setIsAnalyzing(false);
        }
    }, [capturedImage, onAnalysisSuccess, onClose]);

    const handleSimulatedAnalysis = () => {
        const mockResult = { scannedBarcode: '4710123456789', productName: '測試產品名稱', extractedPrice: (Math.random() * 50 + 100).toFixed(0).toString(), storeName: '模擬超商 (AI)', discountDetails: '買二送一優惠 / 限時促銷' };
        onAnalysisSuccess(mockResult);
        onClose();
    };

    const themePrimary = theme.primary;
    const themeHover = theme.hover;

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-95 z-50 flex flex-col items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 transform transition-all flex flex-col items-center">
                <header className="flex justify-between items-center w-full mb-4 border-b pb-2">
                    <h3 className={`text-xl font-bold ${theme.text} flex items-center`}><Zap className="inline-block w-5 h-5 mr-2" />AI 視覺擷取與分析</h3>
                    <button onClick={onClose} className="p-1 rounded-full text-gray-500 hover:text-gray-900"><X className="w-6 h-6" /></button>
                </header>
                {isAnalyzing && <div className={`w-full p-4 mb-4 rounded-lg bg-yellow-100 text-yellow-800 flex items-center justify-center`}>...分析中...</div>}
                {scanError ? <div className="text-red-600 bg-red-100 p-4 rounded-lg w-full mb-4 text-center">{scanError}</div> : (
                    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden mb-4 border-4 border-dashed border-white">
                        {capturedImage ? <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" /> : <video ref={videoRef} className="w-full h-full object-cover" playsInline muted></video>}
                        {!capturedImage && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="w-[75%] h-[75%] border-4 border-yellow-400 border-opacity-75 rounded-lg shadow-lg"></div></div>}
                    </div>
                )}
                <div className="w-full">
                    {!capturedImage && !scanError && <button onClick={handleCapture} className={`w-full p-3 mb-3 rounded-lg text-white font-semibold shadow-lg transition-all ${themePrimary} ${themeHover} flex items-center justify-center`} disabled={isAnalyzing}><Camera className="w-5 h-5 mr-2" />擷取畫面</button>}
                    {capturedImage && !scanError && (
                        <div className="grid grid-cols-2 gap-4 mb-3">
                            <button onClick={handleRetake} className="w-full p-3 rounded-lg bg-gray-500 hover:bg-gray-600 text-white font-semibold shadow-lg transition-all flex items-center justify-center" disabled={isAnalyzing}>重新拍攝</button>
                            <button onClick={handleAnalyze} className={`w-full p-3 rounded-lg text-white font-semibold shadow-lg transition-all ${themePrimary} ${themeHover} flex items-center justify-center`} disabled={isAnalyzing}><Zap className="w-5 h-5 mr-2" />開始 AI 分析</button>
                        </div>
                    )}
                    <button onClick={handleSimulatedAnalysis} className="w-full p-3 mb-3 bg-gray-500 hover:bg-gray-600 text-white font-semibold rounded-lg shadow-lg transition-all" disabled={isAnalyzing}>模擬 AI 分析成功 (測試用)</button>
                    <button onClick={onClose} className="w-full p-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg shadow-lg transition-all" disabled={isAnalyzing}>關閉</button>
                </div>
            </div>
        </div>
    );
}


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
    const [currentPage, setCurrentPage] = useState('main');
    const [ocrResult, setOcrResult] = useState(null);

    useEffect(() => {
        const price = parseFloat(currentPrice);
        const qty = parseFloat(quantity);

        if (!isNaN(price) && !isNaN(qty) && qty > 0) {
            let calculatedUnitPrice;
            if (unitType === 'g' || unitType === 'ml') {
                calculatedUnitPrice = (price / qty) * 100;
            } else { // For 'pcs' and any other unit
                calculatedUnitPrice = price / qty;
            }
            setUnitPrice(calculatedUnitPrice);
        } else {
            setUnitPrice(null);
        }
    }, [currentPrice, quantity, unitType]);
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
    }, []);

    const stopCameraStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
            console.log("Camera stream stopped.");
        }
    }, []);

    useEffect(() => {
        // Add a cleanup function to stop the camera when the component unmounts
        return () => {
            stopCameraStream();
        };
    }, [stopCameraStream]);

    const startCameraStream = async () => {
        if (streamRef.current) {
            return streamRef.current;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } });
            streamRef.current = stream;
            console.log("Camera stream started.");
            return stream;
        } catch (err) {
            console.error("無法存取攝影機:", err);
            setStatusMessage(`無法存取攝影機: ${err.name}`);
            return null;
        }
    };

    const lookupProduct = useCallback(async (barcodeData) => {
        if (!barcodeData || barcodeData.length < 5) {
            setProductName('');
            setLookupStatus('ready');
            setProductHistory([]);
            return;
        }

        setLookupStatus('searching');
        const numericalID = djb2Hash(barcodeData);
        
        try {
            const productRef = doc(db, "products", numericalID.toString());
            const productSnap = await getDoc(productRef);

            if (productSnap.exists()) {
                setProductName(productSnap.data().productName);
                setLookupStatus('found');
            } else {
                setLookupStatus('new');
            }

            const recordsQuery = query(
                collection(db, "priceRecords"),
                where("numericalID", "==", numericalID),
                orderBy("timestamp", "desc")
            );
            const recordsSnap = await getDocs(recordsQuery);
            const records = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setProductHistory(records);

        } catch (error) {
            console.error("查詢產品失敗 (Firestore):", error);
            setStatusMessage("查詢產品資料時發生錯誤。");
            setLookupStatus('ready');
            setProductHistory([]);
        }
    }, []);

    useEffect(() => {
        if (barcode.length > 0 && isAuthReady) {
            const timer = setTimeout(() => { lookupProduct(barcode); }, 500);
            return () => clearTimeout(timer);
        } else if (barcode.length === 0) {
            clearForm();
        }
    }, [barcode, isAuthReady, lookupProduct, clearForm]);

    useEffect(() => {
        if (statusMessage) {
            const timer = setTimeout(() => { setStatusMessage(''); }, 3000);
            return () => clearTimeout(timer);
        }
    }, [statusMessage]);

    const handleAiCaptureSuccess = useCallback((result) => {
        const { scannedBarcode, productName, extractedPrice, storeName, discountDetails } = result;
        setOcrResult(result);
        
        const newBarcode = scannedBarcode || '';
        setBarcode(newBarcode);

        if (!newBarcode) {
            setStatusMessage("AI 未能識別條碼，請手動輸入或確保條碼清晰！");
        } else {
            setStatusMessage(`AI 分析成功！`);
        }

        setProductName(productName || '');
        setCurrentPrice(extractedPrice || '');
        setStoreName(storeName || '');
        setDiscountDetails(discountDetails || '');

        if (productName && newBarcode) {
            setLookupStatus('found');
        } else {
            setLookupStatus('new');
        }
    }, []);

    const saveAndComparePrice = useCallback(async (selectedStore) => {
        const finalStoreName = selectedStore || storeName;
        const numericalID = djb2Hash(barcode);
        const priceValue = parseFloat(currentPrice);

        if (!userId || !barcode || !productName || isNaN(priceValue) || isNaN(parseFloat(quantity)) || parseFloat(quantity) <= 0 || unitPrice === null) {
            setSaveResultToast({ status: 'error', message: '請確保已輸入條碼、產品名稱、有效總價、數量和單位！', productName: productName || "未知產品" });
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
            if (!productSnap.exists()) {
                await setDoc(productRef, {
                    numericalID,
                    barcodeData: barcode,
                    productName,
                    createdAt: serverTimestamp(),
                    lastUpdatedBy: userId,
                });
            }

            const priceRecord = {
                numericalID,
                productName,
                storeName: finalStoreName,
                price: priceValue, // 總價
                quantity: parseFloat(quantity),
                unitType: unitType,
                unitPrice: unitPrice, // 單價
                discountDetails: discountDetails || '',
                timestamp: serverTimestamp(),
                recordedBy: userId,
            };
            await addDoc(collection(db, "priceRecords"), priceRecord);
            
            const recordsQuery = query(collection(db, "priceRecords"), where("numericalID", "==", numericalID));
            const recordsSnap = await getDocs(recordsQuery);
            const records = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            const allRecordsForCompare = [...records, { ...priceRecord, timestamp: new Date() }];

            let toastStatus, toastMessage, isBest, bestPrice, bestStore;

            if (allRecordsForCompare.length <= 1) {
                isBest = true;
                bestPrice = unitPrice;
                bestStore = finalStoreName;
                toastStatus = 'success';
                toastMessage = '這是第一筆紀錄，成功建立！';
            } else {
                const bestDeal = allRecordsForCompare.reduce((best, cur) => cur.unitPrice < best.unitPrice ? cur : best);
                isBest = unitPrice <= bestDeal.unitPrice;
                bestPrice = bestDeal.unitPrice;
                bestStore = bestDeal.storeName;
                
                if (isBest) {
                    toastStatus = 'success';
                    toastMessage = '恭喜！這是目前紀錄中的最低標價！';
                } else {
                    toastStatus = 'warning';
                    toastMessage = `非最低標價。歷史最低單價為 $${bestDeal.unitPrice.toFixed(2)} (${bestDeal.storeName})`;
                }
            }

            setComparisonResult({ isBest, bestPrice, bestStore, message: toastMessage });
            setSaveResultToast({ status: toastStatus, message: toastMessage, productName: productName });
            
            lookupProduct(barcode);

        } catch (error) {
            console.error("儲存或比價失敗 (Firestore):", error);
            setSaveResultToast({ status: 'error', message: `數據操作失敗: ${error.message}`, productName: productName || "未知產品" });
        } finally {
            setIsLoading(false);
        }
    }, [userId, barcode, productName, currentPrice, discountDetails, storeName, lookupProduct, quantity, unitType, unitPrice, setSaveResultToast, setComparisonResult, setIsLoading, setIsStoreSelectorOpen]);

    const handleStoreSelect = useCallback((selectedStore) => {
        setStoreName(selectedStore);
        setIsStoreSelectorOpen(false);
        saveAndComparePrice(selectedStore);
    }, [saveAndComparePrice]);

    const handleNewScanClick = async () => {
        clearForm();
        const stream = await startCameraStream();
        if (stream) {
            setIsCaptureModalOpen(true);
        }
    };

    const themePrimary = currentTheme.primary;
    const themeText = currentTheme.text;
    const themeLight = currentTheme.light;
    const themeBorder = currentTheme.border;

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
            <div className="max-w-xl mx-auto">
                <header className="flex justify-between items-center mb-6 border-b pb-4">
                    <h1 className={`text-3xl font-extrabold ${themeText} flex items-center`}><Barcode className="w-8 h-8 mr-2" />條碼比價神器 (Cloud)</h1>
                    <div className="flex items-center space-x-3">
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
                            <div>價格:</div><div>${ocrResult.extractedPrice || 'N/A'}</div>
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
                            <input type="text" value={unitPrice ? unitPrice.toFixed(2) : '-'} readOnly className="w-full p-3 border border-gray-300 rounded-lg bg-gray-100" />
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

                {(lookupStatus === 'found' || lookupStatus === 'new') && barcode && <PriceHistoryDisplay historyRecords={productHistory} theme={currentTheme} />}
            </div>

            {isThemeModalOpen && <ThemeSelector theme={currentTheme} saveTheme={saveUserTheme} onClose={() => setIsThemeModalOpen(false)} />}
            {isCaptureModalOpen && <AIOcrCaptureModal theme={currentTheme} onAnalysisSuccess={handleAiCaptureSuccess} onClose={() => setIsCaptureModalOpen(false)} stream={streamRef.current} />}
            {isStoreSelectorOpen && <StoreSelector theme={currentTheme} onSelect={handleStoreSelect} onClose={() => setIsStoreSelectorOpen(false)} />}
        </div>
    );
}

export default App;