<script lang="ts">
	import type { SearchResult } from '$lib/types';
	import { extractDomain } from '$lib/utils/helpers';

	let { result }: { result: SearchResult } = $props();

	const domain = $derived(extractDomain(result.url));
	const faviconUrl = $derived(
		`https://www.google.com/s2/favicons?domain=${domain}&sz=16`
	);
</script>

<a
	href={result.url}
	target="_blank"
	rel="noopener noreferrer"
	class="group/source flex items-center gap-2.5 rounded-xl border border-chat-border bg-chat-raised px-3 py-2 transition-all hover:border-teal-500/30 hover:bg-chat-raised/80"
	title={result.snippet}
>
	<img
		src={faviconUrl}
		alt=""
		class="h-4 w-4 flex-shrink-0 rounded-sm"
		onerror={(e) => {
			const target = e.currentTarget as HTMLImageElement;
			target.style.display = 'none';
		}}
	/>
	<div class="min-w-0 max-w-[160px]">
		<p class="truncate text-xs font-medium text-slate-300 group-hover/source:text-teal-300">
			{result.title}
		</p>
		<p class="truncate text-[10px] text-slate-600">{domain}</p>
	</div>
</a>
