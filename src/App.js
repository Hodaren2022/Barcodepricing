import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { PaintBucket, DollarSign, Barcode, ClipboardCheck, X, Camera, Zap, FileText, RotateCcw, Database } from 'lucide-react';
import AllRecordsPage from './AllRecordsPage';
import StoreSelector from './StoreSelector';

// -----------------------------------------------------------------------------
// 1. 核心設定與工具函數 (Core Setup & Utilities)
// -----------------------------------------------------------------------------

// MVP 階段使用 Local Storage 模擬 App ID
const MVP_APP_ID = 'mvp-local-price-app'; 

/**
 * DJB2 雜湊算法：將條碼字串轉換為數值 ID (numericalID)。
 * @param {string} str - 原始條碼字串
 * @returns {number} - 32位元無符號整數
 */
function djb2Hash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        // hash * 33 + charCode
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
    }
    // 轉換為無符號 32 位整數
    return hash >>> 0;
}

/**
 * 指數退避 (Exponential Backoff) 執行 API 呼叫
 */
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
                    // 解析 JSON 內容
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
                const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError; // 所有重試失敗後拋出最後一個錯誤
}

// 放在 App 組件定義之前
const CHART_WIDTH = 400; // SVG 寬度 (px)
const CHART_HEIGHT = 150; // SVG 高度 (px)
const PADDING = 20;

function PriceTrendChart({ records, theme }) {
    // 價格必須是數字，並且時間戳必須存在
    const validRecords = records.filter(r => !isNaN(r.price) && r.timestamp);

    if (validRecords.length < 2) {
        return <p className="text-center text-sm text-gray-500">至少需要兩筆紀錄才能繪製趨勢圖。</p>;
    }

    // 1. 計算數據範圍
    const prices = validRecords.map(r => r.price);
    const minPrice = Math.min(...prices) * 0.95; // 讓圖表底部留一點空間
    const maxPrice = Math.max(...prices) * 1.05; // 讓圖表頂部留一點空間
    const priceRange = maxPrice - minPrice;

    // 時間軸範圍
    const minTimestamp = new Date(validRecords[validRecords.length - 1].timestamp).getTime();
    const maxTimestamp = new Date(validRecords[0].timestamp).getTime();
    const timeRange = maxTimestamp - minTimestamp;
    
    if (priceRange === 0) {
        return <p className="text-center text-sm text-gray-500">價格沒有波動，無法繪製趨勢圖。</p>;
    }

    // 2. 轉換為 SVG 座標點字串
    const points = validRecords.map(record => {
        const timestamp = new Date(record.timestamp).getTime();
        const price = record.price;

        // X 座標：將時間映射到 CHART_WIDTH 範圍
        const xRatio = (timestamp - minTimestamp) / timeRange;
        const x = PADDING + xRatio * (CHART_WIDTH - 2 * PADDING);

        // Y 座標：將價格映射到 CHART_HEIGHT 範圍 (注意：Y 軸在 SVG 中是倒置的)
        const yRatio = (price - minPrice) / priceRange;
        const y = CHART_HEIGHT - PADDING - yRatio * (CHART_HEIGHT - 2 * PADDING);

        return `${x},${y}`;
    }).join(' ');

    return (
        <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
            <h3 className="text-base font-medium text-gray-700 mb-2 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1 text-gray-500"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                價格走勢
            </h3>
            <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="w-full h-auto" style={{maxWidth: `${CHART_WIDTH}px`}}>
                
                {/* 輔助線 - Y軸 (價格標籤) */}
                <line x1={PADDING} y1={PADDING} x2={PADDING} y2={CHART_HEIGHT - PADDING} stroke="#ddd" strokeWidth="1" />
                {/* 輔助線 - X軸 (時間標籤) */}
                <line x1={PADDING} y1={CHART_HEIGHT - PADDING} x2={CHART_WIDTH - PADDING} y2={CHART_HEIGHT - PADDING} stroke="#ddd" strokeWidth="1" />
                
                {/* Y 軸標籤 (Max Price) */}
                <text x={PADDING - 5} y={PADDING + 5} textAnchor="end" fontSize="10" fill="#666">
                    ${maxPrice.toFixed(0)}
                </text>

                {/* Y 軸標籤 (Min Price) */}
                <text x={PADDING - 5} y={CHART_HEIGHT - PADDING} textAnchor="end" fontSize="10" fill="#666">
                    ${minPrice.toFixed(0)}
                </text>


                {/* 折線圖 */}
                <polyline
                    fill="none"
                    stroke={theme.color === 'red' ? '#EF4444' : '#4F46E5'} // 使用主題色
                    strokeWidth="2"
                    points={points}
                />

                {/* 數據點 */}
                {validRecords.map((record, index) => {
                    const [x, y] = points.split(' ')[index].split(',').map(Number);
                    return (
                        <circle 
                            key={index} 
                            cx={x} 
                            cy={y} 
                            r="3" 
                            fill={index === 0 ? '#10B981' : theme.primary.split('-')[1]} // 最新點使用綠色
                            title={`$${record.price}`}
                        />
                    );
                })}
            </svg>
            <div className="text-xs text-gray-500 mt-2 flex justify-between px-3">
                <span>最早紀錄: {new Date(minTimestamp).toLocaleDateString()}</span>
                <span>最新紀錄: {new Date(maxTimestamp).toLocaleDateString()}</span>
            </div>
        </div>
    );
}

