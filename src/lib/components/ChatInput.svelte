<script lang="ts">
	import { chatStore } from '$lib/stores/chat.svelte';

	let inputValue = $state('');
	let textarea: HTMLTextAreaElement;

	function handleSubmit() {
		const value = inputValue.trim();
		if (!value || chatStore.isGenerating) return;

		chatStore.sendMessage(value);
		inputValue = '';
		resetTextarea();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			handleSubmit();
		}
	}

	function autoResize() {
		if (!textarea) return;
		textarea.style.height = 'auto';
		textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
	}

	function resetTextarea() {
		if (textarea) {
			textarea.style.height = 'auto';
		}
	}

	function toggleSearch() {
		chatStore.searchEnabled = !chatStore.searchEnabled;
	}

	function stopGeneration() {
		chatStore.stopGeneration();
	}
</script>

<div class="border-t border-chat-border bg-chat-surface/80 px-4 py-3 backdrop-blur-md">
	<div class="mx-auto max-w-3xl">
		<!-- Unified input container -->
		<div
			class="rounded-2xl border border-transparent bg-chat-raised transition-colors focus-within:border-violet-500/40"
		>
			<!-- Textarea row -->
			<div class="flex items-end gap-3 px-4 pt-3 pb-2">
				<textarea
					bind:this={textarea}
					bind:value={inputValue}
					onkeydown={handleKeydown}
					oninput={autoResize}
					placeholder="Message JukimBot..."
					rows={1}
					class="max-h-[200px] flex-1 resize-none border-none bg-transparent text-sm leading-relaxed text-slate-200 outline-none ring-0 placeholder:text-slate-500 focus:border-none focus:outline-none focus:ring-0"
					disabled={chatStore.isGenerating}
				></textarea>
			</div>

			<!-- Bottom controls row -->
			<div class="flex items-center justify-between px-3 pb-2.5">
				<div class="flex items-center gap-2">
					<button
						onclick={toggleSearch}
						class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all {chatStore.searchEnabled
							? 'border-teal-500/30 bg-teal-500/10 text-teal-400'
							: 'border-transparent bg-transparent text-slate-500 hover:bg-chat-surface hover:text-slate-400'}"
					>
						<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
							/>
						</svg>
						Web
						{#if chatStore.searchEnabled}
							<span class="h-1.5 w-1.5 rounded-full bg-teal-400"></span>
						{/if}
					</button>

					{#if chatStore.isGenerating}
						<button
							onclick={stopGeneration}
							class="flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-400 transition-all hover:bg-red-500/20"
						>
							<svg class="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
								<rect x="6" y="6" width="12" height="12" rx="2" />
							</svg>
							Stop
						</button>
					{/if}
				</div>

				<button
					onclick={handleSubmit}
					disabled={!inputValue.trim() || chatStore.isGenerating}
					class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl transition-all {inputValue.trim() &&
					!chatStore.isGenerating
						? 'bg-violet-600 text-white shadow-lg shadow-violet-600/25 hover:bg-violet-500 active:scale-95'
						: 'cursor-not-allowed bg-chat-surface text-slate-600'}"
					aria-label="Send message"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M5 12h14M12 5l7 7-7 7"
						/>
					</svg>
				</button>
			</div>
		</div>

		<p class="mt-2 text-center text-[10px] text-slate-600">
			Powered by Ollama &middot; llama3.1:8b &middot; Enter to send, Shift+Enter for new line
		</p>
	</div>
</div>
