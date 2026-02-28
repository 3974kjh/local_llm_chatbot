export interface TelegramBotConfig {
	id: string;
	name: string;
	botToken: string;
}

export interface TelegramChatConfig {
	id: string;
	name: string;
	chatId: string;
}

export interface ResultHistoryItem {
	executedAt: string;
	result: string;
	success: boolean;
}

export interface AutoBundle {
	id: string;
	title: string;
	autoTimeSetting: number;
	autoApplyText: string;
	autoReferUrl: string[];
	enableWebSearch: boolean;
	telegramEnabled: boolean;
	telegramBotId: string;
	telegramChatId: string;
	isActive: boolean;
	isExecuting: boolean;
	lastExecutedAt: string | null;
	researchResultText: string | null;
	resultHistory: ResultHistoryItem[];
	createdAt: string;
	updatedAt: string;
}

export interface BundleFormData {
	title: string;
	autoTimeSetting: number;
	autoApplyText: string;
	autoReferUrl: string[];
	enableWebSearch: boolean;
	telegramEnabled: boolean;
	telegramBotId: string;
	telegramChatId: string;
}

export interface BundleExecutionResult {
	researchResultText: string;
	success: boolean;
	error?: string;
}

export interface BundleStatus {
	isActive: boolean;
	isRunning: boolean;
	lastResult: string | null;
	lastExecutedAt: string | null;
}
