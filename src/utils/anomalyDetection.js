// 異常價格檢測服務
export const detectPriceAnomaly = (currentPrice, historicalPrices, threshold = 0.5, minConfidence = 0.8) => {
    if (!historicalPrices || historicalPrices.length === 0) {
        return { isAnomalous: false, confidence: 0, reason: 'insufficient_data' };
    }

    // 計算歷史平均價格
    const validPrices = historicalPrices.filter(price => price && !isNaN(price) && price > 0);
    if (validPrices.length === 0) {
        return { isAnomalous: false, confidence: 0, reason: 'no_valid_data' };
    }

    const averagePrice = validPrices.reduce((sum, price) => sum + price, 0) / validPrices.length;
    
    // 計算偏離百分比
    const deviation = Math.abs(currentPrice - averagePrice) / averagePrice;
    
    // 計算置信度（基於歷史數據量和價格穩定性）
    const dataPoints = validPrices.length;
    const priceVariance = validPrices.reduce((sum, price) => sum + Math.pow(price - averagePrice, 2), 0) / dataPoints;
    const priceStdDev = Math.sqrt(priceVariance);
    
    // 置信度計算：數據點越多、價格越穩定，置信度越高
    const dataConfidence = Math.min(dataPoints / 10, 1); // 10個數據點達到最高數據置信度
    const stabilityConfidence = Math.max(0, 1 - (priceStdDev / averagePrice)); // 標準差越小，穩定性越高
    const confidence = (dataConfidence + stabilityConfidence) / 2;

    // 判斷是否異常
    const isAnomalous = deviation > threshold && confidence > minConfidence;
    
    let reason = 'normal';
    if (isAnomalous) {
        if (currentPrice > averagePrice) {
            reason = 'significantly_higher';
        } else {
            reason = 'significantly_lower';
        }
    }

    return {
        isAnomalous,
        confidence,
        reason,
        deviation,
        averagePrice,
        currentPrice,
        dataPoints
    };
};

// 標記異常價格記錄
export const flagAnomalousPrice = async (priceRecordId, anomalyData) => {
    // 這個函數會在實際使用時實現
    // 目前只是返回標記數據
    return {
        recordId: priceRecordId,
        flaggedAt: new Date(),
        anomalyData,
        status: 'flagged',
        reviewRequired: true
    };
};

// 驗證異常價格
export const validateAnomalousPrice = (originalPhoto, userConfirmation) => {
    // 這個函數會在實際使用時實現人工驗證邏輯
    // 目前只是返回驗證結果
    return {
        validated: userConfirmation,
        validatedAt: new Date(),
        hasOriginalPhoto: !!originalPhoto,
        validationMethod: 'manual'
    };
};