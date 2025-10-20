
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
    const { systemPrompt, userPrompt, base64Image, responseSchema } = JSON.parse(event.body);

    // 驗證收到的資料
    if (!systemPrompt || !userPrompt || !base64Image || !responseSchema) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields: systemPrompt, userPrompt, base64Image, or responseSchema' }),
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
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: responseSchema
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
