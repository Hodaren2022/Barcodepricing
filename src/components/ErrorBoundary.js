import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        // 更新 state 以顯示錯誤 UI
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        // 記錄錯誤詳情
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        this.setState({
            error: error,
            errorInfo: errorInfo
        });
    }

    render() {
        if (this.state.hasError) {
            // 自定義錯誤 UI
            return (
                <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                    <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
                        <div className="text-red-500 text-6xl mb-4">⚠️</div>
                        <h1 className="text-2xl font-bold text-gray-800 mb-2">應用程式發生錯誤</h1>
                        <p className="text-gray-600 mb-4">
                            很抱歉，應用程式遇到了意外錯誤。請重新整理頁面或聯繫技術支援。
                        </p>
                        <button 
                            onClick={() => window.location.reload()}
                            className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                        >
                            重新整理頁面
                        </button>
                        {process.env.NODE_ENV === 'development' && (
                            <details className="mt-4 text-left">
                                <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                                    顯示錯誤詳情 (開發模式)
                                </summary>
                                <div className="mt-2 p-3 bg-gray-100 rounded text-xs font-mono text-gray-700 overflow-auto max-h-40">
                                    <div className="font-bold text-red-600 mb-2">錯誤:</div>
                                    <div className="mb-2">{this.state.error && this.state.error.toString()}</div>
                                    <div className="font-bold text-red-600 mb-2">堆疊追蹤:</div>
                                    <div className="whitespace-pre-wrap">{this.state.errorInfo.componentStack}</div>
                                </div>
                            </details>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;