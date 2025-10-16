import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Database, TrendingUp } from 'lucide-react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';

// 圖表組件
const CHART_WIDTH = 400;
const CHART_HEIGHT = 150;
const PADDING = 20;

function PriceTrendChart({ records, productName }) {
    const validRecords = records.map(r => ({
        ...r,
        timestamp: r.timestamp?.toDate ? r.timestamp.toDate() : new Date(r.timestamp)
    })).filter(r => !isNaN(r.price) && r.timestamp).sort((a, b) => a.timestamp - b.timestamp);

    if (validRecords.length < 2) {
        return <p className="text-center text-sm text-gray-500">至少需要兩筆紀錄才能繪製趨勢圖。</p>;
    }

    const prices = validRecords.map(r => r.price);
    const minPrice = Math.min(...prices) * 0.95;
    const maxPrice = Math.max(...prices) * 1.05;
    const priceRange = maxPrice - minPrice;

    const timestamps = validRecords.map(r => r.timestamp.getTime());
    const minTimestamp = Math.min(...timestamps);
    const maxTimestamp = Math.max(...timestamps);
    const timeRange = maxTimestamp - minTimestamp;

    if (priceRange === 0 || timeRange === 0) {
        return <p className="text-center text-sm text-gray-500">價格或時間無足夠變化可繪圖。</p>;
    }

    const points = validRecords.map(record => {
        const xRatio = (record.timestamp.getTime() - minTimestamp) / timeRange;
        const x = PADDING + xRatio * (CHART_WIDTH - 2 * PADDING);
        const yRatio = (record.price - minPrice) / priceRange;
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
                <line x1={PADDING} y1={PADDING} x2={PADDING} y2={CHART_HEIGHT - PADDING} stroke="#ddd" strokeWidth="1" />
                <line x1={PADDING} y1={CHART_HEIGHT - PADDING} x2={CHART_WIDTH - PADDING} y2={CHART_HEIGHT - PADDING} stroke="#ddd" strokeWidth="1" />
                <text x={PADDING - 5} y={PADDING + 5} textAnchor="end" fontSize="10" fill="#666">${maxPrice.toFixed(0)}</text>
                <text x={PADDING - 5} y={CHART_HEIGHT - PADDING} textAnchor="end" fontSize="10" fill="#666">${minPrice.toFixed(0)}</text>
                <polyline fill="none" stroke="#4F46E5" strokeWidth="2" points={points} />
                {validRecords.map((record, index) => {
                    const [x, y] = points.split(' ')[index].split(',').map(Number);
                    return <circle key={index} cx={x} cy={y} r="3" fill={index === validRecords.length - 1 ? '#10B981' : '#4F46E5'} title={`$${record.price} at ${record.timestamp.toLocaleDateString()}`} />;
                })}
            </svg>
            <div className="text-xs text-gray-500 mt-2 flex justify-between px-3">
                <span>{new Date(minTimestamp).toLocaleDateString()}</span>
                <span>{new Date(maxTimestamp).toLocaleDateString()}</span>
            </div>
        </div>
    );
}

// 產品記錄組件
function ProductRecord({ product, records, theme }) {
    const formattedRecords = records.map(r => ({ ...r, timestamp: r.timestamp?.toDate ? r.timestamp.toDate() : new Date(r.timestamp) })).sort((a, b) => b.timestamp - a.timestamp);
    
    const latestRecord = formattedRecords[0];
    if (!latestRecord) return null; // 如果沒有記錄，則不渲染此組件

    const prices = formattedRecords.map(r => r.price);
    const lowestPrice = Math.min(...prices);
    const highestPrice = Math.max(...prices);
    const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;

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
                    <p className="text-xs text-gray-500">{latestRecord.timestamp.toLocaleDateString()}</p>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-2 my-3 text-center">
                <div className="bg-green-50 p-2 rounded"><p className="text-xs text-gray-500">最低價</p><p className="font-bold text-green-600">${lowestPrice.toFixed(2)}</p></div>
                <div className="bg-blue-50 p-2 rounded"><p className="text-xs text-gray-500">平均價</p><p className="font-bold text-blue-600">${avgPrice.toFixed(2)}</p></div>
                <div className="bg-red-50 p-2 rounded"><p className="text-xs text-gray-500">最高價</p><p className="font-bold text-red-600">${highestPrice.toFixed(2)}</p></div>
            </div>

            <div className="mb-4"><PriceTrendChart records={formattedRecords} productName={product.productName} /></div>

            <div className="mt-4">
                <h4 className="font-semibold text-gray-700 mb-2">價格記錄詳情</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                    {formattedRecords.map((record, index) => (
                        <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                            <div>
                                <p className="font-medium">${record.price.toFixed(2)}</p>
                                {record.discountDetails && <p className="text-xs text-indigo-600">{record.discountDetails}</p>}
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-gray-500">{record.storeName || '未標註'}</p>
                                <p className="text-xs text-gray-500">{record.timestamp.toLocaleDateString()}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// 主組件
function AllRecordsPage({ theme, onBack, db }) {
    const [allProducts, setAllProducts] = useState([]);
    const [allRecords, setAllRecords] = useState({});
    const [loading, setLoading] = useState(true);
    const [sortOption, setSortOption] = useState('latest'); // latest, name, price

    useEffect(() => {
        const fetchData = async () => {
            if (!db) return;
            setLoading(true);
            try {
                // 1. Fetch all products
                const productsQuery = query(collection(db, "products"), orderBy("createdAt", "desc"));
                const productsSnap = await getDocs(productsQuery);
                const productsArray = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                // 2. Fetch all records
                const recordsQuery = query(collection(db, "priceRecords"), orderBy("timestamp", "desc"));
                const recordsSnap = await getDocs(recordsQuery);
                const recordsArray = recordsSnap.docs.map(doc => doc.data());

                // 3. Group records by product ID
                const recordsByProduct = {};
                recordsArray.forEach(record => {
                    if (!recordsByProduct[record.numericalID]) {
                        recordsByProduct[record.numericalID] = [];
                    }
                    recordsByProduct[record.numericalID].push(record);
                });

                setAllProducts(productsArray);
                setAllRecords(recordsByProduct);

            } catch (error) {
                console.error('讀取 Firestore 數據失敗:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [db]);

    const sortedProducts = useMemo(() => {
        return [...allProducts].sort((a, b) => {
            const recordsA = allRecords[a.numericalID] || [];
            const recordsB = allRecords[b.numericalID] || [];
            
            if (sortOption === 'name') {
                return a.productName.localeCompare(b.productName);
            }
            
            const latestRecordA = recordsA[0];
            const latestRecordB = recordsB[0];

            if (sortOption === 'price') {
                const priceA = latestRecordA?.price || -1;
                const priceB = latestRecordB?.price || -1;
                return priceB - priceA;
            }

            // Default to 'latest'
            const timeA = latestRecordA?.timestamp?.toDate ? latestRecordA.timestamp.toDate().getTime() : 0;
            const timeB = latestRecordB?.timestamp?.toDate ? latestRecordB.timestamp.toDate().getTime() : 0;
            return timeB - timeA;
        });
    }, [allProducts, allRecords, sortOption]);

    if (loading) {
        return (
            <div className="min-h-screen p-4 sm:p-8 bg-gray-100">
                <div className="max-w-4xl mx-auto">
                    <div className="flex items-center mb-6">
                        <button onClick={onBack} className="flex items-center text-indigo-600 hover:text-indigo-800 mr-4"><ArrowLeft className="mr-1" size={20} />返回</button>
                        <h1 className="text-2xl font-bold text-gray-800">所有記錄</h1>
                    </div>
                    <div className="text-center py-10"><p>正在從雲端加載數據...</p></div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-4 sm:p-8 bg-gray-100">
            <div className="max-w-4xl mx-auto">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
                    <div className="flex items-center mb-4 sm:mb-0">
                        <button onClick={onBack} className="flex items-center text-indigo-600 hover:text-indigo-800 mr-4"><ArrowLeft className="mr-1" size={20} />返回</button>
                        <h1 className="text-2xl font-bold text-gray-800 flex items-center"><Database className="mr-2" />所有記錄</h1>
                    </div>
                    <div className="flex items-center">
                        <label className="mr-2 text-gray-700">排序:</label>
                        <select value={sortOption} onChange={(e) => setSortOption(e.target.value)} className="border border-gray-300 rounded p-2">
                            <option value="latest">最新記錄</option>
                            <option value="name">產品名稱</option>
                            <option value="price">最新價格</option>
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
                                <p className="text-gray-700">總共 <span className="font-bold">{sortedProducts.length}</span> 個產品</p>
                                <p className="text-gray-700">總共 <span className="font-bold">{Object.values(allRecords).flat().length}</span> 條記錄</p>
                            </div>
                        </div>
                        {sortedProducts.map(product => {
                            const records = allRecords[product.numericalID] || [];
                            if (records.length === 0) return null;
                            return <ProductRecord key={product.numericalID} product={product} records={records} theme={theme} />;
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

export default AllRecordsPage;
