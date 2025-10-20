import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ArrowLeft, Database, TrendingUp, Edit, Trash2, Save, X, CheckCircle } from 'lucide-react';
import { collection, getDocs, query, orderBy, updateDoc, deleteDoc, doc } from 'firebase/firestore';

// 圖表組件
const CHART_WIDTH = 400;
const CHART_HEIGHT = 150;
const PADDING = 20;

function PriceTrendChart({ records, productName }) {
    const validRecords = records.map(r => ({
        ...r,
        timestamp: r.timestamp?.toDate ? r.timestamp.toDate() : new Date(r.timestamp),
        displayPrice: r.unitPrice !== undefined && r.unitPrice !== null ? r.unitPrice : r.price // Use unitPrice if available, else price
    })).filter(r => !isNaN(r.displayPrice) && r.timestamp).sort((a, b) => a.timestamp - b.timestamp);

    if (validRecords.length < 2) {
        return <p className="text-center text-sm text-gray-500">至少需要兩筆紀錄才能繪製趨勢圖。</p>;
    }

    const prices = validRecords.map(r => r.displayPrice);
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
        const yRatio = (record.displayPrice - minPrice) / priceRange;
        const y = CHART_HEIGHT - PADDING - yRatio * (CHART_HEIGHT - 2 * PADDING);
        return `${x},${y}`;
    }).join(' ');

    return (
        <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
            <h3 className="text-base font-medium text-gray-700 mb-2 flex items-center">
                <TrendingUp className="mr-1 text-gray-500" size={16} />
                單價走勢 - {productName}
            </h3>
            <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="w-full h-auto" style={{maxWidth: `${CHART_WIDTH}px`}}>
                <line x1={PADDING} y1={PADDING} x2={PADDING} y2={CHART_HEIGHT - PADDING} stroke="#ddd" strokeWidth="1" />
                <line x1={PADDING} y1={CHART_HEIGHT - PADDING} x2={CHART_WIDTH - PADDING} y2={CHART_HEIGHT - PADDING} stroke="#ddd" strokeWidth="1" />
                <text x={PADDING - 5} y={PADDING + 5} textAnchor="end" fontSize="10" fill="#666">${maxPrice.toFixed(2)}</text>
                <text x={PADDING - 5} y={CHART_HEIGHT - PADDING} textAnchor="end" fontSize="10" fill="#666">${minPrice.toFixed(2)}</text>
                <polyline fill="none" stroke="#4F46E5" strokeWidth="2" points={points} />
                {validRecords.map((record, index) => {
                    const [x, y] = points.split(' ')[index].split(',').map(Number);
                    return <circle key={index} cx={x} cy={y} r="3" fill={index === validRecords.length - 1 ? '#10B981' : '#4F46E5'} title={`${record.displayPrice.toFixed(2)} at ${record.timestamp.toLocaleDateString()}`} />;
                })}
            </svg>
            <div className="text-xs text-gray-500 mt-2 flex justify-between px-3">
                <span>{new Date(minTimestamp).toLocaleDateString()}</span>
                <span>{new Date(maxTimestamp).toLocaleDateString()}</span>
            </div>
        </div>
    );
}

