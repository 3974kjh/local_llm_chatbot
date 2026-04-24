/**
 * Pull a single JSON object from model output: trims fences ```json ... ``` and
 * finds the first balanced `{ ... }` respecting string escapes.
 */
export function extractFirstJsonObject(text: string): string | null {
	let s = text.trim();
	const fenced = /^```(?:json)?\s*([\s\S]*?)```/im.exec(s);
	if (fenced) {
		s = fenced[1].trim();
	}

	const start = s.indexOf('{');
	if (start === -1) return null;

	let depth = 0;
	let inString = false;
	let escape = false;

	for (let i = start; i < s.length; i++) {
		const c = s[i];
		if (escape) {
			escape = false;
			continue;
		}
		if (c === '\\' && inString) {
			escape = true;
			continue;
		}
		if (c === '"') {
			inString = !inString;
			continue;
		}
		if (inString) continue;
		if (c === '{') depth++;
		else if (c === '}') {
			depth--;
			if (depth === 0) return s.slice(start, i + 1);
		}
	}
	return null;
}
