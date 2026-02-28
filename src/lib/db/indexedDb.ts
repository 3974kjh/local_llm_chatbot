import { openDb } from './openDb';
import { STORE_NAME } from './constants';

/**
 * 키에 해당하는 값을 가져온다. 없으면 null.
 */
export async function getItem(key: string): Promise<string | null> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readonly');
		const store = tx.objectStore(STORE_NAME);
		const request = store.get(key);
		request.onerror = () => reject(request.error);
		request.onsuccess = () => {
			const value = request.result;
			resolve(value === undefined ? null : String(value));
		};
	});
}

/**
 * 키-값을 저장한다. 값은 문자열로 저장된다.
 */
export async function setItem(key: string, value: string): Promise<void> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		const store = tx.objectStore(STORE_NAME);
		const request = store.put(value, key);
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve();
	});
}

/**
 * 키에 해당하는 항목을 삭제한다.
 */
export async function removeItem(key: string): Promise<void> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		const store = tx.objectStore(STORE_NAME);
		const request = store.delete(key);
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve();
	});
}
