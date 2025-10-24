import React, { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import { ArrowLeft, Database, TrendingUp, Edit, Trash2, Save, X, CheckCircle, Search } from 'lucide-react';
import { collection, getDocs, query, orderBy, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { calculateUnitPrice, formatUnitPrice } from './utils/priceCalculations';
import StoreSelector from './StoreSelector';
import { showUserFriendlyError, handleFirestoreSaveError } from './utils/errorHandler'; // 導入錯誤處理工具

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

// Fuzzy search function
function fuzzyMatch(pattern, text) {
    const pattern_lower = pattern.toLowerCase();
    const text_lower = text.toLowerCase();
    let patternIdx = 0;
    let textIdx = 0;
    let score = 0;
    let consecutive = 0;
    let firstMatchIndex = -1;

    // Iterate through text to find pattern characters
    while (patternIdx < pattern_lower.length && textIdx < text_lower.length) {
        if (pattern_lower[patternIdx] === text_lower[textIdx]) {
            if (firstMatchIndex === -1) {
                firstMatchIndex = textIdx;
            }
            score += 1;
            // Add bonus for consecutive matches
            if (consecutive > 0) {
                score += consecutive;
            }
            consecutive++;
            patternIdx++;
        } else {
            consecutive = 0;
        }
        textIdx++;
    }

    // If the whole pattern was found
    if (patternIdx === pattern_lower.length) {
        // Add bonus for being a prefix
        if (firstMatchIndex === 0) {
            score += 5;
        }
        // Add bonus for tightness of the match
        const matchDensity = pattern.length / (textIdx - firstMatchIndex);
        score *= (1 + matchDensity);

        return score;
    }

    return 0;
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
                    {/* 顯示原價和特價信息 */}
                    {latestRecord.specialPrice ? (
                        <div>
                            {latestRecord.originalPrice && (
                                <p className="text-lg text-gray-500 line-through">${latestRecord.originalPrice.toFixed(2)}</p>
                            )}
                            <p className="text-2xl font-bold text-indigo-600">${latestRecord.specialPrice.toFixed(2)}</p>
                            <p className="text-xs text-gray-500">@{formatUnitPrice(latestRecord.unitPrice)}</p>
                        </div>
                    ) : (
                        <p className="text-2xl font-bold text-indigo-600">{formatUnitPrice(latestRecord.unitPrice) === '--' ? (isNaN(latestRecord.price) ? 'N/A' : `$${(latestRecord.price || 0).toFixed(2)}`) : `$${(latestRecord.price || 0).toFixed(2)} @${formatUnitPrice(latestRecord.unitPrice)}`}</p>
                    )}
                    <p className="text-xs text-gray-500">{latestRecord.timestamp.toLocaleDateString()}</p>
                    {/* 顯示數量和單位 */}
                    {latestRecord.quantity && latestRecord.unitType && (
                        <p className="text-xs text-gray-500">數量: {latestRecord.quantity} {latestRecord.unitType}</p>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-3 gap-2 my-3 text-center">
                <div className="bg-green-50 p-2 rounded"><p className="text-xs text-gray-500">最低單價</p><p className="font-bold text-green-600">{isNaN(lowestUnitPrice) ? 'N/A' : `${lowestUnitPrice.toFixed(2)}`}</p></div>
                <div className="bg-blue-50 p-2 rounded"><p className="text-xs text-gray-500">平均單價</p><p className="font-bold text-blue-600">{isNaN(avgUnitPrice) ? 'N/A' : `${avgUnitPrice.toFixed(2)}`}</p></div>
                <div className="bg-red-50 p-2 rounded"><p className="text-xs text-gray-500">最高單價</p><p className="font-bold text-red-600">{isNaN(highestUnitPrice) ? 'N/A' : `${highestUnitPrice.toFixed(2)}`}</p></div>
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
                                    {/* 顯示原價和特價信息 */}
                                    {record.specialPrice ? (
                                        <p className="font-medium">
                                            {record.originalPrice && (
                                                <span className="text-gray-500 line-through">${record.originalPrice.toFixed(2)}</span>
                                            )}
                                            <span className="text-red-600 ml-1">${record.specialPrice.toFixed(2)}</span>
                                            <span className="text-gray-500 ml-1">@{formatUnitPrice(record.unitPrice)}</span>
                                        </p>
                                    ) : (
                                        <p className="font-medium">{`$${(record.price || 0).toFixed(2)} @${formatUnitPrice(record.unitPrice)}`}</p>
                                    )}
                                    {record.discountDetails && <p className="text-xs text-indigo-600">{record.discountDetails}</p>}
                                    {/* 顯示數量和單位 */}
                                    {record.quantity && record.unitType && (
                                        <p className="text-xs text-gray-600">數量: {record.quantity} {record.unitType}</p>
                                    )}
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
    const scrollPositionRef = useRef(0); // For scroll restoration
    const [isAfterDelete, setIsAfterDelete] = useState(false); // Signal for scroll restoration
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const searchInputRef = useRef(null);
    
    // Edit mode states
    const [isEditMode, setIsEditMode] = useState(false);
    const [selectedItems, setSelectedItems] = useState(new Set());
    const [localProducts, setLocalProducts] = useState([]);
    const [localRecords, setLocalRecords] = useState({});
    // 新增狀態：批量刪除確認對話框
    const [isBulkDeleteConfirmationOpen, setIsBulkDeleteConfirmationOpen] = useState(false);
    // 新增狀態：原始數據快照和衝突解決
    const [originalDataSnapshot, setOriginalDataSnapshot] = useState(null);
    const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false);

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
            const userMessage = handleFirestoreSaveError(error, "讀取產品數據");
            showUserFriendlyError(userMessage);
        } finally {
            setLoading(false);
        }
    }, [db]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        if (isSearchOpen && searchInputRef.current) {
            setTimeout(() => searchInputRef.current.focus(), 100); // Shorter delay for responsiveness
        }
    }, [isSearchOpen]);

    useLayoutEffect(() => {
        if (isAfterDelete && !loading) {
            // Use requestAnimationFrame to ensure scroll happens after browser paints
            requestAnimationFrame(() => {
                window.scrollTo(0, scrollPositionRef.current);
                setIsAfterDelete(false); // Reset the signal after scrolling
            });
        }
    }, [loading, isAfterDelete]);

    const filteredProducts = useMemo(() => {
        // Use local data in edit mode, otherwise use Firebase data
        const products = isEditMode ? localProducts : allProducts;
        const records = isEditMode ? localRecords : allRecords;

        if (searchQuery.trim() === '') {
            // No search query, just sort the products
            return [...products].sort((a, b) => {
                const recordsA = records[a.numericalID] || [];
                const recordsB = records[b.numericalID] || [];
                
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
        }

        // Fuzzy search logic
        const scoredProducts = products
            .map(product => ({
                product,
                score: fuzzyMatch(searchQuery, product.productName)
            }))
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score);
        
        return scoredProducts.map(item => item.product);

    }, [allProducts, allRecords, sortOption, searchQuery, isEditMode, localProducts, localRecords]);

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
        scrollPositionRef.current = window.scrollY; // Save scroll position
        setDeletingRecord(record);
    };

    // New function to handle checkbox selection
    const handleItemSelect = (productId) => {
        setSelectedItems(prev => {
            const newSet = new Set(prev);
            if (newSet.has(productId)) {
                newSet.delete(productId);
            } else {
                newSet.add(productId);
            }
            return newSet;
        });
    };

    // 修改批量刪除功能以使用確認對話框
    const handleBulkDeleteClick = () => {
        if (selectedItems.size === 0) return;
        setIsBulkDeleteConfirmationOpen(true);
    };

    // New function to delete selected items
    const deleteSelectedItems = async () => {
        if (selectedItems.size === 0) return;
        
        try {
            // Update local state
            setLocalProducts(prev => prev.filter(product => !selectedItems.has(product.numericalID)));
            setLocalRecords(prev => {
                const newRecords = {...prev};
                selectedItems.forEach(productId => {
                    delete newRecords[productId];
                });
                return newRecords;
            });
            
            // Clear selection
            setSelectedItems(new Set());
            setIsBulkDeleteConfirmationOpen(false);
        } catch (error) {
            console.error("Error deleting selected items:", error);
            const userMessage = handleFirestoreSaveError(error, "批量刪除產品");
            showUserFriendlyError(userMessage);
        }
    };

    // 新增函數：檢查衝突並退出編輯模式
    const checkForConflictsAndExit = async () => {
        if (!db || !originalDataSnapshot) return;
        
        try {
            // 獲取當前 Firebase 數據
            const productsQuery = query(collection(db, "products"), orderBy("createdAt", "desc"));
            const productsSnap = await getDocs(productsQuery);
            const currentProducts = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            const recordsQuery = query(collection(db, "priceRecords"), orderBy("timestamp", "desc"));
            const recordsSnap = await getDocs(recordsQuery);
            const currentRecordsArray = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // 將記錄按產品 ID 分組
            const currentRecords = {};
            currentRecordsArray.forEach(record => {
                if (!currentRecords[record.numericalID]) {
                    currentRecords[record.numericalID] = [];
                }
                currentRecords[record.numericalID].push(record);
            });
            
            // 比較當前數據與原始快照
            const hasConflicts = checkForDataConflicts(originalDataSnapshot, {products: currentProducts, records: currentRecords});
            
            if (hasConflicts) {
                // 如果有衝突，顯示衝突解決對話框
                setIsConflictDialogOpen(true);
            } else {
                // 如果沒有衝突，直接退出編輯模式
                await exitEditMode(currentProducts, currentRecords);
            }
        } catch (error) {
            console.error("檢查數據衝突時出錯:", error);
            const userMessage = handleFirestoreSaveError(error, "檢查數據衝突");
            showUserFriendlyError(userMessage);
            // 出錯時仍然退出編輯模式
            await exitEditMode();
        }
    };
    
    // 新增函數：檢查數據衝突
    const checkForDataConflicts = (original, current) => {
        // 比較產品數量
        if (original.products.length !== current.products.length) {
            return true;
        }
        
        // 比較記錄數量
        const originalRecordCount = Object.values(original.records).reduce((count, records) => count + records.length, 0);
        const currentRecordCount = Object.values(current.records).reduce((count, records) => count + records.length, 0);
        
        if (originalRecordCount !== currentRecordCount) {
            return true;
        }
        
        // 更詳細的比較可以在此處添加
        // 為了簡化，我們只檢查數量變化
        
        return false;
    };
    
    // 修改 exitEditMode 函數以接受當前數據
    const exitEditMode = async (currentProducts = null, currentRecords = null) => {
        if (!db) return;
        
        try {
            // 如果沒有提供當前數據，則獲取最新數據
            let latestProducts = currentProducts;
            let latestRecords = currentRecords;
            
            if (!latestProducts || !latestRecords) {
                const productsQuery = query(collection(db, "products"), orderBy("createdAt", "desc"));
                const productsSnap = await getDocs(productsQuery);
                latestProducts = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                const recordsQuery = query(collection(db, "priceRecords"), orderBy("timestamp", "desc"));
                const recordsSnap = await getDocs(recordsQuery);
                const currentRecordsArray = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                // 將記錄按產品 ID 分組
                latestRecords = {};
                currentRecordsArray.forEach(record => {
                    if (!latestRecords[record.numericalID]) {
                        latestRecords[record.numericalID] = [];
                    }
                    latestRecords[record.numericalID].push(record);
                });
            }
            
            // 計算需要從 Firebase 刪除的產品
            const productsToDelete = latestProducts.filter(product => 
                !localProducts.some(localProduct => localProduct.numericalID === product.numericalID)
            );
            
            // 刪除 Firebase 中的產品及其記錄
            for (const product of productsToDelete) {
                // 刪除所有記錄
                const productRecords = latestRecords[product.numericalID] || [];
                for (const record of productRecords) {
                    const recordRef = doc(db, "priceRecords", record.id);
                    await deleteDoc(recordRef);
                }
            }
            
            // 計算需要從 Firebase 刪除的記錄（編輯模式下刪除的記錄）
            const recordsToDelete = [];
            for (const [productId, records] of Object.entries(latestRecords)) {
                const localRecordsForProduct = localRecords[productId] || [];
                // 找出在原始記錄中存在但在本地記錄中不存在的記錄
                const deletedRecords = records.filter(record => 
                    !localRecordsForProduct.some(localRecord => localRecord.id === record.id)
                );
                recordsToDelete.push(...deletedRecords);
            }
            
            // 刪除 Firebase 中的記錄
            for (const record of recordsToDelete) {
                const recordRef = doc(db, "priceRecords", record.id);
                await deleteDoc(recordRef);
            }
            
            // 重新從 Firebase 獲取數據
            await fetchData();
            setIsEditMode(false);
            setSelectedItems(new Set());
            setOriginalDataSnapshot(null);

        } catch (error) {
            console.error("Error syncing with Firebase:", error);
            const userMessage = handleFirestoreSaveError(error, "同步編輯數據");
            showUserFriendlyError(userMessage);
        }
    };

    const handleSaveEdit = async (updatedRecord) => {
        if (!db) return;
        try {
            const recordRef = doc(db, "priceRecords", updatedRecord.id);
            // 更新所有字段，不僅僅是價格和折扣詳情
            await updateDoc(recordRef, {
                price: updatedRecord.price,
                discountDetails: updatedRecord.discountDetails,
                productName: updatedRecord.productName,
                storeName: updatedRecord.storeName,
                quantity: updatedRecord.quantity,
                unitType: updatedRecord.unitType,
                unitPrice: updatedRecord.unitPrice,
                originalPrice: updatedRecord.originalPrice,
                specialPrice: updatedRecord.specialPrice
            });
            
            // 在編輯模式下，更新本地狀態而不是重新獲取所有數據
            if (isEditMode) {
                setLocalRecords(prev => {
                    const newRecords = {...prev};
                    
                    // 確保更新的記錄所屬的產品在 localRecords 中存在
                    if (!newRecords[updatedRecord.numericalID]) {
                        newRecords[updatedRecord.numericalID] = [];
                    }
                    
                    // 更新記錄
                    Object.keys(newRecords).forEach(productId => {
                        if (newRecords[productId]) {
                            newRecords[productId] = newRecords[productId].map(record => 
                                record.id === updatedRecord.id ? updatedRecord : record
                            ).filter(record => record !== undefined); // 過濾掉可能的 undefined 值
                        }
                    });
                    
                    // 確保當前更新的記錄存在於其對應的產品記錄中
                    if (!newRecords[updatedRecord.numericalID].some(record => record.id === updatedRecord.id)) {
                        newRecords[updatedRecord.numericalID].push(updatedRecord);
                    }
                    
                    return newRecords;
                });
                
                // 同時更新本地產品列表中的產品名稱
                setLocalProducts(prev => 
                    prev.map(product => 
                        product.numericalID === updatedRecord.numericalID 
                            ? {...product, productName: updatedRecord.productName} 
                            : product
                    )
                );
            } else {
                await fetchData(); // 非編輯模式下重新獲取數據以更新UI
            }
            
            showSuccessMessage('記錄已成功更新');
        } catch (error) {
            console.error("更新記錄失敗:", error);
            const userMessage = handleFirestoreSaveError(error, "更新價格記錄");
            showUserFriendlyError(userMessage);
        }
        setEditingRecord(null);
    };

    // 新增函數：處理衝突解決
    const handleConflictResolution = async (resolutionType) => {
        setIsConflictDialogOpen(false);
        
        switch (resolutionType) {
            case 'local':
                // 保留本地更改，直接退出編輯模式
                await exitEditMode();
                break;
            case 'remote':
                // 保留遠程數據，重新獲取最新數據並退出
                await fetchData();
                setIsEditMode(false);
                setSelectedItems(new Set());
                setOriginalDataSnapshot(null);

                break;
            case 'merge':
                // 手動合併，重新獲取數據並保持編輯模式
                await fetchData();
                setLocalProducts([...allProducts]);
                setLocalRecords({...allRecords});
                // 保持編輯模式開啟，讓用戶繼續編輯
                setOriginalDataSnapshot({
                    products: [...allProducts],
                    records: {...allRecords},
                    timestamp: Date.now()
                });

                break;
            default:
                // 默認情況下直接退出編輯模式
                await exitEditMode();
        }
    };

    const confirmDelete = async () => {
        if (!db || !deletingRecord) return;
        
        // 在編輯模式下，我們只需要更新本地狀態，不需要重新整理畫面
        if (isEditMode) {
            try {
                // 更新本地狀態而不是調用 Firebase
                setLocalRecords(prev => {
                    const newRecords = {...prev};
                    if (newRecords[deletingRecord.numericalID]) {
                        newRecords[deletingRecord.numericalID] = newRecords[deletingRecord.numericalID].filter(
                            record => record.id !== deletingRecord.id
                        );
                    }
                    return newRecords;
                });
                
                // 顯示成功消息
                showSuccessMessage('記錄已成功刪除');
            } catch (error) {
                console.error("刪除記錄失敗:", error);
                const userMessage = handleFirestoreSaveError(error, "刪除價格記錄");
                showUserFriendlyError(userMessage);
            } finally {
                setDeletingRecord(null);
            }
        } else {
            // 非編輯模式下保持原有行為
            setIsAfterDelete(true); // Signal that the next data fetch is after a delete
            try {
                const recordRef = doc(db, "priceRecords", deletingRecord.id);
                await deleteDoc(recordRef);
                await fetchData(); // 重新獲取數據以更新UI
                showSuccessMessage('記錄已成功刪除');
            } catch (error) {
                console.error("刪除記錄失敗:", error);
                const userMessage = handleFirestoreSaveError(error, "刪除價格記錄");
                showUserFriendlyError(userMessage);
            }
            setDeletingRecord(null);
        }
    };

    const handleSearchToggle = () => {
        if (isSearchOpen) {
            setSearchQuery('');
        }
        setIsSearchOpen(!isSearchOpen);
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
            <div className="max-w-4xl mx-auto pb-28"> {/* Added pb-28 for floating button */}
                <SuccessMessage message={successMessage} />
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
                    <div className="flex items-center mb-4 sm:mb-0">
                        <button onClick={onBack} className="flex items-center text-indigo-600 hover:text-indigo-800 mr-4"><ArrowLeft className="mr-1" size={20} />返回</button>
                        <h1 className="text-2xl font-bold text-gray-800 flex items-center"><Database className="mr-2" />所有記錄</h1>
                    </div>
                    <div className="flex items-center">
                        <label className="mr-2 text-gray-700">排序:</label>
                        <select value={sortOption} onChange={(e) => setSortOption(e.target.value)} className="border border-gray-300 rounded p-2 mr-2">
                            <option value="latest">最新記錄</option>
                            <option value="name">產品名稱</option>
                            <option value="price">最新價格</option>
                        </select>
                        <button 
                            onClick={() => {
                                if (!isEditMode) {
                                    // Enter edit mode - copy current data to local state
                                    setLocalProducts([...allProducts]);
                                    setLocalRecords({...allRecords});
                                    // 保存原始數據快照和時間戳
                                    setOriginalDataSnapshot({
                                        products: [...allProducts],
                                        records: {...allRecords},
                                        timestamp: Date.now()
                                    });
                                } else {
                                    // Exit edit mode - 檢查數據版本衝突
                                    checkForConflictsAndExit();
                                }
                                setIsEditMode(!isEditMode);
                                setSelectedItems(new Set());
                            }}
                            className={`px-3 py-2 rounded text-white text-sm ${
                                isEditMode ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'
                            }`}
                        >
                            {isEditMode ? '退出編輯模式' : '編輯模式'}
                        </button>
                    </div>
                </div>

                {/* Floating Delete Button - 修改為固定位置 */}
                {isEditMode && selectedItems.size > 0 && (
                    <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 bg-red-500 text-white rounded-full p-4 shadow-lg z-50 flex items-center"
                         style={{bottom: '6rem'}}>
                        <button 
                            onClick={handleBulkDeleteClick}
                            className="flex items-center"
                        >
                            <Trash2 size={20} className="mr-2" />
                            刪除選取項目 ({selectedItems.size})
                        </button>
                    </div>
                )}

                {/* Floating Exit Edit Mode Button - 修改為固定位置 */}
                {isEditMode && (
                    <div className="fixed bottom-10 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white rounded-full p-4 shadow-lg z-50">
                        <button 
                            onClick={checkForConflictsAndExit}
                            className="flex items-center"
                        >
                            <X size={20} className="mr-2" />
                            退出編輯模式
                        </button>
                    </div>
                )}

                {filteredProducts.length === 0 ? (
                    <div className="text-center py-10 bg-white rounded-xl shadow">
                        <Database size={48} className="mx-auto text-gray-400 mb-4" />
                        <h3 className="text-xl font-semibold text-gray-700 mb-2">{searchQuery ? '找不到結果' : '暫無記錄'}</h3>
                        <p className="text-gray-500">{searchQuery ? `找不到符合 "${searchQuery}" 的產品` : '還沒有任何產品和價格記錄'}</p>
                    </div>
                ) : (
                    <div>
                        <div className="mb-4 p-4 bg-white rounded-lg shadow">
                            <div className="flex justify-between">
                                <p className="text-gray-700">總共 <span className="font-bold">{filteredProducts.length}</span> 個產品</p>
                                <p className="text-gray-700">總共 <span className="font-bold">{Object.values(allRecords).flat().length}</span> 條記錄</p>
                            </div>
                        </div>
                        {filteredProducts.map(product => {
                            // 修復：確保 records 始終有默認值
                            const records = isEditMode ? (localRecords[product.numericalID] || []) : (allRecords[product.numericalID] || []);
                            // 修改：即使沒有記錄也顯示產品卡片，但只在編輯模式下
                            if (records.length === 0 && !isEditMode) return null;
                            return (
                                // 修改：為選中的項目添加增強的視覺反饋
                                <div key={product.numericalID} className={`relative transition-all duration-200 ${isEditMode && selectedItems.has(product.numericalID) ? 'bg-blue-50 border-2 border-blue-500 rounded-lg' : ''}`}>
                                    {isEditMode && (
                                        <div className="absolute top-4 left-4 z-10">
                                            <input
                                                type="checkbox"
                                                checked={selectedItems.has(product.numericalID)}
                                                onChange={() => handleItemSelect(product.numericalID)}
                                                className="h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                            />
                                        </div>
                                    )}
                                    <div className={isEditMode ? "pl-12" : ""}>
                                        <ProductRecord 
                                            product={product} 
                                            records={records} 
                                            theme={theme} 
                                            onEdit={handleEdit} 
                                            onDelete={handleDelete} 
                                        />
                                    </div>
                                </div>
                            );
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

                {/* 新增批量刪除確認對話框 */}
                {isBulkDeleteConfirmationOpen && (
                    <BulkDeleteConfirmation
                        count={selectedItems.size}
                        onClose={() => setIsBulkDeleteConfirmationOpen(false)}
                        onConfirm={deleteSelectedItems}
                    />
                )}

                {/* 新增衝突解決對話框 */}
                {isConflictDialogOpen && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
                            <h2 className="text-xl font-bold mb-4">檢測到數據衝突</h2>
                            <p className="mb-4">在您編輯期間，其他用戶修改了部分數據。請選擇如何解決衝突：</p>
                            
                            <div className="mb-6 p-4 bg-yellow-50 rounded-lg">
                                <h3 className="font-semibold text-yellow-800 mb-2">衝突詳情：</h3>
                                <ul className="list-disc pl-5 text-sm text-yellow-700">
                                    <li>數據可能已被人修改</li>
                                    <li>您的更改可能與其他用戶的更改衝突</li>
                                </ul>
                            </div>
                            
                            <div className="space-y-3">
                                <button 
                                    onClick={() => handleConflictResolution('local')}
                                    className="w-full p-3 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                                >
                                    保留我的更改
                                </button>
                                <button 
                                    onClick={() => handleConflictResolution('remote')}
                                    className="w-full p-3 bg-green-500 text-white rounded-md hover:bg-green-600"
                                >
                                    保留最新數據
                                </button>
                                <button 
                                    onClick={() => handleConflictResolution('merge')}
                                    className="w-full p-3 bg-purple-500 text-white rounded-md hover:bg-purple-600"
                                >
                                    手動合併（推薦）
                                </button>
                            </div>
                            
                            <div className="mt-6 flex justify-end">
                                <button 
                                    onClick={() => setIsConflictDialogOpen(false)}
                                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                                >
                                    取消
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- START: Revamped Search Component --- */}
                <div className="fixed top-6 right-6 z-30">
                    <div 
                        className={`flex items-center justify-end bg-white rounded-full shadow-xl transition-all duration-300 ease-in-out overflow-hidden ${isSearchOpen ? 'w-80' : 'w-16 h-16'}`}
                    >
                        <Search className={`absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 transition-opacity duration-200 ${isSearchOpen ? 'opacity-100' : 'opacity-0'}`} size={22} />
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="輸入品名進行模糊搜尋..."
                            className={`w-full h-16 pl-14 pr-20 bg-transparent border-none rounded-full outline-none text-lg transition-opacity duration-200 ${isSearchOpen ? 'opacity-100' : 'opacity-0'}`}
                            style={{pointerEvents: isSearchOpen ? 'auto' : 'none'}}
                        />
                        <button
                            onClick={handleSearchToggle}
                            className="absolute right-0 top-0 w-16 h-16 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-300 flex items-center justify-center"
                            aria-label={isSearchOpen ? "關閉搜尋" : "開啟搜尋"}
                        >
                            {isSearchOpen ? <X size={28} /> : <Search size={28} />}
                        </button>
                    </div>
                </div>
                {/* --- END: Revamped Search Component --- */}
            </div>
        </div>
    );
}

function EditModal({ record, onClose, onSave }) {
    const [price, setPrice] = useState(record.price);
    const [quantity, setQuantity] = useState(record.quantity || '');
    const [unitType, setUnitType] = useState(record.unitType || 'pcs');
    const [discount, setDiscount] = useState(record.discountDetails || '');
    const [originalPrice, setOriginalPrice] = useState(record.originalPrice || '');
    const [specialPrice, setSpecialPrice] = useState(record.specialPrice || '');
    const [productName, setProductName] = useState(record.productName || '');
    const [storeName, setStoreName] = useState(record.storeName || '');
    const [isStoreSelectorOpen, setIsStoreSelectorOpen] = useState(false);

    const handleSave = () => {
        const newUnitPrice = calculateUnitPrice(price, quantity, unitType);
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
            discountDetails: discount,
            originalPrice: originalPrice ? parseFloat(originalPrice) : null,
            specialPrice: specialPrice ? parseFloat(specialPrice) : null,
            productName: productName,
            storeName: storeName
        });
    };

    const currentUnitPrice = calculateUnitPrice(price, quantity, unitType);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-hidden">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold mb-4">編輯記錄</h2>
                <div className="space-y-3">
                    {/* 產品名稱輸入 */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700">產品名稱</label>
                        <input
                            type="text"
                            value={productName}
                            onChange={(e) => setProductName(e.target.value)}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    
                    {/* 商店名稱輸入 */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700">商店名稱</label>
                        <div className="mt-1 flex">
                            <input
                                type="text"
                                value={storeName}
                                onChange={(e) => setStoreName(e.target.value)}
                                className="block flex-grow border border-gray-300 rounded-l-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                placeholder="點擊選擇商店或手動輸入"
                                readOnly
                            />
                            <button 
                                onClick={() => setIsStoreSelectorOpen(true)}
                                className="bg-indigo-600 text-white px-4 py-2 rounded-r-md hover:bg-indigo-700"
                            >
                                選擇
                            </button>
                        </div>
                    </div>
                    
                    {/* 原價輸入 */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700">原價 ($)</label>
                        <input
                            type="number"
                            value={originalPrice}
                            onChange={(e) => setOriginalPrice(e.target.value)}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    
                    {/* 特價輸入 */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700">特價 ($)</label>
                        <input
                            type="number"
                            value={specialPrice}
                            onChange={(e) => setSpecialPrice(e.target.value)}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    
                    {/* 總價輸入（實際支付價格） */}
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
                            value={currentUnitPrice === null ? 'N/A' : currentUnitPrice.toFixed(2)}
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
                <div className="mt-4 flex justify-between">
                    <button onClick={onClose} className="flex-1 mr-2 items-center bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300 flex justify-center">
                        <X size={18} className="mr-1" />
                        取消
                    </button>
                    <button onClick={handleSave} className="flex-1 ml-2 items-center bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 flex justify-center">
                        <Save size={18} className="mr-1" />
                        保存
                    </button>
                </div>
            </div>
            
            {isStoreSelectorOpen && (
                <StoreSelector 
                    onSelect={(selectedStore) => {
                        setStoreName(selectedStore);
                        setIsStoreSelectorOpen(false);
                    }}
                    onClose={() => setIsStoreSelectorOpen(false)}
                    theme={{ primary: 'bg-indigo-600', hover: 'hover:bg-indigo-700', text: 'text-indigo-600' }}
                />
            )}
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



// 新增批量刪除確認對話框組件
function BulkDeleteConfirmation({ count, onClose, onConfirm }) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm">
                <h2 className="text-xl font-bold mb-4">確認批量刪除</h2>
                <p>您確定要刪除選中的 {count} 個產品項目嗎？此操作無法復原。</p>
                <div className="mt-6 flex justify-end space-x-3">
                    <button onClick={onClose} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300">取消</button>
                    <button onClick={onConfirm} className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700">確認刪除</button>
                </div>
            </div>
        </div>
    );
}



export default AllRecordsPage;
