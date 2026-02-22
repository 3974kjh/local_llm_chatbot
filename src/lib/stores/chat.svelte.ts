import { browser } from '$app/environment';
import type { Conversation, Message } from '$lib/types';
import { streamChat } from '$lib/services/api';
import { generateId, getCurrentDateContext } from '$lib/utils/helpers';

const STORAGE_KEY = 'jukimbot-chat-conversations';

class ChatStore {
	conversations = $state<Conversation[]>([]);
	activeId = $state<string | null>(null);
	isGenerating = $state(false);
	searchEnabled = $state(true);
	sidebarOpen = $state(true);

	private abortController: AbortController | null = null;

	constructor() {
		if (browser) {
			this.loadFromStorage();
		}
	}

	get activeConversation(): Conversation | undefined {
		return this.conversations.find((c) => c.id === this.activeId);
	}

	get activeMessages(): Message[] {
		return this.activeConversation?.messages ?? [];
	}

	get sortedConversations(): Conversation[] {
		return [...this.conversations].sort(
			(a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
		);
	}

	createConversation(): string {
		const id = generateId();
		const conv: Conversation = {
			id,
			title: 'New Chat',
			messages: [],
			createdAt: new Date(),
			updatedAt: new Date()
		};
		this.conversations.unshift(conv);
		this.activeId = id;
		this.persist();
		return id;
	}

	selectConversation(id: string) {
		this.activeId = id;
	}

	deleteConversation(id: string) {
		const idx = this.conversations.findIndex((c) => c.id === id);
		if (idx !== -1) {
			this.conversations.splice(idx, 1);
		}
		if (this.activeId === id) {
			this.activeId = this.conversations[0]?.id ?? null;
		}
		this.persist();
	}

	async sendMessage(content: string) {
		if (this.isGenerating || !content.trim()) return;

		if (!this.activeId) {
			this.createConversation();
		}

		const convId = this.activeId!;
		const conv = this.conversations.find((c) => c.id === convId);
		if (!conv) return;

		const userMsg: Message = {
			id: generateId(),
			role: 'user',
			content: content.trim(),
			timestamp: new Date()
		};
		conv.messages.push(userMsg);

		if (conv.messages.filter((m) => m.role === 'user').length === 1) {
			conv.title = content.trim().slice(0, 50) + (content.trim().length > 50 ? '...' : '');
		}

		const assistantMsg: Message = {
			id: generateId(),
			role: 'assistant',
			content: '',
			timestamp: new Date(),
			isStreaming: true,
			searchResults: []
		};
		conv.messages.push(assistantMsg);

		const assistantIdx = conv.messages.length - 1;
		this.isGenerating = true;

		const MAX_CONTEXT_MESSAGES = 20;
		const completedMessages = conv.messages
			.filter((m) => !m.isStreaming && m.content.trim().length > 0);
		const recentMessages = completedMessages.length > MAX_CONTEXT_MESSAGES
			? completedMessages.slice(-MAX_CONTEXT_MESSAGES)
			: completedMessages;
		const apiMessages = recentMessages.map((m) => ({ role: m.role, content: m.content }));

		this.abortController = new AbortController();
		const currentDate = getCurrentDateContext();

		await streamChat(
			apiMessages,
			this.searchEnabled,
			content.trim(),
			currentDate,
			{
				onToken: (token) => {
					const c = this.conversations.find((c) => c.id === convId);
					if (c && c.messages[assistantIdx]) {
						c.messages[assistantIdx].content += token;
					}
				},
				onSources: (sources) => {
					const c = this.conversations.find((c) => c.id === convId);
					if (c && c.messages[assistantIdx]) {
						c.messages[assistantIdx].searchResults = sources;
					}
				},
				onDone: () => {
					const c = this.conversations.find((c) => c.id === convId);
					if (c && c.messages[assistantIdx]) {
						c.messages[assistantIdx].isStreaming = false;
						c.updatedAt = new Date();
					}
					this.isGenerating = false;
					this.abortController = null;
					this.persist();
				},
				onError: (message) => {
					const c = this.conversations.find((c) => c.id === convId);
					if (c && c.messages[assistantIdx]) {
						if (!c.messages[assistantIdx].content) {
							c.messages[assistantIdx].content = `⚠️ ${message}`;
						}
						c.messages[assistantIdx].isStreaming = false;
					}
					this.isGenerating = false;
					this.abortController = null;
					this.persist();
				}
			},
			this.abortController.signal
		);
	}

	stopGeneration() {
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}
		this.isGenerating = false;
	}

	clearConversation() {
		const conv = this.activeConversation;
		if (conv) {
			conv.messages.length = 0;
			this.persist();
		}
	}

	private loadFromStorage() {
		try {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved) {
				const parsed = JSON.parse(saved);
				this.conversations = parsed.map((c: Record<string, unknown>) => ({
					...c,
					createdAt: new Date(c.createdAt as string),
					updatedAt: new Date(c.updatedAt as string),
					messages: (c.messages as Record<string, unknown>[]).map(
						(m: Record<string, unknown>) => ({
							...m,
							timestamp: new Date(m.timestamp as string),
							isStreaming: false
						})
					)
				}));
				if (this.conversations.length > 0) {
					this.activeId = this.conversations[0].id;
				}
			}
		} catch {
			// ignore corrupted storage
		}
	}

	private persist() {
		if (browser) {
			try {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(this.conversations));
			} catch {
				// ignore quota exceeded
			}
		}
	}
}

export const chatStore = new ChatStore();
