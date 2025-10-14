import React, { useState, useEffect, useRef } from 'react';
import Quagga from 'quagga';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid'; // 用於生成本地用戶ID

// ==================================================================
// MVP 測試：Firebase 功能暫時禁用
// 以下 Firebase 相關引用與初始化區塊已註釋掉，改用 Local Storage 進行本地測試。
// 待測試完成後，請取消註釋此區塊以恢復 Firebase 功能。
// ==================================================================
/*
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

// Firebase 配置
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
*/
// ==================================================================
// Firebase 功能暫時禁用結束
// ==================================================================

// Gemini API 配置
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent";

// DJB2 雜湊算法實現
const generateNumericalID = (str) => {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return hash >>> 0; // 轉換為無符號整數
};

// 指數退避邏輯
const exponentialBackoff = async (fn, retries = 5, delay = 1000) => {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    await new Promise(resolve => setTimeout(resolve, delay));
    return exponentialBackoff(fn, retries - 1, delay * 2);
  }
};

const BarcodeIDGenerator = () => {
  // 狀態管理
  const [barcodeData, setBarcodeData] = useState('');
  const [numericalID, setNumericalID] = useState(null);
  const [productName, setProductName] = useState('');
  const [currentStore, setCurrentStore] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [currentDiscount, setCurrentDiscount] = useState('');
  const [comparisonResults, setComparisonResults] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [userId, setUserId] = useState('');
  const [productExists, setProductExists] = useState(false);

  // 參考
  const scannerRef = useRef(null);
  const fileInputRef = useRef(null);

  // 初始化用戶身份
  useEffect(() => {
    // ==================================================================
    // MVP 測試：改用 Local Storage 模擬用戶身份
    // ==================================================================
    let localUserId = localStorage.getItem('localUserId');
    if (!localUserId) {
      localUserId = uuidv4();
      localStorage.setItem('localUserId', localUserId);
    }
    setUserId(localUserId);
    // ==================================================================

    /*
    // 原始 Firebase 身份驗證
    const initAuth = async () => {
      try {
        const userCredential = await signInAnonymously(auth);
        setUserId(userCredential.user.uid);
      } catch (error) {
        console.error("身份驗證錯誤:", error);
      }
    };
    initAuth();
    */
  }, []);

  // 條碼掃描器初始化
  const initQuagga = () => {
    if (isScanning && scannerRef.current) {
      Quagga.init({
        inputStream: {
          name: "Live",
          type: "LiveStream",
          target: scannerRef.current,
          constraints: {
            width: 640,
            height: 480,
            facingMode: "environment"
          },
        },
        decoder: {
          readers: [
            "ean_reader",
            "ean_8_reader",
            "code_128_reader",
            "code_39_reader",
            "upc_reader",
            "upc_e_reader"
          ]
        }
      }, (err) => {
        if (err) {
          console.error("Quagga 初始化錯誤:", err);
          return;
        }
        Quagga.start();
      });

      Quagga.onDetected((result) => {
        if (result && result.codeResult && result.codeResult.code) {
          const code = result.codeResult.code;
          setBarcodeData(code);
          const id = generateNumericalID(code);
          setNumericalID(id);
          checkProductExists(id);
          Quagga.stop();
          setIsScanning(false);
        }
      });

      return () => {
        Quagga.stop();
      };
    }
  };

  // 監聽掃描狀態變化
  useEffect(() => {
    initQuagga();
    return () => {
      if (isScanning) {
        Quagga.stop();
      }
    };
  }, [isScanning]);

  // 檢查產品是否存在
  const checkProductExists = async (id) => {
    setIsLoading(true);
    
    // ==================================================================
    // MVP 測試：改用 Local Storage 檢查產品
    // ==================================================================
    try {
      const localProducts = JSON.parse(localStorage.getItem('products')) || [];
      const product = localProducts.find(p => p.numericalID === id);

      if (product) {
        setProductName(product.productName);
        setProductExists(true);
        setMessage("產品已存在，請繼續輸入價格資訊");
      } else {
        setProductExists(false);
        setProductName('');
        setMessage("新產品，請輸入產品名稱");
      }
    } catch (error) {
      console.error("從 Local Storage 檢查產品錯誤:", error);
      setMessage("檢查產品時發生本地錯誤");
    } finally {
      setIsLoading(false);
    }
    // ==================================================================

    /*
    // 原始 Firebase 檢查產品邏輯
    try {
      setIsLoading(true);
      const productRef = doc(db, "products", id.toString());
      const productSnap = await getDoc(productRef);
      
      if (productSnap.exists()) {
        const data = productSnap.data();
        setProductName(data.productName);
        setProductExists(true);
        setMessage("產品已存在，請繼續輸入價格資訊");
      } else {
        setProductExists(false);
        setProductName('');
        setMessage("新產品，請輸入產品名稱");
      }
    } catch (error) {
      console.error("檢查產品錯誤:", error);
      setMessage("檢查產品時發生錯誤");
    } finally {
      setIsLoading(false);
    }
    */
  };

  // 手動輸入條碼
  const handleBarcodeInput = (e) => {
    const code = e.target.value;
    setBarcodeData(code);
    if (code) {
      const id = generateNumericalID(code);
      setNumericalID(id);
      checkProductExists(id);
    } else {
      setNumericalID(null);
      setProductExists(false);
      setProductName('');
    }
  };

  // 開始掃描
  const startScanning = () => {
    setIsScanning(true);
  };

  // 觸發文件選擇
  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  // 處理圖像上傳
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setIsLoading(true);
      setMessage("正在分析價格標籤...");

      // 將圖像轉換為 Base64
      const base64Image = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(file);
      });

      // 準備 Gemini API 請求
      const requestData = {
        contents: [{
          parts: [
            {
              text: "你是一個專業的價格標籤分析師。請分析這張圖片中的價格標籤，識別出商店名稱、價格和優惠細節。請只返回 JSON 格式的結果，不要有任何其他文字。"
            },
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: base64Image
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024
        },
        responseSchema: {
          type: "object",
          properties: {
            storeName: { type: "string" },
            price: { type: "number" },
            discountDetails: { type: "string" }
          },
          required: ["storeName", "price"]
        }
      };

      // 使用指數退避調用 Gemini API
      const response = await exponentialBackoff(async () => {
        const result = await axios.post(
          `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
          requestData
        );
        return result.data;
      });

      // 解析 API 回應
      if (response && 
          response.candidates && 
          response.candidates[0] && 
          response.candidates[0].content && 
          response.candidates[0].content.parts && 
          response.candidates[0].content.parts[0] && 
          response.candidates[0].content.parts[0].text) {
        
        try {
          const jsonText = response.candidates[0].content.parts[0].text;
          // 嘗試提取 JSON 部分（如果有其他文字）
          const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
          const jsonStr = jsonMatch ? jsonMatch[0] : jsonText;
          
          const result = JSON.parse(jsonStr);
          
          setCurrentStore(result.storeName || "");
          setCurrentPrice(result.price ? result.price.toString() : "");
          setCurrentDiscount(result.discountDetails || "");
          setMessage("價格標籤分析完成");
        } catch (parseError) {
          console.error("解析 JSON 錯誤:", parseError);
          setMessage("無法解析價格標籤資訊");
        }
      } else {
        setMessage("無法從圖像中提取價格資訊");
      }
    } catch (error) {
      console.error("圖像分析錯誤:", error);
      setMessage("圖像分析時發生錯誤");
    } finally {
      setIsLoading(false);
      // 重置文件輸入，以便可以再次選擇相同的文件
      e.target.value = null;
    }
  };

  // 儲存價格記錄
  const saveRecord = async () => {
    if (!numericalID) {
      setMessage("請先掃描或輸入條碼");
      return;
    }

    if (!productName) {
      setMessage("請輸入產品名稱");
      return;
    }

    if (!currentPrice || isNaN(parseFloat(currentPrice))) {
      setMessage("請輸入有效的價格");
      return;
    }

    setIsLoading(true);
    setMessage("正在儲存記錄...");

    // ==================================================================
    // MVP 測試：改用 Local Storage 儲存記錄
    // ==================================================================
    try {
      // 如果是新產品，先創建產品記錄
      if (!productExists) {
        const localProducts = JSON.parse(localStorage.getItem('products')) || [];
        const newProduct = {
          numericalID,
          barcodeData,
          productName,
          createdAt: new Date().toISOString()
        };
        localProducts.push(newProduct);
        localStorage.setItem('products', JSON.stringify(localProducts));
      }

      // 創建價格記錄
      const localPriceRecords = JSON.parse(localStorage.getItem('price_records')) || [];
      const priceRecord = {
        numericalID,
        productName,
        storeName: currentStore,
        price: parseFloat(currentPrice),
        discountDetails: currentDiscount,
        timestamp: new Date().toISOString(),
        recordedBy: userId,
        recordId: uuidv4() // 給本地記錄一個唯一ID
      };
      localPriceRecords.push(priceRecord);
      localStorage.setItem('price_records', JSON.stringify(localPriceRecords));
      
      setMessage("記錄已儲存");

      // 獲取比價資料
      await fetchComparisonData(numericalID);
    } catch (error) {
      console.error("儲存記錄到 Local Storage 錯誤:", error);
      setMessage("儲存記錄時發生本地錯誤");
    } finally {
      setIsLoading(false);
    }
    // ==================================================================

    /*
    // 原始 Firebase 儲存記錄邏輯
    try {
      setIsLoading(true);
      setMessage("正在儲存記錄...");

      // 如果是新產品，先創建產品記錄
      if (!productExists) {
        await setDoc(doc(db, "products", numericalID.toString()), {
          numericalID,
          barcodeData,
          productName,
          createdAt: new Date().toISOString()
        });
      }

      // 創建價格記錄
      const priceRecord = {
        numericalID,
        productName,
        storeName: currentStore,
        price: parseFloat(currentPrice),
        discountDetails: currentDiscount,
        timestamp: new Date().toISOString(),
        recordedBy: userId
      };

      await addDoc(collection(db, "price_records"), priceRecord);
      setMessage("記錄已儲存");

      // 獲取比價資料
      await fetchComparisonData(numericalID);
    } catch (error) {
      console.error("儲存記錄錯誤:", error);
      setMessage("儲存記錄時發生錯誤");
    } finally {
      setIsLoading(false);
    }
    */
  };

  // 獲取比價資料
  const fetchComparisonData = async (id) => {
    setIsLoading(true);
    setMessage("正在獲取比價資料...");

    // ==================================================================
    // MVP 測試：改用 Local Storage 獲取比價資料
    // ==================================================================
    try {
      const localPriceRecords = JSON.parse(localStorage.getItem('price_records')) || [];
      const records = localPriceRecords.filter(r => r.numericalID === id);

      if (records.length > 0) {
        // 找出最低價格
        const bestDeal = records.reduce((min, record) => 
          record.price < min.price ? record : min, records[0]);
        
        // 當前價格
        const currentPriceValue = parseFloat(currentPrice);
        
        // 比較結果
        const result = {
          records,
          bestDeal,
          isBestPrice: currentPriceValue <= bestDeal.price,
          priceDifference: Math.abs(currentPriceValue - bestDeal.price)
        };
        
        setComparisonResults(result);
        
        if (result.isBestPrice && currentPrice) { // 只有在當前有價格時才顯示最佳價格訊息
          setMessage("恭喜！這是目前最優惠的價格");
        } else if (currentPrice) {
          setMessage(`價格不是最低，${bestDeal.storeName} 的價格低 ${result.priceDifference.toFixed(2)} 元`);
        } else {
           setMessage("查看歷史價格記錄");
        }
      } else {
        setComparisonResults(null);
        setMessage("這是第一筆價格記錄");
      }
    } catch (error) {
      console.error("從 Local Storage 獲取比價資料錯誤:", error);
      setMessage("獲取比價資料時發生本地錯誤");
    } finally {
      setIsLoading(false);
    }
    // ==================================================================

    /*
    // 原始 Firebase 獲取比價資料邏輯
    try {
      setIsLoading(true);
      setMessage("正在獲取比價資料...");

      const q = query(
        collection(db, "price_records"),
        where("numericalID", "==", id)
      );

      const querySnapshot = await getDocs(q);
      const records = [];
      
      querySnapshot.forEach((doc) => {
        records.push(doc.data());
      });

      if (records.length > 0) {
        // 找出最低價格
        const bestDeal = records.reduce((min, record) => 
          record.price < min.price ? record : min, records[0]);
        
        // 當前價格
        const currentPriceValue = parseFloat(currentPrice);
        
        // 比較結果
        const result = {
          records,
          bestDeal,
          isBestPrice: currentPriceValue <= bestDeal.price,
          priceDifference: Math.abs(currentPriceValue - bestDeal.price)
        };
        
        setComparisonResults(result);
        
        if (result.isBestPrice) {
          setMessage("恭喜！這是目前最優惠的價格");
        } else {
          setMessage(`價格不是最低，${bestDeal.storeName} 的價格低 ${result.priceDifference.toFixed(2)} 元`);
        }
      } else {
        setComparisonResults(null);
        setMessage("這是第一筆價格記錄");
      }
    } catch (error) {
      console.error("獲取比價資料錯誤:", error);
      setMessage("獲取比價資料時發生錯誤");
    } finally {
      setIsLoading(false);
    }
    */
  };

  // 清除所有資料
  const clearAll = () => {
    setBarcodeData('');
    setNumericalID(null);
    setProductName('');
    setCurrentStore('');
    setCurrentPrice('');
    setCurrentDiscount('');
    setComparisonResults(null);
    setProductExists(false);
    setMessage('');
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden md:max-w-2xl">
        <div className="p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-800">比價神器</h1>
            <p className="text-sm text-gray-600">掃描條碼，比較價格，找到最優惠</p>
          </div>

          {/* 條碼輸入區域 */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-700 mb-2">步驟 1: 輸入或掃描條碼</h2>
            <div className="flex space-x-2 mb-4">
              <input
                type="text"
                value={barcodeData}
                onChange={handleBarcodeInput}
                placeholder="手動輸入條碼"
                className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={startScanning}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                掃描
              </button>
            </div>
            
            {isScanning && (
              <div className="mb-4">
                <div ref={scannerRef} className="border rounded-lg overflow-hidden h-64"></div>
                <button
                  onClick={() => setIsScanning(false)}
                  className="mt-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  取消掃描
                </button>
              </div>
            )}
            
            {numericalID && (
              <div className="text-sm text-gray-600">
                <p>條碼: {barcodeData}</p>
                <p>數值 ID: {numericalID}</p>
              </div>
            )}
          </div>

          {/* 產品名稱區域 */}
          {numericalID && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-700 mb-2">步驟 2: {productExists ? '確認' : '輸入'} 產品名稱</h2>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="產品名稱"
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                readOnly={productExists}
              />
            </div>
          )}

          {/* 價格標籤 OCR 區域 */}
          {numericalID && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-700 mb-2">步驟 3: 價格標籤分析</h2>
              <button
                onClick={triggerFileInput}
                className="w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                拍照/上傳價格標籤進行 OCR
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                className="hidden"
              />
              
              <div className="mt-4 grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">商店名稱</label>
                  <input
                    type="text"
                    value={currentStore}
                    onChange={(e) => setCurrentStore(e.target.value)}
                    placeholder="商店名稱"
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">價格</label>
                  <input
                    type="text"
                    value={currentPrice}
                    onChange={(e) => setCurrentPrice(e.target.value)}
                    placeholder="價格"
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">優惠細節</label>
                  <input
                    type="text"
                    value={currentDiscount}
                    onChange={(e) => setCurrentDiscount(e.target.value)}
                    placeholder="優惠細節"
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 儲存和比價區域 */}
          {numericalID && productName && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-700 mb-2">步驟 4: 儲存記錄</h2>
              <button
                onClick={saveRecord}
                className="w-full px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={isLoading}
              >
                {isLoading ? "處理中..." : "儲存價格記錄"}
              </button>
            </div>
          )}

          {/* 比價結果區域 */}
          {comparisonResults && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h2 className="text-lg font-semibold text-gray-700 mb-2">比價結果</h2>
              <div className={`p-3 rounded-lg ${comparisonResults.isBestPrice ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                {comparisonResults.isBestPrice && currentPrice ? (
                  <p className="font-medium">恭喜！這是目前最優惠的價格</p>
                ) : (
                  <div>
                    <p className="font-medium">有更優惠的價格可供選擇</p>
                    <p>最低價: {comparisonResults.bestDeal.price} 元 ({comparisonResults.bestDeal.storeName})</p>
                    <p>價差: {comparisonResults.priceDifference.toFixed(2)} 元</p>
                    {comparisonResults.bestDeal.discountDetails && (
                      <p>優惠細節: {comparisonResults.bestDeal.discountDetails}</p>
                    )}
                  </div>
                )}
              </div>
              
              <div className="mt-4">
                <h3 className="text-md font-medium text-gray-700 mb-2">歷史價格記錄</h3>
                <div className="max-h-60 overflow-y-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">商店</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">價格</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">日期</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {comparisonResults.records.map((record) => (
                        <tr key={record.recordId} className={record.price === comparisonResults.bestDeal.price ? 'bg-green-50' : ''}>
                          <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">{record.storeName}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">{record.price}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                            {new Date(record.timestamp).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 訊息顯示區域 */}
          {message && (
            <div className="mb-6 p-3 bg-blue-50 text-blue-700 rounded-lg">
              {message}
            </div>
          )}

          {/* 重置按鈕 */}
          <button
            onClick={clearAll}
            className="w-full px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            清除並重新開始
          </button>
        </div>
      </div>
    </div>
  );
};

export default BarcodeIDGenerator;