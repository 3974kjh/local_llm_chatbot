import { browser } from '$app/environment';
import type { AutoBundle, BundleFormData, BundleStatus, ResultHistoryItem } from '$lib/types/auto';
import { generateId } from '$lib/utils/helpers';
import { telegramConfigsStore } from '$lib/stores/telegramConfigs.svelte';
import { getItem, setItem } from '$lib/db';

const STORAGE_KEY = 'jukimbot-auto-bundles';

class AutoStore {
	bundles = $state<AutoBundle[]>([]);
	selectedId = $state<string | null>(null);
	isCreating = $state(false);
	kakaoConnected = $state(false);
	kakaoHasTokens = $state(false);
	kakaoTokenExpired = $state(false);
	kakaoTestResult = $state<string | null>(null);
	kakaoTestLoading = $state(false);
	telegramConfigured = $state(false);
	telegramTestResult = $state<string | null>(null);
	telegramTestLoading = $state(false);

	private pollingTimer: ReturnType<typeof setInterval> | null = null;

	constructor() {
		if (browser) {
			this.loadFromStorage();
			this.checkKakaoStatus();
			this.checkTelegramStatus();
			this.startPolling();
		}
	}

	get selectedBundle(): AutoBundle | undefined {
		return this.bundles.find((b) => b.id === this.selectedId);
	}

	get hasActiveBundles(): boolean {
		return this.bundles.some((b) => b.isActive);
	}

	// --- Validation ---

	validateTitle(title: string, excludeId?: string): string | null {
		const trimmed = title.trim();
		if (!trimmed) return 'Title is required';
		if (this.bundles.some((b) => b.id !== excludeId && b.title === trimmed))
			return 'Title already exists';
		return null;
	}

	// --- CRUD ---

	createBundle(data: BundleFormData): string | null {
		const error = this.validateTitle(data.title);
		if (error) return null;

		const id = generateId();
		const bundle: AutoBundle = {
			id,
			title: data.title.trim(),
			autoTimeSetting: data.autoTimeSetting,
			autoApplyText: data.autoApplyText,
			autoReferUrl: data.autoReferUrl.filter((u) => u.trim()),
			enableWebSearch: data.enableWebSearch,
			telegramEnabled: data.telegramEnabled ?? false,
			telegramBotId: (data.telegramBotId ?? '').trim(),
			telegramChatId: (data.telegramChatId ?? '').trim(),
			isActive: false,
			isExecuting: false,
			lastExecutedAt: null,
			researchResultText: null,
			resultHistory: [],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		};

		this.bundles.push(bundle);
		this.selectedId = id;
		this.isCreating = false;
		this.persist();
		return id;
	}

	updateBundle(id: string, data: BundleFormData): boolean {
		const bundle = this.bundles.find((b) => b.id === id);
		if (!bundle) return false;

		const titleError = this.validateTitle(data.title, id);
		if (titleError) return false;

		bundle.title = data.title.trim();
		bundle.autoTimeSetting = data.autoTimeSetting;
		bundle.autoApplyText = data.autoApplyText;
		bundle.autoReferUrl = data.autoReferUrl.filter((u) => u.trim());
		bundle.enableWebSearch = data.enableWebSearch;
		bundle.telegramEnabled = data.telegramEnabled ?? false;
		bundle.telegramBotId = (data.telegramBotId ?? '').trim();
		bundle.telegramChatId = (data.telegramChatId ?? '').trim();
		bundle.updatedAt = new Date().toISOString();
		this.persist();
		return true;
	}

	async deleteBundle(id: string) {
		// Always tell server to stop, regardless of local isActive state
		await this.forceStopOnServer(id);

		const idx = this.bundles.findIndex((b) => b.id === id);
		if (idx !== -1) this.bundles.splice(idx, 1);
		if (this.selectedId === id) {
			this.selectedId = this.bundles[0]?.id ?? null;
		}
		this.persist();
	}

