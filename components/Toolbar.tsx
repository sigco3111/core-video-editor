import React from 'react';

interface ToolbarProps {
  onAddText: () => void;
  onSplitClip: () => void;
  canSplit: boolean;
  isTimelineActive: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const Toolbar: React.FC<ToolbarProps> = ({ 
    onAddText, 
    onSplitClip, 
    canSplit, 
    isTimelineActive,
    onUndo,
    onRedo,
    canUndo,
    canRedo 
}) => {
  return (
    <div className="bg-gray-800 p-2 rounded-lg flex items-center space-x-2">
      <button
        onClick={onUndo}
        disabled={!canUndo}
        className="p-2 bg-gray-700 hover:bg-indigo-600 disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed text-white rounded-md transition-colors text-xl"
        title="실행 취소 (Ctrl+Z)"
        aria-label="실행 취소"
      >
        ↩️
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        className="p-2 bg-gray-700 hover:bg-indigo-600 disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed text-white rounded-md transition-colors text-xl"
        title="다시 실행 (Ctrl+Y)"
        aria-label="다시 실행"
      >
        ↪️
      </button>

      <div className="h-6 w-px bg-gray-700"></div>

      <button
        onClick={onSplitClip}
        disabled={!canSplit}
        className="flex items-center bg-gray-700 hover:bg-indigo-600 disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed text-white text-sm font-semibold py-2 px-3 rounded-md transition-colors"
      >
        <span className="mr-2 text-xl" aria-hidden="true">✂️</span>
        분할
      </button>
      <button
        onClick={onAddText}
        disabled={!isTimelineActive}
        className="flex items-center bg-gray-700 hover:bg-indigo-600 disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed text-white text-sm font-semibold py-2 px-3 rounded-md transition-colors"
      >
        <span className="mr-2 text-xl" aria-hidden="true">✏️</span>
        텍스트 추가
      </button>
    </div>
  );
};

export default Toolbar;