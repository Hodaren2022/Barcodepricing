import React, { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { db } from './firebase-config';
import { collection, getDocs, addDoc, query, where, serverTimestamp, doc, updateDoc } from 'firebase/firestore';

const initialStores = [
    { name: "全聯", sort: 1 },
    { name: "大全聯", sort: 2 },
    { name: "家樂福", sort: 3 },
    { name: "7-11", sort: 4 }, 
    { name: "全家", sort: 5 },
    { name: "萊爾富", sort: 6 }, 
    { name: "好市多", sort: 7 }, 
    { name: "屈臣氏", sort: 8 }, 
    { name: "康是美", sort: 9 },
    { name: "美廉社", sort: 10 }, 
    { name: "愛買", sort: 11 },
    { name: "其他", sort: 999 }
];

function StoreSelector({ theme, onSelect, onClose, isOcrQueueStoreSelector = false }) {
    const [selectedStore, setSelectedStore] = useState('');
    const [otherStore, setOtherStore] = useState('');
    const [commonStores, setCommonStores] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchStores = useCallback(async () => {
        setLoading(true);
        try {
            const storesCollection = collection(db, 'stores');
            let querySnapshot = await getDocs(storesCollection);

            if (querySnapshot.empty) {
                const batch = initialStores.map(store => 
                    addDoc(storesCollection, { ...store, createdAt: serverTimestamp() })
                );
                await Promise.all(batch);
                querySnapshot = await getDocs(storesCollection);
            } else {
                // --- Start of new migration logic ---
                const storesFromDb = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                const updates = [];

                for (const initialStore of initialStores) {
                    const dbStore = storesFromDb.find(s => s.name === initialStore.name);
                    // If the store exists in DB but the sort order is different from the code
                    if (dbStore && dbStore.sort !== initialStore.sort) {
                        const storeRef = doc(db, 'stores', dbStore.id);
                        updates.push(updateDoc(storeRef, { sort: initialStore.sort }));
                    }
                }

                // If there are any updates to perform
                if (updates.length > 0) {
                    console.log(`Updating sort order for ${updates.length} stores...`);
                    await Promise.all(updates);
                    // Re-fetch the data after updates to ensure we have the latest version
                    querySnapshot = await getDocs(storesCollection);
                    console.log("Store sort order updated successfully.");
                }
                // --- End of new migration logic ---
            }

            const storesList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const uniqueStores = Array.from(new Map(storesList.map(store => [store.name, store])).values());
            const sortedStores = uniqueStores.sort((a, b) => (a.sort || 999) - (b.sort || 999));
            
            setCommonStores(sortedStores);

        } catch (error) {
            console.error("Firebase Error in fetchStores:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStores();
    }, [fetchStores]);

    const handleSelect = async () => {
        if (selectedStore === '其他' && otherStore.trim() === '') {
            alert('請輸入其他商店名稱');
            return;
        }
        
        let finalStoreName = selectedStore === '其他' ? otherStore.trim() : selectedStore;

        if (selectedStore === '其他') {
            const storesCollection = collection(db, 'stores');
            const q = query(storesCollection, where("name", "==", finalStoreName));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                await addDoc(storesCollection, {
                    name: finalStoreName,
                    sort: 1000, 
                    createdAt: serverTimestamp()
                });
            }
        }
        
        onSelect(finalStoreName);
    };

    // 處理商店選擇（用於待辨識序列管理頁面）
    const handleStoreSelectForOcrQueue = async (storeName) => {
        setSelectedStore(storeName);
        
        // 如果選擇的是"其他"，需要輸入商店名稱
        if (storeName === '其他') {
            // 不在這裡處理，讓用戶在輸入框中輸入
            return;
        }
        
        // 直接選擇商店並關閉選擇器
        let finalStoreName = storeName;
        
        // 檢查是否需要添加新商店到資料庫
        const storesCollection = collection(db, 'stores');
        const q = query(storesCollection, where("name", "==", finalStoreName));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            await addDoc(storesCollection, {
                name: finalStoreName,
                sort: 1000, 
                createdAt: serverTimestamp()
            });
        }
        
        onSelect(finalStoreName);
        onClose();
    };

    const themePrimary = theme.primary;
    const themeHover = theme.hover;

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-50 flex items-center justify-center p-4 sm:p-6">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-[calc(100%-80px)] sm:max-w-md flex flex-col max-h-[80vh] h-auto">
                <div className="p-6 pb-4 flex-shrink-0">
                    <div className="flex justify-between items-center mb-4 border-b pb-2">
                        <h3 className={`text-xl font-bold ${theme.text}`}>
                            選擇商店
                        </h3>
                        <button 
                            onClick={onClose}
                            className="p-1 rounded-full text-gray-500 hover:text-gray-900"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                    <p className="text-gray-600">請選擇或輸入商店名稱：</p>
                </div>

                {loading ? (
                    <div className="flex-grow flex justify-center items-center">
                        <p className="text-gray-600">正在從資料庫載入商店列表...</p>
                    </div>
                ) : (
                    <div className="flex-grow overflow-y-auto px-6">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 py-1">
                            {commonStores.map((store) => (
                                <button
                                    key={store.id}
                                    onClick={() => isOcrQueueStoreSelector ? handleStoreSelectForOcrQueue(store.name) : setSelectedStore(store.name)}
                                    className={`p-3 rounded-lg text-center font-medium transition-all ${
                                        selectedStore === store.name 
                                            ? `${themePrimary} text-white shadow-md` 
                                            : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                                    }`}
                                >
                                    {store.name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="p-6 pt-4 flex-shrink-0">
                    {selectedStore === '其他' && (
                        <div className="mb-4">
                            <label className="block text-gray-700 font-medium mb-2">請輸入商店名稱：</label>
                            <input
                                type="text"
                                value={otherStore}
                                onChange={(e) => setOtherStore(e.target.value)}
                                placeholder="輸入商店名稱"
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                                autoFocus
                            />
                        </div>
                    )}

                    {/* 對於待辨識序列管理頁面，當選擇"其他"並輸入商店名稱後直接儲存 */}
                    {isOcrQueueStoreSelector && selectedStore === '其他' && otherStore.trim() !== '' && (
                        <button
                            onClick={() => {
                                onSelect(otherStore.trim());
                                onClose();
                            }}
                            className={`w-full p-3 mb-3 text-white font-semibold rounded-lg shadow-lg transition-all ${themePrimary} ${themeHover}`}
                        >
                            確認選擇商店: {otherStore.trim()}
                        </button>
                    )}

                    {/* 只有在非待辨識序列管理頁面時才顯示取消和確認按鈕 */}
                    {!isOcrQueueStoreSelector && (
                        <div className="flex justify-end space-x-3 pt-4 border-t">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg shadow-lg hover:bg-gray-600 transition-all"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSelect}
                                disabled={loading || !selectedStore || (selectedStore === '其他' && otherStore.trim() === '')}
                                className={`px-4 py-2 text-white font-semibold rounded-lg shadow-lg transition-all ${
                                    loading || !selectedStore || (selectedStore === '其他' && otherStore.trim() === '')
                                        ? 'bg-gray-400 cursor-not-allowed'
                                        : `${themePrimary} ${themeHover}`
                                }`}
                            >
                                確認選擇
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default StoreSelector;