<script lang="ts">
	import { appStore } from '$lib/stores/app.svelte';
</script>

<div class="flex rounded-full bg-chat-raised p-1">
	<button
		onclick={() => (appStore.mode = 'chat')}
		class="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition-all {appStore.mode ===
		'chat'
			? 'bg-violet-600 text-white shadow-lg shadow-violet-600/25'
			: 'text-slate-400 hover:text-slate-300'}"
	>
		<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
			/>
		</svg>
		Chat
	</button>
	<button
		onclick={() => (appStore.mode = 'auto')}
		class="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition-all {appStore.mode ===
		'auto'
			? 'bg-violet-600 text-white shadow-lg shadow-violet-600/25'
			: 'text-slate-400 hover:text-slate-300'}"
	>
		<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M13 10V3L4 14h7v7l9-11h-7z"
			/>
		</svg>
		Auto
	</button>
</div>
