import React, { useState, useEffect, useCallback } from 'react';
import { updateApiKey, getApiKey, isApiActive } from '../services/geminiService';
import { EyeIcon, EyeSlashIcon } from '../constants';

interface ApiKeyManagerProps {
    onApiKeyUpdate: (isActive: boolean) => void;
}

const ApiKeyManager: React.FC<ApiKeyManagerProps> = ({ onApiKeyUpdate }) => {
    const [apiKey, setApiKey] = useState('');
    const [isActive, setIsActive] = useState(false);
    const [showKey, setShowKey] = useState(false);

    useEffect(() => {
        setApiKey(getApiKey() || '');
        setIsActive(isApiActive());
    }, []);

    const handleSave = useCallback(() => {
        const newStatus = updateApiKey(apiKey);
        setIsActive(newStatus);
        onApiKeyUpdate(newStatus);
    }, [apiKey, onApiKeyUpdate]);

    const handleClear = useCallback(() => {
        setApiKey('');
        const newStatus = updateApiKey('');
        setIsActive(newStatus);
        onApiKeyUpdate(newStatus);
    }, [onApiKeyUpdate]);

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            handleSave();
        }
    };
    
    const toggleShowKey = () => {
        setShowKey(prev => !prev);
    };

    return (
        <div className="flex items-center space-x-2 bg-gray-700 p-2 rounded-lg">
            <div 
                className={`w-3 h-3 rounded-full flex-shrink-0 transition-colors ${isActive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}
                title={isActive ? 'Gemini API 활성' : 'Gemini API 비활성: API 키를 입력해주세요.'}
                aria-label={`Gemini API 상태: ${isActive ? '활성' : '비활성'}`}
            />
            <div className="relative flex items-center">
                <label htmlFor="api-key-input" className="text-sm font-medium sr-only">Gemini API 키</label>
                <input
                    id="api-key-input"
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Gemini API 키 입력"
                    className="bg-gray-800 text-white text-sm rounded-md px-2 py-1 w-48 focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-8"
                    aria-label="Gemini API 키 입력 필드"
                />
                 <button
                    type="button"
                    onClick={toggleShowKey}
                    className="absolute inset-y-0 right-0 flex items-center px-2 text-gray-400 hover:text-gray-200"
                    aria-label={showKey ? "API 키 숨기기" : "API 키 보기"}
                    title={showKey ? "API 키 숨기기" : "API 키 보기"}
                >
                    {showKey ? <EyeSlashIcon /> : <EyeIcon />}
                </button>
            </div>
            <button 
                onClick={handleSave} 
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-1 px-3 rounded-md transition-colors"
                aria-label="API 키 저장"
            >
                저장
            </button>
            {apiKey && (
                 <button 
                    onClick={handleClear} 
                    className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-1 px-2 rounded-md transition-colors"
                    aria-label="API 키 지우기"
                    title="API 키 지우기"
                >
                    X
                 </button>
            )}
        </div>
    );
};

export default ApiKeyManager;