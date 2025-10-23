import React, { useState, useEffect } from 'react';
import { ArrowLeft, Trash2, Clock, AlertCircle } from 'lucide-react';

function OcrQueuePage({ theme, onBack, pendingOcrCards, onRemoveCard }) {
    const [queueStats, setQueueStats] = useState({
        total: 0,
        oldest: null,
        newest: null
    });

    useEffect(() => {
        if (pendingOcrCards.length > 0) {
            const timestamps = pendingOcrCards.map(card => card.id);
            setQueueStats({
                total: pendingOcrCards.length,
                oldest: Math.min(...timestamps),
                newest: Math.max(...timestamps)
            });
        } else {
            setQueueStats({
                total: 0,
                oldest: null,
                newest: null
            });
        }
    }, [pendingOcrCards]);

    const formatTime = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleString('zh-TW');
    };

    const calculateDuration = (timestamp) => {
        const now = Date.now();
        const diffMs = now - timestamp;
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        
        if (diffHours > 0) {
            return `${diffHours}小時前`;
        } else if (diffMins > 0) {
            return `${diffMins}分鐘前`;
        } else {
            return `${diffSecs}秒前`;
        }
    };

    return (
        <div className={`min-h-screen p-4 sm:p-8 ${theme.light}`}>
            <div className="max-w-2xl mx-auto">
                <div className="flex items-center mb-6 border-b pb-4">
                    <button onClick={onBack} className="flex items-center text-indigo-600 hover:text-indigo-800 mr-4">
                        <ArrowLeft className="mr-1" size={20} />返回
                    </button>
                    <h1 className={`text-2xl font-bold ${theme.text} flex items-center`}>
                        <Clock className="w-6 h-6 mr-2" />待辨識序列管理
                    </h1>
                </div>

                {queueStats.total > 0 ? (
                    <div className="mb-6 p-4 bg-white rounded-lg shadow">
                        <h2 className="text-lg font-semibold mb-2">序列統計</h2>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="bg-blue-50 p-3 rounded text-center">
                                <p className="text-sm text-gray-600">總數</p>
                                <p className="text-2xl font-bold text-blue-600">{queueStats.total}</p>
                            </div>
                            <div className="bg-green-50 p-3 rounded text-center">
                                <p className="text-sm text-gray-600">最早</p>
                                <p className="text-lg font-bold text-green-600">{queueStats.oldest ? formatTime(queueStats.oldest) : 'N/A'}</p>
                            </div>
                            <div className="bg-purple-50 p-3 rounded text-center">
                                <p className="text-sm text-gray-600">最新</p>
                                <p className="text-lg font-bold text-purple-600">{queueStats.newest ? formatTime(queueStats.newest) : 'N/A'}</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-10 bg-white rounded-xl shadow">
                        <AlertCircle size={48} className="mx-auto text-gray-400 mb-4" />
                        <h3 className="text-xl font-semibold text-gray-700 mb-2">無待辨識項目</h3>
                        <p className="text-gray-500">目前沒有任何待確認的辨識卡片</p>
                    </div>
                )}

                <div className="space-y-4">
                    {pendingOcrCards.map((card) => (
                        <div key={card.id} className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
                            <div className="flex justify-between items-start">
                                <div className="flex-1">
                                    <h3 className="font-bold text-lg text-gray-800">{card.productName || '未命名產品'}</h3>
                                    <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                                        <div>
                                            <span className="text-gray-500">條碼:</span>
                                            <span className="ml-1">{card.scannedBarcode || 'N/A'}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500">價格:</span>
                                            <span className="ml-1">${card.extractedPrice || '0'}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500">數量:</span>
                                            <span className="ml-1">{card.quantity || 'N/A'} {card.unitType || ''}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500">商店:</span>
                                            <span className="ml-1">{card.storeName || 'N/A'}</span>
                                        </div>
                                    </div>
                                    <div className="mt-2 text-xs text-gray-500">
                                        <p>加入時間: {formatTime(card.id)}</p>
                                        <p>運行時間: {calculateDuration(card.id)}</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => onRemoveCard(card.id)}
                                    className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full"
                                    title="刪除"
                                >
                                    <Trash2 size={20} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default OcrQueuePage;