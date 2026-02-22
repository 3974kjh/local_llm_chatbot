<script lang="ts">
	import { marked } from 'marked';

	let { content }: { content: string } = $props();

	marked.setOptions({
		breaks: true,
		gfm: true
	});

	function sanitize(html: string): string {
		return html
			.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
			.replace(/on\w+="[^"]*"/g, '')
			.replace(/on\w+='[^']*'/g, '');
	}

	const html = $derived(sanitize(marked.parse(content, { async: false }) as string));
</script>

<div
	class="prose prose-sm prose-invert max-w-none prose-headings:text-slate-200 prose-p:leading-relaxed prose-p:text-slate-300 prose-a:text-violet-400 prose-a:no-underline hover:prose-a:underline prose-strong:text-slate-200 prose-code:rounded prose-code:bg-white/5 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-xs prose-code:text-violet-300 prose-pre:rounded-xl prose-pre:border prose-pre:border-chat-border prose-pre:bg-[#0d0d18] prose-li:text-slate-300 prose-blockquote:border-violet-500/50 prose-blockquote:text-slate-400"
>
	{@html html}
</div>
