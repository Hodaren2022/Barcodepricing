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