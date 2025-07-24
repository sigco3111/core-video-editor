import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";

// Module-level state
let ai: GoogleGenAI | null = null;
let currentApiKey: string | null = null;

const effectModel = 'gemini-2.5-flash';
const imageModel = 'imagen-3.0-generate-002';


const initializeAi = (apiKey: string) => {
    if (apiKey && apiKey.trim() !== '') {
        try {
            ai = new GoogleGenAI({ apiKey });
            currentApiKey = apiKey;
            console.log("Gemini AI 서비스가 초기화되었습니다.");
        } catch(e) {
            console.error("GoogleGenAI 초기화 실패. API 키를 확인하세요.", e);
            ai = null;
            currentApiKey = null;
        }
    } else {
        ai = null;
        currentApiKey = null;
        console.log("Gemini AI 서비스가 비활성화되었습니다.");
    }
};

export const getApiKey = (): string | null => {
    return currentApiKey;
};

export const isApiActive = (): boolean => {
    return !!ai && !!currentApiKey;
};

export const updateApiKey = (newKey: string): boolean => {
    const trimmedKey = newKey.trim();
    if (trimmedKey) {
        localStorage.setItem('gemini_api_key', trimmedKey);
        initializeAi(trimmedKey);
    } else {
        localStorage.removeItem('gemini_api_key');
        initializeAi('');
    }
    return isApiActive();
};

// Initialize on load
const envApiKey = process.env.API_KEY;
const storedApiKey = typeof window !== 'undefined' ? localStorage.getItem('gemini_api_key') : null;
initializeAi(envApiKey || storedApiKey || '');


const checkApiAvailability = () => {
    if (!isApiActive()) {
        throw new Error("Gemini API 키가 설정되지 않았습니다. 상단의 입력 필드에 유효한 키를 입력하고 저장해주세요.");
    }
    return ai!; 
};


const readFileAsBase64 = (file: File): Promise<{mimeType: string, data: string}> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            const data = result.substring(result.indexOf(',') + 1);
            resolve({ mimeType: file.type, data });
        };
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
};

export interface EffectSuggestion {
    type: 'filter' | 'generate_image';
    value: string;
    imagePrompt?: string;
}

export const getEffectFromPrompt = async (prompt: string): Promise<EffectSuggestion> => {
    const ai = checkApiAvailability();
    try {
        const systemInstruction = `You are a video effect assistant. A user will provide a prompt describing a visual effect. Your task is to interpret the prompt and respond in a specific JSON format.

The JSON output must have two properties: "type" and "value".

1.  **"type"**: This can be one of two strings:
    *   "filter": If the user's prompt can be represented by a standard visual effect (like black and white, sepia, blur, vintage, etc.).
    *   "generate_image": If the user's prompt asks to create and insert a new visual, like "add a shot of a sunset" or "insert a logo of a cat".

2.  **"value"**: The value depends on the "type".
    *   If type is "filter", "value" must be one of the following predefined strings: 'grayscale(100%)', 'sepia(100%)', 'blur(8px)', 'saturate(2)', 'contrast(150%)', 'brightness(1.2)'. Choose the one that best matches the user's prompt.
    *   If type is "generate_image", "value" must be a concise, descriptive English prompt suitable for an AI image generation model, based on the user's request. For example, if the user says "add a beautiful sunset over the ocean", the value should be "A beautiful, vibrant sunset over a calm ocean.".

Do not add any extra explanations. Only return the JSON object.`;

        const response: GenerateContentResponse = await ai.models.generateContent({
            model: effectModel,
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        type: { type: Type.STRING },
                        value: { type: Type.STRING },
                    },
                    required: ["type", "value"],
                }
            }
        });

        const jsonText = response.text.trim();
        const result = JSON.parse(jsonText);

        if (result.type === 'generate_image') {
            return { type: 'generate_image', value: 'loading', imagePrompt: result.value };
        } else {
            return { type: 'filter', value: result.value };
        }

    } catch (error) {
        console.error("Error getting effect from prompt:", error);
        throw new Error("프롬프트에서 효과를 생성하지 못했습니다. API 키와 프롬프트를 확인하세요.");
    }
};

