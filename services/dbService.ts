import { AnalysisResult, StoryboardScene } from '../types';

export interface HistoryRecord {
    id: string; // timestamp generated ID
    createdAt: number;
    url: string; // product url or prompt
    analysisResult: AnalysisResult;
    scenes: StoryboardScene[];
}

const DB_NAME = 'TKHistoryDB';
const STORE_NAME = 'historyRecords';

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = (e.target as any).result as IDBDatabase;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function saveHistory(record: HistoryRecord): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(record);
        tx.oncomplete = () => {
            // Keep only latest 10
            const tx2 = db.transaction(STORE_NAME, 'readwrite');
            const store2 = tx2.objectStore(STORE_NAME);
            const req = store2.getAll();
            req.onsuccess = () => {
                const results = (req.result as HistoryRecord[]) || [];
                // Sort by createdAt desc
                results.sort((a, b) => b.createdAt - a.createdAt);
                if (results.length > 10) {
                    for (let i = 10; i < results.length; i++) {
                        store2.delete(results[i].id);
                    }
                }
            };
            tx2.oncomplete = () => resolve();
            tx2.onerror = () => reject(tx2.error);
        };
        tx.onerror = () => reject(tx.error);
    });
}

export async function getHistory(): Promise<HistoryRecord[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
             const results = (req.result as HistoryRecord[]) || [];
             results.sort((a, b) => b.createdAt - a.createdAt);
             resolve(results);
        };
        req.onerror = () => reject(req.error);
    });
}

export async function clearHistory(): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject();
    });
}