	private async forceStopOnServer(id: string) {
		try {
			await fetch('/api/auto/schedule', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'stop', id })
			});
		} catch {
			// best effort
		}
	}

	selectBundle(id: string) {
		this.selectedId = id;
		this.isCreating = false;
	}

	startCreating() {
		this.isCreating = true;
		this.selectedId = null;
	}

	// --- Execution ---

	async executeBundle(
		id: string,
		telegramOverrides?: {
			telegramEnabled?: boolean;
			telegramBotId?: string;
			telegramChatId?: string;
		}
	) {
		const bundle = this.bundles.find((b) => b.id === id);
		if (!bundle || bundle.isExecuting) return;

		bundle.isExecuting = true;

		try {
			const botId = telegramOverrides?.telegramBotId ?? bundle.telegramBotId;
			const chatId = telegramOverrides?.telegramChatId ?? bundle.telegramChatId;
			const bot = botId ? telegramConfigsStore.getBotById(botId) : undefined;
			const chat = chatId ? telegramConfigsStore.getChatById(chatId) : undefined;
			// Run Now 시 에디터 폼 상태 반영 (저장 안 해도 토글·봇·수신처 적용)
			const telegramEnabled =
				telegramOverrides?.telegramEnabled !== undefined
					? telegramOverrides.telegramEnabled
					: (bundle.telegramEnabled ?? false);
			const telegramBotToken = bot?.botToken ?? '';
			const telegramChatIdVal = chat?.chatId ?? '';
			if (telegramEnabled && (!telegramBotToken || !telegramChatIdVal)) {
				console.warn(
					'[Auto] Telegram enabled but token or chatId missing. botId=',
					botId,
					'chatId=',
					chatId,
					'resolvedBot=',
					!!bot,
					'resolvedChat=',
					!!chat
				);
			}
			const response = await fetch('/api/auto/execute', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: bundle.title,
					autoApplyText: bundle.autoApplyText,
					autoReferUrl: bundle.autoReferUrl,
					enableWebSearch: bundle.enableWebSearch,
					telegramEnabled,
					telegramBotToken,
					telegramChatId: telegramChatIdVal
				})
			});

			const result = await response.json();
			const now = new Date().toISOString();
			const text = result.researchResultText || result.error || 'No result';
			const success = !!result.success;
			const telegramNote =
				telegramEnabled && result.telegramSent === false
					? result.telegramError
						? `\n\n[Telegram 전송 실패] ${result.telegramError}`
						: '\n\n[Telegram] 전송되지 않음 (봇/수신처 선택 후 저장하거나 .env에 TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID 설정)'
					: '';

			bundle.researchResultText = text;
			bundle.lastExecutedAt = now;
			this.addToHistory(bundle, {
				executedAt: now,
				result: text + telegramNote,
				success
			});
		} catch (e) {
			const now = new Date().toISOString();
			const errorText = `Error: ${e instanceof Error ? e.message : 'Unknown'}`;
			bundle.researchResultText = errorText;
			bundle.lastExecutedAt = now;
			this.addToHistory(bundle, { executedAt: now, result: errorText, success: false });
		} finally {
			bundle.isExecuting = false;
			this.persist();
		}
	}

	async startBundle(id: string) {
		const bundle = this.bundles.find((b) => b.id === id);
		if (!bundle) return;

		try {
			const bot = bundle.telegramBotId ? telegramConfigsStore.getBotById(bundle.telegramBotId) : undefined;
			const chat = bundle.telegramChatId ? telegramConfigsStore.getChatById(bundle.telegramChatId) : undefined;
			const response = await fetch('/api/auto/schedule', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'start',
					id: bundle.id,
					title: bundle.title,
					autoTimeSetting: bundle.autoTimeSetting,
					autoApplyText: bundle.autoApplyText,
					autoReferUrl: bundle.autoReferUrl,
					enableWebSearch: bundle.enableWebSearch,
					telegramEnabled: bundle.telegramEnabled ?? false,
					telegramBotToken: bot?.botToken ?? '',
					telegramChatId: chat?.chatId ?? ''
				})
			});

			if (response.ok) {
				bundle.isActive = true;
				this.persist();
			}
		} catch {
			// failed to start
		}
	}

	async stopBundle(id: string) {
		try {
			const response = await fetch('/api/auto/schedule', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'stop', id })
			});

			if (response.ok) {
				const bundle = this.bundles.find((b) => b.id === id);
				if (bundle) {
					bundle.isActive = false;
					this.persist();
				}
			}
		} catch {
			// failed to stop
		}
	}

	// --- Polling for server-side execution results ---

	private startPolling() {
		if (this.pollingTimer) return;
		this.pollingTimer = setInterval(() => {
			if (this.hasActiveBundles) {
				this.pollStatuses();
			}
		}, 15000);
	}

	async pollStatuses() {
		try {
			const response = await fetch('/api/auto/status');
			if (!response.ok) return;
			const statuses: Record<string, BundleStatus> = await response.json();

			for (const [id, status] of Object.entries(statuses)) {
				const bundle = this.bundles.find((b) => b.id === id);
				if (bundle) {
					const hasNewResult =
						status.lastResult !== null &&
						status.lastExecutedAt !== null &&
						status.lastExecutedAt !== bundle.lastExecutedAt;

					if (hasNewResult) {
						this.addToHistory(bundle, {
							executedAt: status.lastExecutedAt!,
							result: status.lastResult!,
							success: true
						});
					}

					if (status.lastResult !== null) bundle.researchResultText = status.lastResult;
					if (status.lastExecutedAt !== null) bundle.lastExecutedAt = status.lastExecutedAt;
				}
			}
			this.persist();
		} catch {
			// polling failed silently
		}
	}

	// --- Kakao ---

	async checkKakaoStatus() {
		try {
			const response = await fetch('/api/auto/kakao/status');
			if (response.ok) {
				const data = await response.json();
				this.kakaoConnected = data.connected;
				this.kakaoHasTokens = data.hasTokens;
				this.kakaoTokenExpired = data.tokenExpired;
			}
		} catch {
			this.kakaoConnected = false;
			this.kakaoHasTokens = false;
			this.kakaoTokenExpired = false;
		}
	}

	async sendTestMessage() {
		this.kakaoTestLoading = true;
		this.kakaoTestResult = null;

		try {
			const response = await fetch('/api/auto/kakao/test', { method: 'POST' });
			const data = await response.json();

			if (data.success) {
				this.kakaoTestResult = 'Test message sent successfully!';
			} else {
				this.kakaoTestResult = `Failed: ${data.error}`;
			}
		} catch (e) {
			this.kakaoTestResult = `Error: ${e instanceof Error ? e.message : 'Unknown'}`;
		} finally {
			this.kakaoTestLoading = false;
		}
	}

	// --- Telegram ---

	async checkTelegramStatus() {
		try {
			const response = await fetch('/api/auto/telegram/status');
			if (response.ok) {
				const data = await response.json();
				this.telegramConfigured = data.configured === true;
			} else {
				this.telegramConfigured = false;
			}
		} catch {
			this.telegramConfigured = false;
		}
	}

	async sendTelegramTest(chatId: string, botToken: string) {
		this.telegramTestLoading = true;
		this.telegramTestResult = null;

		try {
			const response = await fetch('/api/auto/telegram/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ chatId: chatId.trim(), botToken: botToken.trim() })
			});
			const data = await response.json();

			if (data.success) {
				this.telegramTestResult = 'Telegram test message sent successfully!';
			} else {
				this.telegramTestResult = `Failed: ${data.error}`;
			}
		} catch (e) {
			this.telegramTestResult = `Error: ${e instanceof Error ? e.message : 'Unknown'}`;
		} finally {
			this.telegramTestLoading = false;
		}
	}

	private addToHistory(bundle: AutoBundle, item: ResultHistoryItem) {
		if (!bundle.resultHistory) bundle.resultHistory = [];
		const isDuplicate = bundle.resultHistory.some(
			(h) => h.executedAt === item.executedAt && h.result === item.result
		);
		if (!isDuplicate) {
			bundle.resultHistory.unshift(item);
			if (bundle.resultHistory.length > 50) {
				bundle.resultHistory = bundle.resultHistory.slice(0, 50);
			}
		}
	}

	// --- Persistence ---

	private async loadFromStorage() {
		if (!browser) return;
		try {
			let saved = await getItem(STORAGE_KEY);
			if (saved == null || saved === '') {
				const fromLs = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
				if (fromLs) {
					saved = fromLs;
					await setItem(STORAGE_KEY, fromLs);
					try {
						localStorage.removeItem(STORAGE_KEY);
					} catch {
						// ignore
					}
				}
			}
			if (saved) {
				const parsed = JSON.parse(saved);
				this.bundles = parsed.map((b: Record<string, unknown>) => ({
					...b,
					enableWebSearch: b.enableWebSearch ?? false,
					telegramEnabled: b.telegramEnabled ?? false,
					telegramBotId: String(b.telegramBotId ?? '').trim(),
					telegramChatId: String(b.telegramChatId ?? '').trim(),
					resultHistory: Array.isArray(b.resultHistory) ? b.resultHistory : [],
					isActive: false,
					isExecuting: false
				}));
				if (this.bundles.length > 0) {
					this.selectedId = this.bundles[0].id;
				}
			}
		} catch {
			// ignore
		}
	}

	private persist() {
		if (!browser) return;
		setItem(STORAGE_KEY, JSON.stringify(this.bundles)).catch(() => {
			// ignore
		});
	}
}

export const autoStore = new AutoStore();
