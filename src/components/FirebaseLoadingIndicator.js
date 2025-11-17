import React from 'react';

// Firebase 載入進度條組件 - 6px 高度的簡潔進度條
function FirebaseLoadingIndicator({ loadingState }) {
    if (loadingState === 'ready') return null;

    const getStatusColor = () => {
        switch (loadingState) {
            case 'initializing':
                return 'bg-blue-500';
            case 'authenticating':
                return 'bg-yellow-500';
            case 'error':
                return 'bg-red-500';
            default:
                return 'bg-gray-500';
        }
    };

    return (
        <div className="fixed top-0 left-0 right-0 z-50">
            <div 
                className={`w-full transition-all duration-500 ${getStatusColor()}`}
                style={{ height: '6px' }}
            ></div>
        </div>
    );
}

export default FirebaseLoadingIndicator;