// 可滑動的記錄項目
function SwipeableRecord({ children, onEdit, onDelete }) {
    const [translateX, setTranslateX] = useState(0);
    const touchStartX = useRef(0);
    const itemRef = useRef(null);
    const buttonsRef = useRef(null);

    const handleTouchStart = (e) => {
        touchStartX.current = e.touches[0].clientX;
    };

    const handleTouchMove = (e) => {
        const touchCurrentX = e.touches[0].clientX;
        const diff = touchCurrentX - touchStartX.current;
        if (diff < 0) { // 只允許向左滑動
            setTranslateX(Math.max(diff, -160)); // -160 是按鈕寬度的總和
        }
    };

    const handleTouchEnd = () => {
        if (translateX < -80) {
            setTranslateX(-160);
        } else {
            setTranslateX(0);
        }
    };

    useEffect(() => {
        const handleGlobalClick = (e) => {
            if (buttonsRef.current && !buttonsRef.current.contains(e.target)) {
                setTranslateX(0);
            }
        };

        if (translateX !== 0) {
            document.addEventListener('click', handleGlobalClick, true);
        }

        return () => {
            document.removeEventListener('click', handleGlobalClick, true);
        };
    }, [translateX]);

    const handleEdit = () => {
        onEdit();
        setTranslateX(0);
    };

    const handleDelete = () => {
        onDelete();
        setTranslateX(0);
    };

    return (
        <div className="relative overflow-hidden">
            <div ref={buttonsRef} className="absolute top-0 right-0 h-full flex items-center">
                <button onClick={handleEdit} className="bg-blue-500 text-white h-full w-20 flex flex-col items-center justify-center">
                    <Edit size={20} />
                    <span>編輯</span>
                </button>
                <button onClick={handleDelete} className="bg-red-500 text-white h-full w-20 flex flex-col items-center justify-center">
                    <Trash2 size={20} />
                    <span>刪除</span>
                </button>
            </div>
            <div
                ref={itemRef}
                className="transition-transform duration-300 ease-in-out"
                style={{ transform: `translateX(${translateX}px)` }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                {children}
            </div>
        </div>
    );
}


// 產品記錄組件
function ProductRecord({ product, records, theme, onEdit, onDelete }) {
    const formattedRecords = records.map(r => ({ ...r, timestamp: r.timestamp?.toDate ? r.timestamp.toDate() : new Date(r.timestamp) })).sort((a, b) => b.timestamp - a.timestamp);
    
    const latestRecord = formattedRecords[0];
    if (!latestRecord) return null; // 如果沒有記錄，則不渲染此組件

    const validUnitPrices = formattedRecords.map(r => r.unitPrice).filter(p => !isNaN(p) && p !== undefined && p !== null);
    const lowestUnitPrice = validUnitPrices.length > 0 ? Math.min(...validUnitPrices) : 0;
    const highestUnitPrice = validUnitPrices.length > 0 ? Math.max(...validUnitPrices) : 0;
    const avgUnitPrice = validUnitPrices.length > 0 ? validUnitPrices.reduce((sum, p) => sum + p, 0) / validUnitPrices.length : 0;

    return (
        <div className={`p-4 rounded-xl shadow-lg bg-white border-t-4 ${theme.border} mb-6`}>
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="text-lg font-bold text-gray-800">{product.productName}</h3>
                    <p className="text-sm text-gray-600">條碼: {product.barcodeData}</p>
                    <p className="text-xs text-gray-500">ID: {product.numericalID}</p>
                </div>
                <div className="text-right">
                    <p className="text-2xl font-bold text-indigo-600">{isNaN(latestRecord.unitPrice) && isNaN(latestRecord.price) ? 'N/A' : `$${(latestRecord.unitPrice || latestRecord.price || 0).toFixed(2)}`}</p>
                    <p className="text-xs text-gray-500">{latestRecord.timestamp.toLocaleDateString()}</p>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-2 my-3 text-center">
                <div className="bg-green-50 p-2 rounded"><p className="text-xs text-gray-500">最低單價</p><p className="font-bold text-green-600">{isNaN(lowestUnitPrice) ? 'N/A' : `$${lowestUnitPrice.toFixed(2)}`}</p></div>
                <div className="bg-blue-50 p-2 rounded"><p className="text-xs text-gray-500">平均單價</p><p className="font-bold text-blue-600">{isNaN(avgUnitPrice) ? 'N/A' : `$${avgUnitPrice.toFixed(2)}`}</p></div>
                <div className="bg-red-50 p-2 rounded"><p className="text-xs text-gray-500">最高單價</p><p className="font-bold text-red-600">{isNaN(highestUnitPrice) ? 'N/A' : `$${highestUnitPrice.toFixed(2)}`}</p></div>
            </div>

            <div className="mb-4"><PriceTrendChart records={formattedRecords} productName={product.productName} /></div>

            <div className="mt-4">
                <h4 className="font-semibold text-gray-700 mb-2">價格記錄詳情</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                    {formattedRecords.map((record, index) => (
                        <SwipeableRecord
                            key={index}
                            onEdit={() => onEdit(record)}
                            onDelete={() => onDelete(record)}
                        >
                            <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
                                <div>
                                    <p className="font-medium">
                                        {isNaN(record.price) || isNaN(record.unitPrice) ?
                                            `$${(record.price || 0).toFixed(2)}@--` :
                                            `$${record.price}@$${(record.unitPrice || 0).toFixed(2)}`
                                        }
                                    </p>
                                    {record.discountDetails && <p className="text-xs text-indigo-600">{record.discountDetails}</p>}
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-gray-500">{record.storeName || '未標註'}</p>
                                    <p className="text-xs text-gray-500">{record.timestamp.toLocaleDateString()}</p>
                                </div>
                            </div>
                        </SwipeableRecord>
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
    const [editingRecord, setEditingRecord] = useState(null);
    const [deletingRecord, setDeletingRecord] = useState(null);
    const [successMessage, setSuccessMessage] = useState('');

    const fetchData = useCallback(async () => {
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
            const recordsArray = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

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
    }, [db]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

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

    const showSuccessMessage = (message) => {
        setSuccessMessage(message);
        setTimeout(() => {
            setSuccessMessage('');
        }, 2000);
    };

    const handleEdit = (record) => {
        setEditingRecord(record);
    };

    const handleDelete = (record) => {
        setDeletingRecord(record);
    };

    const handleSaveEdit = async (updatedRecord) => {
        if (!db) return;
        try {
            const recordRef = doc(db, "priceRecords", updatedRecord.id);
            await updateDoc(recordRef, {
                price: updatedRecord.price,
                discountDetails: updatedRecord.discountDetails
            });
            await fetchData(); // 重新獲取數據以更新UI
            showSuccessMessage('記錄已成功更新');
        } catch (error) {
            console.error("更新記錄失敗:", error);
        }
        setEditingRecord(null);
    };

    const confirmDelete = async () => {
        if (!db || !deletingRecord) return;
        try {
            const recordRef = doc(db, "priceRecords", deletingRecord.id);
            await deleteDoc(recordRef);
            await fetchData(); // 重新獲取數據以更新UI
            showSuccessMessage('記錄已成功刪除');
        } catch (error) {
            console.error("刪除記錄失敗:", error);
        }
        setDeletingRecord(null);
    };

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
                <SuccessMessage message={successMessage} />
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
                            return <ProductRecord key={product.numericalID} product={product} records={records} theme={theme} onEdit={handleEdit} onDelete={handleDelete} />;
                        })}
                    </div>
                )}

                {editingRecord && (
                    <EditModal
                        record={editingRecord}
                        onClose={() => setEditingRecord(null)}
                        onSave={handleSaveEdit}
                    />
                )}

                {deletingRecord && (
                    <DeleteConfirmation
                        record={deletingRecord}
                        onClose={() => setDeletingRecord(null)}
                        onConfirm={confirmDelete}
                    />
                )}
            </div>
        </div>
    );
}

function EditModal({ record, onClose, onSave }) {
    const [price, setPrice] = useState(record.price);
    const [quantity, setQuantity] = useState(record.quantity || '');
    const [unitType, setUnitType] = useState(record.unitType || 'pcs');
    const [discount, setDiscount] = useState(record.discountDetails || '');

    const calculateUnitPrice = useCallback(() => {
        const p = parseFloat(price);
        const q = parseFloat(quantity);
        if (!isNaN(p) && !isNaN(q) && q > 0) {
            if (unitType === 'g' || unitType === 'ml') {
                return (p / q) * 100;
            } else { // For 'pcs' and any other unit
                return p / q;
            }
        }
        return null;
    }, [price, quantity, unitType]);

    const handleSave = () => {
        const newUnitPrice = calculateUnitPrice();
        if (newUnitPrice === null) {
            alert("請輸入有效的價格和數量。");
            return;
        }
        onSave({ 
            ...record, 
            price: parseFloat(price),
            quantity: parseFloat(quantity),
            unitType: unitType,
            unitPrice: newUnitPrice,
            discountDetails: discount 
        });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm">
                <h2 className="text-xl font-bold mb-4">編輯記錄</h2>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">總價 ($)</label>
                        <input
                            type="number"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">數量</label>
                        <input
                            type="number"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">單位</label>
                        <select
                            value={unitType}
                            onChange={(e) => setUnitType(e.target.value)}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            <option value="ml">ml (毫升)</option>
                            <option value="g">g (克)</option>
                            <option value="pcs">pcs (個/包/支/條)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">單價 (自動計算)</label>
                        <input
                            type="text"
                            value={isNaN(calculateUnitPrice()) ? 'N/A' : calculateUnitPrice().toFixed(2)}
                            readOnly
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 bg-gray-100"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">折扣詳情</label>
                        <input
                            type="text"
                            value={discount}
                            onChange={(e) => setDiscount(e.target.value)}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                </div>
                <div className="mt-6 flex justify-end space-x-3">
                    <button onClick={onClose} className="flex items-center bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300">
                        <X size={18} className="mr-1" />
                        取消
                    </button>
                    <button onClick={handleSave} className="flex items-center bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">
                        <Save size={18} className="mr-1" />
                        保存
                    </button>
                </div>
            </div>
        </div>
    );
}

function DeleteConfirmation({ record, onClose, onConfirm }) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm">
                <h2 className="text-xl font-bold mb-4">確認刪除</h2>
                <p>您確定要刪除這條價格為 ${record.price.toFixed(2)} 的記錄嗎？此操作無法復原。</p>
                <div className="mt-6 flex justify-end space-x-3">
                    <button onClick={onClose} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300">取消</button>
                    <button onClick={onConfirm} className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700">確認刪除</button>
                </div>
            </div>
        </div>
    );
}

function SuccessMessage({ message }) {
    if (!message) return null;

    return (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center z-50">
            <CheckCircle size={20} className="mr-2" />
            <span>{message}</span>
        </div>
    );
}

export default AllRecordsPage;
