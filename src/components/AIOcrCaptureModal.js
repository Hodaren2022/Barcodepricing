import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Camera, Zap, RotateCcw } from 'lucide-react';
import { showUserFriendlyError } from '../utils/errorHandler'; // 導入錯誤處理工具

const withExponentialBackoff = async (fn, retries = 5, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === retries - 1) throw error;
            console.warn(`Attempt ${i + 1} failed, retrying in ${delay}ms...`);
            const currentDelay = delay; // Capture current delay
            await new Promise(resolve => setTimeout(resolve, currentDelay));
            delay *= 2;
        }
    }
};

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

function AIOcrCaptureModal({ theme, onAnalysisSuccess, onClose, stream }) {
    const videoRef = useRef(null);
    const [scanError, setScanError] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [capturedImage, setCapturedImage] = useState(null);
    const streamRef = useRef(stream); // 添加這一行來保持對 stream 的引用

    // 更新 useEffect 以處理 stream 變化
    useEffect(() => {
        streamRef.current = stream; // 更新 streamRef 的值
        if (stream && videoRef.current) {
            videoRef.current.srcObject = stream;
            // 只有在沒有捕獲圖片時才自動播放
            if (!capturedImage) {
                videoRef.current.play().catch(err => {
                    console.error("Video play failed:", err);
                    setScanError("無法播放相機影像。");
                });
            }
        }
    }, [stream, capturedImage]);

    const handleCapture = useCallback(() => {
        if (!videoRef.current || !videoRef.current.srcObject) return;
        const video = videoRef.current;
        
        // 計算預覽框在視頻中的實際像素位置和尺寸 (75% 中心區域)
        const cropWidth = video.videoWidth * 0.75;
        const cropHeight = video.videoHeight * 0.75;
        const cropX = (video.videoWidth - cropWidth) / 2;
        const cropY = (video.videoHeight - cropHeight) / 2;
        
        // 創建最終的 canvas 來繪製裁切後的圖片
        const canvas = document.createElement('canvas');
        canvas.width = cropWidth;
        canvas.height = cropHeight;
        const ctx = canvas.getContext('2d');
        
        // 從視頻中裁切並繪製 75% 中心區域
        ctx.drawImage(
            video, 
            cropX, cropY, cropWidth, cropHeight,  // source rectangle
            0, 0, cropWidth, cropHeight           // destination rectangle
        );
        
        const base64Data = canvas.toDataURL('image/jpeg', 0.9);
        setCapturedImage(base64Data); // 設置擷取的圖片

        // Pause video playback after capture, but don't stop the stream
        if (videoRef.current) {
            videoRef.current.pause();
        }
    }, []);

    const handleRetake = useCallback(() => {
        // Clear the captured image and error, and restart the video stream
        setCapturedImage(null);
        setScanError('');
        setIsAnalyzing(false);
        
        // Manually play the video stream when retaking
        if (streamRef.current && videoRef.current) {
            videoRef.current.srcObject = streamRef.current;
            videoRef.current.play().catch(err => {
                console.error("Video play failed:", err);
                setScanError("無法播放相機影像。");
            });
        }
    }, []);

    const handleAnalyze = useCallback(async () => {
        if (!capturedImage) { setScanError("沒有可分析的影像。"); return; }
        setIsAnalyzing(true);
        setScanError('');
        try {
            const base64Image = capturedImage.split(',')[1];
        
        const userQuery = "請根據圖片中的條碼、標價、產品名稱、規格（質量/容量/數量）、商店名稱和折扣資訊，以嚴格的 JSON 格式輸出結構化數據。請特別注意計算產品的總容量/總質量。如果圖像中顯示了原價和特價，請分別標註。";

        const newSchema = {
            type: "OBJECT",
            properties: {
                scannedBarcode: { "type": "STRING", "description": "影像中找到的 EAN, UPC 或其他產品條碼數字，如果不可見則為空字串。" },
                productName: { "type": "STRING", "description": "產品名稱，例如：家庭號牛奶" },
                originalPrice: { "type": "NUMBER", "description": "產品的原價（純數字，例如 59），如果沒有原價則為空。" },
                specialPrice: { "type": "NUMBER", "description": "產品的特價（純數字，例如 39），如果沒有特價則為空。" },
                listedPrice: { "type": "NUMBER", "description": "產品標價（純數字，例如 59），如果沒有單一標價則為空。當有特價時，listedPrice 應為特價；當無特價時，listedPrice 應為原價。" },
                totalCapacity: { "type": "NUMBER", "description": "產品的總容量/總質量/總數量（純數字）。例如：若產品是 '18克10入'，則總容量是 180；若產品是 '2000ml'，則總容量是 2000。" },
                baseUnit: { "type": "STRING", "description": "用於計算單價的基礎單位。僅使用 'g' (克), 'ml' (毫升), 或 'pcs' (個/入)。如果是質量，請統一使用 'g'。" },
                storeName: { "type": "STRING", "description": "價目標籤或收據所示的商店名稱。如果不可見則為空字串。" },
                discountDetails: { "type": "STRING", "description": "發現的任何促銷或折扣的詳細描述（例如：'買一送一', '第二件半價', '有效期限 2026/01/01'）。如果沒有折扣則為空字串。" }
            },
            propertyOrdering: ["scannedBarcode", "productName", "originalPrice", "specialPrice", "listedPrice", "totalCapacity", "baseUnit", "storeName", "discountDetails"]
        };
        
        const systemPrompt = `
            你是一個專業的價格數據分析助理。你的任務是從圖像中識別產品條碼、產品名稱、標價、完整的容量/質量/數量資訊、商店名稱和折扣細節，並將其格式化為嚴格的 JSON 輸出。
            **計算規則（重要）：**
            1. 標價 (listedPrice) 必須是純數字。
            2. 總容量 (totalCapacity) 必須是純數字。
            3. 如果產品標示為「X 克 Y 入」，**必須**計算總質量： totalCapacity = X * Y。例如：「18克10入」-> 180。
            4. 如果產品標示為「X 毫升 Y 瓶」，**必須**計算總容量： totalCapacity = X * Y。
            5. 如果產品標示為「Z 個」，則 totalCapacity = Z。
            6. 基礎單位 (baseUnit) 必須是 'g', 'ml', 或 'pcs' 之一。質量請用 'g'。
            7. 如果圖像中同時顯示原價和特價：
               - originalPrice 應包含原價數值
               - specialPrice 應包含特價數值
               - listedPrice 應包含特價數值（因為這是消費者實際支付的價格）
            8. 如果圖像中只顯示一個價格：
               - listedPrice 應包含該價格數值
               - originalPrice 和 specialPrice 應為空
            請勿輸出任何 JSON 以外的文字、註釋或說明。
        `;

        const apiUrl = `/.netlify/functions/gemini-proxy`;
        const payload = { systemPrompt, userPrompt: userQuery, base64Image, responseSchema: newSchema };
        const analysisResult = await withExponentialBackoff(() => callGeminiApiWithRetry(payload, apiUrl));
        console.log("AI Analysis Result:", analysisResult); // Added console.log for debugging

        // 計算並添加單價欄位 (從單價計算.txt 複製過來)
        const { 
            scannedBarcode = '', 
            productName = '', 
            listedPrice = 0, 
            totalCapacity = 0, 
            baseUnit = 'pcs', 
            storeName = 'AI 辨識', 
            discountDetails = '',
            specialPrice = null,
            originalPrice = null
        } = analysisResult;
        let unitPrice = 0;
        if (listedPrice > 0 && totalCapacity > 0) {
             if (baseUnit === 'g' || baseUnit === 'ml') {
                unitPrice = (listedPrice / totalCapacity) * 100;
            } else if (baseUnit === 'pcs') {
                unitPrice = listedPrice / totalCapacity;
            }
        }
        
        // 準備傳遞給父組件的數據，包含計算出的單價和捕獲的圖像
        const finalData = {
            scannedBarcode: scannedBarcode,
            productName: productName,
            extractedPrice: listedPrice.toString(), // 轉換為字串以符合現有狀態
            storeName: storeName,
            discountDetails: discountDetails,
            quantity: totalCapacity.toString(), // 轉換為字串以符合現有狀態
            unitType: baseUnit,
            unitPrice: unitPrice,
            specialPrice: specialPrice, // 保留特價信息
            originalPrice: originalPrice,  // 保留原價信息
            capturedImage: capturedImage  // 添加捕獲的圖像
        };

        onAnalysisSuccess(finalData);
        onClose();
    } catch (error) {
        console.error("AI 分析失敗:", error);
        const userMessage = `AI 分析錯誤: ${error.message || '未知錯誤'}`;
        setScanError(userMessage);
        showUserFriendlyError(userMessage, "AI 分析");
    } finally {
        setIsAnalyzing(false);
    }
}, [capturedImage, onAnalysisSuccess, onClose]);

    const handleAnalyzeAndCaptureNext = useCallback(() => {
        if (!capturedImage) { 
            setScanError("沒有可分析的影像。"); 
            return; 
        }
        
        // 保存當前圖像用於分析
        const imageToAnalyze = capturedImage;
        
        // 立即清除捕獲的圖像並重新啟動相機，讓用戶可以繼續拍攝
        setCapturedImage(null);
        setScanError('');
        
        // 重新啟動相機流
        if (streamRef.current && videoRef.current) {
            videoRef.current.srcObject = streamRef.current;
            videoRef.current.play().catch(err => {
                console.error("Video play failed:", err);
                setScanError("無法播放相機影像。");
            });
        }
        
        // 準備 API 請求參數
        const base64Image = imageToAnalyze.split(',')[1];
        
        const userQuery = "請根據圖片中的條碼、標價、產品名稱、規格（質量/容量/數量）、商店名稱和折扣資訊，以嚴格的 JSON 格式輸出結構化數據。請特別注意計算產品的總容量/總質量。如果圖像中顯示了原價和特價，請分別標註。";

        const newSchema = {
            type: "OBJECT",
            properties: {
                scannedBarcode: { "type": "STRING", "description": "影像中找到的 EAN, UPC 或其他產品條碼數字，如果不可見則為空字串。" },
                productName: { "type": "STRING", "description": "產品名稱，例如：家庭號牛奶" },
                originalPrice: { "type": "NUMBER", "description": "產品的原價（純數字，例如 59），如果沒有原價則為空。" },
                specialPrice: { "type": "NUMBER", "description": "產品的特價（純數字，例如 39），如果沒有特價則為空。" },
                listedPrice: { "type": "NUMBER", "description": "產品標價（純數字，例如 59），如果沒有單一標價則為空。當有特價時，listedPrice 應為特價；當無特價時，listedPrice 應為原價。" },
                totalCapacity: { "type": "NUMBER", "description": "產品的總容量/總質量/總數量（純數字）。例如：若產品是 '18克10入'，則總容量是 180；若產品是 '2000ml'，則總容量是 2000。" },
                baseUnit: { "type": "STRING", "description": "用於計算單價的基礎單位。僅使用 'g' (克), 'ml' (毫升), 或 'pcs' (個/入)。如果是質量，請統一使用 'g'。" },
                storeName: { "type": "STRING", "description": "價目標籤或收據所示的商店名稱。如果不可見則為空字串。" },
                discountDetails: { "type": "STRING", "description": "發現的任何促銷或折扣的詳細描述（例如：'買一送一', '第二件半價', '有效期限 2026/01/01'）。如果沒有折扣則為空字串。" }
            },
            propertyOrdering: ["scannedBarcode", "productName", "originalPrice", "specialPrice", "listedPrice", "totalCapacity", "baseUnit", "storeName", "discountDetails"]
        };
        
        const systemPrompt = `
            你是一個專業的價格數據分析助理。你的任務是從圖像中識別產品條碼、產品名稱、標價、完整的容量/質量/數量資訊、商店名稱和折扣細節，並將其格式化為嚴格的 JSON 輸出。
            **計算規則（重要）：**
            1. 標價 (listedPrice) 必須是純數字。
            2. 總容量 (totalCapacity) 必須是純數字。
            3. 如果產品標示為「X 克 Y 入」，**必須**計算總質量： totalCapacity = X * Y。例如：「18克10入」-> 180。
            4. 如果產品標示為「X 毫升 Y 瓶」，**必須**計算總容量： totalCapacity = X * Y。
            5. 如果產品標示為「Z 個」，則 totalCapacity = Z。
            6. 基礎單位 (baseUnit) 必須是 'g', 'ml', 或 'pcs' 之一。質量請用 'g'。
            7. 如果圖像中同時顯示原價和特價：
               - originalPrice 應包含原價數值
               - specialPrice 應包含特價數值
               - listedPrice 應包含特價數值（因為這是消費者實際支付的價格）
            8. 如果圖像中只顯示一個價格：
               - listedPrice 應包含該價格數值
               - originalPrice 和 specialPrice 應為空
            請勿輸出任何 JSON 以外的文字、註釋或說明。
        `;

        const apiUrl = `/.netlify/functions/gemini-proxy`;
        const payload = { systemPrompt, userPrompt: userQuery, base64Image, responseSchema: newSchema };
        
        // 在後台執行分析
        withExponentialBackoff(() => callGeminiApiWithRetry(payload, apiUrl))
            .then(analysisResult => {
                console.log("AI Analysis Result:", analysisResult);
                
                // 計算並添加單價欄位
                const { 
                    scannedBarcode = '', 
                    productName = '', 
                    listedPrice = 0, 
                    totalCapacity = 0, 
                    baseUnit = 'pcs', 
                    storeName = 'AI 辨識', 
                    discountDetails = '',
                    specialPrice = null,
                    originalPrice = null
                } = analysisResult;
                let unitPrice = 0;
                if (listedPrice > 0 && totalCapacity > 0) {
                     if (baseUnit === 'g' || baseUnit === 'ml') {
                        unitPrice = (listedPrice / totalCapacity) * 100;
                    } else if (baseUnit === 'pcs') {
                        unitPrice = listedPrice / totalCapacity;
                    }
                }
                
                // 準備傳遞給父組件的數據
                const finalData = {
                    scannedBarcode: scannedBarcode,
                    productName: productName,
                    extractedPrice: listedPrice.toString(),
                    storeName: storeName,
                    discountDetails: discountDetails,
                    quantity: totalCapacity.toString(),
                    unitType: baseUnit,
                    unitPrice: unitPrice,
                    specialPrice: specialPrice,
                    originalPrice: originalPrice,
                    capturedImage: imageToAnalyze  // 使用保存的圖像
                };
                
                // 直接調用成功回調
                onAnalysisSuccess(finalData);
            })
            .catch(error => {
                console.error("AI 分析失敗:", error);
                const userMessage = `AI 分析錯誤: ${error.message || '未知錯誤'}`;
                setScanError(userMessage);
                showUserFriendlyError(userMessage, "AI 分析");
                
                // 即使分析失敗，也將基本數據加入序列，讓用戶知道有錯誤
                const errorData = {
                    capturedImage: imageToAnalyze,
                    error: error.message
                };
                onAnalysisSuccess(errorData);
            });
    }, [capturedImage, onAnalysisSuccess]);

    const handleSimulatedAnalysis = () => {
        const randomListedPrice = parseFloat((Math.random() * 50 + 100).toFixed(2));
        const randomTotalCapacity = Math.floor(Math.random() * 1000) + 100; // 100-1099
        const unitTypes = ['ml', 'g', 'pcs'];
        const randomBaseUnit = unitTypes[Math.floor(Math.random() * unitTypes.length)];
        
        // 模擬特價情況：20% 機率有特價
        const hasSpecialPrice = Math.random() < 0.2;
        let specialPrice = null;
        let finalListedPrice = randomListedPrice;
        
        if (hasSpecialPrice) {
            specialPrice = parseFloat((randomListedPrice * 0.8).toFixed(2)); // 8折特價
            finalListedPrice = specialPrice;
        }
        
        // 使用真實的產品標籤圖片
        const mockImageData = "/士力架.png";
        
        const mockResult = {
            productName: '士力架巧克力',
            listedPrice: finalListedPrice,
            totalCapacity: randomTotalCapacity,
            baseUnit: randomBaseUnit,
            // 以下是 AI 可能額外提供的資訊，如果 AI 模型能辨識
            scannedBarcode: '4710123456789',
            storeName: '模擬超商 (AI)',
            discountDetails: hasSpecialPrice ? '限時特價 8 折' : '買二送一優惠 / 限時促銷',
            specialPrice: specialPrice
        };

        // AIOcrCaptureModal 的 handleAnalyze 函數會處理這個 mockResult
        // 並計算 unitPrice，然後傳遞給 onAnalysisSuccess
        const { listedPrice, totalCapacity, baseUnit } = mockResult;
        let unitPrice = 0;
        if (listedPrice > 0 && totalCapacity > 0) {
             if (baseUnit === 'g' || baseUnit === 'ml') {
            unitPrice = (listedPrice / totalCapacity) * 100;
        } else if (baseUnit === 'pcs') {
            unitPrice = listedPrice / totalCapacity;
        }
    }

        const finalData = {
            scannedBarcode: mockResult.scannedBarcode || '',
            productName: mockResult.productName,
            extractedPrice: listedPrice.toString(),
            storeName: mockResult.storeName || 'AI 辨識',
            discountDetails: mockResult.discountDetails || '',
            quantity: totalCapacity.toString(),
            unitType: baseUnit,
            unitPrice: unitPrice,
            specialPrice: mockResult.specialPrice,
            capturedImage: mockImageData  // 添加真實的產品標籤圖片
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
                {isAnalyzing && <div className={`w-full p-4 mb-4 rounded-lg bg-yellow-100 text-yellow-800 flex items-center justify-center`}>...分析中...</div>}
                {scanError ? <div className="text-red-600 bg-red-100 p-4 rounded-lg w-full mb-4 text-center">{scanError}</div> : (
                    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden mb-4 border-4 border-dashed border-white">
                        {capturedImage ? <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" /> : <video ref={videoRef} className="w-full h-full object-cover" playsInline muted></video>}
                        {!capturedImage && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="w-[75%] h-[75%] border-4 border-yellow-400 border-opacity-75 rounded-lg shadow-lg"></div></div>}
                    </div>
                )}
                <div className="w-full">
                    {!capturedImage && !scanError && <button onClick={handleCapture} className={`w-full p-3 mb-3 rounded-lg text-white font-semibold shadow-lg transition-all ${themePrimary} ${themeHover} flex items-center justify-center`} disabled={isAnalyzing}><Camera className="inline-block w-5 h-5 mr-2" />擷取畫面</button>}
                    {capturedImage && !scanError && (
                        <div className="grid grid-cols-2 gap-4 mb-3">
                            <button onClick={handleRetake} className="w-full p-3 rounded-lg bg-gray-500 hover:bg-gray-600 text-white font-semibold shadow-lg transition-all flex items-center justify-center" disabled={isAnalyzing}><RotateCcw className="w-5 h-5 mr-2" />重新拍攝</button>
                            <button onClick={handleAnalyze} className={`w-full p-3 rounded-lg text-white font-semibold shadow-lg transition-all ${themePrimary} ${themeHover} flex items-center justify-center`} disabled={isAnalyzing}><Zap className="w-5 h-5 mr-2" />開始 AI 分析</button>
                        </div>
                    )}
                    {capturedImage && !scanError && (
                        <button onClick={handleAnalyzeAndCaptureNext} className={`w-full p-3 mb-3 rounded-lg text-white font-semibold shadow-lg transition-all bg-green-600 hover:bg-green-700 flex items-center justify-center`} disabled={isAnalyzing}>
                            <Zap className="w-5 h-5 mr-2" /><Camera className="w-5 h-5 mr-2" />進行分析並拍攝下一張
                        </button>
                    )}
                    <button onClick={handleSimulatedAnalysis} className="w-full p-3 mb-3 bg-gray-500 hover:bg-gray-600 text-white font-semibold rounded-lg shadow-lg transition-all" disabled={isAnalyzing}>模擬 AI 分析成功 (測試用)</button>
                    <button onClick={onClose} className="w-full p-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg shadow-lg transition-all" disabled={isAnalyzing}>關閉</button>
                </div>
            </div>
        </div>
    );
}

export default AIOcrCaptureModal;