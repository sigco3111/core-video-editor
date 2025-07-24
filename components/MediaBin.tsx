
import React, { useRef } from 'react';
import { UploadIcon, TrashIcon } from '../constants';
import type { MediaSource } from '../types';

interface MediaBinProps {
  onAddVideo: (file: File) => void;
  onDeleteMediaSource: (id: string) => void;
  mediaSources: MediaSource[];
}

const MediaBin: React.FC<MediaBinProps> = ({ onAddVideo, mediaSources, onDeleteMediaSource }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      for (const file of Array.from(files)) {
        if (file.type.startsWith('video/')) {
          onAddVideo(file);
        }
      }
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const files = event.dataTransfer.files;
    if (files) {
      for (const file of Array.from(files)) {
        if (file.type.startsWith('video/')) {
          onAddVideo(file);
        }
      }
    }
  };
  
  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, source: MediaSource) => {
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'media',
      sourceId: source.id,
      duration: source.duration,
    }));
  };

  return (
    <div className="bg-gray-800 p-4 rounded-lg h-full flex flex-col">
        <h2 className="text-lg font-bold text-indigo-400 mb-4 border-b border-gray-700 pb-2">미디어 라이브러리</h2>
        <div 
            className="flex-grow overflow-y-auto"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
        >
            {mediaSources.length === 0 ? (
                 <div 
                    className="h-full flex flex-col justify-center items-center cursor-pointer border-2 border-dashed border-gray-600 hover:border-indigo-500 transition-colors rounded-md"
                    onClick={openFilePicker}
                >
                    <div className="text-center text-gray-400">
                        <UploadIcon />
                        <p className="font-semibold">클릭하여 업로드하거나 비디오를 드래그 앤 드롭하세요</p>
                        <p className="text-xs mt-1">여러 비디오 파일을 추가할 수 있습니다</p>
                    </div>
                </div>
            ) : (
                <div className="space-y-2">
                    {mediaSources.map(source => (
                        <div 
                            key={source.id} 
                            className="bg-gray-700 p-2 rounded-md flex items-center justify-between cursor-grab"
                            draggable
                            onDragStart={(e) => handleDragStart(e, source)}
                        >
                            <span className="text-sm font-medium text-gray-200 truncate" title={source.name}>{source.name}</span>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteMediaSource(source.id);
                                }}
                                className="ml-2 p-1 text-gray-400 hover:text-red-500"
                                title="미디어 소스 삭제"
                            >
                                <TrashIcon />
                            </button>
                        </div>
                    ))}
                     <button
                        onClick={openFilePicker}
                        className="mt-4 w-full flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md transition-colors text-sm"
                      >
                        <UploadIcon />
                        비디오 추가
                      </button>
                </div>
            )}
        </div>
        <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept="video/*"
            multiple
        />
    </div>
  );
};

export default MediaBin;
