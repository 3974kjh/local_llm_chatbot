<script lang="ts">
	import { lexer, parser } from 'marked';
	import type { Token, Tokens } from 'marked';

	let { content }: { content: string } = $props();

	const lexOptions = { gfm: true, breaks: true };
	const parseOptions = { gfm: true, breaks: true, async: false as const };

	const proseInner =
		'prose prose-sm prose-invert max-w-none prose-headings:text-slate-200 prose-p:leading-relaxed prose-p:text-slate-300 prose-a:text-violet-400 prose-a:no-underline hover:prose-a:underline prose-strong:text-slate-200 prose-code:rounded prose-code:bg-white/5 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-xs prose-code:text-violet-300 prose-pre:rounded-xl prose-pre:border prose-pre:border-chat-border prose-pre:bg-[#0d0d18] prose-li:text-slate-300 prose-blockquote:border-violet-500/50 prose-blockquote:text-slate-400';

	function sanitize(html: string): string {
		return html
			.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
			.replace(/on\w+="[^"]*"/g, '')
			.replace(/on\w+='[^']*'/g, '');
	}

	function collectParagraphHttpHrefs(tokens: Token[] | undefined): string[] {
		if (!tokens?.length) return [];
		const out: string[] = [];
		const walk = (ts: Token[]) => {
			for (const t of ts) {
				if (t.type === 'link') {
					const href = (t as Tokens.Link).href;
					if (/^https?:\/\//i.test(href) && !out.includes(href)) out.push(href);
				}
				const nested = (t as { tokens?: Token[] }).tokens;
				if (nested) walk(nested);
			}
		};
		walk(tokens);
		return out;
	}

	const segments = $derived.by(() => {
		const toks = lexer(content, lexOptions);
		return toks.map((tok: Token) => {
			const links = tok.type === 'paragraph' ? collectParagraphHttpHrefs(tok.tokens) : [];
			const rawHtml = parser([tok], parseOptions) as string;
			return {
				showChrome: tok.type === 'paragraph' && links.length > 0,
				links,
				html: sanitize(rawHtml)
			};
		});
	});
</script>

<div
	class="deep-search-md {proseInner} max-w-none [&_.ds-cite-body>*:first-child]:mt-0 [&_.ds-cite-body>*:last-child]:mb-0"
>
	{#each segments as seg, i (i)}
		{#if seg.showChrome}
			<div class="ds-para-with-cites not-prose my-2.5 flex gap-2.5">
				<div
					class="flex shrink-0 flex-col items-center gap-1 border-l border-violet-500/25 pl-2.5 pt-0.5"
					aria-hidden="true"
				>
					{#each seg.links as href (href)}
						<a
							href={href}
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex h-7 w-7 items-center justify-center rounded-md border border-violet-500/30 bg-violet-500/10 text-violet-300 transition-colors hover:border-teal-500/40 hover:bg-teal-500/10 hover:text-teal-300"
							title={href}
						>
							<svg
								class="h-3.5 w-3.5"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M13.828 10.172a4 4 0 00-5.656 0L9 10.343m4.95-4.95l.354-.354a2 2 0 112.829 2.829L15 8M7 9H5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M15 4h5v5"
								/>
							</svg>
						</a>
					{/each}
				</div>
				<div class="ds-cite-body min-w-0 flex-1 {proseInner}">{@html seg.html}</div>
			</div>
		{:else}
			<div class="ds-md-block">{@html seg.html}</div>
		{/if}
	{/each}
</div>
