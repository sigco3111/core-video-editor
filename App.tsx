import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { Clip, TextOverlay, Effect, TimelineElement, MediaSource } from './types';
import MediaBin from './components/MediaBin';
import VideoPlayer from './components/VideoPlayer';
import Timeline from './components/Timeline';
import PropertiesPanel from './components/PropertiesPanel';
import Toolbar from './components/Toolbar';
import { ExportIcon, NewProjectIcon } from './constants';
import * as db from './services/db';
import ConfirmationModal from './components/ConfirmationModal';
import HelpModal from './components/HelpModal';
import ApiKeyManager from './components/ApiKeyManager';
import { 
    getAudioTranscription, 
    getSceneCuts, 
    generateTransitionImages,
    isApiActive as checkApiActiveOnLoad 
} from './services/geminiService';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';


const THUMBNAIL_INTERVAL_S = 5;
const THUMBNAIL_WIDTH_PX = 160;

const generateThumbnails = (videoUrl: string, duration: number): Promise<string[]> => {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.src = videoUrl;
        video.muted = true;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            return reject(new Error("Canvas 2D context not supported"));
        }

        const thumbnails: string[] = [];
        let currentTime = 0;

        const onSeeked = () => {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            thumbnails.push(canvas.toDataURL('image/jpeg', 0.8));

            currentTime += THUMBNAIL_INTERVAL_S;

            if (currentTime <= duration) {
                video.currentTime = currentTime;
            } else {
                video.removeEventListener('seeked', onSeeked);
                video.removeEventListener('error', onError);
                video.src = ''; // Release video resources
                resolve(thumbnails);
            }
        };

        const onError = () => {
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('error', onError);
            video.src = '';
            reject(new Error("Video error during thumbnail generation."));
        };

        video.addEventListener('loadeddata', () => {
            if (video.videoWidth === 0) { // Check for valid video dimensions
                onError();
                return;
            }
            canvas.width = THUMBNAIL_WIDTH_PX;
            canvas.height = (video.videoHeight / video.videoWidth) * THUMBNAIL_WIDTH_PX;
            video.currentTime = 0; // This will trigger the first 'seeked' event
        });
        
        video.addEventListener('seeked', onSeeked);
        video.addEventListener('error', onError);
        
        if (video.readyState >= 2) {
             video.dispatchEvent(new Event('loadeddata'));
        }
    });
};

const useDebouncedEffect = (effect: () => void, deps: React.DependencyList, delay: number) => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const callback = useCallback(effect, deps);
    useEffect(() => {
        const handler = setTimeout(() => {
            callback();
        }, delay);
        return () => clearTimeout(handler);
    }, [callback, delay]);
};

interface EditorState {
  clips: Clip[];
  textOverlays: TextOverlay[];
  effects: Effect[];
}

const useHistoryState = <T extends EditorState>(initialState: T) => {
  const [history, setHistory] = useState<{ past: T[], present: T, future: T[] }>({
    past: [],
    present: initialState,
    future: [],
  });

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const undo = useCallback(() => {
    if (!canUndo) return;
    const previous = history.past[history.past.length - 1];
    const newPast = history.past.slice(0, history.past.length - 1);
    setHistory({
      past: newPast,
      present: previous,
      future: [history.present, ...history.future],
    });
  }, [canUndo, history]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    const next = history.future[0];
    const newFuture = history.future.slice(1);
    setHistory({
      past: [...history.past, history.present],
      present: next,
      future: newFuture,
    });
  }, [canRedo, history]);

  const setState = useCallback((newState: T | ((currentState: T) => T)) => {
    const newPresent = typeof newState === 'function'
      ? (newState as (currentState: T) => T)(history.present)
      : newState;

    if (JSON.stringify(newPresent) === JSON.stringify(history.present)) {
      return;
    }
    
    setHistory({
      past: [...history.past, history.present].slice(-50), // 최대 50개 기록
      present: newPresent,
      future: [],
    });
  }, [history.present]);

  const loadNewState = useCallback((newState: T) => {
      setHistory({
          past: [],
          present: newState,
          future: []
      });
  }, []);
  
  return { state: history.present, setState, undo, redo, canUndo, canRedo, loadNewState };
};


const App: React.FC = () => {
    const [mediaSources, setMediaSources] = useState<MediaSource[]>([]);
    
    const { 
      state: editorState, 
      setState: setEditorState, 
      undo, 
      redo, 
      canUndo, 
      canRedo,
      loadNewState: loadEditorState
    } = useHistoryState<EditorState>({
      clips: [],
      textOverlays: [],
      effects: [],
    });
    const { clips, textOverlays, effects } = editorState;
    
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [selectedElementIdentifier, setSelectedElementIdentifier] = useState<{ type: TimelineElement['type']; id: string } | null>(null);

    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);
    
    const [timelineZoom, setTimelineZoom] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
    const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
    const [isApiActive, setIsApiActive] = useState(false);
    const [projectDuration, setProjectDuration] = useState(30);

    const mediaSourcesRef = useRef(mediaSources);
    mediaSourcesRef.current = mediaSources;

    const selectedElement = useMemo<TimelineElement | null>(() => {
        if (!selectedElementIdentifier) return null;
    
        const { type, id } = selectedElementIdentifier;
        switch (type) {
            case 'clip': {
                const data = clips.find(c => c.id === id);
                return data ? { type, data } : null;
            }
            case 'text': {
                const data = textOverlays.find(t => t.id === id);
                return data ? { type, data } : null;
            }
            case 'effect': {
                const data = effects.find(e => e.id === id);
                return data ? { type, data } : null;
            }
            default:
                return null;
        }
    }, [selectedElementIdentifier, clips, textOverlays, effects]);

    const handleSelectElement = useCallback((element: TimelineElement | null) => {
        if (element && 'id' in element.data && (element.type === 'clip' || element.type === 'text' || element.type === 'effect')) {
            setSelectedElementIdentifier({ type: element.type, id: element.data.id });
        } else {
            setSelectedElementIdentifier(null);
        }
    }, []);

    useEffect(() => {
        return () => {
            mediaSourcesRef.current.forEach(source => URL.revokeObjectURL(source.url));
        }
    }, []);

    // Initial Load from IndexedDB
    useEffect(() => {
        const load = async () => {
            setIsApiActive(checkApiActiveOnLoad());
            try {
                const savedProject = await db.loadProject();
                if (savedProject) {
                    if (savedProject.mediaSources.length > 0) {
                        const revivedMediaSources = savedProject.mediaSources.map(source => ({
                            ...source,
                            url: URL.createObjectURL(source.file) 
                        }));
                        setMediaSources(revivedMediaSources);

                        revivedMediaSources.forEach(source => {
                             if (!source.thumbnails) {
                                generateThumbnails(source.url, source.duration)
                                    .then(thumbnails => {
                                        setMediaSources(prev => 
                                            prev.map(s => s.id === source.id ? { ...s, thumbnails } : s)
                                        );
                                    })
                                    .catch(err => {
                                        console.error("썸네일 생성 실패:", err);
                                        setMediaSources(prev => 
                                            prev.map(s => s.id === source.id ? { ...s, thumbnails: [] } : s)
                                        );
                                    });
                            }
                        });
                    }
                    
                    setProjectDuration(savedProject.projectDuration || 30);
                    loadEditorState(savedProject.editorState);
                    console.log("프로젝트를 IndexedDB에서 불러왔습니다.");
                }
            } catch (error) {
                console.error("IndexedDB에서 프로젝트를 불러오는 데 실패했습니다:", error);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [loadEditorState]);

    // Auto-save to IndexedDB
    useDebouncedEffect(() => {
        if (!isLoading) {
            const sourcesToSave = mediaSources.map(({ url, ...rest }) => rest);
            db.saveProject({ mediaSources: sourcesToSave, editorState, projectDuration });
        }
    }, [mediaSources, editorState, isLoading, projectDuration], 1000);

    const handleApiKeyUpdate = useCallback((isActive: boolean) => {
        setIsApiActive(isActive);
    }, []);

    const handleUndo = useCallback(() => {
        if (canUndo) {
            undo();
            setSelectedElementIdentifier(null);
        }
    }, [canUndo, undo]);

    const handleRedo = useCallback(() => {
        if (canRedo) {
            redo();
            setSelectedElementIdentifier(null);
        }
    }, [canRedo, redo]);
    
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') {
                return;
            }

            const isMac = navigator.platform.toUpperCase().includes('MAC');
            const isUndo = (isMac ? e.metaKey : e.ctrlKey) && e.key === 'z' && !e.shiftKey;
            const isRedo = (isMac && e.metaKey && e.shiftKey && e.key === 'z') || 
                         (isMac && e.metaKey && e.key === 'y') ||
                         (!isMac && e.ctrlKey && e.key === 'y');

            if (isUndo) {
                e.preventDefault();
                handleUndo();
                return;
            }
            if (isRedo) {
                e.preventDefault();
                handleRedo();
                return;
            }

            let newZoom = timelineZoom;
            if (e.key === '=' || e.key === '+') {
                e.preventDefault();
                newZoom = Math.min(30, timelineZoom * 1.25);
            }
            if (e.key === '-') {
                e.preventDefault();
                newZoom = Math.max(1, timelineZoom / 1.25);
            }
            if(newZoom !== timelineZoom) {
                 setTimelineZoom(newZoom);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [timelineZoom, handleUndo, handleRedo]);


    const timelineDuration = useMemo(() => {
        const allElements = [...clips, ...textOverlays, ...effects];
        const maxEnd = allElements.length > 0 ? Math.max(0, ...allElements.map(el => el.end)) : 0;
        return Math.max(projectDuration, maxEnd);
    }, [clips, textOverlays, effects, projectDuration]);

    const handleAddVideo = useCallback(async (file: File) => {
        const id = `media-${Date.now()}-${file.name}`;
        const url = URL.createObjectURL(file);
        
        const tempVideo = document.createElement('video');
        tempVideo.src = url;

        tempVideo.onloadedmetadata = () => {
             const newSource: MediaSource = { id, name: file.name, url, duration: tempVideo.duration, file };
            setMediaSources(prev => [...prev, newSource]);

            generateThumbnails(url, tempVideo.duration)
                .then(thumbnails => {
                    setMediaSources(prev => 
                        prev.map(s => s.id === id ? { ...s, thumbnails } : s)
                    );
                })
                .catch(err => {
                    console.error("썸네일 생성 실패:", err);
                    setMediaSources(prev => 
                        prev.map(s => s.id === id ? { ...s, thumbnails: [] } : s)
                    );
                });
        };
        
        tempVideo.onerror = () => {
            console.error("비디오 메타데이터를 로드하는 중 오류 발생. 이 파일은 지원되지 않을 수 있습니다.");
            URL.revokeObjectURL(url);
        };
    }, []);

    const handlePlayPause = useCallback((forceState?: boolean) => {
        if(clips.length > 0) setIsPlaying(prev => forceState ?? !prev);
    }, [clips.length]);

    const handleSeek = (time: number) => {
        setIsPlaying(false);
        setCurrentTime(Math.max(0, Math.min(time, timelineDuration)));
    };

    const handlePlayerTimeUpdate = (videoTime: number) => {
        const activeClip = clips.find(c => currentTime >= c.start && currentTime < c.end);
        if(activeClip && isPlaying) {
            const timeWithinSource = videoTime - activeClip.sourceStart;
            const timeWithinClipTimeline = timeWithinSource / activeClip.playbackRate;
            const newTimelineTime = activeClip.start + timeWithinClipTimeline;
            
            if(newTimelineTime >= activeClip.end) {
                const nextClip = clips.sort((a,b) => a.start - b.start).find(c => c.start >= activeClip.end);
                if (nextClip) {
                    setCurrentTime(nextClip.start);
                } else {
                    setCurrentTime(activeClip.end);
                    setIsPlaying(false);
                }
            } else {
                setCurrentTime(newTimelineTime);
            }
        }
    };
    
    const playerState = useMemo(() => {
        if (clips.length === 0) return { url: null, time: 0, rate: 1 };
        const activeClip = clips.find(c => currentTime >= c.start && currentTime < c.end);
        if (!activeClip) return { url: null, time: 0, rate: 1 };
    
        const source = mediaSources.find(s => s.id === activeClip.sourceId);
        if (!source) return { url: null, time: 0, rate: 1 };
        
        const timeWithinClip = currentTime - activeClip.start;
        const playbackTime = activeClip.sourceStart + (timeWithinClip * activeClip.playbackRate);

        return { url: source.url, time: playbackTime, rate: activeClip.playbackRate };
    }, [currentTime, clips, mediaSources]);

    const handleAddClip = useCallback((sourceId: string, startTime: number, sourceDuration: number) => {
        const newClip: Clip = {
            id: `clip-${Date.now()}`,
            sourceId,
            start: startTime,
            end: startTime + sourceDuration,
            sourceStart: 0,
            sourceEnd: sourceDuration,
            playbackRate: 1,
        };
        setEditorState(prev => ({ ...prev, clips: [...prev.clips, newClip] }));
        setSelectedElementIdentifier({ type: 'clip', id: newClip.id });
    }, [setEditorState]);
    
    const handleAddText = useCallback(() => {
        if (clips.length === 0) return;
        const newText: TextOverlay = {
            id: `text-${Date.now()}`,
            text: '새 텍스트',
            start: Math.min(currentTime, timelineDuration - 2 > 0 ? timelineDuration - 2 : 0),
            end: Math.min(currentTime + 5, timelineDuration),
            style: { top: '80%', left: '50%', color: '#FFFFFF', fontSize: '24px' }
        };
        setEditorState(prev => ({ ...prev, textOverlays: [...prev.textOverlays, newText] }));
        setSelectedElementIdentifier({ type: 'text', id: newText.id });
    }, [currentTime, timelineDuration, clips.length, setEditorState]);
    
    const handleUpdateText = useCallback((id: string, newText: string) => {
        setEditorState(prev => ({
            ...prev,
            textOverlays: prev.textOverlays.map(t => t.id === id ? { ...t, text: newText } : t)
        }));
    }, [setEditorState]);

    const handleUpdateTextStyle = useCallback((id: string, styleChanges: Partial<TextOverlay['style']>) => {
        setEditorState(prev => ({
            ...prev,
            textOverlays: prev.textOverlays.map(t =>
                t.id === id ? { ...t, style: { ...t.style, ...styleChanges } } : t
            )
        }));
    }, [setEditorState]);

    const handleAddEffect = useCallback((effect: Effect) => {
        setEditorState(prev => ({ ...prev, effects: [...prev.effects, effect] }));
        setSelectedElementIdentifier({ type: 'effect', id: effect.id });
    }, [setEditorState]);

    const handleUpdateEffect = useCallback((id: string, newEffectData: Partial<Effect>) => {
        setEditorState(prev => ({
            ...prev,
            effects: prev.effects.map(e => e.id === id ? {...e, ...newEffectData} : e)
        }));
    }, [setEditorState]);

    const handleUpdateClip = useCallback((id: string, updates: Partial<Clip>) => {
        setEditorState(prev => ({
            ...prev,
            clips: prev.clips.map(c => {
                if (c.id === id) {
                    const updatedClip = { ...c, ...updates };
                    const sourceDuration = updatedClip.sourceEnd - updatedClip.sourceStart;
                    const timelineDuration = updatedClip.end - updatedClip.start;

                    if (timelineDuration > 0) {
                        updatedClip.playbackRate = sourceDuration / timelineDuration;
                    } else {
                        updatedClip.playbackRate = 1;
                    }
                    return updatedClip;
                }
                return c;
            })
        }));
    }, [setEditorState]);

    const handleDeleteElement = useCallback((id: string, type: TimelineElement['type']) => {
        if (type === 'media') return; 
        setEditorState(prev => {
            switch (type) {
                case 'clip':
                    return { ...prev, clips: prev.clips.filter(c => c.id !== id) };
                case 'text':
                    return { ...prev, textOverlays: prev.textOverlays.filter(t => t.id !== id) };
                case 'effect':
                    return { ...prev, effects: prev.effects.filter(e => e.id !== id) };
                default:
                    return prev;
            }
        });
        if (selectedElementIdentifier?.id === id) {
            setSelectedElementIdentifier(null);
        }
    }, [selectedElementIdentifier, setEditorState]);
    
    const handleDeleteMediaSource = useCallback((id: string) => {
        const sourceToDelete = mediaSources.find(s => s.id === id);
        if (sourceToDelete) {
            URL.revokeObjectURL(sourceToDelete.url);
        }
        setMediaSources(prev => prev.filter(s => s.id !== id));
        setEditorState(prev => ({ ...prev, clips: prev.clips.filter(c => c.sourceId !== id) }));
        
        if (selectedElement?.type === 'clip' && selectedElement.data.sourceId === id) {
            setSelectedElementIdentifier(null);
        }
    }, [selectedElement, mediaSources, setEditorState]);
    
    const canSplit = useMemo(() => {
        if (!selectedElement || selectedElement.type !== 'clip') return false;
        const { start, end } = selectedElement.data;
        return currentTime > start + 0.1 && currentTime < end - 0.1;
    }, [currentTime, selectedElement]);

    const handleSplitClip = useCallback(() => {
        if (!canSplit || !selectedElement || selectedElement.type !== 'clip') return;
        const clipToSplit = selectedElement.data;
        const splitTime = currentTime;
        
        const timeIntoClip = splitTime - clipToSplit.start;
        const sourceTimeAtSplit = clipToSplit.sourceStart + (timeIntoClip * clipToSplit.playbackRate);
    
        const firstClip: Clip = { ...clipToSplit, id: `clip-${Date.now()}-a`, end: splitTime, sourceEnd: sourceTimeAtSplit };
        const secondClip: Clip = { ...clipToSplit, id: `clip-${Date.now()}-b`, start: splitTime, sourceStart: sourceTimeAtSplit };
    
        setEditorState(prev => ({
            ...prev,
            clips: [...prev.clips.filter(c => c.id !== clipToSplit.id), firstClip, secondClip].sort((a,b) => a.start - b.start)
        }));
        setSelectedElementIdentifier({ type: 'clip', id: secondClip.id });
    }, [canSplit, currentTime, selectedElement, setEditorState]);

     const handleGenerateSubtitles = useCallback(async (clipId: string) => {
        const clip = clips.find(c => c.id === clipId);
        const source = mediaSources.find(s => s.id === clip?.sourceId);
        if (!clip || !source) return;

        try {
            const transcriptions = await getAudioTranscription(source.file);
            const newTextOverlays: TextOverlay[] = transcriptions.map((item, index) => {
                const timelineStart = clip.start + ((item.start - clip.sourceStart) / clip.playbackRate);
                const timelineEnd = clip.start + ((item.end - clip.sourceStart) / clip.playbackRate);
                
                if (timelineStart >= clip.end) return null;

                return {
                    id: `text-sub-${Date.now()}-${index}`,
                    text: item.text,
                    start: Math.max(clip.start, timelineStart),
                    end: Math.min(clip.end, timelineEnd),
                    style: { top: '90%', left: '50%', color: '#FFFFFF', fontSize: '20px' }
                };
            }).filter((item): item is TextOverlay => item !== null && (item.end - item.start > 0.1));

            setEditorState(prev => ({ ...prev, textOverlays: [...prev.textOverlays, ...newTextOverlays] }));
        } catch (error) {
            console.error(error);
            alert(error instanceof Error ? error.message : "자막 생성 중 오류가 발생했습니다.");
        }
    }, [clips, mediaSources, setEditorState]);

    const handleSmartCut = useCallback(async (clipId: string) => {
        const clipToSplit = clips.find(c => c.id === clipId);
        const source = mediaSources.find(s => s.id === clipToSplit?.sourceId);
        if (!clipToSplit || !source) return;

        try {
            const cutTimestamps = await getSceneCuts(source.file);
            const relevantCuts = cutTimestamps
                .filter(ts => ts > clipToSplit.sourceStart + 0.1 && ts < clipToSplit.sourceEnd - 0.1)
                .sort((a, b) => a - b);
            
            if (relevantCuts.length === 0) {
                alert("이 클립에서 자동으로 분할할 장면을 찾지 못했습니다.");
                return;
            }

            const newClips: Clip[] = [];
            let lastSourceTime = clipToSplit.sourceStart;
            let lastTimelineTime = clipToSplit.start;

            relevantCuts.forEach(sourceCutTime => {
                const clipDuration = (sourceCutTime - lastSourceTime) / clipToSplit.playbackRate;
                const timelineCutTime = lastTimelineTime + clipDuration;

                newClips.push({
                    id: `clip-smart-${Date.now()}-${lastSourceTime}`,
                    sourceId: clipToSplit.sourceId,
                    start: lastTimelineTime,
                    end: timelineCutTime,
                    sourceStart: lastSourceTime,
                    sourceEnd: sourceCutTime,
                    playbackRate: clipToSplit.playbackRate,
                });

                lastSourceTime = sourceCutTime;
                lastTimelineTime = timelineCutTime;
            });

            newClips.push({
                id: `clip-smart-${Date.now()}-${lastSourceTime}`,
                sourceId: clipToSplit.sourceId,
                start: lastTimelineTime,
                end: clipToSplit.end,
                sourceStart: lastSourceTime,
                sourceEnd: clipToSplit.sourceEnd,
                playbackRate: clipToSplit.playbackRate,
            });
            
            setEditorState(prev => ({
                ...prev,
                clips: [...prev.clips.filter(c => c.id !== clipId), ...newClips].sort((a, b) => a.start - b.start)
            }));
            setSelectedElementIdentifier(null);

        } catch (error) {
            console.error(error);
            alert(error instanceof Error ? error.message : "스마트 컷 중 오류가 발생했습니다.");
        }
    }, [clips, mediaSources, setEditorState]);

    const handleAddTransition = useCallback(async (fromClipId: string, toClipId: string, prompt: string, duration: number = 1) => {
        const fromClip = clips.find(c => c.id === fromClipId);
        const toClip = clips.find(c => c.id === toClipId);
        if (!fromClip || !toClip || !prompt) return;

        const transitionStart = fromClip.end - (duration / 2);
        const transitionEnd = toClip.start + (duration / 2);
        const transitionId = `effect-trans-${Date.now()}`;
        
        const placeholderEffect: Effect = {
            id: transitionId,
            type: 'generative_transition',
            start: Math.max(0, transitionStart),
            end: Math.min(timelineDuration, transitionEnd),
            value: 'loading',
            prompt,
            images: []
        };
        setEditorState(prev => ({ ...prev, effects: [...prev.effects, placeholderEffect] }));
        setSelectedElementIdentifier({type: 'effect', id: placeholderEffect.id});
        
        try {
            const images = await generateTransitionImages(prompt);
            const finalEffect: Effect = { ...placeholderEffect, value: 'done', images };
            setEditorState(prev => ({
                ...prev,
                effects: prev.effects.map(e => e.id === transitionId ? finalEffect : e)
            }));
            setSelectedElementIdentifier({type: 'effect', id: finalEffect.id});
        } catch(error) {
            console.error(error);
            alert(error instanceof Error ? error.message : "전환 효과 생성 중 오류가 발생했습니다.");
            setEditorState(prev => ({ ...prev, effects: prev.effects.filter(e => e.id !== transitionId)}));
            setSelectedElementIdentifier(null);
        }
    }, [clips, setEditorState, timelineDuration]);


    const handleConfirmNewProject = () => {
        setIsNewProjectModalOpen(false);
        mediaSourcesRef.current.forEach(source => URL.revokeObjectURL(source.url));
        setMediaSources([]);
        loadEditorState({ clips: [], textOverlays: [], effects: [] });
        setCurrentTime(0);
        setIsPlaying(false);
        setSelectedElementIdentifier(null);
        setTimelineZoom(1);
        setProjectDuration(30);
        db.saveProject({
            mediaSources: [],
            editorState: { clips: [], textOverlays: [], effects: [] },
            projectDuration: 30
        });
        console.log("새 프로젝트가 시작되었습니다.");
    };
    
    const handleExport = async () => {
        if (clips.length === 0) {
            alert("내보낼 클립이 없습니다.");
            return;
        }

        const allElements = [...clips, ...textOverlays, ...effects];
        const exportDuration = allElements.length > 0 ? Math.max(...allElements.map(el => el.end)) : 0;

        if (exportDuration <= 0) {
            alert("내보낼 콘텐츠가 없습니다.");
            return;
        }

        setIsExporting(true);
        setExportProgress(0);
    
        const FRAME_RATE = 30;
        const EXPORT_WIDTH = 1280;
        const EXPORT_HEIGHT = 720;
        const outputFilename = `edited_video.mp4`;
    
        const seekVideo = (videoEl: HTMLVideoElement, time: number): Promise<void> => {
            return new Promise((resolve, reject) => {
                const timeoutId = window.setTimeout(() => {
                    cleanup();
                    reject(new Error(`비디오 탐색 시간 초과 (${videoEl.src} at ${time}s)`));
                }, 5000);
    
                const cleanup = () => {
                    clearTimeout(timeoutId);
                    videoEl.onseeked = null;
                    videoEl.onerror = null;
                };
    
                videoEl.onseeked = () => {
                    cleanup();
                    requestAnimationFrame(() => resolve());
                };
    
                videoEl.onerror = () => {
                    cleanup();
                    reject(new Error(`비디오 탐색 오류: ${videoEl.src}`));
                };
                
                if (Math.abs(videoEl.currentTime - time) > 0.01) {
                     videoEl.currentTime = time;
                } else {
                    if (videoEl.onseeked) {
                        videoEl.onseeked(new Event('seeked'));
                    }
                }
            });
        };
    
        const videoElementCache: Record<string, HTMLVideoElement> = {};
        const imageElementCache: Record<string, HTMLImageElement> = {};
    
        try {
            await Promise.all(mediaSources.map(source => new Promise<void>((resolve, reject) => {
                const video = document.createElement('video');
                video.src = source.url;
                video.muted = true;
                video.preload = 'auto';
                video.oncanplaythrough = () => {
                    videoElementCache[source.id] = video;
                    video.pause();
                    resolve();
                };
                video.onerror = () => reject(new Error(`비디오 로드 실패: ${source.name}`));
                video.load();
            })));
    
            const allImageEffects = effects.filter(e => (e.type === 'image_overlay' || e.type === 'generative_transition') && e.value !== 'loading');
            await Promise.all(allImageEffects.flatMap(effect => {
                const imagesToLoad: string[] = effect.type === 'image_overlay' ? [effect.value] : (effect.images || []);
                return imagesToLoad.map(imgSrc => new Promise<void>((resolve, reject) => {
                    if (!imgSrc || imageElementCache[imgSrc]) return resolve();
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.src = imgSrc;
                    img.onload = () => { imageElementCache[imgSrc] = img; resolve(); };
                    img.onerror = () => reject(new Error(`이미지 로드 실패: ${imgSrc.substring(0, 50)}...`));
                }));
            }));
        } catch (error) {
            alert(`에셋 로드 중 오류가 발생했습니다: ${error instanceof Error ? error.message : 'Unknown error'}`);
            setIsExporting(false);
            return;
        }
    
        const canvas = document.createElement('canvas');
        canvas.width = EXPORT_WIDTH;
        canvas.height = EXPORT_HEIGHT;
        const ctx = canvas.getContext('2d', { alpha: false });
    
        if (!ctx) {
            alert("캔버스 컨텍스트를 생성할 수 없습니다.");
            setIsExporting(false);
            return;
        }
        
        if (typeof VideoEncoder === "undefined") {
            alert("이 브라우저는 VideoEncoder API를 지원하지 않아 내보내기가 불가능합니다. 최신 버전의 Chrome이나 Edge를 사용해주세요.");
            setIsExporting(false);
            return;
        }

        let exportError: Error | null = null;
    
        const muxer = new Muxer({
            target: new ArrayBufferTarget(),
            video: {
                codec: 'avc',
                width: EXPORT_WIDTH,
                height: EXPORT_HEIGHT,
                frameRate: FRAME_RATE,
            },
            fastStart: 'in-memory',
        });

        const videoEncoder = new VideoEncoder({
            output: (chunk, meta) => {
                muxer.addVideoChunk(chunk, meta);
            },
            error: (e) => {
                console.error('VideoEncoder error:', e);
                exportError = e;
            }
        });

        videoEncoder.configure({
            codec: 'avc1.42001f',
            width: EXPORT_WIDTH,
            height: EXPORT_HEIGHT,
            bitrate: 5_000_000, // 5 Mbps
            framerate: FRAME_RATE,
        });

        try {
            const totalFrames = Math.floor(exportDuration * FRAME_RATE);
    
            for (let frame = 0; frame < totalFrames; frame++) {
                if (exportError) throw exportError;

                const time = frame / FRAME_RATE;
                const timestamp = frame * 1_000_000 / FRAME_RATE;
    
                ctx.fillStyle = 'black';
                ctx.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);

                const activeClip = clips.find(c => time >= c.start && time < c.end);
                if (activeClip) {
                    const video = videoElementCache[activeClip.sourceId];
                    if (video) {
                        const sourceTime = activeClip.sourceStart + ((time - activeClip.start) * activeClip.playbackRate);
                        await seekVideo(video, sourceTime);

                        const activeFilter = effects.find(e => e.type === 'filter' && time >= e.start && time <= e.end);
                        ctx.filter = activeFilter ? activeFilter.value : 'none';
                        
                        const videoAspect = video.videoWidth / video.videoHeight;
                        const canvasAspect = EXPORT_WIDTH / EXPORT_HEIGHT;
                        let drawWidth = EXPORT_WIDTH, drawHeight = EXPORT_HEIGHT;
                        if (videoAspect > canvasAspect) {
                            drawHeight = EXPORT_WIDTH / videoAspect;
                        } else {
                            drawWidth = EXPORT_HEIGHT * videoAspect;
                        }
                        const x = (EXPORT_WIDTH - drawWidth) / 2;
                        const y = (EXPORT_HEIGHT - drawHeight) / 2;
                        
                        ctx.drawImage(video, x, y, drawWidth, drawHeight);
                        ctx.filter = 'none';
                    }
                }

                const activeImageOverlay = effects.find(e => e.type === 'image_overlay' && e.value !== 'loading' && time >= e.start && time <= e.end);
                if (activeImageOverlay && imageElementCache[activeImageOverlay.value]) {
                    const img = imageElementCache[activeImageOverlay.value];
                    const imgAspect = img.naturalWidth / img.naturalHeight;
                    const canvasAspect = EXPORT_WIDTH / EXPORT_HEIGHT;
                    let w = EXPORT_WIDTH, h = EXPORT_HEIGHT;
                    if (imgAspect > canvasAspect) { h = w / imgAspect; } else { w = h * imgAspect; }
                    const x = (EXPORT_WIDTH - w) / 2;
                    const y = (EXPORT_HEIGHT - h) / 2;
                    ctx.drawImage(img, x, y, w, h);
                }

                const activeTransition = effects.find(e => e.type === 'generative_transition' && e.value === 'done' && time >= e.start && time <= e.end);
                if (activeTransition && activeTransition.images && activeTransition.images.length > 0) {
                    const progress = (time - activeTransition.start) / (activeTransition.end - activeTransition.start);
                    const imageIndex = Math.min(Math.floor(progress * activeTransition.images.length), activeTransition.images.length - 1);
                    const img = imageElementCache[activeTransition.images[imageIndex]];
                    if (img) ctx.drawImage(img, 0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
                }

                const activeTextOverlays = textOverlays.filter(t => time >= t.start && time <= t.end);
                if (activeTextOverlays.length > 0) {
                    ctx.textBaseline = 'middle';
                    ctx.textAlign = 'center';
                    ctx.shadowColor = 'rgba(0,0,0,0.7)';
                    ctx.shadowBlur = 4;
                    ctx.shadowOffsetX = 2;
                    ctx.shadowOffsetY = 2;
                    activeTextOverlays.forEach(text => {
                        ctx.fillStyle = text.style.color;
                        ctx.font = `${text.style.fontSize} sans-serif`;
                        const x = parseFloat(text.style.left) / 100 * EXPORT_WIDTH;
                        const y = parseFloat(text.style.top) / 100 * EXPORT_HEIGHT;
                        ctx.fillText(text.text, x, y);
                    });
                    ctx.shadowColor = 'transparent';
                }
                
                const videoFrame = new VideoFrame(canvas, { timestamp, duration: 1_000_000 / FRAME_RATE });
                videoEncoder.encode(videoFrame);

                setExportProgress(((frame + 1) / totalFrames) * 100);
                if (frame > 0 && frame % FRAME_RATE === 0) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }

            await videoEncoder.flush();
            muxer.finalize();

            const { buffer } = muxer.target as ArrayBufferTarget;
            const blob = new Blob([buffer], { type: 'video/mp4' });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = outputFilename;
            document.body.appendChild(a);
            a.click();
            URL.revokeObjectURL(url);
            a.remove();
        } catch (e) {
            console.error("Export process failed:", e);
            alert(`내보내기 중 오류가 발생했습니다: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
        } finally {
             setIsExporting(false);
             setExportProgress(0);
        }
    };
    
    return (
        <div className="h-screen w-screen bg-gray-900 text-white flex flex-col p-4 space-y-4 overflow-hidden">
            {isLoading && (
                <div className="absolute inset-0 bg-gray-900 bg-opacity-80 flex items-center justify-center z-50">
                    <p className="text-xl animate-pulse">프로젝트 로딩 중...</p>
                </div>
            )}
            
            <ConfirmationModal
                isOpen={isNewProjectModalOpen}
                onClose={() => setIsNewProjectModalOpen(false)}
                onConfirm={handleConfirmNewProject}
                title="새 프로젝트 시작"
            >
                <p>현재 작업 내용이 모두 사라집니다.</p>
                <p>정말로 새 프로젝트를 시작하시겠습니까?</p>
            </ConfirmationModal>
            
            <HelpModal
                isOpen={isHelpModalOpen}
                onClose={() => setIsHelpModalOpen(false)}
            />

            <header className="flex-shrink-0 flex items-center justify-between">
                <h1 className="text-2xl font-bold text-indigo-400">코어 비디오 에디터</h1>
                <div className="flex items-center space-x-4">
                     <button
                        onClick={() => setIsHelpModalOpen(true)}
                        className="w-10 h-10 flex items-center justify-center bg-gray-700 hover:bg-indigo-600 text-white rounded-md transition-colors text-2xl"
                        title="도움말"
                        aria-label="도움말 보기"
                    >
                        ❓
                    </button>
                    <ApiKeyManager onApiKeyUpdate={handleApiKeyUpdate} />
                    <div className="h-6 w-px bg-gray-600"></div>
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={() => setIsNewProjectModalOpen(true)}
                            className="flex items-center bg-gray-700 hover:bg-indigo-600 text-white text-sm font-semibold py-2 px-3 rounded-md transition-colors"
                            aria-label="새 프로젝트"
                        >
                            <NewProjectIcon />
                            새 프로젝트
                        </button>
                        
                        <button
                            onClick={handleExport}
                            disabled={clips.length === 0 || isExporting}
                            className="flex items-center bg-green-600 hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-md transition-colors"
                            aria-label="비디오 내보내기"
                        >
                            <ExportIcon />
                            {isExporting ? `내보내는 중... (${exportProgress.toFixed(0)}%)` : '비디오 내보내기'}
                        </button>
                    </div>
                </div>
            </header>
            
            <main className="flex-grow flex flex-col space-y-4 min-h-0">
                <div className="flex-[3] flex flex-row space-x-4 min-h-0">
                    <div className="w-1/3 flex flex-col space-y-4">
                        <div className="flex-1 min-h-0">
                           <MediaBin 
                             onAddVideo={handleAddVideo} 
                             mediaSources={mediaSources} 
                             onDeleteMediaSource={handleDeleteMediaSource}
                            />
                        </div>
                        <div className="flex-1 min-h-0">
                           <PropertiesPanel 
                             selectedElement={selectedElement}
                             mediaSources={mediaSources}
                             clips={clips}
                             onUpdateText={handleUpdateText}
                             onUpdateTextStyle={handleUpdateTextStyle}
                             onAddEffect={handleAddEffect}
                             onUpdateEffect={handleUpdateEffect}
                             onDeleteElement={handleDeleteElement}
                             onGenerateSubtitles={handleGenerateSubtitles}
                             onSmartCut={handleSmartCut}
                             onAddTransition={handleAddTransition}
                             isApiActive={isApiActive}
                            />
                        </div>
                    </div>

                    <div className="w-2/3 flex">
                      <VideoPlayer 
                          videoUrl={playerState.url}
                          playbackTime={playerState.time}
                          playbackRate={playerState.rate}
                          isPlaying={isPlaying}
                          timelineDuration={timelineDuration}
                          timelineCurrentTime={currentTime}
                          onTimeUpdate={handlePlayerTimeUpdate}
                          onPlayPause={handlePlayPause}
                          onSeek={handleSeek}
                          textOverlays={textOverlays}
                          effects={effects}
                          onSetProjectDuration={setProjectDuration}
                      />
                    </div>
                </div>

                <div className="flex-[2] flex flex-col space-y-2 min-h-0">
                    <div className="flex-shrink-0">
                        <Toolbar 
                            onAddText={handleAddText}
                            onSplitClip={handleSplitClip}
                            canSplit={canSplit}
                            isTimelineActive={clips.length > 0}
                            onUndo={handleUndo}
                            onRedo={handleRedo}
                            canUndo={canUndo}
                            canRedo={canRedo}
                        />
                    </div>
                    <div className="flex-grow min-h-0">
                        <Timeline 
                            duration={timelineDuration}
                            currentTime={currentTime}
                            clips={clips}
                            textOverlays={textOverlays}
                            effects={effects}
                            mediaSources={mediaSources}
                            onSeek={handleSeek}
                            onSelectElement={handleSelectElement}
                            selectedElement={selectedElement}
                            onUpdateClip={handleUpdateClip}
                            onAddClip={handleAddClip}
                            zoom={timelineZoom}
                            onZoomChange={setTimelineZoom}
                        />
                    </div>
                </div>
            </main>
        </div>
    );
};

export default App;