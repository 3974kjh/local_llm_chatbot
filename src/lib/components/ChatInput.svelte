<script lang="ts">
	import { chatStore } from '$lib/stores/chat.svelte';
	import { llmStore } from '$lib/stores/llm.svelte';
	import type { DeepSearchPresetId } from '$lib/types';

	const presetOptions: { id: DeepSearchPresetId; label: string; short: string }[] = [
		{ id: 'fast', label: 'Fast', short: '1 verification round' },
		{ id: 'balanced', label: 'Balanced', short: '2 verification rounds' },
		{ id: 'deep', label: 'Deep', short: '4 verification rounds' }
	];

	let inputValue = $state('');
	let seedUrlInput = $state('');
	let textarea: HTMLTextAreaElement;

	const placeholder = $derived(
		chatStore.deepSearchEnabled
			? 'Ask anything — deep research enabled...'
			: 'Message JukimBot...'
	);

	function handleSubmit() {
		const value = inputValue.trim();
		if (!value || chatStore.isGenerating) return;

		if (chatStore.deepSearchEnabled) {
			chatStore.sendDeepSearch(value);
		} else {
			chatStore.sendMessage(value);
		}
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
		if (!chatStore.searchEnabled) {
			chatStore.deepSearchEnabled = false;
		}
		chatStore.searchEnabled = !chatStore.searchEnabled;
	}

	function toggleDeepSearch() {
		if (chatStore.deepSearchEnabled) {
			chatStore.deepSearchSeedUrls = [];
			seedUrlInput = '';
		}
		if (!chatStore.deepSearchEnabled) {
			chatStore.searchEnabled = false;
		}
		chatStore.deepSearchEnabled = !chatStore.deepSearchEnabled;
	}

	function addSeedUrl() {
		const v = seedUrlInput.trim();
		if (!v) return;
		chatStore.addDeepSearchSeedUrl(v);
		seedUrlInput = '';
	}

	function removeSeedAt(i: number) {
		chatStore.removeDeepSearchSeedUrl(i);
	}

	function stopGeneration() {
		chatStore.stopGeneration();
	}
</script>

<div class="px-4 py-3">
	<div class="mx-auto max-w-3xl">
		<!-- Unified input container -->
		<div
			class="rounded-2xl border border-transparent bg-chat-raised transition-colors focus-within:border-violet-500/40"
		>
			{#if chatStore.deepSearchEnabled}
				<div class="border-b border-chat-border px-4 pb-2 pt-3">
					<p class="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
						Research depth
					</p>
					<div
						class="mb-3 flex min-w-0 flex-wrap gap-1 rounded-lg border border-chat-border bg-chat-surface/80 p-0.5"
						role="group"
						aria-label="Deep research depth"
					>
						{#each presetOptions as opt (opt.id)}
							<button
								type="button"
								disabled={chatStore.isGenerating}
								onclick={() => {
									chatStore.deepSearchPreset = opt.id;
								}}
								title={opt.short}
								class="min-w-0 flex-1 rounded-md px-2 py-1.5 text-center text-[11px] font-medium transition-all sm:flex-none sm:px-3 {chatStore.deepSearchPreset ===
								opt.id
									? 'bg-violet-600/90 text-white shadow-sm'
									: 'text-slate-400 hover:bg-chat-raised hover:text-slate-200'}"
							>
								{opt.label}
							</button>
						{/each}
					</div>
					<p class="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
						Attach source pages (recommended for fact-checking)
					</p>
					{#if chatStore.deepSearchSeedUrls.length > 0}
						<div class="mb-2 flex min-w-0 flex-wrap gap-1.5">
							{#each chatStore.deepSearchSeedUrls as u, i (u)}
								<span
									class="group flex max-w-full min-w-0 items-center gap-1 rounded-lg border border-violet-500/25 bg-violet-500/10 py-0.5 pl-2 pr-1 text-[11px] text-violet-200"
								>
									<span class="min-w-0 truncate" title={u}>{u}</span>
									<button
										type="button"
										onclick={() => removeSeedAt(i)}
										class="flex-shrink-0 rounded p-0.5 text-slate-500 hover:bg-white/10 hover:text-slate-300"
										aria-label="Remove URL"
									>
										<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M6 18L18 6M6 6l12 12"
											/>
										</svg>
									</button>
								</span>
							{/each}
						</div>
					{/if}
					<div class="flex min-w-0 gap-2">
						<input
							type="url"
							bind:value={seedUrlInput}
							placeholder="https://example.com/article"
							class="min-w-0 flex-1 rounded-lg border border-chat-border bg-chat-surface px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-violet-500/40 focus:outline-none"
							disabled={chatStore.isGenerating}
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									addSeedUrl();
								}
							}}
						/>
						<button
							type="button"
							onclick={addSeedUrl}
							disabled={!seedUrlInput.trim() || chatStore.isGenerating}
							class="flex-shrink-0 rounded-lg border border-violet-500/30 bg-violet-500/15 px-2.5 py-1.5 text-xs font-medium text-violet-300 transition-colors hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-40"
						>
							Add
						</button>
					</div>
				</div>
			{/if}
			<!-- Textarea row -->
			<div class="flex items-end gap-3 px-4 pt-3 pb-2">
				<textarea
					bind:this={textarea}
					bind:value={inputValue}
					onkeydown={handleKeydown}
					oninput={autoResize}
					placeholder={placeholder}
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

					<button
						onclick={toggleDeepSearch}
						class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all {chatStore.deepSearchEnabled
							? 'border-violet-500/30 bg-violet-500/10 text-violet-400'
							: 'border-transparent bg-transparent text-slate-500 hover:bg-chat-surface hover:text-slate-400'}"
					>
						<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 001.357 2.059l.096.038a2.25 2.25 0 002.404-.41l1.96-1.961m-7.5-3.4c.073.038.145.077.217.118M9.75 3.104A24.3 24.3 0 005 3.75m4.75-.646V8.6m4.5-5.75v5.357m0 0a2.25 2.25 0 001.06 1.91l.098.044m-1.158-1.954c.073.038.145.077.217.118M14.25 3.104c.252.023.501.05.75.082M5 3.75a24.251 24.251 0 00-1.5 7.5M5 14.5l-1.5 1.5m1.5-1.5v5.25m9-10.5v5.25m0 0l1.5 1.5"
							/>
						</svg>
						Deep
						{#if chatStore.deepSearchEnabled}
							<span class="h-1.5 w-1.5 rounded-full bg-violet-400"></span>
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
						? chatStore.deepSearchEnabled
							? 'bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-violet-600/25 hover:from-indigo-500 hover:to-violet-500 active:scale-95'
							: 'bg-violet-600 text-white shadow-lg shadow-violet-600/25 hover:bg-violet-500 active:scale-95'
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
			Powered by {llmStore.selectedOption.label} &middot; {llmStore.selectedOption.model} &middot; Enter to send, Shift+Enter for new line
		</p>
	</div>
</div>
