import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { TimelineElement, TextOverlay, Effect, EffectType, Clip, MediaSource } from '../types';
import { getEffectFromPrompt, generateImage } from '../services/geminiService';
import { TrashIcon, SparklesIcon } from '../constants';

interface PropertiesPanelProps {
  selectedElement: TimelineElement | null;
  mediaSources: MediaSource[];
  clips: Clip[]; // For transition logic
  onUpdateText: (id: string, newText: string) => void;
  onUpdateTextStyle: (id: string, styleChanges: Partial<TextOverlay['style']>) => void;
  onUpdateEffect: (id:string, newEffect: Partial<Effect>) => void;
  onAddEffect: (effect: Effect) => void;
  onDeleteElement: (id: string, type: TimelineElement['type']) => void;
  onGenerateSubtitles: (clipId: string) => Promise<void>;
  onSmartCut: (clipId: string) => Promise<void>;
  onAddTransition: (fromClipId: string, toClipId: string, prompt: string) => Promise<void>;
  isApiActive: boolean;
}

const typeToKorean: Record<Exclude<TimelineElement['type'], 'media'>, string> = {
    clip: '클립',
    text: '텍스트',
    effect: '효과',
};

const effectTypeToKorean: Record<EffectType, string> = {
    filter: '필터',
    image_overlay: '이미지 오버레이',
    generative_transition: 'AI 전환 효과'
};

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ 
    selectedElement, 
    mediaSources,
    clips,
    onUpdateText, 
    onUpdateTextStyle,
    onUpdateEffect, 
    onAddEffect,
    onDeleteElement,
    onGenerateSubtitles,
    onSmartCut,
    onAddTransition,
    isApiActive,
}) => {
    const [aiPrompt, setAiPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [isSubtitleLoading, setIsSubtitleLoading] = useState(false);
    const [isSmartCutLoading, setIsSmartCutLoading] = useState(false);
    const [isTransitionLoading, setIsTransitionLoading] = useState(false);
    const [transitionPrompt, setTransitionPrompt] = useState("");

    const aiDisabledTooltip = !isApiActive ? "Gemini API 키를 먼저 설정해야 합니다." : "";

    useEffect(() => {
        if (selectedElement?.type === 'effect') {
            setAiPrompt(selectedElement.data.prompt || '');
        } else {
            setAiPrompt('');
        }
        setTransitionPrompt('');
    }, [selectedElement]);

    const handleAddEffect = useCallback(async () => {
        if (!aiPrompt || !selectedElement || selectedElement.type !== 'clip') return;
        
        setIsLoading(true);
        setError(null);
        try {
            const suggestion = await getEffectFromPrompt(aiPrompt);
            const { start, end } = selectedElement.data;
            const newEffectId = `effect-${Date.now()}`;

            if (suggestion.type === 'generate_image' && suggestion.imagePrompt) {
                 onAddEffect({
                    id: newEffectId,
                    type: 'image_overlay',
                    start,
                    end,
                    value: 'loading',
                    prompt: aiPrompt,
                });

                const imageUrl = await generateImage(suggestion.imagePrompt);
                onUpdateEffect(newEffectId, { value: imageUrl });

            } else if (suggestion.type === 'filter') {
                onAddEffect({
                    id: newEffectId,
                    type: 'filter',
                    start,
                    end,
                    value: suggestion.value,
                    prompt: aiPrompt,
                });
            }
        } catch (e: any) {
            setError(e.message || '효과를 생성할 수 없습니다. 다시 시도해주세요.');
            console.error(e);
        } finally {
            setIsLoading(false);
            setAiPrompt('');
        }
    }, [aiPrompt, selectedElement, onAddEffect, onUpdateEffect]);

    const handleGenerateSubtitlesClick = async () => {
        if (!selectedElement || selectedElement.type !== 'clip') return;
        setIsSubtitleLoading(true);
        try {
            await onGenerateSubtitles(selectedElement.data.id);
        } catch (e) {
            // Error is handled in App.tsx with an alert
        } finally {
            setIsSubtitleLoading(false);
        }
    };

    const handleSmartCutClick = async () => {
        if (!selectedElement || selectedElement.type !== 'clip') return;
        setIsSmartCutLoading(true);
        try {
            await onSmartCut(selectedElement.data.id);
        } catch(e) {
            // Error handled in App.tsx
        } finally {
            setIsSmartCutLoading(false);
        }
    }

    const adjacentClip = useMemo(() => {
        if (selectedElement?.type !== 'clip') return null;
        const currentClip = selectedElement.data;
        // Find a clip that starts exactly where the current one ends
        return clips.find(c => Math.abs(c.start - currentClip.end) < 0.01);
    }, [selectedElement, clips]);

    const handleAddTransitionClick = async () => {
        if (!selectedElement || selectedElement.type !== 'clip' || !adjacentClip || !transitionPrompt) return;
        setIsTransitionLoading(true);
        try {
            await onAddTransition(selectedElement.data.id, adjacentClip.id, transitionPrompt);
            setTransitionPrompt("");
        } catch (e) {
            // Error handled in App.tsx
        } finally {
            setIsTransitionLoading(false);
        }
    };

    const DeleteButton = () => {
        if (!selectedElement || selectedElement.type === 'media') return null;
        return (
            <div className="mt-6 border-t border-gray-700 pt-4">
                <button 
                    onClick={() => onDeleteElement(selectedElement.data.id, selectedElement.type)}
                    className="w-full flex items-center justify-center bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-md transition-colors"
                >
                    <TrashIcon /> {typeToKorean[selectedElement.type]} 삭제
                </button>
            </div>
        )
    };

    const renderClipProperties = () => {
        if (!selectedElement || selectedElement.type !== 'clip') return null;
        const clip = selectedElement.data as Clip;
        const source = mediaSources.find(s => s.id === clip.sourceId);
        return (
            <div>
                <h3 className="text-lg font-bold text-indigo-400 border-b border-gray-600 pb-2 mb-4">클립 속성</h3>
                <div className="space-y-2 text-sm">
                    <p><span className="font-semibold text-gray-400">소스 파일:</span> <span className="text-gray-200 break-all">{source?.name || '알 수 없음'}</span></p>
                    <p><span className="font-semibold text-gray-400">시작 시간:</span> {clip.start.toFixed(2)}s</p>
                    <p><span className="font-semibold text-gray-400">종료 시간:</span> {clip.end.toFixed(2)}s</p>
                    <p><span className="font-semibold text-gray-400">길이:</span> {(clip.end - clip.start).toFixed(2)}s</p>
                </div>
                
                <div className="mt-6 pt-4 border-t border-gray-700 space-y-4">
                    <h4 className="font-bold text-indigo-400 mb-2">지능형 AI 기능</h4>
                    <div className="space-y-3">
                        <button onClick={handleGenerateSubtitlesClick} disabled={!isApiActive || isSubtitleLoading || isSmartCutLoading} className="w-full flex items-center justify-center bg-teal-600 hover:bg-teal-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded transition-colors" title={aiDisabledTooltip}>
                            <SparklesIcon /> {isSubtitleLoading ? '자막 생성 중...' : 'AI 자동 자막 생성'}
                        </button>
                         <button onClick={handleSmartCutClick} disabled={!isApiActive || isSmartCutLoading || isSubtitleLoading} className="w-full flex items-center justify-center bg-teal-600 hover:bg-teal-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded transition-colors" title={aiDisabledTooltip}>
                            <SparklesIcon /> {isSmartCutLoading ? '장면 분석 중...' : 'AI 스마트 컷'}
                        </button>
                    </div>

                    {adjacentClip && (
                        <div className="mt-4 pt-4 border-t border-gray-600">
                             <h5 className="font-bold text-indigo-400 mb-2">AI 생성 전환 효과</h5>
                            <p className="text-xs text-gray-400 mb-2">이 클립과 다음 클립 사이에 적용할 전환 효과를 설명하세요.</p>
                             <textarea 
                                value={transitionPrompt}
                                onChange={(e) => setTransitionPrompt(e.target.value)}
                                className="w-full h-20 p-2 bg-gray-900 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm disabled:bg-gray-800 disabled:cursor-not-allowed"
                                placeholder={isApiActive ? "예: 화면이 부서지는 글리치 효과" : "API 키를 먼저 설정해주세요."}
                                disabled={!isApiActive || isTransitionLoading}
                            />
                            <button 
                                onClick={handleAddTransitionClick}
                                disabled={!isApiActive || isTransitionLoading || !transitionPrompt}
                                className="mt-2 w-full flex items-center justify-center bg-purple-600 hover:bg-purple-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded transition-colors"
                                title={aiDisabledTooltip}
                            >
                                <SparklesIcon /> {isTransitionLoading ? '생성 중...' : '전환 효과 적용'}
                            </button>
                        </div>
                    )}
                </div>

                <div className="mt-6 pt-4 border-t border-gray-700">
                    <h4 className="font-bold text-indigo-400 mb-2">수동 효과 추가</h4>
                    <p className="text-xs text-gray-400 mb-2">이 클립에 적용할 효과를 설명하세요 (예: '흑백으로 만들기', '웃는 강아지 사진 추가').</p>
                    <textarea 
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        className="w-full h-20 p-2 bg-gray-900 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm disabled:bg-gray-800 disabled:cursor-not-allowed"
                        placeholder={isApiActive ? "예: 빈티지 필름처럼 보이게..." : "API 키를 먼저 설정해주세요."}
                        disabled={!isApiActive || isLoading}
                    />
                    <button 
                        onClick={handleAddEffect}
                        disabled={!isApiActive || isLoading || !aiPrompt}
                        className="mt-2 w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded transition-colors"
                        title={aiDisabledTooltip}
                    >
                        {isLoading ? '생성 중...' : '효과 적용'}
                    </button>
                    {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
                </div>
                <DeleteButton />
            </div>
        );
    };

    const renderTextProperties = () => {
        if (!selectedElement || selectedElement.type !== 'text') return null;
        const textElement = selectedElement.data as TextOverlay;
        return (
            <div>
                <h3 className="text-lg font-bold text-indigo-400 border-b border-gray-600 pb-2 mb-4">텍스트 속성</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">텍스트 내용</label>
                        <textarea
                            className="w-full h-24 p-2 bg-gray-900 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            value={textElement.text}
                            onChange={(e) => onUpdateText(textElement.id, e.target.value)}
                        />
                    </div>
                    <div className="flex items-center space-x-4">
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-300 mb-1">글꼴 크기</label>
                            <input
                                type="text"
                                className="w-full p-2 bg-gray-900 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                value={textElement.style.fontSize}
                                onChange={(e) => onUpdateTextStyle(textElement.id, { fontSize: e.target.value })}
                            />
                        </div>
                        <div>
                             <label className="block text-sm font-medium text-gray-300 mb-1">색상</label>
                             <input
                                type="color"
                                className="w-12 h-10 p-1 bg-gray-900 border border-gray-600 rounded-md cursor-pointer"
                                value={textElement.style.color}
                                onChange={(e) => onUpdateTextStyle(textElement.id, { color: e.target.value })}
                            />
                        </div>
                    </div>
                </div>
                <DeleteButton />
            </div>
        );
    };

    const renderEffectProperties = () => {
        if (!selectedElement || selectedElement.type !== 'effect') return null;
        const effectElement = selectedElement.data as Effect;
        const isTransition = effectElement.type === 'generative_transition';

        return (
            <div>
                <h3 className="text-lg font-bold text-indigo-400 border-b border-gray-600 pb-2 mb-4">효과 속성</h3>
                <div className="space-y-2 text-sm">
                    <p><span className="font-semibold text-gray-400">유형:</span> {effectTypeToKorean[effectElement.type]}</p>
                    <p><span className="font-semibold text-gray-400">프롬프트:</span> {effectElement.prompt || '해당 없음'}</p>
                    
                    {isTransition && effectElement.value === 'loading' && <p className="mt-2 text-indigo-400 animate-pulse">AI 전환 효과 생성 중...</p>}
                    
                    {isTransition && effectElement.value === 'done' && effectElement.images && (
                         <div className="mt-2 grid grid-cols-4 gap-2">
                            {effectElement.images.map((img, i) => (
                                <img key={i} src={img} alt={`Transition frame ${i+1}`} className="rounded w-full object-cover aspect-video"/>
                            ))}
                         </div>
                    )}
                    
                    {effectElement.type === 'image_overlay' && effectElement.value !== 'loading' && (
                        <img src={effectElement.value} alt="Generated" className="mt-2 rounded-lg w-full object-cover"/>
                    )}

                    {effectElement.type === 'image_overlay' && effectElement.value === 'loading' && <p className="mt-2 text-indigo-400 animate-pulse">이미지 생성 중...</p>}
                </div>
                <DeleteButton />
            </div>
        );
    };

    const renderContent = () => {
        if (!selectedElement) {
            return <div className="text-gray-500 text-center mt-8">타임라인에서 요소를 선택하여 속성을 확인하세요.</div>;
        }
        switch (selectedElement.type) {
            case 'clip':
                return renderClipProperties();
            case 'text':
                return renderTextProperties();
            case 'effect':
                return renderEffectProperties();
            default:
                return null;
        }
    };

    return (
        <div className="bg-gray-800 p-4 rounded-lg h-full overflow-y-auto">
            {renderContent()}
        </div>
    );
};

export default PropertiesPanel;