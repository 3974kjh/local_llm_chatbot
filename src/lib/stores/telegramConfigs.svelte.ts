import { browser } from '$app/environment';
import type { TelegramBotConfig, TelegramChatConfig } from '$lib/types/auto';
import { generateId } from '$lib/utils/helpers';

const BOTS_KEY = 'jukimbot-telegram-bots';
const CHATS_KEY = 'jukimbot-telegram-chats';
const OLD_CONFIGS_KEY = 'jukimbot-telegram-configs';

class TelegramConfigsStore {
	bots = $state<TelegramBotConfig[]>([]);
	chats = $state<TelegramChatConfig[]>([]);

	constructor() {
		if (browser) {
			this.loadFromStorage();
		}
	}

	getBotById(id: string): TelegramBotConfig | undefined {
		return this.bots.find((b) => b.id === id);
	}

	getChatById(id: string): TelegramChatConfig | undefined {
		return this.chats.find((c) => c.id === id);
	}

	// --- Bots ---
	addBot(name: string, botToken: string): string | null {
		const trimmedName = name.trim();
		if (!trimmedName) return null;
		if (this.bots.some((b) => b.name === trimmedName)) return null;
		const id = generateId();
		this.bots = [...this.bots, { id, name: trimmedName, botToken: botToken.trim() }];
		this.persistBots();
		return id;
	}

	updateBot(id: string, data: { name?: string; botToken?: string }): boolean {
		const idx = this.bots.findIndex((b) => b.id === id);
		if (idx === -1) return false;
		const name = (data.name ?? this.bots[idx].name).trim();
		if (!name) return false;
		if (this.bots.some((b) => b.id !== id && b.name === name)) return false;
		this.bots = this.bots.map((b) =>
			b.id === id
				? {
						...b,
						name,
						botToken: data.botToken !== undefined ? data.botToken.trim() : b.botToken
					}
				: b
		);
		this.persistBots();
		return true;
	}

	removeBot(id: string): void {
		this.bots = this.bots.filter((b) => b.id !== id);
		this.persistBots();
	}

	// --- Chats ---
	addChat(name: string, chatId: string): string | null {
		const trimmedName = name.trim();
		if (!trimmedName) return null;
		if (this.chats.some((c) => c.name === trimmedName)) return null;
		const id = generateId();
		this.chats = [...this.chats, { id, name: trimmedName, chatId: chatId.trim() }];
		this.persistChats();
		return id;
	}

	updateChat(id: string, data: { name?: string; chatId?: string }): boolean {
		const idx = this.chats.findIndex((c) => c.id === id);
		if (idx === -1) return false;
		const name = (data.name ?? this.chats[idx].name).trim();
		if (!name) return false;
		if (this.chats.some((c) => c.id !== id && c.name === name)) return false;
		this.chats = this.chats.map((c) =>
			c.id === id
				? {
						...c,
						name,
						chatId: data.chatId !== undefined ? data.chatId.trim() : c.chatId
					}
				: c
		);
		this.persistChats();
		return true;
	}

	removeChat(id: string): void {
		this.chats = this.chats.filter((c) => c.id !== id);
		this.persistChats();
	}

	private loadFromStorage(): void {
		try {
			const savedBots = localStorage.getItem(BOTS_KEY);
			const savedChats = localStorage.getItem(CHATS_KEY);
			const oldConfigs = localStorage.getItem(OLD_CONFIGS_KEY);

			if (savedBots) {
				const parsed = JSON.parse(savedBots);
				this.bots = Array.isArray(parsed) ? parsed : [];
			} else {
				this.bots = [];
			}

			if (savedChats) {
				const parsed = JSON.parse(savedChats);
				this.chats = Array.isArray(parsed) ? parsed : [];
			} else if (oldConfigs) {
				try {
					const old = JSON.parse(oldConfigs) as Array<{ name: string; botToken?: string; chatId?: string }>;
					if (Array.isArray(old) && old.length > 0) {
						for (const c of old) {
							if (!savedBots && c.botToken) this.bots = [...this.bots, { id: generateId(), name: c.name, botToken: c.botToken }];
							if (c.chatId) this.chats = [...this.chats, { id: generateId(), name: c.name, chatId: c.chatId }];
						}
						this.persistBots();
						this.persistChats();
						localStorage.removeItem(OLD_CONFIGS_KEY);
					}
				} catch {
					// ignore
				}
			}
			if (!savedChats && !oldConfigs) {
				this.chats = [];
			}
		} catch {
			this.bots = [];
			this.chats = [];
		}
	}

	private persistBots(): void {
		if (browser) {
			try {
				localStorage.setItem(BOTS_KEY, JSON.stringify(this.bots));
			} catch {
				// ignore
			}
		}
	}

	private persistChats(): void {
		if (browser) {
			try {
				localStorage.setItem(CHATS_KEY, JSON.stringify(this.chats));
			} catch {
				// ignore
			}
		}
	}
}

export const telegramConfigsStore = new TelegramConfigsStore();
