export const calculateUnitPrice = (price, quantity, unitType) => {
  const p = parseFloat(price);
  const q = parseFloat(quantity);
  if (isNaN(p) || isNaN(q) || q <= 0) {
    return null;
  }
  // 對於 'g' 或 'ml'，計算每 100 單位的價格
  return (unitType === 'g' || unitType === 'ml') ? (p / q) * 100 : p / q;
};