export const generateImage = async (prompt: string): Promise<string> => {
    const ai = checkApiAvailability();
    try {
        const response = await ai.models.generateImages({
            model: imageModel,
            prompt: prompt,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/jpeg',
                aspectRatio: '16:9',
            },
        });

        const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
        return `data:image/jpeg;base64,${base64ImageBytes}`;
    } catch (error) {
        console.error("Error generating image:", error);
        throw new Error("이미지를 생성하지 못했습니다. API 키와 프롬프트를 확인하세요.");
    }
};

export const getAudioTranscription = async (videoFile: File): Promise<{start: number, end: number, text: string}[]> => {
    const ai = checkApiAvailability();
    try {
        const { mimeType, data } = await readFileAsBase64(videoFile);
        const videoPart = { inlineData: { mimeType, data } };
        const promptPart = { text: "이 비디오의 오디오를 분석하여 타임스탬프가 포함된 자막을 생성해주세요. 각 자막은 문장이나 의미 있는 구문 단위로 나눠주세요." };

        const response = await ai.models.generateContent({
            model: effectModel,
            contents: { parts: [promptPart, videoPart] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            start: { type: Type.NUMBER, description: "자막 시작 시간 (초)" },
                            end: { type: Type.NUMBER, description: "자막 종료 시간 (초)" },
                            text: { type: Type.STRING, description: "자막 내용" }
                        },
                        required: ["start", "end", "text"]
                    }
                }
            }
        });
        
        return JSON.parse(response.text.trim());

    } catch(error) {
        console.error("Error transcribing audio:", error);
        throw new Error("오디오 자막을 생성하지 못했습니다. API 키를 확인하세요.");
    }
};

export const getSceneCuts = async (videoFile: File): Promise<number[]> => {
    const ai = checkApiAvailability();
    try {
        const { mimeType, data } = await readFileAsBase64(videoFile);
        const videoPart = { inlineData: { mimeType, data } };
        const promptPart = { text: "이 비디오를 분석하여 주요 장면이 전환되는 지점의 타임스탬프를 초 단위로 찾아주세요. 카메라의 미세한 움직임이 아닌, 명확한 컷 전환이나 장면 변경만 포함해주세요." };

        const response = await ai.models.generateContent({
            model: effectModel,
            contents: { parts: [promptPart, videoPart] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    description: "장면 전환이 일어나는 시간(초)의 배열",
                    items: { type: Type.NUMBER }
                }
            }
        });
        
        return JSON.parse(response.text.trim());

    } catch(error) {
        console.error("Error detecting scene cuts:", error);
        throw new Error("장면 전환을 감지하지 못했습니다. API 키를 확인하세요.");
    }
};

export const generateTransitionImages = async (prompt: string): Promise<string[]> => {
    const ai = checkApiAvailability();
    try {
        const NUM_TRANSITION_IMAGES = 8;
        const response = await ai.models.generateImages({
            model: imageModel,
            prompt: `다음 전환 효과를 표현하는 ${NUM_TRANSITION_IMAGES}개의 연속적인 이미지를 생성해줘: ${prompt}. 이미지는 점진적으로 변해야 해.`,
            config: {
                numberOfImages: NUM_TRANSITION_IMAGES,
                outputMimeType: 'image/jpeg',
                aspectRatio: '16:9',
            },
        });

        return response.generatedImages.map(img => `data:image/jpeg;base64,${img.image.imageBytes}`);
    } catch (error) {
        console.error("Error generating transition images:", error);
        throw new Error("전환 효과 이미지를 생성하지 못했습니다. API 키와 프롬프트를 확인하세요.");
    }
};
