import React, { useState, useEffect } from 'react';
import { ArrowLeft, Database, TrendingUp } from 'lucide-react';

// 圖表組件
const CHART_WIDTH = 400;
const CHART_HEIGHT = 150;
const PADDING = 20;

function PriceTrendChart({ records, productName }) {
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
                <TrendingUp className="mr-1 text-gray-500" size={16} />
                價格走勢 - {productName}
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
                    stroke="#4F46E5"
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
                            fill={index === 0 ? '#10B981' : '#4F46E5'}
                            title={`$${record.price} at ${new Date(record.timestamp).toLocaleDateString()}`}
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

// 產品記錄組件
function ProductRecord({ product, records, theme }) {
    // 計算統計信息
    const latestRecord = records[0];
    const lowestPrice = Math.min(...records.map(r => r.price));
    const highestPrice = Math.max(...records.map(r => r.price));
    const avgPrice = records.reduce((sum, r) => sum + r.price, 0) / records.length;

    return (
        <div className={`p-4 rounded-xl shadow-lg bg-white border-t-4 ${theme.border} mb-6`}>
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="text-lg font-bold text-gray-800">{product.productName}</h3>
                    <p className="text-sm text-gray-600">條碼: {product.barcodeData}</p>
                    <p className="text-xs text-gray-500">ID: {product.numericalID}</p>
                </div>
                <div className="text-right">
                    <p className="text-2xl font-bold text-indigo-600">${latestRecord.price.toFixed(2)}</p>
                    <p className="text-xs text-gray-500">
                        {new Date(latestRecord.timestamp).toLocaleDateString()}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-2 my-3 text-center">
                <div className="bg-green-50 p-2 rounded">
                    <p className="text-xs text-gray-500">最低價</p>
                    <p className="font-bold text-green-600">${lowestPrice.toFixed(2)}</p>
                </div>
                <div className="bg-blue-50 p-2 rounded">
                    <p className="text-xs text-gray-500">平均價</p>
                    <p className="font-bold text-blue-600">${avgPrice.toFixed(2)}</p>
                </div>
                <div className="bg-red-50 p-2 rounded">
                    <p className="text-xs text-gray-500">最高價</p>
                    <p className="font-bold text-red-600">${highestPrice.toFixed(2)}</p>
                </div>
            </div>

            <div className="mb-4">
                <PriceTrendChart records={records} productName={product.productName} />
            </div>

            <div className="mt-4">
                <h4 className="font-semibold text-gray-700 mb-2">價格記錄詳情</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                    {records.map((record, index) => (
                        <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                            <div>
                                <p className="font-medium">${record.price.toFixed(2)}</p>
                                {record.discountDetails && (
                                    <p className="text-xs text-indigo-600">{record.discountDetails}</p>
                                )}
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-gray-500">{record.storeName || '未標註'}</p>
                                <p className="text-xs text-gray-500">
                                    {new Date(record.timestamp).toLocaleDateString()}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// 主組件
function AllRecordsPage({ theme, onBack }) {
    const [allProducts, setAllProducts] = useState([]);
    const [allRecords, setAllRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sortOption, setSortOption] = useState('latest'); // latest, name, price

    useEffect(() => {
        try {
            // 從 Local Storage 獲取數據
            const productsJson = localStorage.getItem('MVP_PRODUCTS') || '{}';
            const recordsJson = localStorage.getItem('MVP_PRICE_RECORDS') || '[]';
            
            const products = JSON.parse(productsJson);
            const records = JSON.parse(recordsJson);

            // 轉換產品對象為數組
            const productsArray = Object.values(products);
            
            // 按 numericalID 將記錄分組
            const recordsByProduct = {};
            records.forEach(record => {
                if (!recordsByProduct[record.numericalID]) {
                    recordsByProduct[record.numericalID] = [];
                }
                recordsByProduct[record.numericalID].push(record);
            });

            // 排序每個產品的記錄（按時間倒序）
            Object.keys(recordsByProduct).forEach(productId => {
                recordsByProduct[productId].sort((a, b) => 
                    new Date(b.timestamp) - new Date(a.timestamp)
                );
            });

            setAllProducts(productsArray);
            setAllRecords(recordsByProduct);
            setLoading(false);
        } catch (error) {
            console.error('讀取數據失敗:', error);
            setLoading(false);
        }
    }, []);

    // 排序產品
    const sortedProducts = [...allProducts].sort((a, b) => {
        switch (sortOption) {
            case 'name':
                return a.productName.localeCompare(b.productName);
            case 'price':
                const priceA = allRecords[a.numericalID]?.[0]?.price || 0;
                const priceB = allRecords[b.numericalID]?.[0]?.price || 0;
                return priceB - priceA; // 降序
            case 'latest':
            default:
                const timeA = allRecords[a.numericalID]?.[0]?.timestamp || '';
                const timeB = allRecords[b.numericalID]?.[0]?.timestamp || '';
                return new Date(timeB) - new Date(timeA); // 降序
        }
    });

    if (loading) {
        return (
            <div className="min-h-screen p-4 sm:p-8 bg-gray-100">
                <div className="max-w-4xl mx-auto">
                    <div className="flex items-center mb-6">
                        <button 
                            onClick={onBack}
                            className="flex items-center text-indigo-600 hover:text-indigo-800 mr-4"
                        >
                            <ArrowLeft className="mr-1" size={20} />
                            返回
                        </button>
                        <h1 className="text-2xl font-bold text-gray-800">所有記錄</h1>
                    </div>
                    <div className="text-center py-10">
                        <p>正在加載數據...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-4 sm:p-8 bg-gray-100">
            <div className="max-w-4xl mx-auto">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
                    <div className="flex items-center mb-4 sm:mb-0">
                        <button 
                            onClick={onBack}
                            className="flex items-center text-indigo-600 hover:text-indigo-800 mr-4"
                        >
                            <ArrowLeft className="mr-1" size={20} />
                            返回
                        </button>
                        <h1 className="text-2xl font-bold text-gray-800 flex items-center">
                            <Database className="mr-2" />
                            所有記錄
                        </h1>
                    </div>
                    <div className="flex items-center">
                        <label className="mr-2 text-gray-700">排序:</label>
                        <select 
                            value={sortOption}
                            onChange={(e) => setSortOption(e.target.value)}
                            className="border border-gray-300 rounded p-2"
                        >
                            <option value="latest">最新記錄</option>
                            <option value="name">產品名稱</option>
                            <option value="price">價格</option>
                        </select>
                    </div>
                </div>

                {sortedProducts.length === 0 ? (
                    <div className="text-center py-10 bg-white rounded-xl shadow">
                        <Database size={48} className="mx-auto text-gray-400 mb-4" />
                        <h3 className="text-xl font-semibold text-gray-700 mb-2">暫無記錄</h3>
                        <p className="text-gray-500">還沒有任何產品和價格記錄</p>
                    </div>
                ) : (
                    <div>
                        <div className="mb-4 p-4 bg-white rounded-lg shadow">
                            <div className="flex justify-between">
                                <p className="text-gray-700">
                                    總共 <span className="font-bold">{sortedProducts.length}</span> 個產品
                                </p>
                                <p className="text-gray-700">
                                    總共 <span className="font-bold">{Object.values(allRecords).flat().length}</span> 條記錄
                                </p>
                            </div>
                        </div>
                        
                        {sortedProducts.map(product => {
                            const records = allRecords[product.numericalID] || [];
                            return (
                                <ProductRecord 
                                    key={product.numericalID} 
                                    product={product} 
                                    records={records} 
                                    theme={theme}
                                />
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

export default AllRecordsPage;