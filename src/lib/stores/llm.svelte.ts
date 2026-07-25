import { browser } from '$app/environment';
import type { LlmProvider } from '$lib/types';

const STORAGE_KEY = 'jukimbot-llm-provider';

export const LLM_PROVIDER_OPTIONS: Array<{
	value: LlmProvider;
	label: string;
	model: string;
}> = [
	{ value: 'local', label: 'Local', model: 'llama3.1:8b' },
	{ value: 'omniroute', label: 'OpenRouter', model: 'openrouter/free' }
];

class LlmStore {
	provider = $state<LlmProvider>('local');
	healthOk = $state<boolean | null>(null);
	healthLoading = $state(false);

	constructor() {
		if (browser) {
			this.loadFromStorage();
		}
	}

	get selectedOption() {
		return LLM_PROVIDER_OPTIONS.find((o) => o.value === this.provider) ?? LLM_PROVIDER_OPTIONS[0];
	}

	get displayLabel(): string {
		const opt = this.selectedOption;
		return `${opt.model} · ${opt.label}`;
	}

	setProvider(provider: LlmProvider) {
		this.provider = provider;
		if (browser) {
			localStorage.setItem(STORAGE_KEY, provider);
		}
		this.refreshHealth();
	}

	loadFromStorage() {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved === 'local' || saved === 'omniroute') {
			this.provider = saved;
		}
	}

	async refreshHealth() {
		if (!browser) return;
		this.healthLoading = true;
		try {
			const res = await fetch(`/api/llm/health?provider=${this.provider}`);
			if (!res.ok) {
				this.healthOk = false;
				return;
			}
			const data = (await res.json()) as { ok?: boolean };
			this.healthOk = !!data.ok;
		} catch {
			this.healthOk = false;
		} finally {
			this.healthLoading = false;
		}
	}
}

export const llmStore = new LlmStore();
