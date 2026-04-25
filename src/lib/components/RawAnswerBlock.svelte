<script lang="ts">
	import { marked } from 'marked';

	let { content, isDeepSearch = false }: { content: string; isDeepSearch?: boolean } = $props();

	let expanded = $state(false);

	marked.setOptions({ breaks: true, gfm: true });

	function sanitize(html: string): string {
		return html
			.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
			.replace(/on\w+="[^"]*"/g, '')
			.replace(/on\w+='[^']*'/g, '');
	}

	const html = $derived(sanitize(marked.parse(content, { async: false }) as string));

	const label = $derived(isDeepSearch ? '조사에서 수집한 출처' : '검색 원문');
	const sourceCount = $derived((content.match(/^\*\*\d+\./gm) ?? []).length);
</script>

<div class="mb-3 w-full min-w-0 max-w-full">
	<button
		type="button"
		onclick={() => (expanded = !expanded)}
		class="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-left text-[11px] font-medium text-amber-300/80 transition-colors hover:bg-amber-500/10"
	>
		<span class="flex items-center gap-1.5">
			<svg class="h-3 w-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
				/>
			</svg>
			{label}
			{#if sourceCount > 0}
				<span class="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-400/70">
					{sourceCount}건
				</span>
			{/if}
			<span class="text-[10px] font-normal text-amber-400/50">— LLM 의견 미포함</span>
		</span>
		<svg
			class="h-3.5 w-3.5 flex-shrink-0 transition-transform {expanded ? 'rotate-180' : ''}"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
		</svg>
	</button>

	{#if expanded}
		<div
			class="mt-1.5 max-h-96 overflow-y-auto rounded-lg border border-amber-500/15 bg-amber-500/[0.03] p-3"
		>
			<div
				class="prose prose-sm prose-invert max-w-none
					prose-p:leading-relaxed prose-p:text-slate-400
					prose-a:text-amber-400 prose-a:no-underline hover:prose-a:underline
					prose-strong:text-slate-300
					prose-code:rounded prose-code:bg-white/5 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-xs prose-code:text-amber-300
					prose-pre:rounded-xl prose-pre:border prose-pre:border-chat-border prose-pre:bg-[#0d0d18] prose-pre:text-xs
					prose-blockquote:border-amber-500/40 prose-blockquote:text-slate-500
					prose-li:text-slate-400"
			>
				{@html html}
			</div>
		</div>
	{/if}
</div>
