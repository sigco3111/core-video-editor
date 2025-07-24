import type { MediaSource, Clip, TextOverlay, Effect } from '../types';

type StorableMediaSource = Omit<MediaSource, 'url'>;

interface EditorState {
  clips: Clip[];
  textOverlays: TextOverlay[];
  effects: Effect[];
}

interface ProjectState {
    mediaSources: StorableMediaSource[];
    editorState: EditorState;
    projectDuration: number;
}

const DB_NAME = 'CoreVideoEditorDB';
const DB_VERSION = 1;
const STORE_NAME = 'projects';
const PROJECT_KEY = 'currentProject';

let db: IDBDatabase | null = null;

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        if (db) {
            return resolve(db);
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error("IndexedDB error:", request.error);
            reject("Error opening IndexedDB.");
        };

        request.onsuccess = (event) => {
            db = (event.target as IDBOpenDBRequest).result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const tempDb = (event.target as IDBOpenDBRequest).result;
            if (!tempDb.objectStoreNames.contains(STORE_NAME)) {
                tempDb.createObjectStore(STORE_NAME);
            }
        };
    });
};

export const saveProject = async (projectState: ProjectState): Promise<void> => {
    try {
        const dbInstance = await openDB();
        const transaction = dbInstance.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.put(projectState, PROJECT_KEY);
        
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });

    } catch (error) {
        console.error("Failed to save project to IndexedDB:", error);
    }
};

export const loadProject = async (): Promise<ProjectState | null> => {
    try {
        const dbInstance = await openDB();
        const transaction = dbInstance.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(PROJECT_KEY);

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                resolve(request.result ? (request.result as ProjectState) : null);
            };
            request.onerror = () => {
                reject(request.error);
            };
        });
    } catch (error) {
        console.error("Failed to load project from IndexedDB:", error);
        return null;
    }
};