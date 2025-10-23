export const calculateUnitPrice = (price, quantity, unitType) => {
  const p = parseFloat(price);
  const q = parseFloat(quantity);
  if (isNaN(p) || isNaN(q) || q <= 0) {
    return null;
  }
  // 對於 'g' 或 'ml'，計算每 100 單位的價格
  return (unitType === 'g' || unitType === 'ml') ? (p / q) * 100 : p / q;
};

// 新增一個函數來根據原價和特價計算最終價格
export const calculateFinalPrice = (originalPrice, specialPrice) => {
  // 如果有特價，則優先使用特價
  if (specialPrice && !isNaN(parseFloat(specialPrice))) {
    return parseFloat(specialPrice);
  }
  // 否則使用原價
  if (originalPrice && !isNaN(parseFloat(originalPrice))) {
    return parseFloat(originalPrice);
  }
  // 如果都沒有，返回 0
  return 0;
};

/**
 * 安全地格式化單價顯示
 * @param {number|null|undefined} unitPrice - 單價值
 * @returns {string} 格式化後的單價字符串
 */
export const formatUnitPrice = (unitPrice) => {
  // 檢查值是否存在且不為 null 或 undefined
  if (unitPrice == null) {
    return '--';
  }
  
  // 檢查值是否為有效數字
  const parsedUnitPrice = parseFloat(unitPrice);
  if (isNaN(parsedUnitPrice)) {
    return '--';
  }
  
  // 檢查是否為 0
  if (parsedUnitPrice === 0) {
    return '--';
  }
  
  // 返回格式化後的價格
  return parsedUnitPrice.toFixed(2);
};