import { DB_NAME, DB_VERSION, STORE_NAME } from './constants';

let dbInstance: IDBDatabase | null = null;

/**
 * IndexedDB 데이터베이스를 연다. 이미 열려 있으면 같은 인스턴스를 반환한다.
 */
export function openDb(): Promise<IDBDatabase> {
	if (dbInstance) {
		return Promise.resolve(dbInstance);
	}
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onerror = () => reject(request.error);
		request.onsuccess = () => {
			dbInstance = request.result;
			resolve(dbInstance);
		};
		request.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME);
			}
		};
	});
}
