
// 使用 ES 模組語法，Netlify Functions 支援
import fetch from 'node-fetch';

// API 金鑰從環境變數讀取，確保安全
const apiKey = process.env.GEMINI_API_KEY;

// Netlify Function 的主要處理函數
exports.handler = async (event, context) => {
  // 只允許 POST 請求
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    // 從前端請求中解析出資料
    const { systemPrompt, userPrompt, base64Image } = JSON.parse(event.body);

    // 驗證收到的資料
    if (!systemPrompt || !userPrompt || !base64Image) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields: systemPrompt, userPrompt, or base64Image' }),
      };
    }
    
    // Google Gemini API 的端點
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    // 構建與 Google API 規格相符的 payload
    const payload = {
      contents: [{
        role: "user",
        parts: [
          { text: userPrompt },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image
            }
          }
        ]
      }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            "scannedBarcode": { "type": "STRING", "description": "影像中找到的 EAN, UPC 或其他產品條碼數字，如果不可見則為空字串。" },
            "productName": { "type": "STRING", "description": "產品名稱。如果不可見則為空字串。" },
            "extractedPrice": { "type": "STRING", "description": "主要售價，格式為乾淨的字串，不帶貨幣符號（例如：'120.5'）。如果找不到價格則為空字串。" },
            "storeName": { "type": "STRING", "description": "價目標籤或收據所示的商店名稱。如果不可見則為空字串。" },
            "discountDetails": { "type": "STRING", "description": "發現的任何促銷或折扣的詳細描述（例如：'買一送一', '第二件半價', '有效期限 2026/01/01'）。如果沒有折扣則為空字串。" }
          },
          "required": ["scannedBarcode", "productName", "extractedPrice", "storeName", "discountDetails"]
        }
      }
    };

    // 呼叫 Google API
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // 檢查 Google API 的回應
    if (!response.ok) {
      const errorBody = await response.json();
      console.error('Google API Error:', errorBody);
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `Google API error: ${errorBody.error?.message || 'Unknown error'}` }),
      };
    }

    // 將 Google API 的成功回應直接傳回給前端
    const data = await response.json();
    return {
      statusCode: 200,
      body: JSON.stringify(data),
    };

  } catch (error) {
    console.error('Serverless Function Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `Internal Server Error: ${error.message}` }),
    };
  }
};
