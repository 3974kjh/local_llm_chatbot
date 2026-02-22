export interface Message {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	timestamp: Date;
	isStreaming?: boolean;
	searchResults?: SearchResult[];
}

export interface Conversation {
	id: string;
	title: string;
	messages: Message[];
	createdAt: Date;
	updatedAt: Date;
}

export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

export interface StreamEvent {
	type: 'token' | 'sources' | 'done' | 'error';
	content?: string;
	data?: SearchResult[];
	message?: string;
}
