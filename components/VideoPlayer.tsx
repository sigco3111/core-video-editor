
import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { TextOverlay, Effect } from '../types';
import { PlayIcon, PauseIcon, SparklesIcon } from '../constants';

interface VideoPlayerProps {
  videoUrl: string | null;
  playbackTime: number;
  playbackRate: number;
  isPlaying: boolean;
  timelineDuration: number;
  timelineCurrentTime: number;
  onTimeUpdate: (time: number) => void;
  onPlayPause: (forceState?: boolean) => void;
  onSeek: (time: number) => void;
  textOverlays: TextOverlay[];
  effects: Effect[];
  onSetProjectDuration: (duration: number) => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  videoUrl,
  playbackTime,
  playbackRate,
  isPlaying,
  timelineDuration,
  timelineCurrentTime,
  onTimeUpdate,
  onPlayPause,
  onSeek,
  textOverlays,
  effects,
  onSetProjectDuration
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isEditingDuration, setIsEditingDuration] = useState(false);
  const [durationInputValue, setDurationInputValue] = useState(timelineDuration.toFixed(2));

  useEffect(() => {
    if (!isEditingDuration) {
        setDurationInputValue(timelineDuration.toFixed(2));
    }
  }, [timelineDuration, isEditingDuration]);

  // This single, unified effect handles all interactions with the video element
  // to prevent race conditions between play/pause and seeking.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // 1. Sync playback rate. This is safe to do anytime.
    if (video.playbackRate !== playbackRate) {
      video.playbackRate = playbackRate;
    }

    // 2. Handle the primary "intent": playing or pausing.
    // If the intent is to PLAY:
    if (isPlaying) {
      // Only issue a play command if the video is actually paused.
      if (video.paused) {
        video.play().catch(e => console.error("Video play failed:", e));
      }
      // CRITICAL: When the intent is to play, we do NOT sync time.
      // The video element is the source of truth for time during playback.
      return; 
    }
    
    // If the intent is to PAUSE:
    if (!isPlaying) {
       // Only issue a pause command if the video is not already paused.
      if (!video.paused) {
        video.pause();
      }
      
      // We can only safely seek the video's time when it is actually paused.
      // This prevents seeking while the video is still trying to play.
      if (video.paused) {
        if (Math.abs(video.currentTime - playbackTime) > 0.05) {
          video.currentTime = playbackTime;
        }
      }
    }
  }, [isPlaying, playbackTime, playbackRate, videoUrl]);


  const activeFilter = effects.find(
    (e) => e.type === 'filter' && timelineCurrentTime >= e.start && timelineCurrentTime <= e.end
  );

  const activeImageOverlay = effects.find(
    (e) => e.type === 'image_overlay' && timelineCurrentTime >= e.start && timelineCurrentTime <= e.end
  );
  
  const activeTransition = effects.find(
    (e) => e.type === 'generative_transition' && timelineCurrentTime >= e.start && timelineCurrentTime <= e.end
  );

  const activeTextOverlays = textOverlays.filter(
    (t) => timelineCurrentTime >= t.start && timelineCurrentTime <= t.end
  );
  
  let transitionImageSrc: string | null = null;
  if (activeTransition?.value === 'done' && activeTransition.images && activeTransition.images.length > 0) {
      const progress = (timelineCurrentTime - activeTransition.start) / (activeTransition.end - activeTransition.start);
      const imageIndex = Math.floor(progress * activeTransition.images.length);
      const safeIndex = Math.min(imageIndex, activeTransition.images.length - 1);
      transitionImageSrc = activeTransition.images[safeIndex];
  }

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (video && isPlaying && !video.paused) {
        onTimeUpdate(video.currentTime);
    }
  }, [isPlaying, onTimeUpdate]);

  const handleDurationChange = () => {
      const newDuration = parseFloat(durationInputValue);
      if (!isNaN(newDuration) && newDuration > 0) {
          onSetProjectDuration(newDuration);
      } else {
          setDurationInputValue(timelineDuration.toFixed(2));
      }
      setIsEditingDuration(false);
  };

  const handleDurationKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
          handleDurationChange();
      } else if (e.key === 'Escape') {
          setIsEditingDuration(false);
          setDurationInputValue(timelineDuration.toFixed(2));
      }
  };

  return (
    <div className="bg-gray-800 p-4 rounded-lg h-full flex flex-col">
      <div className="relative w-full flex-grow bg-black rounded-md overflow-hidden flex items-center justify-center">
        {videoUrl ? (
          <video
            key={videoUrl}
            ref={videoRef}
            src={videoUrl}
            className="max-w-full max-h-full object-contain"
            style={{ filter: activeFilter ? activeFilter.value : 'none' }}
            muted
            onTimeUpdate={handleTimeUpdate}
            // Add onLoadedData to ensure the first frame is correct after src change
            onLoadedData={() => {
                const video = videoRef.current;
                if (video && !isPlaying && Math.abs(video.currentTime - playbackTime) > 0.05) {
                    video.currentTime = playbackTime;
                }
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500">
            시작하려면 미디어 라이브러리에 비디오를 추가하고 타임라인으로 드래그하세요.
          </div>
        )}
        
        {activeTransition && (
           <div className="absolute inset-0 flex items-center justify-center bg-black pointer-events-none">
              {activeTransition.value === 'loading' ? (
                <div className="text-white text-xl animate-pulse flex items-center">
                  <SparklesIcon className="h-8 w-8 mr-3 text-yellow-400"/> AI 전환 효과 생성 중...
                </div>
              ) : transitionImageSrc && (
                <img src={transitionImageSrc} alt={activeTransition.prompt} className="max-w-full max-h-full object-contain" />
              )}
           </div>
        )}
        
        {activeImageOverlay && timelineCurrentTime >= activeImageOverlay.start && timelineCurrentTime <= activeImageOverlay.end && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 pointer-events-none">
                {activeImageOverlay.value === 'loading' ? 
                 <div className="text-white text-xl animate-pulse">이미지 생성 중...</div> :
                 <img src={activeImageOverlay.value} alt={activeImageOverlay.prompt} className="max-w-full max-h-full object-contain"/>
                }
            </div>
        )}

        {activeTextOverlays.map((text) => (
          <div
            key={text.id}
            className="absolute p-2 select-none pointer-events-none"
            style={{
              ...text.style,
              transform: 'translateX(-50%)',
              textShadow: '2px 2px 4px rgba(0,0,0,0.7)',
            }}
          >
            {text.text}
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center space-x-4">
        <button
          onClick={() => onPlayPause()}
          disabled={!videoUrl}
          className="p-2 bg-indigo-600 rounded-full text-white hover:bg-indigo-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors"
          aria-label={isPlaying ? '일시정지' : '재생'}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div className="text-sm font-mono text-gray-300 flex items-center">
            <span>{timelineCurrentTime.toFixed(2)}s /&nbsp;</span>
            {isEditingDuration ? (
                <input
                    type="text"
                    value={durationInputValue}
                    onChange={(e) => setDurationInputValue(e.target.value)}
                    onBlur={handleDurationChange}
                    onKeyDown={handleDurationKeyDown}
                    className="bg-gray-900 text-white w-20 p-0 m-0 text-sm font-mono outline-none border-b-2 border-indigo-500"
                    autoFocus
                />
            ) : (
                <span 
                    onClick={() => setIsEditingDuration(true)} 
                    className="cursor-pointer hover:text-indigo-400 transition-colors"
                    title="프로젝트 길이 수정"
                >
                    {timelineDuration.toFixed(2)}s
                </span>
            )}
        </div>
        <input
          type="range"
          min="0"
          max={timelineDuration}
          step="0.01"
          value={timelineCurrentTime}
          onMouseDown={() => onPlayPause(false)}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          disabled={timelineDuration === 0}
          aria-label="비디오 탐색 막대"
        />
      </div>
    </div>
  );
};

export default VideoPlayer;