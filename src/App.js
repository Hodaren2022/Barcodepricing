import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PaintBucket, DollarSign, Barcode, ClipboardCheck, X, Camera, Zap, FileText, RotateCcw, Database, Loader2 } from 'lucide-react';
import AllRecordsPage from './AllRecordsPage';
import StoreSelector from './StoreSelector';
import { db } from './firebase-config.js';
import { getAuth, signInAnonymously } from "firebase/auth";
import { doc, getDoc, setDoc, collection, query, where, getDocs, addDoc, orderBy, serverTimestamp, limit, startAfter } from "firebase/firestore";
import { calculateUnitPrice } from './utils/priceCalculations';

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
                const rawText = candidate.content.parts[0].text;
                try {
                    return JSON.parse(rawText);
                } catch (parseError) {
                    console.warn("JSON Parse Error, returning raw text:", rawText, parseError);
                    return { rawText: rawText }; 
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

const withExponentialBackoff = async (fn, retries = 5, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === retries - 1) throw error;
            console.warn(`Attempt ${i + 1} failed, retrying in ${delay}ms...`);
            const currentDelay = delay;
            await new Promise(resolve => setTimeout(resolve, currentDelay));
            delay *= 2;
        }
    }
};

function getCleanProductName(name) {
    if (!name) return '';
    return name
        .replace(/[\d.]+ *(g|ml|l|kg|cc|oz|入|支|條|包|個|顆|片|罐|瓶)/ig, '')
        .replace(/\s*\d+\s*號/g, '')
        .replace(/(家庭號|分享包|補充包|隨身包)/g, '')
        .replace(/[()（）[\]【】]/g, '')
        .trim();
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
        displayPrice: r.unitPrice !== undefined && r.unitPrice !== null ? r.unitPrice : r.price
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

function PriceHistoryDisplay({ historyRecords, theme, fetchMore, hasMore, isLoadingMore }) {
    if (historyRecords.length === 0) {
        return <div className="text-center p-6 text-gray-500 bg-white rounded-xl shadow-md">尚無歷史價格紀錄。</div>;
    }

    const formattedRecords = historyRecords.map(record => ({
        ...record,
        timestamp: record.timestamp?.toDate ? record.timestamp.toDate() : new Date(record.timestamp),
        unitPrice: record.unitPrice !== undefined ? record.unitPrice : calculateUnitPrice(record.price, record.quantity, record.unitType)
    }));

    return (
        <div className={`p-6 rounded-xl shadow-2xl bg-white border-t-4 ${theme.border} mt-8`}>
            <h2 className={`text-xl font-semibold ${theme.text} mb-4`}>價格紀錄 ({formattedRecords.length} 筆)</h2>
            <div className="mb-6"><PriceTrendChart records={formattedRecords} theme={theme} /></div>
            <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                {formattedRecords.map((record, index) => (
                    <div key={record.id || index} className={`p-3 rounded-lg shadow-sm border border-gray-100 ${index === 0 ? theme.light : 'bg-white'}`}>
                        <div className="flex justify-between items-start font-bold">
                            <span className="text-2xl text-red-600">{`$${(record.price || 0).toFixed(2)}`}{record.unitPrice !== null && ` @${(record.unitPrice).toFixed(2)}`}</span>
                            <span className="text-xs text-gray-500">{record.timestamp.toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-gray-700 mt-1">商店: {record.storeName || '未標註'}</p>
                        {record.quantity && record.unitType && <p className="text-xs text-gray-600">數量: {record.quantity} {record.unitType}</p>}
                        {record.discountDetails && <p className="text-xs text-indigo-600 italic">優惠: {record.discountDetails}</p>}
                        {index === 0 && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full text-white ${theme.primary}`}>最新紀錄</span>}
                    </div>
                ))}
            </div>
            {hasMore && (
                <div className="mt-4 text-center">
                    <button onClick={fetchMore} disabled={isLoadingMore} className={`w-full p-2 rounded-lg text-white font-semibold shadow-lg transition-all ${theme.primary} ${theme.hover} disabled:bg-gray-400`}>
                        {isLoadingMore ? <Loader2 className="inline-block w-5 h-5 mr-2 animate-spin" /> : '加載更多紀錄'}
                    </button>
                </div>
            )}
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

function AIOcrCaptureModal({ theme, onAnalysisSuccess, onClose }) {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const [scanError, setScanError] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [capturedImage, setCapturedImage] = useState(null);

    useEffect(() => {
        const getCameraStream = async () => {
            try {
                const mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
                });
                streamRef.current = mediaStream;
                if (videoRef.current) {
                    videoRef.current.srcObject = mediaStream;
                    videoRef.current.play().catch(err => {
                        console.error("Video play failed:", err);
                        setScanError("無法播放相機影像。");
                    });
                }
            } catch (err) {
                console.error("無法存取攝影機:", err);
                setScanError(`無法存取攝影機: ${err.name}. 請檢查權限設定。`);
            }
        };

        getCameraStream();

        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    const resetState = useCallback(() => {
        setScanError('');
        setCapturedImage(null);
        setIsAnalyzing(false);
    }, []);

    const handleCapture = useCallback(() => {
        if (!videoRef.current || !videoRef.current.srcObject) return;
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        const sWidth = video.videoWidth * 0.75;
        const sHeight = video.videoHeight * 0.75;
        const sx = (video.videoWidth - sWidth) / 2;
        const sy = (video.videoHeight - sHeight) / 2;

        canvas.width = sWidth;
        canvas.height = sHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
        const base64Data = canvas.toDataURL('image/jpeg', 0.9);
        setCapturedImage(base64Data);
        
        if (videoRef.current) {
            videoRef.current.pause();
        }
    }, []);

    const handleRetake = useCallback(() => {
        resetState();
        if (videoRef.current && streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
            videoRef.current.play().catch(err => console.error("Video play failed:", err));
        }
    }, [resetState]);

    const handleAnalyze = useCallback(async () => {
        if (!capturedImage) { setScanError("沒有可分析的影像。"); return; }
        setIsAnalyzing(true);
        setScanError('');
        try {
            const base64Image = capturedImage.split(',')[1];
            const userQuery = "請根據圖片中的條碼、標價、產品名稱、規格（質量/容量/數量）、商店名稱和折扣資訊，以嚴格的 JSON 格式輸出結構化數據。請特別注意計算產品的總容量/總質量。";
            const newSchema = {
                type: "OBJECT",
                properties: {
                    scannedBarcode: { "type": "STRING", "description": "影像中找到的 EAN, UPC 或其他產品條碼數字，如果不可見則為空字串。" },
                    productName: { "type": "STRING", "description": "產品名稱，例如：家庭號牛奶" },
                    listedPrice: { "type": "NUMBER", "description": "產品標價（純數字，例如 59）" },
                    totalCapacity: { "type": "NUMBER", "description": "產品的總容量/總質量/總數量（純數字）。例如：若產品是 '18克10入'，則總容量是 180；若產品是 '2000ml'，則總容量是 2000。" },
                    baseUnit: { "type": "STRING", "description": "用於計算單價的基礎單位。僅使用 'g' (克), 'ml' (毫升), 或 'pcs' (個/入)。如果是質量，請統一使用 'g'。" },
                    storeName: { "type": "STRING", "description": "價目標籤或收據所示的商店名稱。如果不可見則為空字串。" },
                    discountDetails: { "type": "STRING", "description": "發現的任何促銷或折扣的詳細描述（例如：'買一送一', '第二件半價', '有效期限 2026/01/01'）。如果沒有折扣則為空字串。" }
                },
                propertyOrdering: ["scannedBarcode", "productName", "listedPrice", "totalCapacity", "baseUnit", "storeName", "discountDetails"]
            };
            const systemPrompt = `你是一個專業的價格數據分析助理...`; // System prompt remains the same

            const apiUrl = `/.netlify/functions/gemini-proxy`;
            const payload = { systemPrompt, userPrompt: userQuery, base64Image, responseSchema: newSchema };
            const analysisResult = await withExponentialBackoff(() => callGeminiApiWithRetry(payload, apiUrl));
            
            const { 
                scannedBarcode = '', 
                productName = '', 
                listedPrice = 0, 
                totalCapacity = 0, 
                baseUnit = 'pcs', 
                storeName = 'AI 辨識', 
                discountDetails = '' 
            } = analysisResult;

            // REFACTOR: Use the extracted calculateUnitPrice function
            const unitPrice = calculateUnitPrice(listedPrice, totalCapacity, baseUnit);
            
            const finalData = {
                scannedBarcode,
                productName,
                extractedPrice: listedPrice.toString(),
                storeName,
                discountDetails,
                quantity: totalCapacity.toString(),
                unitType: baseUnit,
                unitPrice, // Pass calculated unit price
            };

            onAnalysisSuccess(finalData);
            onClose();
        } catch (error) {
            console.error("AI 分析失敗:", error);
            setScanError(`AI 分析錯誤: ${error.message}`);
        } finally {
            setIsAnalyzing(false);
        }
    }, [capturedImage, onAnalysisSuccess, onClose]);

    const handleSimulatedAnalysis = () => {
        const randomListedPrice = parseFloat((Math.random() * 50 + 100).toFixed(2));
        const randomTotalCapacity = Math.floor(Math.random() * 1000) + 100;
        const unitTypes = ['ml', 'g', 'pcs'];
        const randomBaseUnit = unitTypes[Math.floor(Math.random() * unitTypes.length)];
        
        const mockResult = {
            productName: '模擬產品名稱',
            listedPrice: randomListedPrice,
            totalCapacity: randomTotalCapacity,
            baseUnit: randomBaseUnit,
            scannedBarcode: '4710123456789',
            storeName: '模擬超商 (AI)',
            discountDetails: '買二送一優惠 / 限時促銷',
        };

        // REFACTOR: Use the extracted calculateUnitPrice function
        const unitPrice = calculateUnitPrice(mockResult.listedPrice, mockResult.totalCapacity, mockResult.baseUnit);

        const finalData = {
            scannedBarcode: mockResult.scannedBarcode || '',
            productName: mockResult.productName,
            extractedPrice: mockResult.listedPrice.toString(),
            storeName: mockResult.storeName || 'AI 辨識',
            discountDetails: mockResult.discountDetails || '',
            quantity: mockResult.totalCapacity.toString(),
            unitType: mockResult.baseUnit,
            unitPrice: unitPrice,
        };

        onAnalysisSuccess(finalData);
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
                {isAnalyzing && <div className={`w-full p-4 mb-4 rounded-lg bg-yellow-100 text-yellow-800 flex items-center justify-center`}><Loader2 className="inline-block w-5 h-5 mr-2 animate-spin" />...分析中...</div>}
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

    if (!result) return null;

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
                </div>
                <button onClick={onClose} className="ml-4 p-1 rounded-full hover:bg-white/20"><X className="w-5 h-5" /></button>
            </div>
        </div>
    );
}


// ----------------------------------------------------------------------------
// 5. 主應用程式元件 (App Component)
// ----------------------------------------------------------------------------

const RECORDS_PER_PAGE = 10;

function App() {
    const { userId, isAuthReady, currentTheme, saveUserTheme } = useFirebaseAuthentication();
    
    const [saveResultToast, setSaveResultToast] = useState(null);

    // UI & Data State
    const [barcode, setBarcode] = useState('');
    const [productName, setProductName] = useState('');
    const [price, setPrice] = useState('');
    const [quantity, setQuantity] = useState('');
    const [unitType, setUnitType] = useState('pcs');
    const [unitPrice, setUnitPrice] = useState(null);
    const [discountDetails, setDiscountDetails] = useState('');
    const [storeName, setStoreName] = useState('');
    const [records, setRecords] = useState([]);
    const [comparisonResult, setComparisonResult] = useState(null);
    const [statusMessage, setStatusMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [lookupStatus, setLookupStatus] = useState('ready');
    
    // Pagination State
    const [lastVisible, setLastVisible] = useState(null);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    // Modal and Page State
    const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
    const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false);
    const [isStoreSelectorOpen, setIsStoreSelectorOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState('main');
    const [ocrResult, setOcrResult] = useState(null);

    // REFACTOR: Calculate unit price in real-time using the utility function
    useEffect(() => {
        const calculatedUnitPrice = calculateUnitPrice(price, quantity, unitType);
        setUnitPrice(calculatedUnitPrice);
    }, [price, quantity, unitType]);

    const clearForm = useCallback((keepBarcode = false) => {
        if (!keepBarcode) setBarcode('');
        setProductName('');
        setPrice('');
        setQuantity('');
        setUnitType('pcs');
        setUnitPrice(null);
        setDiscountDetails('');
        setStoreName('');
        setRecords([]);
        setComparisonResult(null);
        setOcrResult(null);
        setLookupStatus('ready');
        setLastVisible(null);
        setHasMore(true);
    }, []);

    // REFACTOR: lookupProduct now handles initial paginated fetch
    const lookupProduct = useCallback(async (barcodeData) => {
        if (!barcodeData || barcodeData.length < 5) {
            clearForm();
            return;
        }

        setLookupStatus('searching');
        setIsLoading(true);
        clearForm(true); // Clear previous data but keep barcode

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
                orderBy("timestamp", "desc"),
                limit(RECORDS_PER_PAGE)
            );
            const recordsSnap = await getDocs(recordsQuery);
            const fetchedRecords = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setRecords(fetchedRecords);

            if (recordsSnap.docs.length < RECORDS_PER_PAGE) {
                setHasMore(false);
            } else {
                setLastVisible(recordsSnap.docs[recordsSnap.docs.length - 1]);
            }

        } catch (error) {
            console.error("查詢產品失敗 (Firestore):", error);
            setStatusMessage("查詢產品資料時發生錯誤。");
            setLookupStatus('error');
        } finally {
            setIsLoading(false);
        }
    }, [clearForm]);

    // REFACTOR: New function to fetch more records for pagination
    const fetchMoreRecords = useCallback(async () => {
        if (!hasMore || isLoadingMore) return;

        setIsLoadingMore(true);
        const numericalID = djb2Hash(barcode);

        try {
            const recordsQuery = query(
                collection(db, "priceRecords"),
                where("numericalID", "==", numericalID),
                orderBy("timestamp", "desc"),
                startAfter(lastVisible),
                limit(RECORDS_PER_PAGE)
            );
            const recordsSnap = await getDocs(recordsQuery);
            const newRecords = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            setRecords(prev => [...prev, ...newRecords]);

            if (recordsSnap.docs.length < RECORDS_PER_PAGE) {
                setHasMore(false);
            } else {
                setLastVisible(recordsSnap.docs[recordsSnap.docs.length - 1]);
            }
        } catch (error) {
            console.error("加載更多紀錄失敗:", error);
            setStatusMessage("加載更多紀錄時發生錯誤。");
        } finally {
            setIsLoadingMore(false);
        }
    }, [barcode, hasMore, isLoadingMore, lastVisible]);

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
        setOcrResult(result);
        const { scannedBarcode, productName, extractedPrice, storeName, discountDetails, quantity, unitType } = result;
        
        if (scannedBarcode && scannedBarcode !== barcode) {
            setBarcode(scannedBarcode); // This will trigger lookupProduct
        } else {
            // If barcode is the same or not present, manually set fields
            setProductName(productName || '');
            setLookupStatus(productName ? 'found' : 'new');
        }

        setPrice(extractedPrice || '');
        setStoreName(storeName || '');
        setDiscountDetails(discountDetails || '');
        setQuantity(quantity || '');
        setUnitType(unitType || 'pcs');
        
        setStatusMessage(`AI 分析成功！`);
    }, [barcode]);

    // REFACTOR: saveAndComparePrice now compares locally and avoids re-fetch
    const saveAndComparePrice = useCallback(async (selectedStore) => {
        const finalStoreName = selectedStore || storeName;
        const priceValue = parseFloat(price);
        const quantityValue = parseFloat(quantity);

        if (!userId || !productName.trim() || isNaN(priceValue) || isNaN(quantityValue) || quantityValue <= 0 || unitPrice === null) {
            setSaveResultToast({ status: 'error', message: '請確保已輸入產品名稱、有效總價、數量和單位！', productName: productName || "未知產品" });
            return;
        }
        if (!finalStoreName.trim()) {
            setIsStoreSelectorOpen(true);
            return;
        }

        setIsLoading(true);
        const groupingKey = barcode.trim() || getCleanProductName(productName);
        if (!groupingKey) {
            setSaveResultToast({ status: 'error', message: '無法建立產品分類，請檢查產品名稱！', productName: productName });
            setIsLoading(false);
            return;
        }
        const numericalID = djb2Hash(groupingKey);

        const newRecordData = {
            numericalID,
            productName: productName.trim(),
            storeName: finalStoreName,
            price: priceValue,
            quantity: quantityValue,
            unitType: unitType,
            unitPrice: unitPrice,
            discountDetails: discountDetails || '',
            timestamp: new Date(), // Use client-side date for immediate local comparison
            recordedBy: userId,
        };

        try {
            // Save to Firestore (using server timestamp for DB consistency)
            const docRef = await addDoc(collection(db, "priceRecords"), { ...newRecordData, timestamp: serverTimestamp() });
            
            const newRecordForState = { ...newRecordData, id: docRef.id };
            const updatedRecords = [newRecordForState, ...records];
            
            // Update state immediately
            setRecords(updatedRecords);

            // Perform comparison locally
            const recordsWithUnitPrice = updatedRecords.map(r => ({
                ...r,
                unitPrice: r.unitPrice ?? calculateUnitPrice(r.price, r.quantity, r.unitType)
            })).filter(r => r.unitPrice !== null);

            let toastStatus, toastMessage;
            if (recordsWithUnitPrice.length > 0) {
                const bestDeal = recordsWithUnitPrice.reduce((best, cur) => (cur.unitPrice < best.unitPrice ? cur : best));
                const isBest = unitPrice <= bestDeal.unitPrice;
                
                if (isBest) {
                    toastStatus = 'success';
                    toastMessage = '恭喜！這是目前紀錄中的最低單價！';
                } else {
                    toastStatus = 'warning';
                    toastMessage = `非最低單價。歷史最低為 $${bestDeal.unitPrice.toFixed(2)} (${bestDeal.storeName})。`;
                }
                setComparisonResult({ isBest, bestPrice: bestDeal.unitPrice, bestStore: bestDeal.storeName, message: toastMessage });
            } else {
                 toastStatus = 'success';
                 toastMessage = '這是此產品的第一筆紀錄，成功建立！';
                 setComparisonResult({ isBest: true, bestPrice: unitPrice, bestStore: finalStoreName, message: toastMessage });
            }
            
            setSaveResultToast({ status: toastStatus, message: toastMessage, productName: productName });

            // Update product master data
            const productRef = doc(db, "products", numericalID.toString());
            await setDoc(productRef, {
                numericalID,
                groupingKey,
                barcodeData: barcode.trim(),
                productName: productName.trim(),
                lastUpdated: serverTimestamp(),
                lastUpdatedBy: userId,
            }, { merge: true });

        } catch (error) {
            console.error("儲存或比價失敗 (Firestore):", error);
            setSaveResultToast({ status: 'error', message: `數據操作失敗: ${error.message}`, productName: productName || "未知產品" });
        } finally {
            setIsLoading(false);
        }
    }, [userId, barcode, productName, price, quantity, unitType, unitPrice, discountDetails, storeName, records]);

    const handleStoreSelect = useCallback((selectedStore) => {
        setStoreName(selectedStore);
        setIsStoreSelectorOpen(false);
        saveAndComparePrice(selectedStore);
    }, [saveAndComparePrice]);

    const handleNewScanClick = () => {
        clearForm();
        setIsCaptureModalOpen(true);
    };

    const themePrimary = currentTheme.primary;
    const themeText = currentTheme.text;
    const themeLight = currentTheme.light;
    const themeBorder = currentTheme.border;

    if (!isAuthReady) {
        return <div className="flex items-center justify-center min-h-screen bg-gray-50"><Loader2 className="w-8 h-8 mr-2 animate-spin" /><p className="text-xl text-gray-700">正在連線至雲端服務...</p></div>;
    }

    if (currentPage === 'allRecords') {
        return <AllRecordsPage theme={currentTheme} onBack={() => setCurrentPage('main')} db={db} />;
    }

    return (
        <div className={`min-h-screen p-4 sm:p-8 ${themeLight}`}>
            <SaveResultToast result={saveResultToast} onClose={() => setSaveResultToast(null)} />
            <div className="max-w-xl mx-auto">
                <header className="flex justify-between items-center mb-6 border-b pb-4">
                    <h1 className={`text-3xl font-extrabold ${themeText} flex items-center`}><Barcode className="w-8 h-8 mr-2" />條碼比價神器</h1>
                    <div className="flex items-center space-x-3">
                        <button onClick={() => setCurrentPage('allRecords')} className={`p-2 rounded-full text-white shadow-md transition-all ${themePrimary} hover:opacity-80`} title="查看所有記錄"><Database className="w-5 h-5" /></button>
                        <button onClick={() => setIsThemeModalOpen(true)} className={`p-2 rounded-full text-white shadow-md transition-all ${themePrimary} hover:opacity-80`} title="設定介面主題"><PaintBucket className="w-5 h-5" /></button>
                    </div>
                </header>

                {statusMessage && <div className="bg-blue-500 text-white p-3 rounded-lg shadow-md mb-4 text-center font-medium">{statusMessage}</div>}
                
                {isLoading && lookupStatus === 'searching' && (
                    <div className="flex justify-center items-center p-4 mb-4 bg-white rounded-lg shadow"><Loader2 className="w-6 h-6 mr-3 animate-spin" />正在查詢產品歷史紀錄...</div>
                )}

                <div className={`p-6 rounded-xl shadow-2xl bg-white border-t-4 ${themeBorder}`}>
                    <h2 className={`text-xl font-semibold ${themeText} mb-6 flex items-center`}><Zap className="w-5 h-5 mr-2" />步驟 1: AI 視覺或手動輸入</h2>
                    <button className={`w-full p-4 rounded-lg text-white font-bold text-lg shadow-xl transition-all ${themePrimary} hover:opacity-80 flex items-center justify-center mb-4`} onClick={handleNewScanClick}>
                        <Camera className="inline-block w-6 h-6 mr-3" />開啟鏡頭擷取
                    </button>
                    <div className="mb-4">
                        <label className="block text-gray-700 font-medium mb-1">條碼數據</label>
                        <input type="text" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="AI 自動填入，或手動輸入" className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                    </div>
                </div>

                <div className={`p-6 mt-8 rounded-xl shadow-2xl bg-white border-t-4 ${themeBorder}`}>
                    <h2 className={`text-xl font-semibold text-gray-700 mb-4 flex items-center`}><FileText className="w-5 h-5 mr-2" />步驟 2: 檢查與儲存</h2>
                    <div className="mb-4">
                        <label className="block text-gray-700 font-medium mb-1">產品名稱</label>
                        <input type="text" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder={lookupStatus === 'new' ? '新產品，請輸入名稱' : '...'} className={`w-full p-3 border border-gray-300 rounded-lg ${lookupStatus === 'found' ? 'bg-green-50' : ''}`} />
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-gray-700 font-medium mb-1">總價 ($) <span className="text-red-500">*</span></label>
                            <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="例如: 159" className="w-full p-3 border border-gray-300 rounded-lg" />
                        </div>
                        <div>
                            <label className="block text-gray-700 font-medium mb-1">商店名稱</label>
                            <input type="text" value={storeName} onFocus={() => setIsStoreSelectorOpen(true)} readOnly placeholder="點擊選擇商店" className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50 cursor-pointer" />
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
                                <option value="pcs">pcs (個/包)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-gray-700 font-medium mb-1">單價</label>
                            <input type="text" value={unitPrice ? `${unitPrice.toFixed(2)} / ${unitType === 'pcs' ? '個' : '100' + unitType}` : '-'} readOnly className="w-full p-3 border border-gray-300 rounded-lg bg-gray-100" />
                        </div>
                    </div>
                    <div className="mb-6">
                        <label className="block text-gray-700 font-medium mb-1">優惠細節</label>
                        <input type="text" value={discountDetails} onChange={(e) => setDiscountDetails(e.target.value)} placeholder="例如: 買二送一" className="w-full p-3 border border-gray-300 rounded-lg" />
                    </div>
                    <button className={`w-full mt-4 p-3 rounded-lg text-white font-semibold shadow-lg transition-all bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-400`} onClick={() => saveAndComparePrice()} disabled={isLoading}>
                        {isLoading ? <Loader2 className="inline-block w-5 h-5 mr-2 animate-spin" /> : <ClipboardCheck className="inline-block w-5 h-5 mr-2" />}
                        {isLoading ? '處理中...' : '儲存紀錄並比價'}
                    </button>
                </div>

                {comparisonResult && (
                    <div className="mt-8">
                        <h2 className={`text-xl font-semibold ${themeText} mb-4 flex items-center`}><DollarSign className="w-5 h-5 mr-2" />比價結果</h2>
                        <div className={`p-6 rounded-xl shadow-xl border-2 ${comparisonResult.isBest ? 'border-green-500 bg-green-50' : 'border-yellow-500 bg-yellow-50'}`}>
                            <p className={`text-lg font-bold ${comparisonResult.isBest ? 'text-green-700' : 'text-yellow-700'}`}>{comparisonResult.message}</p>
                        </div>
                    </div>
                )}

                {records.length > 0 && (
                    <PriceHistoryDisplay 
                        historyRecords={records} 
                        theme={currentTheme} 
                        fetchMore={fetchMoreRecords}
                        hasMore={hasMore}
                        isLoadingMore={isLoadingMore}
                    />
                )}
            </div>

            {isThemeModalOpen && <ThemeSelector theme={currentTheme} saveTheme={saveUserTheme} onClose={() => setIsThemeModalOpen(false)} />}
            {isCaptureModalOpen && <AIOcrCaptureModal theme={currentTheme} onAnalysisSuccess={handleAiCaptureSuccess} onClose={() => setIsCaptureModalOpen(false)} />}
            {isStoreSelectorOpen && <StoreSelector theme={currentTheme} onSelect={handleStoreSelect} onClose={() => setIsStoreSelectorOpen(false)} />}
        </div>
    );
}

export default App;