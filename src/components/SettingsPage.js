import React from 'react';
import { X, Settings as SettingsIcon } from 'lucide-react';
import DataManagement from './DataManagement';

const SettingsPage = ({ theme, onClose, onDataChange }) => {
    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className={`flex justify-between items-center p-4 border-b ${theme.border}`}>
                    <h2 className={`text-xl font-bold ${theme.text} flex items-center`}>
                        <SettingsIcon className="w-5 h-5 mr-2" />
                        設定
                    </h2>
                    <button 
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                {/* Content */}
                <div className="flex-grow overflow-y-auto p-4">
                    <DataManagement 
                        themePrimary={theme.primary}
                        onRefreshApp={onDataChange}
                    />
                </div>
                
                {/* Footer */}
                <div className="p-4 border-t bg-gray-50 flex justify-end">
                    <button 
                        onClick={onClose}
                        className={`px-4 py-2 rounded-lg font-medium ${theme.primary} text-white hover:opacity-90 transition-opacity`}
                    >
                        關閉
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsPage;