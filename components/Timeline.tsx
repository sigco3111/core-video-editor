
import React, { useRef, useState, useEffect, useCallback, useLayoutEffect } from 'react';
import type { Clip, TextOverlay, Effect, TimelineElement, EffectType, MediaSource } from '../types';
import { SparklesIcon } from '../constants';

interface TimelineProps {
    duration: number;
    currentTime: number;
    clips: Clip[];
    textOverlays: TextOverlay[];
    effects: Effect[];
    mediaSources: MediaSource[];
    onSeek: (time: number) => void;
    onSelectElement: (element: TimelineElement | null) => void;
    selectedElement: TimelineElement | null;
    onUpdateClip: (id: string, updates: Partial<Clip>) => void;
    onAddClip: (sourceId: string, startTime: number, sourceDuration: number) => void;
    zoom: number;
    onZoomChange: (zoom: number) => void;
}

const MIN_CLIP_DURATION = 0.2;
const SNAP_THRESHOLD_PX = 10;

const effectTypeToKorean: Record<EffectType, string> = {
    filter: '필터',
    image_overlay: '이미지 오버레이',
    generative_transition: 'AI 전환'
};

const Timeline: React.FC<TimelineProps> = ({ 
    duration, 
    currentTime, 
    clips, 
    textOverlays, 
    effects, 
    mediaSources,
    onSeek, 
    onSelectElement, 
    selectedElement, 
    onUpdateClip,
    onAddClip,
    zoom,
    onZoomChange,
}) => {
    const timelineContainerRef = useRef<HTMLDivElement>(null);
    const playheadRef = useRef<HTMLDivElement>(null);
    
    const [zoomAnchor, setZoomAnchor] = useState<{ time: number; x: number } | null>(null);
    const [snapLinePosition, setSnapLinePosition] = useState<number | null>(null);


    const [resizing, setResizing] = useState<{
        clipId: string;
        handle: 'start' | 'end';
        initialX: number;
        originalStart: number;
        originalEnd: number;
    } | null>(null);
    
    const [dragging, setDragging] = useState<{
        clipId: string;
        initialX: number;
        originalStart: number;
        originalEnd: number;
    } | null>(null);

    const getTimeFromX = useCallback((clientX: number) => {
        if (!timelineContainerRef.current) return 0;
        const rect = timelineContainerRef.current.getBoundingClientRect();
        const scrollLeft = timelineContainerRef.current.scrollLeft;
        const scrollWidth = timelineContainerRef.current.scrollWidth;
        const relativeX = (clientX - rect.left + scrollLeft) / scrollWidth;
        return relativeX * duration;
    }, [duration]);
    
    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        if (!timelineContainerRef.current) return;

        const rect = timelineContainerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;

        const timeAtCursor = getTimeFromX(e.clientX);
        
        const newZoom = Math.max(1, Math.min(30, zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
        
        if (newZoom !== zoom) {
            setZoomAnchor({ time: timeAtCursor, x: mouseX });
            onZoomChange(newZoom);
        }
    };

    useLayoutEffect(() => {
        if (!zoomAnchor || !timelineContainerRef.current) return;
        
        const { time, x } = zoomAnchor;
        
        const newScrollWidth = timelineContainerRef.current.clientWidth * zoom;
        const newPixelPositionForTime = (time / duration) * newScrollWidth;
        const newScrollLeft = newPixelPositionForTime - x;

        timelineContainerRef.current.scrollLeft = newScrollLeft;

        setZoomAnchor(null);
    }, [zoom, zoomAnchor, duration]);
    
    useLayoutEffect(() => {
        if(zoom === 1) {
            if(timelineContainerRef.current) timelineContainerRef.current.scrollLeft = 0;
        }
    }, [zoom]);


    const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        if (target.dataset.timelineRuler) {
            const time = getTimeFromX(e.clientX);
            onSeek(time);
        }
    };

    const handleResizeStart = useCallback((e: React.MouseEvent, clip: Clip, handle: 'start' | 'end') => {
        e.stopPropagation();
        onSelectElement({ type: 'clip', data: clip });
        setResizing({
            clipId: clip.id,
            handle,
            initialX: e.clientX,
            originalStart: clip.start,
            originalEnd: clip.end,
        });
    }, [onSelectElement]);

    const handleResizeMove = useCallback((e: MouseEvent) => {
        if (!resizing || !timelineContainerRef.current) return;
        
        const pixelsPerSecond = timelineContainerRef.current.scrollWidth / duration;
        const deltaX = e.clientX - resizing.initialX;
        const deltaTime = deltaX / pixelsPerSecond;
        const snapThresholdTime = SNAP_THRESHOLD_PX / pixelsPerSecond;

        const snapTargets = [0, duration, currentTime];
        clips.forEach(clip => {
            if (clip.id !== resizing.clipId) {
                snapTargets.push(clip.start);
                snapTargets.push(clip.end);
            }
        });
        
        let snapped = false;

        if (resizing.handle === 'start') {
            let newStart = resizing.originalStart + deltaTime;

            for (const target of snapTargets) {
                if (Math.abs(newStart - target) < snapThresholdTime) {
                    newStart = target;
                    setSnapLinePosition((target / duration) * 100);
                    snapped = true;
                    break;
                }
            }

            if (newStart < 0) newStart = 0;
            if (resizing.originalEnd - newStart < MIN_CLIP_DURATION) {
                newStart = resizing.originalEnd - MIN_CLIP_DURATION;
            }
            onUpdateClip(resizing.clipId, { start: newStart });
        } else { // 'end' handle
            let newEnd = resizing.originalEnd + deltaTime;
            
            for (const target of snapTargets) {
                if (Math.abs(newEnd - target) < snapThresholdTime) {
                    newEnd = target;
                    setSnapLinePosition((target / duration) * 100);
                    snapped = true;
                    break;
                }
            }

            if (newEnd > duration) newEnd = duration;
            if (newEnd - resizing.originalStart < MIN_CLIP_DURATION) {
                newEnd = resizing.originalStart + MIN_CLIP_DURATION;
            }
            onUpdateClip(resizing.clipId, { end: newEnd });
        }

        if (!snapped) {
            setSnapLinePosition(null);
        }

    }, [resizing, duration, onUpdateClip, clips, currentTime]);
    
    const handleResizeEnd = useCallback(() => {
        setResizing(null);
        setSnapLinePosition(null);
    }, []);

    useEffect(() => {
        if (resizing) {
            window.addEventListener('mousemove', handleResizeMove);
            window.addEventListener('mouseup', handleResizeEnd);
        }
        return () => {
            window.removeEventListener('mousemove', handleResizeMove);
            window.removeEventListener('mouseup', handleResizeEnd);
        };
    }, [resizing, handleResizeMove, handleResizeEnd]);

    const handleDragStart = useCallback((e: React.MouseEvent, clip: Clip) => {
        if ((e.target as HTMLElement).classList.contains('resize-handle')) return;
        e.stopPropagation();
        onSelectElement({ type: 'clip', data: clip });
        setDragging({
            clipId: clip.id,
            initialX: e.clientX,
            originalStart: clip.start,
            originalEnd: clip.end,
        });
    }, [onSelectElement]);

    const handleDragMove = useCallback((e: MouseEvent) => {
        if (!dragging || !timelineContainerRef.current) return;
        
        const pixelsPerSecond = timelineContainerRef.current.scrollWidth / duration;
        const deltaX = e.clientX - dragging.initialX;
        const deltaTime = deltaX / pixelsPerSecond;
        const snapThresholdTime = SNAP_THRESHOLD_PX / pixelsPerSecond;

        const clipDuration = dragging.originalEnd - dragging.originalStart;
        let newStart = dragging.originalStart + deltaTime;
        let newEnd = newStart + clipDuration;

        const snapTargets = [0, duration, currentTime];
        clips.forEach(clip => {
            if (clip.id !== dragging.clipId) {
                snapTargets.push(clip.start);
                snapTargets.push(clip.end);
            }
        });

        let snapped = false;
        // Snap start of clip
        for (const target of snapTargets) {
            if (Math.abs(newStart - target) < snapThresholdTime) {
                newStart = target;
                newEnd = newStart + clipDuration;
                setSnapLinePosition((target / duration) * 100);
                snapped = true;
                break;
            }
        }
        // Snap end of clip if start didn't snap
        if (!snapped) {
            for (const target of snapTargets) {
                if (Math.abs(newEnd - target) < snapThresholdTime) {
                    newEnd = target;
                    newStart = newEnd - clipDuration;
                    setSnapLinePosition((target / duration) * 100);
                    snapped = true;
                    break;
                }
            }
        }
        
        if (!snapped) {
            setSnapLinePosition(null);
        }

        if (newStart < 0) newStart = 0;
        newEnd = newStart + clipDuration;
        if (newEnd > duration) {
            newEnd = duration;
            newStart = newEnd - clipDuration;
        }
        
        onUpdateClip(dragging.clipId, { start: newStart, end: newEnd });

    }, [dragging, duration, onUpdateClip, clips, currentTime]);

    const handleDragEnd = useCallback(() => {
        setDragging(null);
        setSnapLinePosition(null);
    }, []);

    useEffect(() => {
        if (dragging) {
            window.addEventListener('mousemove', handleDragMove);
            window.addEventListener('mouseup', handleDragEnd);
        }
        return () => {
            window.removeEventListener('mousemove', handleDragMove);
            window.removeEventListener('mouseup', handleDragEnd);
        };
    }, [dragging, handleDragMove, handleDragEnd]);
    
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        try {
            const jsonString = e.dataTransfer.getData('application/json');
            if (jsonString) {
                const data = JSON.parse(jsonString);
                if (data.type === 'media') {
                    const startTime = getTimeFromX(e.clientX);
                    onAddClip(data.sourceId, startTime, data.duration);
                }
            }
            // Silently ignore other drop types like files from desktop to prevent crash
        } catch (error) {
            console.error("드롭 데이터 처리 오류:", error);
        }
    };

    const renderTimeMarkers = () => {
        if (!timelineContainerRef.current) return null;
        const markers = [];
        const containerWidth = timelineContainerRef.current.clientWidth;
        const pixelsPerSecond = (containerWidth * zoom) / duration;
        
        let interval = 5;
        let subIntervals = 4;
        if (pixelsPerSecond < 10) { interval = 30; subIntervals = 2; }
        else if (pixelsPerSecond < 20) { interval = 10; subIntervals = 4; }
        else if (pixelsPerSecond < 80) { interval = 5; subIntervals = 4; }
        else if (pixelsPerSecond < 160) { interval = 2; subIntervals = 1; }
        else if (pixelsPerSecond < 400) { interval = 1; subIntervals = 4; }
        else { interval = 0.5; subIntervals = 4;}

        const numMarkers = Math.floor(duration / interval) + 1;
        for (let i = 0; i < numMarkers; i++) {
            const time = i * interval;
            const leftPercent = (time / duration) * 100;
            markers.push(
                <div key={`maj-${time}`} style={{ left: `${leftPercent}%`}} className="absolute h-full text-xs text-gray-400 flex flex-col items-center">
                    <span>{time.toFixed(time < 1 && duration < 30 ? 1 : 0)}</span>
                    <div className="w-px h-2.5 bg-gray-400"></div>
                </div>
            );
            if (subIntervals > 0) {
                for (let j = 1; j < subIntervals; j++) {
                    const subTime = time + (j * interval / subIntervals);
                    if (subTime >= duration) break;
                    const subLeftPercent = (subTime / duration) * 100;
                    markers.push(
                        <div key={`min-${subTime}`} style={{ left: `${subLeftPercent}%`}} className="absolute bottom-0 h-full">
                           <div className="w-px h-1.5 bg-gray-600"></div>
                        </div>
                    );
                }
            }
        }
        return markers;
    };
    
    const isSelected = (el: TimelineElement) => selectedElement?.type === el.type && selectedElement?.data.id === el.data.id;

    return (
        <div 
            className="bg-gray-800 p-4 rounded-lg flex-grow flex flex-col space-y-2"
            onWheel={handleWheel}
        >
            {/* Horizontal Scroll Container */}
            <div
                ref={timelineContainerRef}
                className="relative flex-1 w-full overflow-x-auto"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
            >
                {/* Wide Inner Container for Zooming and Vertical Layout */}
                <div 
                    className="relative h-full flex flex-col"
                    style={{ width: `${zoom * 100}%`, minWidth: '100%' }}
                >
                    {/* Playhead */}
                    <div
                        ref={playheadRef}
                        className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30 pointer-events-none"
                        style={{ left: `${(currentTime / duration) * 100}%` }}
                    >
                        <div className="absolute -top-1.5 -left-1.5 w-4 h-4 bg-red-500 rounded-full border-2 border-gray-900"></div>
                    </div>
                    
                    {/* Snap Line Indicator */}
                    {snapLinePosition !== null && (
                        <div
                            className="absolute top-0 bottom-0 w-0.5 bg-yellow-400 z-30 pointer-events-none"
                            style={{ left: `${snapLinePosition}%` }}
                        />
                    )}

                    {/* Ruler */}
                    <div 
                        className="relative h-6 bg-gray-900 rounded cursor-pointer flex-shrink-0" 
                        onClick={handleTimelineClick}
                        data-timeline-ruler="true"
                    >
                        {renderTimeMarkers()}
                    </div>

                    {/* Tracks Area (Vertically Scrollable) */}
                    <div 
                        className="relative flex-grow bg-gray-900 rounded p-2 space-y-2 overflow-y-auto"
                        onClick={() => onSelectElement(null)}
                    >
                        {/* Clips Track */}
                        <div className="h-14 relative">
                            <div className="absolute text-xs text-gray-500 top-0 left-1 font-mono">비디오</div>
                            {clips.map(clip => {
                                const left = (clip.start / duration) * 100;
                                const width = ((clip.end - clip.start) / duration) * 100;
                                const element: TimelineElement = { type: 'clip', data: clip };
                                
                                const source = mediaSources.find(s => s.id === clip.sourceId);
                                const isLoadingThumbnails = source && typeof source.thumbnails === 'undefined';
                                const hasThumbnails = source && source.thumbnails && source.thumbnails.length > 0;
                                const clipDuration = clip.end - clip.start;
                                const sourceDuration = source?.duration || 0;

                                let thumbnailStripStyle = {};
                                let thumbnailsJsx: React.ReactNode = null;

                                if (hasThumbnails && source.thumbnails && clipDuration > 0) {
                                    const stripWidthPercent = (sourceDuration / clipDuration) * 100;
                                    const stripLeftPercent = -(clip.sourceStart / clipDuration) * 100;
                                    
                                    thumbnailStripStyle = {
                                        left: `${stripLeftPercent}%`,
                                        width: `${stripWidthPercent}%`,
                                    };

                                    const thumbWidthPercent = 100 / source.thumbnails.length;
                                    thumbnailsJsx = source.thumbnails.map((thumb, i) => (
                                        <div
                                            key={i}
                                            className="h-full bg-cover bg-center"
                                            style={{
                                                width: `${thumbWidthPercent}%`,
                                                backgroundImage: `url(${thumb})`,
                                            }}
                                        />
                                    ));
                                }
                                
                                return (
                                    <div
                                        key={clip.id}
                                        className={`absolute h-10 top-4 rounded-md flex items-center justify-start text-xs font-semibold transition-all px-2 truncate overflow-hidden ${isSelected(element) ? 'bg-indigo-500/70 ring-2 ring-indigo-300 z-20' : 'bg-indigo-700/70 hover:bg-indigo-600/70 z-10'} ${dragging?.clipId === clip.id ? 'cursor-grabbing shadow-lg' : 'cursor-grab'}`}
                                        style={{ left: `${left}%`, width: `${width}%`, minWidth: '1px' }}
                                        onClick={(e) => { e.stopPropagation(); onSelectElement(element); }}
                                        onMouseDown={(e) => handleDragStart(e, clip)}
                                    >
                                        {/* Background thumbnail strip */}
                                        {hasThumbnails && (
                                            <div className="absolute top-0 bottom-0 left-0 right-0 flex h-full pointer-events-none overflow-hidden">
                                                <div className="flex h-full" style={thumbnailStripStyle}>
                                                   {thumbnailsJsx}
                                                </div>
                                            </div>
                                        )}
                                        
                                        {/* Loading Indicator */}
                                        {isLoadingThumbnails && (
                                            <div className="absolute inset-0 flex items-center justify-center text-white/80 text-xs animate-pulse bg-gray-800/50">
                                                썸네일 생성 중...
                                            </div>
                                        )}

                                        <div 
                                            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-indigo-400/50 hover:bg-indigo-300 rounded-l-md resize-handle z-20"
                                            onMouseDown={(e) => handleResizeStart(e, clip, 'start')}
                                        />
                                        <span className="relative z-10 truncate pointer-events-none bg-black/50 px-2 py-1 rounded">{source?.name || '클립'}</span>
                                        <div
                                            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-indigo-400/50 hover:bg-indigo-300 rounded-r-md resize-handle z-20"
                                            onMouseDown={(e) => handleResizeStart(e, clip, 'end')}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                        
                        {/* Effects Track */}
                        <div className="h-14 relative">
                             <div className="absolute text-xs text-gray-500 top-0 left-1 font-mono">효과</div>
                             {effects.map(effect => {
                                const left = (effect.start / duration) * 100;
                                const width = ((effect.end - effect.start) / duration) * 100;
                                const element: TimelineElement = { type: 'effect', data: effect };
                                const isTransition = effect.type === 'generative_transition';
                                
                                let bgColor = '';
                                if (isTransition) {
                                    bgColor = isSelected(element) ? 'bg-yellow-500/80 ring-2 ring-yellow-300 z-10' : 'bg-yellow-700/80 hover:bg-yellow-600/80';
                                } else {
                                    bgColor = isSelected(element) ? 'bg-purple-500/80 ring-2 ring-purple-300 z-10' : 'bg-purple-700/80 hover:bg-purple-600/80';
                                }

                                return (
                                    <div
                                        key={effect.id}
                                        className={`absolute h-10 top-4 rounded-md flex items-center justify-center text-xs px-2 truncate cursor-pointer transition-all ${bgColor}`}
                                        style={{ left: `${left}%`, width: `${width}%`, minWidth: '1px' }}
                                        onClick={(e) => { e.stopPropagation(); onSelectElement(element); }}
                                    >
                                        {isTransition && <SparklesIcon className="h-4 w-4 mr-1 flex-shrink-0" />}
                                        <span className="truncate pointer-events-none">{effect.prompt || effectTypeToKorean[effect.type]}</span>
                                        {isTransition && effect.value === 'loading' && <span className="ml-2 animate-pulse">...</span>}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Text Track */}
                        <div className="h-14 relative">
                            <div className="absolute text-xs text-gray-500 top-0 left-1 font-mono">텍스트</div>
                            {textOverlays.map(text => {
                                const left = (text.start / duration) * 100;
                                const width = ((text.end - text.start) / duration) * 100;
                                const element: TimelineElement = { type: 'text', data: text };
                                return (
                                    <div
                                        key={text.id}
                                        className={`absolute h-10 top-4 rounded-md flex items-center justify-center text-xs px-2 truncate cursor-pointer transition-all ${isSelected(element) ? 'bg-teal-500 ring-2 ring-teal-300 z-10' : 'bg-teal-700 hover:bg-teal-600'}`}
                                        style={{ left: `${left}%`, width: `${width}%`, minWidth: '1px' }}
                                        onClick={(e) => { e.stopPropagation(); onSelectElement(element); }}
                                    >
                                        <span className="truncate pointer-events-none">{text.text}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Timeline;