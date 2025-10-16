import React, { useState } from 'react';
import { X } from 'lucide-react';

const COMMON_STORES = [
    "全聯", "大全聯", "家樂福", "7-11", "全家", 
    "萊爾富", "好市多", "屈臣氏", "康是美", "美廉社", "愛買", "其他"
];

function StoreSelector({ theme, onSelect, onClose }) {
    const [selectedStore, setSelectedStore] = useState('');
    const [otherStore, setOtherStore] = useState('');

    const handleSelect = () => {
        if (selectedStore === '其他' && otherStore.trim() === '') {
            alert('請輸入其他商店名稱');
            return;
        }
        
        const finalStoreName = selectedStore === '其他' ? otherStore.trim() : selectedStore;
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

                <p className="text-gray-600 mb-4">請選擇或輸入商店名稱：</p>

                <div className="grid grid-cols-2 gap-3 mb-4 max-h-60 overflow-y-auto">
                    {COMMON_STORES.map((store) => (
                        <button
                            key={store}
                            onClick={() => setSelectedStore(store)}
                            className={`p-3 rounded-lg text-center font-medium transition-all ${
                                selectedStore === store 
                                    ? `${themePrimary} text-white` 
                                    : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                            }`}
                        >
                            {store}
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

                <div className="flex justify-end space-x-3 pt-4 border-t">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg shadow-lg hover:bg-gray-600 transition-all"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleSelect}
                        disabled={!selectedStore || (selectedStore === '其他' && otherStore.trim() === '')}
                        className={`px-4 py-2 text-white font-semibold rounded-lg shadow-lg transition-all ${
                            !selectedStore || (selectedStore === '其他' && otherStore.trim() === '')
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