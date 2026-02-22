import axios from 'axios';

const OLLAMA_URL = 'http://localhost:11434';
const MODEL = 'llama3.1:8b';

export interface OllamaMessage {
	role: string;
	content: string;
}

export async function createOllamaStream(messages: OllamaMessage[], systemPrompt: string) {
	const allMessages: OllamaMessage[] = [
		{ role: 'system', content: systemPrompt },
		...messages
	];

	return axios.post(
		`${OLLAMA_URL}/api/chat`,
		{
			model: MODEL,
			messages: allMessages,
			stream: true
		},
		{
			responseType: 'stream',
			timeout: 120000
		}
	);
}

export async function checkOllamaHealth(): Promise<boolean> {
	try {
		const response = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 5000 });
		return response.status === 200;
	} catch {
		return false;
	}
}
