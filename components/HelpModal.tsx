import React from 'react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-70 z-[100] flex items-center justify-center"
      aria-modal="true"
      role="dialog"
      onClick={onClose}
    >
      <div 
        className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl m-4 flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-2xl font-bold text-indigo-400 mb-4 flex-shrink-0 border-b border-gray-700 pb-2">도움말</h3>
        <div className="text-gray-300 space-y-4 overflow-y-auto pr-2">
            <div>
                <h4 className="text-lg font-semibold text-indigo-300 mb-2">1. API 키 설정</h4>
                <p className="text-sm">
                    AI 기능을 사용하려면 Gemini API 키가 필요합니다. 우측 상단의 입력 필드에 키를 붙여넣고 '저장'을 누르세요. 상태 표시등이 녹색으로 바뀌면 정상적으로 연결된 것입니다.
                </p>
            </div>
            <div>
                <h4 className="text-lg font-semibold text-indigo-300 mb-2">2. 미디어 추가 및 편집</h4>
                <p className="text-sm">
                   좌측 '미디어 라이브러리'에 비디오 파일을 드래그 앤 드롭하거나, 패널을 클릭하여 파일을 업로드하세요. 추가된 비디오를 하단 타임라인으로 드래그하여 편집을 시작할 수 있습니다.
                </p>
            </div>
             <div>
                <h4 className="text-lg font-semibold text-indigo-300 mb-2">3. 프로젝트 길이 늘리기 (30초 이상)</h4>
                 <ul className="list-disc list-inside space-y-2 text-sm">
                    <li>
                        <strong className="text-indigo-400">자동 확장:</strong> 미디어 파일을 타임라인의 맨 끝으로 드래그하면, 비디오 길이에 맞춰 타임라인이 자동으로 늘어납니다.
                    </li>
                    <li>
                        <strong className="text-indigo-400">수동 설정:</strong> 플레이어의 시간 표시(예: <code className="bg-gray-700 px-1 rounded">0.00s / 30.00s</code>)에서 전체 길이 숫자 부분을 클릭하세요. 원하는 최소 프로젝트 길이를 직접 입력할 수 있습니다.
                    </li>
                </ul>
            </div>
             <div>
                <h4 className="text-lg font-semibold text-indigo-300 mb-2">4. AI 기능 활용</h4>
                <p className="text-sm mb-2">
                   타임라인에서 클립을 선택하면 우측 '속성' 패널에서 AI 기능을 사용할 수 있습니다.
                </p>
                 <ul className="list-disc list-inside space-y-2 text-sm">
                    <li><strong className="text-teal-400">AI 자동 자막:</strong> 비디오의 음성을 분석하여 자동으로 자막을 생성합니다.</li>
                    <li><strong className="text-teal-400">AI 스마트 컷:</strong> 장면이 전환되는 지점을 감지하여 클립을 자동으로 분할합니다.</li>
                    <li><strong className="text-purple-400">AI 효과/전환:</strong> "흑백으로 만들기" 같은 간단한 문장으로 필터, 이미지 추가, 또는 클립 간의 독창적인 전환 효과를 만들 수 있습니다.</li>
                </ul>
            </div>
            <div>
                <h4 className="text-lg font-semibold text-indigo-300 mb-2">5. 내보내기</h4>
                <p className="text-sm">
                    편집이 완료되면 우측 상단의 '비디오 내보내기' 버튼을 클릭하여 결과물을 MP4 파일로 다운로드하세요.
                </p>
            </div>
        </div>
        <div className="mt-6 flex justify-end space-x-3 flex-shrink-0 border-t border-gray-700 pt-4">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md transition-colors"
            aria-label="닫기"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};

export default HelpModal;