// 放在 App 組件定義之前
function PriceHistoryDisplay({ historyRecords, theme }) {
    if (historyRecords.length === 0) {
        return (
            <div className="text-center p-6 text-gray-500 bg-white rounded-xl shadow-md">
                尚無歷史價格紀錄。
            </div>
        );
    }

    return (
        <div className={`p-6 rounded-xl shadow-2xl bg-white border-t-4 ${theme.border} mt-8`}>
            <h2 className={`text-xl font-semibold ${theme.text} mb-4`}>
                價格紀錄 ({historyRecords.length} 筆)
            </h2>
            
            {/* 放置圖表的位置 (圖表邏輯在下面) */}
            <div className="mb-6">
                <PriceTrendChart records={historyRecords} theme={theme} />
            </div>

            {/* 3. 歷史紀錄清單 */}
            <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                {historyRecords.map((record, index) => (
                    <div 
                        key={index} 
                        className={`p-3 rounded-lg shadow-sm border border-gray-100 ${index === 0 ? theme.light : 'bg-white'}`}
                    >
                        <div className="flex justify-between items-start font-bold">
                            <span className="text-2xl text-red-600">${record.price.toFixed(2)}</span>
                            <span className="text-xs text-gray-500">
                                {new Date(record.timestamp).toLocaleString()}
                            </span>
                        </div>
                        <p className="text-sm text-gray-700 mt-1">
                            商店: {record.storeName || '未標註'}
                        </p>
                        {record.discountDetails && (
                            <p className="text-xs text-indigo-600 italic">
                                優惠: {record.discountDetails}
                            </p>
                        )}
                        {/* 標示最新紀錄 */}
                        {index === 0 && (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full text-white ${theme.primary}`}>
                                最新紀錄
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

// -----------------------------------------------------------------------------
// 2. 主題配置與本地儲存設定 (Theming & Local Setup)
// -----------------------------------------------------------------------------

const THEMES = {
    'Default (Indigo)': { primary: 'bg-indigo-600', light: 'bg-indigo-100', hover: 'hover:bg-indigo-700', border: 'border-indigo-600', text: 'text-indigo-600', color: 'indigo' },
    '海洋藍 (Ocean Blue)': { primary: 'bg-blue-600', light: 'bg-blue-100', hover: 'hover:bg-blue-700', border: 'border-blue-600', text: 'text-blue-600', color: 'blue' },
    '森林綠 (Forest Green)': { primary: 'bg-green-600', light: 'bg-green-100', hover: 'hover:bg-green-700', border: 'border-green-600', text: 'text-green-600', color: 'green' },
    '夕陽紅 (Sunset Red)': { primary: 'bg-red-600', light: 'bg-red-100', hover: 'hover:bg-red-700', border: 'border-red-600', text: 'text-red-600', color: 'red' },
    '活力橙 (Vibrant Orange)': { primary: 'bg-orange-600', light: 'bg-orange-100', hover: 'hover:bg-orange-700', border: 'border-orange-600', text: 'text-orange-600', color: 'orange' },
    '薰衣草紫 (Lavender)': { primary: 'bg-purple-600', light: 'bg-purple-100', hover: 'hover:bg-purple-700', border: 'border-purple-600', text: 'text-purple-600', color: 'purple' },
};
const DEFAULT_THEME_KEY = 'Default (Indigo)';

function useLocalMVPSetup() {
    const [userId] = useState(() => {
        let savedId = localStorage.getItem('mvp_user_id');
        if (!savedId) {
            savedId = crypto.randomUUID();
            localStorage.setItem('mvp_user_id', savedId);
        }
        return savedId;
    });

    const [currentTheme, setCurrentTheme] = useState(() => {
        const savedKey = localStorage.getItem('appTheme') || DEFAULT_THEME_KEY;
        return THEMES[savedKey] || THEMES[DEFAULT_THEME_KEY];
    });

    const saveUserTheme = useCallback((themeKey) => {
        localStorage.setItem('appTheme', themeKey);
        setCurrentTheme(THEMES[themeKey] || THEMES[DEFAULT_THEME_KEY]);
    }, []);

    const isAuthReady = true; 
    
    return { userId, isAuthReady, currentTheme, saveUserTheme, appId: MVP_APP_ID };
}

// 主題選擇元件 (Theme Selector Component)
function ThemeSelector({ theme, saveTheme, onClose }) {
    // 渲染邏輯與之前相同，略
    const handleThemeChange = (themeKey) => {
        saveTheme(themeKey);
    };

    const handleReset = () => {
        saveTheme(DEFAULT_THEME_KEY);
    };

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 transform transition-all">
                <h3 className={`text-xl font-bold ${theme.text} mb-4 border-b pb-2`}>
                    <PaintBucket className="inline-block w-5 h-5 mr-2" />
                    介面配色選項
                </h3>
                
                <div className="grid grid-cols-2 gap-4 mb-6">
                    {Object.keys(THEMES).map((themeKey) => {
                        const themeData = THEMES[themeKey];
                        const isSelected = theme.color === themeData.color;
                        return (
                            <button
                                key={themeKey}
                                onClick={() => handleThemeChange(themeKey)}
                                className={`
                                    p-3 rounded-lg text-white font-medium shadow-md transition-all 
                                    ${themeData.primary} ${themeData.hover} 
                                    ${isSelected ? 'ring-4 ring-offset-2 ring-opacity-70 ring-gray-400' : ''}
                                `}
                                style={{ transform: isSelected ? 'scale(1.05)' : 'scale(1)' }}
                            >
                                {themeKey}
                            </button>
                        );
                    })}
                </div>

                <div className="flex justify-between items-center pt-4 border-t">
                    <button
                        onClick={handleReset}
                        className="flex items-center text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                    >
                        <RotateCcw className="w-4 h-4 mr-1" />
                        清除還原 (預設)
                    </button>
                    <button
                        onClick={onClose}
                        className={`px-4 py-2 text-white font-semibold rounded-lg shadow-lg ${theme.primary} ${theme.hover} transition-all`}
                    >
                        關閉
                    </button>
                </div>
            </div>
        </div>
    );
}

// -----------------------------------------------------------------------------
// 3. AI 視覺擷取與分析元件 (AIOcrCaptureModal)
// -----------------------------------------------------------------------------

/**
 * 負責攝影機存取、擷取畫面並呼叫 AI 進行分析的 Modal 元件。
 * 輸出為結構化 JSON 數據。
 */
function AIOcrCaptureModal({ theme, onAnalysisSuccess, onClose }) {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const [isCameraOn, setIsCameraOn] = useState(false);
    const [scanError, setScanError] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [capturedImage, setCapturedImage] = useState(null);

    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setIsCameraOn(false);
    }, []);

    const startCamera = useCallback(async () => {
        setScanError('');
        setCapturedImage(null);
        setIsCameraOn(true); 
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: "environment",
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });
            streamRef.current = stream;

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }
        } catch (err) {
            console.error("無法存取攝影機:", err);
            setScanError(`無法存取攝影機或權限被拒絕。請檢查瀏覽器設定。 (${err.name} - ${err.message})`);
            setIsCameraOn(false);
        }
    }, []);

    // On mount, start the camera. On unmount, stop it.
    useEffect(() => {
        startCamera();
        return () => {
            stopCamera();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleCapture = useCallback(() => {
        if (!videoRef.current || !videoRef.current.srcObject) return;

        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        
        // 獲取影片的實際顯示尺寸 (受 CSS object-cover 和父容器 aspect-video 影響)
        const renderedVideoWidth = video.offsetWidth;
        const renderedVideoHeight = video.offsetHeight;

        // 計算裁剪區域的尺寸 (75% of the rendered video area)
        const targetCanvasWidth = renderedVideoWidth * 0.75;
        const targetCanvasHeight = renderedVideoHeight * 0.75;

        // 計算 intrinsic video 到 rendered video 的縮放比例 (object-cover)
        const scaleFactor = Math.max(
            renderedVideoWidth / video.videoWidth,
            renderedVideoHeight / video.videoHeight
        );

        // 計算 intrinsic video 在 rendered video 內的偏移量
        const scaledIntrinsicWidth = video.videoWidth * scaleFactor;
        const scaledIntrinsicHeight = video.videoHeight * scaleFactor;
        const offsetX = (renderedVideoWidth - scaledIntrinsicWidth) / 2;
        const offsetY = (renderedVideoHeight - scaledIntrinsicHeight) / 2;

        // 計算裁剪區域在 intrinsic video 中的起始點和尺寸
        const captureX_rendered = (renderedVideoWidth - targetCanvasWidth) / 2;
        const captureY_rendered = (renderedVideoHeight - targetCanvasHeight) / 2;

        const sx = (captureX_rendered - offsetX) / scaleFactor;
        const sy = (captureY_rendered - offsetY) / scaleFactor;
        const sWidth = targetCanvasWidth / scaleFactor;
        const sHeight = targetCanvasHeight / scaleFactor;

        canvas.width = sWidth;
        canvas.height = sHeight;

        const ctx = canvas.getContext('2d');

        // 將裁剪後的 intrinsic video 區域繪製到 canvas 上
        ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

        const base64Data = canvas.toDataURL('image/jpeg', 0.9);
        
        stopCamera();
        setCapturedImage(base64Data);

    }, [stopCamera]);

    // 呼叫 Gemini API 進行視覺分析
    const handleAnalyze = useCallback(async () => {
        if (!capturedImage) {
            setScanError("沒有可分析的影像。");
            return;
        }
        setIsAnalyzing(true);
        setScanError('');

        try {
            const base64Image = capturedImage.split(',')[1]; // 移除 MIME 類型前綴

            const systemPrompt = "你是一位專業的價目標籤和收據分析師。請從提供的影像中提取產品條碼（如果可見）、產品名稱、主要售價、商店名稱以及任何詳細的折扣或促銷資訊。請嚴格以 JSON 格式輸出。";
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

    // 模擬 AI 分析成功
    const handleSimulatedAnalysis = () => {
        const mockResult = {
            scannedBarcode: '4710123456789',
            productName: '測試產品名稱',
            extractedPrice: (Math.random() * 50 + 100).toFixed(0).toString(),
            storeName: '模擬超商 (AI)',
            discountDetails: '買二送一優惠 / 限時促銷',
        };
        onAnalysisSuccess(mockResult);
        onClose();
    };

    const themePrimary = theme.primary;
    const themeHover = theme.hover;

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-95 z-50 flex flex-col items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 transform transition-all flex flex-col items-center">
                <header className="flex justify-between items-center w-full mb-4 border-b pb-2">
                    <h3 className={`text-xl font-bold ${theme.text} flex items-center`}>
                        <Zap className="inline-block w-5 h-5 mr-2" />
                        AI 視覺擷取與分析
                    </h3>
                    <button onClick={() => { stopCamera(); onClose(); }} className="p-1 rounded-full text-gray-500 hover:text-gray-900">
                        <X className="w-6 h-6" />
                    </button>
                </header>

                {/* 狀態顯示 */}
                {isAnalyzing && (
                    <div className={`w-full p-4 mb-4 rounded-lg bg-yellow-100 text-yellow-800 flex items-center justify-center`}>
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-yellow-800" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        正在呼叫 AI 分析影像，請稍候...
                    </div>
                )}
                
                {scanError ? (
                    <div className="text-red-600 bg-red-100 p-4 rounded-lg w-full mb-4 text-center">
                        {scanError}
                    </div>
                ) : (
                    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden mb-4 border-4 border-dashed border-white">
                        {capturedImage ? (
                            <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
                        ) : (
                            <video 
                                ref={videoRef} 
                                className="w-full h-full object-cover" 
                                playsInline 
                                muted
                            ></video>
                        )}
                        {/* 掃描對焦框 (僅在攝影機開啟時顯示) */}
                        {isCameraOn && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="w-[75%] h-[75%] border-4 border-yellow-400 border-opacity-75 rounded-lg shadow-lg"></div>
                            </div>
                        )}
                    </div>
                )}
                
                {/* 動作按鈕 */}
                <div className="w-full">
                    {!capturedImage && isCameraOn && !scanError && (
                        <button
                            onClick={handleCapture}
                            className={`w-full p-3 mb-3 rounded-lg text-white font-semibold shadow-lg transition-all ${themePrimary} ${themeHover} flex items-center justify-center`}
                            disabled={isAnalyzing}
                        >
                            <Camera className="w-5 h-5 mr-2" />
                            擷取畫面
                        </button>
                    )}

                    {capturedImage && !scanError && (
                        <div className="grid grid-cols-2 gap-4 mb-3">
                            <button
                                onClick={startCamera} // 重新拍攝
                                className="w-full p-3 rounded-lg bg-gray-500 hover:bg-gray-600 text-white font-semibold shadow-lg transition-all flex items-center justify-center"
                                disabled={isAnalyzing}
                            >
                                重新拍攝
                            </button>
                            <button
                                onClick={handleAnalyze}
                                className={`w-full p-3 rounded-lg text-white font-semibold shadow-lg transition-all ${themePrimary} ${themeHover} flex items-center justify-center`}
                                disabled={isAnalyzing}
                            >
                                <Zap className="w-5 h-5 mr-2" />
                                開始 AI 分析
                            </button>
                        </div>
                    )}

                    {/* 模擬按鈕 (用於測試) */}
                    <button
                        onClick={handleSimulatedAnalysis}
                        className="w-full p-3 mb-3 bg-gray-500 hover:bg-gray-600 text-white font-semibold rounded-lg shadow-lg transition-all"
                        disabled={isAnalyzing}
                    >
                        模擬 AI 分析成功 (測試用)
                    </button>

                    <button
                        onClick={() => { stopCamera(); onClose(); }}
                        className="w-full p-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg shadow-lg transition-all"
                        disabled={isAnalyzing}
                    >
                        關閉
                    </button>
                </div>
            </div>
        </div>
    );
}


// -----------------------------------------------------------------------------
// 4. 主應用程式元件 (App Component)
// -----------------------------------------------------------------------------

function App() {
    const { userId, isAuthReady, currentTheme, saveUserTheme } = useLocalMVPSetup();
    
    // UI 狀態管理
    const [barcode, setBarcode] = useState('');
    const [productName, setProductName] = useState('');
    const [currentPrice, setCurrentPrice] = useState('');
    const [discountDetails, setDiscountDetails] = useState(''); 
    const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
    const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false); 
    const [comparisonResult, setComparisonResult] = useState({
        isBest: false,
        bestPrice: null,
        bestStore: null,
        message: '等待比價數據...'
    });
    const [isLoading, setIsLoading] = useState(false); 
    const [lookupStatus, setLookupStatus] = useState('ready'); 
    const [statusMessage, setStatusMessage] = useState(''); 
    const [storeName, setStoreName] = useState(''); // 新增商店名稱狀態
    const [ocrResult, setOcrResult] = useState(null); // 新增OCR結果狀態，用於開發者確認

    // 新增商店選擇器狀態
    const [isStoreSelectorOpen, setIsStoreSelectorOpen] = useState(false);

    // 新增頁面狀態
    const [currentPage, setCurrentPage] = useState('main'); // 'main' or 'allRecords'

    // 新增歷史紀錄狀態
    const [productHistory, setProductHistory] = useState([]);

    // -----------------------------------------------------------------------------
    // 產品識別邏輯 (Local Storage 版本)
    // -----------------------------------------------------------------------------
    const lookupProduct = useCallback(async (barcodeData) => {
        if (!barcodeData || barcodeData.length < 5) {
            setProductName('');
            setLookupStatus('ready');
            return;
        }

        // 如果有AI辨識結果，則不執行本地查詢
        if (ocrResult) {
            return;
        }

        setLookupStatus('searching');
        const numericalID = djb2Hash(barcodeData);
        
        try {
            await new Promise(r => setTimeout(r, 200)); 
            
            // 1. 獲取所有歷史紀錄
            const allRecordsJson = localStorage.getItem('MVP_PRICE_RECORDS') || '[]';
            const allRecords = JSON.parse(allRecordsJson);
            
            // 2. 篩選出當前產品的紀錄
            const filteredRecords = allRecords
                .filter(r => r.numericalID === numericalID)
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // 依時間倒序排列

            setProductHistory(filteredRecords); // <-- 儲存歷史紀錄

            const productsJson = localStorage.getItem('MVP_PRODUCTS') || '{}';
            const products = JSON.parse(productsJson);

            if (products[numericalID]) {
                setProductName(products[numericalID].productName);
                setLookupStatus('found');
            } else {
                setProductName('');
                setLookupStatus('new');
            }
        } catch (error) {
            console.error("查詢產品失敗 (Local Storage):", error);
            setLookupStatus('ready');
            setProductHistory([]); // 清空歷史紀錄
        }
    }, [ocrResult]);

    useEffect(() => {
        if (barcode.length > 0 && isAuthReady) {
            const timer = setTimeout(() => {
                lookupProduct(barcode);
            }, 500); 
            return () => clearTimeout(timer); 
        }
    }, [barcode, isAuthReady, lookupProduct]);

    // 處理狀態訊息自動消失
    useEffect(() => {
        if (statusMessage) {
            const timer = setTimeout(() => {
                setStatusMessage('');
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [statusMessage]);

    // 處理 AI 分析成功並填入欄位
    const handleAiCaptureSuccess = useCallback((result) => {
        const { scannedBarcode, productName, extractedPrice, storeName, discountDetails } = result;
        
        // 保存OCR結果供開發者確認
        setOcrResult(result);
        
        // 1. 自動填入條碼
        if (scannedBarcode && scannedBarcode.length > 5) {
            setBarcode(scannedBarcode);
        } else if (!barcode) {
             setStatusMessage("AI 未能識別條碼，請手動輸入或確保條碼清晰！");
        }

        // 2. 自動填入產品名稱、價格、商店、折扣
        // 無論條碼是否存在，都應該更新產品名稱和其他欄位
        setProductName(productName || '');
        setCurrentPrice(extractedPrice || '');
        setStoreName(storeName || '');
        setDiscountDetails(discountDetails || '');
        
        // 更新查詢狀態，避免顯示"產品不存在，請手動輸入"
        if (productName) {
            setLookupStatus('found');
        }

        setStatusMessage(`AI 分析成功！產品: ${productName || '?'}, 價格: $${extractedPrice || '?'}, 商店: ${storeName || '?'}, 折扣: ${discountDetails || '無'}`);
    }, [barcode]);
    
    // 新增狀態來跟踪是否剛剛選擇了商店
    const [justSelectedStore, setJustSelectedStore] = useState(false);

    // 儲存並比價函數 (Local Storage 版本)
    const saveAndComparePrice = useCallback(async () => {
        const numericalID = djb2Hash(barcode);
        const priceValue = parseFloat(currentPrice);

        if (!userId || !barcode || !productName || isNaN(priceValue)) {
            setStatusMessage("請確保已輸入條碼、產品名稱和有效價格！");
            return;
        }

        // 檢查商店名稱是否為空
        if (!storeName.trim()) {
            setIsStoreSelectorOpen(true);
            return;
        }

        setIsLoading(true);
        
        try {
            // 從 Local Storage 獲取數據
            const productsJson = localStorage.getItem('MVP_PRODUCTS') || '{}';
            const allRecordsJson = localStorage.getItem('MVP_PRICE_RECORDS') || '[]';
            let products = JSON.parse(productsJson);
            let allRecords = JSON.parse(allRecordsJson);

            // 0. 檢查並創建產品主檔 (如果不存在)
            if (!products[numericalID]) {
                products[numericalID] = {
                    numericalID,
                    barcodeData: barcode,
                    productName,
                    createdAt: new Date().toISOString(),
                };
                localStorage.setItem('MVP_PRODUCTS', JSON.stringify(products));
            }
            
            // 1. 儲存新的價格紀錄
            const priceRecord = {
                numericalID,
                productName,
                storeName: storeName || "手動輸入",
                price: priceValue,
                discountDetails: discountDetails, 
                timestamp: new Date().toISOString(),
                recordedBy: userId,
            };
            
            allRecords.push(priceRecord);
            localStorage.setItem('MVP_PRICE_RECORDS', JSON.stringify(allRecords));
            
            // 2. 執行比價邏輯 - 查詢該產品所有歷史紀錄
            const records = allRecords.filter(r => r.numericalID === numericalID);

            if (records.length <= 1) { 
                setComparisonResult({ 
                    isBest: true, 
                    bestPrice: priceValue,
                    bestStore: storeName || "手動輸入",
                    message: '這是第一筆紀錄！' 
                });
            } else {
                const bestDeal = records.reduce((best, cur) => cur.price < best.price ? cur : best);
                const isCurrentBest = priceRecord.price <= bestDeal.price;
                
                // 比較邏輯：標價最低優先；標價相同則有折扣優先
                const isTrulyBest = isCurrentBest && (priceRecord.price < bestDeal.price || (priceRecord.price === bestDeal.price && priceRecord.discountDetails !== ''));
                
                setComparisonResult({
                    isBest: isTrulyBest,
                    bestPrice: bestDeal.price,
                    bestStore: bestDeal.storeName,
                    message: isTrulyBest 
                        ? '恭喜！這是目前紀錄中的最低標價 (或具備折扣)！' 
                        : `非最低標價。歷史最低標價為 $${bestDeal.price} (商店: ${bestDeal.storeName})`
                });
            }

            // 更新歷史紀錄
            const filteredRecords = allRecords
                .filter(r => r.numericalID === numericalID)
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // 依時間倒序排列

            setProductHistory(filteredRecords);

        } catch (error) {
            console.error("儲存或比價失敗 (Local Storage):", error);
            setStatusMessage("數據操作失敗，請檢查瀏覽器設定或本地儲存空間。");
        } finally {
            setIsLoading(false);
        }
    }, [userId, barcode, productName, currentPrice, discountDetails, storeName]); 

    // 處理商店選擇並繼續儲存流程
    const handleStoreSelect = useCallback((selectedStore) => {
        setStoreName(selectedStore);
        setIsStoreSelectorOpen(false);
        
        // 創建一個新的函數來執行保存，避免依賴於狀態更新
        const performSave = async () => {
            const numericalID = djb2Hash(barcode);
            const priceValue = parseFloat(currentPrice);

            if (!userId || !barcode || !productName || isNaN(priceValue)) {
                setStatusMessage("請確保已輸入條碼、產品名稱和有效價格！");
                return;
            }

            setIsLoading(true);
            
            try {
                // 從 Local Storage 獲取數據
                const productsJson = localStorage.getItem('MVP_PRODUCTS') || '{}';
                const allRecordsJson = localStorage.getItem('MVP_PRICE_RECORDS') || '[]';
                let products = JSON.parse(productsJson);
                let allRecords = JSON.parse(allRecordsJson);

                // 0. 檢查並創建產品主檔 (如果不存在)
                if (!products[numericalID]) {
                    products[numericalID] = {
                        numericalID,
                        barcodeData: barcode,
                        productName,
                        createdAt: new Date().toISOString(),
                    };
                    localStorage.setItem('MVP_PRODUCTS', JSON.stringify(products));
                }
                
                // 1. 儲存新的價格紀錄
                const priceRecord = {
                    numericalID,
                    productName,
                    storeName: selectedStore || "手動輸入",
                    price: priceValue,
                    discountDetails: discountDetails, 
                    timestamp: new Date().toISOString(),
                    recordedBy: userId,
                };
                
                allRecords.push(priceRecord);
                localStorage.setItem('MVP_PRICE_RECORDS', JSON.stringify(allRecords));
                
                // 2. 執行比價邏輯 - 查詢該產品所有歷史紀錄
                const records = allRecords.filter(r => r.numericalID === numericalID);

                if (records.length <= 1) { 
                    setComparisonResult({ 
                        isBest: true, 
                        bestPrice: priceValue,
                        bestStore: selectedStore || "手動輸入",
                        message: '這是第一筆紀錄！' 
                    });
                } else {
                    const bestDeal = records.reduce((best, cur) => cur.price < best.price ? cur : best);
                    const isCurrentBest = priceRecord.price <= bestDeal.price;
                    
                    // 比較邏輯：標價最低優先；標價相同則有折扣優先
                    const isTrulyBest = isCurrentBest && (priceRecord.price < bestDeal.price || (priceRecord.price === bestDeal.price && priceRecord.discountDetails !== ''));
                    
                    setComparisonResult({
                        isBest: isTrulyBest,
                        bestPrice: bestDeal.price,
                        bestStore: bestDeal.storeName,
                        message: isTrulyBest 
                            ? '恭喜！這是目前紀錄中的最低標價 (或具備折扣)！' 
                            : `非最低標價。歷史最低標價為 $${bestDeal.price} (商店: ${bestDeal.storeName})`
                    });
                }

                // 更新歷史紀錄
                const filteredRecords = allRecords
                    .filter(r => r.numericalID === numericalID)
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // 依時間倒序排列

                setProductHistory(filteredRecords);

            } catch (error) {
                console.error("儲存或比價失敗 (Local Storage):", error);
                setStatusMessage("數據操作失敗，請檢查瀏覽器設定或本地儲存空間。");
            } finally {
                setIsLoading(false);
            }
        };
        
        // 延遲執行儲存操作
        setTimeout(performSave, 100);
    }, [userId, barcode, productName, currentPrice, discountDetails]);

    // 主題變數，用於動態 Tailwind 類別
    const themePrimary = currentTheme.primary;
    const themeText = currentTheme.text;
    const themeLight = currentTheme.light;
    const themeBorder = currentTheme.border;

    // 根據查詢狀態顯示產品名稱提示
    const productNamePlaceholder = useMemo(() => {
        switch(lookupStatus) {
            case 'searching':
                return '正在查詢產品資料...';
            case 'found':
                return '產品名稱已自動載入';
            case 'new':
                return '產品不存在，請手動輸入名稱';
            default:
                return '請先輸入條碼或掃描條碼';
        }
    }, [lookupStatus]);

    if (!isAuthReady) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <p className="text-xl text-gray-700">正在初始化本地應用程式...</p>
            </div>
        );
    }

    // 如果在所有記錄頁面，渲染該頁面
    if (currentPage === 'allRecords') {
        return (
            <AllRecordsPage 
                theme={currentTheme} 
                onBack={() => setCurrentPage('main')} 
            />
        );
    }

    return (
        <div className={`min-h-screen p-4 sm:p-8 ${themeLight}`}>
            <div className="max-w-xl mx-auto">
                <header className="flex justify-between items-center mb-6 border-b pb-4">
                    <h1 className={`text-3xl font-extrabold ${themeText} flex items-center`}>
                        <Barcode className="w-8 h-8 mr-2" />
                        條碼比價神器 (MVP-AI)
                    </h1>
                    <div className="flex items-center space-x-3">
                        <button 
                            onClick={() => setCurrentPage('allRecords')}
                            className={`p-2 rounded-full text-white shadow-md transition-all ${themePrimary} hover:opacity-80`}
                            title="查看所有記錄"
                        >
                            <Database className="w-5 h-5" />
                        </button>
                        <button 
                            onClick={() => setIsThemeModalOpen(true)}
                            className={`p-2 rounded-full text-white shadow-md transition-all ${themePrimary} hover:opacity-80`}
                            title="設定介面主題"
                        >
                            <PaintBucket className="w-5 h-5" />
                        </button>
                        <p className="text-sm text-gray-500 hidden sm:block">用戶 ID: {userId}</p>
                    </div>
                </header>

                {/* 狀態訊息提示 */}
                {statusMessage && (
                    <div className="bg-red-500 text-white p-3 rounded-lg shadow-md mb-4 text-center font-medium transition-opacity duration-300">
                        {statusMessage}
                    </div>
                )}

                {/* 開發者確認區塊 - 顯示AI辨識結果 */}
                {ocrResult && (
                    <div className="bg-yellow-100 border border-yellow-300 rounded-lg p-4 mb-6">
                        <h3 className="text-lg font-semibold text-yellow-800 mb-2">AI 辨識結果 (開發者確認區)</h3>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="font-medium text-gray-700">條碼:</div>
                            <div className="text-gray-900">{ocrResult.scannedBarcode || '未識別'}</div>
                            
                            <div className="font-medium text-gray-700">產品名稱:</div>
                            <div className="text-gray-900">{ocrResult.productName || '未識別'}</div>
                            
                            <div className="font-medium text-gray-700">價格:</div>
                            <div className="text-gray-900">${ocrResult.extractedPrice || '未識別'}</div>
                            
                            <div className="font-medium text-gray-700">商店:</div>
                            <div className="text-gray-900">{ocrResult.storeName || '未識別'}</div>
                            
                            <div className="font-medium text-gray-700">折扣:</div>
                            <div className="text-gray-900">{ocrResult.discountDetails || '無'}</div>
                        </div>
                        <button 
                            onClick={() => setOcrResult(null)}
                            className="mt-3 px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 text-sm"
                        >
                            關閉此區塊
                        </button>
                    </div>
                )}

                {/* 整合流程卡片：AI 擷取入口 */}
                <div className={`p-6 rounded-xl shadow-2xl bg-white border-t-4 ${themeBorder}`}>
                    <h2 className={`text-xl font-semibold ${themeText} mb-6 flex items-center`}>
                        <Zap className="w-5 h-5 mr-2" /> 
                        步驟 1: AI 視覺自動擷取資料
                    </h2>
                    
                    {/* AI 擷取按鈕 - 開啟 Modal */}
                    <button 
                        className={`w-full p-4 rounded-lg text-white font-bold text-lg shadow-xl transition-all ${themePrimary} hover:opacity-80 flex items-center justify-center`}
                        onClick={() => setIsCaptureModalOpen(true)}
                    >
                        <Camera className="inline-block w-6 h-6 mr-3" /> 
                        開啟鏡頭，擷取條碼與價目標籤
                    </button>
                    
                    <hr className="my-6 border-gray-200" />

                    <h2 className={`text-xl font-semibold text-gray-700 mb-4 flex items-center`}>
                        <FileText className="w-5 h-5 mr-2" /> 
                        步驟 2: 檢查或手動輸入資料
                    </h2>

                    {/* 條碼輸入區 */}
                    <div className="mb-4">
                        <label className="block text-gray-700 font-medium mb-1">條碼數據 (Barcode Data)</label>
                        <input
                            type="text"
                            value={barcode}
                            onChange={(e) => setBarcode(e.target.value)}
                            placeholder="AI 自動填入，或手動輸入"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                        />
                    </div>
                    
                    {/* 產品名稱區 - 配合自動查詢 */}
                    <div className="mb-4">
                        <label className="block text-gray-700 font-medium mb-1">產品名稱 (Product Name)</label>
                        <input
                            type="text"
                            value={productName}
                            onChange={(e) => setProductName(e.target.value)}
                            placeholder={productNamePlaceholder}
                            className={`w-full p-3 border border-gray-300 rounded-lg transition 
                                ${lookupStatus === 'found' ? 'bg-green-50' : lookupStatus === 'new' ? 'bg-yellow-50' : ''}`}
                            readOnly={lookupStatus === 'found' && !ocrResult} 
                        />
                        <p className="text-sm text-gray-500 mt-1">
                            數值 ID (Hash): {barcode ? djb2Hash(barcode) : '尚未計算'}
                        </p>
                    </div>

                    {/* 價格與商店輸入/OCR 區 */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-gray-700 font-medium mb-1">標價 ($) <span className="text-red-500">*</span></label>
                            <input
                                type="number"
                                value={currentPrice}
                                onChange={(e) => setCurrentPrice(e.target.value)}
                                placeholder="AI 擷取"
                                className="w-full p-3 border border-gray-300 rounded-lg"
                            />
                        </div>
                        <div>
                            <label className="block text-gray-700 font-medium mb-1">商店名稱</label>
                            <input
                                type="text"
                                value={storeName} 
                                onChange={(e) => setStoreName(e.target.value)}
                                placeholder="AI 擷取"
                                className="w-full p-3 border border-gray-300 rounded-lg"
                            />
                        </div>
                    </div>
                    
                    {/* 優惠細節輸入區 (新增) */}
                    <div className="mb-6">
                        <label className="block text-gray-700 font-medium mb-1">優惠細節/促銷活動 (Discount Details)</label>
                        <input
                            type="text"
                            value={discountDetails}
                            onChange={(e) => setDiscountDetails(e.target.value)}
                            placeholder="AI 擷取 (例如: 買二送一, 第二件半價)"
                            className="w-full p-3 border border-gray-300 rounded-lg"
                        />
                    </div>

                    {/* 儲存紀錄並比價 */}
                    <button 
                        className={`w-full mt-4 p-3 rounded-lg text-white font-semibold shadow-lg transition-all bg-emerald-500 hover:bg-emerald-600`}
                        onClick={saveAndComparePrice}
                        disabled={isLoading}
                    >
                        <ClipboardCheck className="inline-block w-5 h-5 mr-2" /> 
                        {isLoading ? '儲存並比價中...' : '步驟 3: 儲存紀錄並比價'}
                    </button>
                </div>

                {/* 比價結果顯示區 */}
                <div className="mt-8">
                    <h2 className={`text-xl font-semibold ${themeText} mb-4 flex items-center`}>
                        <DollarSign className="w-5 h-5 mr-2" />
                        比價結果
                    </h2>
                    <div className={`p-6 rounded-xl shadow-xl border-2 ${comparisonResult.isBest ? 'border-green-500 bg-green-50' : 'border-yellow-500 bg-yellow-50'}`}>
                        <p className={`text-lg font-bold ${comparisonResult.isBest ? 'text-green-700' : 'text-yellow-700'}`}>
                            {comparisonResult.message}
                        </p>
                        {comparisonResult.bestPrice && (
                            <p className="text-sm text-gray-600 mt-2">
                                歷史最低標價: ${comparisonResult.bestPrice}
                            </p>
                        )}
                        <p className="text-xs text-gray-500 mt-2">
                            **附註:** 您的紀錄已儲存在瀏覽器的本地儲存中 (Local Storage)。
                        </p>
                    </div>
                </div>

                {/* 歷史價格與走勢圖表顯示區 - 只有當找到產品時才顯示 */}
                {(lookupStatus === 'found' || lookupStatus === 'new') && barcode && (
                    <PriceHistoryDisplay 
                        historyRecords={productHistory} 
                        theme={currentTheme} 
                    />
                )}
            </div>

            {/* 主題選擇 Modal */}
            {isThemeModalOpen && (
                <ThemeSelector 
                    theme={currentTheme} 
                    saveTheme={saveUserTheme} 
                    onClose={() => setIsThemeModalOpen(false)} 
                />
            )}

            {/* AI 視覺擷取 Modal */}
            {isCaptureModalOpen && (
                <AIOcrCaptureModal
                    theme={currentTheme}
                    onAnalysisSuccess={handleAiCaptureSuccess}
                    onClose={() => setIsCaptureModalOpen(false)}
                />
            )}

            {/* 商店選擇 Modal */}
            {isStoreSelectorOpen && (
                <StoreSelector
                    theme={currentTheme}
                    onSelect={handleStoreSelect}
                    onClose={() => setIsStoreSelectorOpen(false)}
                />
            )}
        </div>
    );
}

export default App;