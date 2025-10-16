import React, { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { db } from './firebase-config';
import { collection, getDocs, addDoc, query, where, serverTimestamp } from 'firebase/firestore';

console.log('--- StoreSelector.js module loaded ---'); // LOG 0

const initialStores = [
    { name: "全聯", sort: 1 }, { name: "家樂福", sort: 2 }, 
    { name: "7-11", sort: 3 }, { name: "全家", sort: 4 },
    { name: "萊爾富", sort: 5 }, { name: "好市多", sort: 6 }, 
    { name: "屈臣氏", sort: 7 }, { name: "康是美", sort: 8 },
    { name: "美廉社", sort: 9 }, { name: "愛買", sort: 10 },
    { name: "其他", sort: 999 }
];

function StoreSelector({ theme, onSelect, onClose }) {
    console.log('[LOG 1] StoreSelector component rendering.');

    const [selectedStore, setSelectedStore] = useState('');
    const [otherStore, setOtherStore] = useState('');
    const [commonStores, setCommonStores] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchStores = useCallback(async () => {
        console.log('[LOG 2] fetchStores function CALLED.');
        setLoading(true);
        try {
            if (!db) {
                console.error('[ERROR] Firestore db object is not available!');
                return;
            }
            const storesCollection = collection(db, 'stores');
            console.log('[LOG 3] Attempting to get documents from \'stores\' collection...');
            
            const querySnapshot = await getDocs(storesCollection);
            
            console.log(`[LOG 4] getDocs() SUCCEEDED. Found ${querySnapshot.size} documents.`);

            if (querySnapshot.empty) {
                console.log("[LOG 5a] 'stores' collection is empty. Attempting to write initial data...");
                const batch = initialStores.map(store => 
                    addDoc(storesCollection, { ...store, createdAt: serverTimestamp() })
                );
                await Promise.all(batch);
                console.log("[LOG 6a] Wrote initial data to Firestore. Re-fetching...");
                const newQuerySnapshot = await getDocs(storesCollection);
                const storesList = newQuerySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                const sortedStores = storesList.sort((a, b) => (a.sort || 999) - (b.sort || 999));
                setCommonStores(sortedStores);

            } else {
                console.log("[LOG 5b] 'stores' collection has data. Reading...");
                const storesList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                const uniqueStores = Array.from(new Map(storesList.map(store => [store.name, store])).values());
                const sortedStores = uniqueStores.sort((a, b) => (a.sort || 999) - (b.sort || 999));
                setCommonStores(sortedStores);
                console.log("[LOG 6b] Finished processing existing stores.");
            }

        } catch (error) {
            console.error("[LOG E] A critical error occurred in fetchStores:", error);
        } finally {
            setLoading(false);
            console.log('[LOG 7] fetchStores function FINISHED.');
        }
    }, []);

    useEffect(() => {
        console.log('[LOG A] useEffect hook triggered. Calling fetchStores.');
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

    const themePrimary = theme.primary;
    const themeHover = theme.hover;

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 transform transition-all">
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

                {loading ? (
                    <div className="flex justify-center items-center h-40">
                        <p className="text-gray-600">正在從資料庫載入商店列表...</p>
                    </div>
                ) : (
                    <>
                        <p className="text-gray-600 mb-4">請選擇或輸入商店名稱：</p>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4 max-h-60 overflow-y-auto p-1">
                            {commonStores.map((store) => (
                                <button
                                    key={store.id}
                                    onClick={() => setSelectedStore(store.name)}
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
                    </>
                )}

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
            </div>
        </div>
    );
}

export default StoreSelector;