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

/** 'minutes' = every N min; 'daily' = once per day at scheduleTime; 'days' = every scheduleDays days at scheduleTime */
export type ScheduleType = 'minutes' | 'daily' | 'days';

export interface AutoBundle {
	id: string;
	title: string;
	autoTimeSetting: number;
	/** HH:mm (e.g. "09:00"). Used when scheduleType is 'daily' or 'days'. */
	scheduleTime: string;
	/** 1 = daily, 2 = every 2 days. Used when scheduleType is 'days'. */
	scheduleDays: number;
	/** How to repeat: by minutes, daily at time, or every N days at time */
	scheduleType: ScheduleType;
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
	scheduleTime: string;
	scheduleDays: number;
	scheduleType: ScheduleType;
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
