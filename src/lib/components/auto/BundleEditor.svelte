<script lang="ts">
	import type { AutoBundle, BundleFormData } from '$lib/types/auto';
	import { autoStore } from '$lib/stores/auto.svelte';
	import { telegramConfigsStore } from '$lib/stores/telegramConfigs.svelte';
	import MarkdownRenderer from '../MarkdownRenderer.svelte';

	let {
		bundle = null,
		isNew = false
	}: {
		bundle?: AutoBundle | null;
		isNew?: boolean;
	} = $props();

	let title = $state('');
	let autoTimeSetting = $state(60);
	let autoApplyText = $state('');
	let autoReferUrl = $state<string[]>(['']);
	let enableWebSearch = $state(false);
	let telegramEnabled = $state(false);
	let telegramBotId = $state('');
	let telegramChatId = $state('');
	let titleError = $state<string | null>(null);
	let expandedHistoryIndex = $state(-1);

	let intervalMode = $state<'minutes' | 'days'>('minutes');
	let dayInput = $state(1);

	$effect(() => {
		if (bundle) {
			title = bundle.title;
			autoTimeSetting = bundle.autoTimeSetting;
			autoApplyText = bundle.autoApplyText;
			autoReferUrl = bundle.autoReferUrl.length ? [...bundle.autoReferUrl] : [''];
			enableWebSearch = bundle.enableWebSearch ?? false;
			telegramEnabled = bundle.telegramEnabled ?? false;
			telegramBotId = (bundle.telegramBotId ?? '').trim();
			telegramChatId = (bundle.telegramChatId ?? '').trim();
			expandedHistoryIndex = -1;
			if (bundle.autoTimeSetting >= 1440 && bundle.autoTimeSetting % 1440 === 0) {
				intervalMode = 'days';
				dayInput = bundle.autoTimeSetting / 1440;
			} else {
				intervalMode = 'minutes';
			}
		} else if (isNew) {
			title = '';
			autoTimeSetting = 60;
			autoApplyText = '';
			autoReferUrl = [''];
			enableWebSearch = false;
			telegramEnabled = false;
			telegramBotId = '';
			telegramChatId = '';
			expandedHistoryIndex = -1;
			intervalMode = 'minutes';
			dayInput = 1;
		}
	});

	function switchIntervalMode(mode: 'minutes' | 'days') {
		intervalMode = mode;
		if (mode === 'days') {
			dayInput = Math.max(1, Math.round(autoTimeSetting / 1440)) || 1;
			autoTimeSetting = dayInput * 1440;
		} else {
			autoTimeSetting = Math.min(1440, Math.max(30, autoTimeSetting));
		}
	}

	function handleDayInput(value: string) {
		const num = parseInt(value, 10);
		if (!isNaN(num) && num >= 1 && num <= 365) {
			dayInput = num;
			autoTimeSetting = num * 1440;
		}
	}

	function addUrl() {
		autoReferUrl = [...autoReferUrl, ''];
	}

	function removeUrl(index: number) {
		autoReferUrl = autoReferUrl.filter((_, i) => i !== index);
		if (autoReferUrl.length === 0) autoReferUrl = [''];
	}

	function updateUrl(index: number, value: string) {
		autoReferUrl[index] = value;
	}

	function formatTimer(minutes: number): string {
		if (minutes >= 1440) {
			const d = Math.floor(minutes / 1440);
			const remainH = Math.floor((minutes % 1440) / 60);
			if (remainH > 0) return `${d}d ${remainH}h`;
			return d === 1 ? '1 day' : `${d} days`;
		}
		if (minutes >= 60) {
			const h = Math.floor(minutes / 60);
			const m = minutes % 60;
			return m > 0 ? `${h}h ${m}m` : `${h}h`;
		}
		return `${minutes}min`;
	}

	function handleSave() {
		const validationError = autoStore.validateTitle(title, bundle?.id);
		if (validationError) {
			titleError = validationError;
			return;
		}

		titleError = null;
		const data: BundleFormData = {
			title,
			autoTimeSetting,
			autoApplyText,
			autoReferUrl: autoReferUrl.filter((u) => u.trim()),
			enableWebSearch,
			telegramEnabled,
			telegramBotId: telegramBotId.trim(),
			telegramChatId: telegramChatId.trim()
		};

		if (isNew) {
			autoStore.createBundle(data);
		} else if (bundle) {
			autoStore.updateBundle(bundle.id, data);
		}
	}

	async function handleDelete() {
		if (bundle) await autoStore.deleteBundle(bundle.id);
	}

	function handleRunNow() {
		if (!bundle) return;
		// Run Now 시 현재 에디터 상태 그대로 사용 (텔레그램 토글·봇·수신처, 저장 안 해도 반영)
		autoStore.executeBundle(bundle.id, {
			telegramEnabled,
			telegramBotId,
			telegramChatId
		});
	}

	function handleToggleActive() {
		if (!bundle) return;
		if (bundle.isActive) {
			autoStore.stopBundle(bundle.id);
		} else {
			autoStore.startBundle(bundle.id);
		}
	}
</script>

<div class="flex h-full flex-col overflow-y-auto">
	<div class="flex-1 space-y-5 p-5">
		<!-- Title -->
		<div>
			<label for="bundle-title" class="mb-1.5 block text-xs font-medium text-slate-400"
				>Title <span class="text-red-400">*</span></label
			>
			<input
				id="bundle-title"
				type="text"
				bind:value={title}
				oninput={() => (titleError = null)}
				placeholder="Enter bundle title..."
				class="w-full rounded-xl border bg-chat-raised px-4 py-2.5 text-sm text-slate-200 outline-none transition-colors placeholder:text-slate-600 {titleError
					? 'border-red-500/50'
					: 'border-chat-border focus:border-violet-500/40'}"
			/>
			{#if titleError}
				<p class="mt-1 text-xs text-red-400">{titleError}</p>
			{/if}
		</div>

		<!-- Timer -->
		<div>
			<div class="mb-2 flex items-center justify-between">
				<p class="text-xs font-medium text-slate-400">
					Interval: <span class="text-violet-400">{formatTimer(autoTimeSetting)}</span>
				</p>
				<div class="flex overflow-hidden rounded-lg border border-chat-border text-[10px]">
					<button
						onclick={() => switchIntervalMode('minutes')}
						class="px-3 py-1 transition-colors {intervalMode === 'minutes'
							? 'bg-violet-600 text-white'
							: 'bg-chat-raised text-slate-500 hover:text-slate-300'}"
					>
						Minutes
					</button>
					<button
						onclick={() => switchIntervalMode('days')}
						class="px-3 py-1 transition-colors {intervalMode === 'days'
							? 'bg-violet-600 text-white'
							: 'bg-chat-raised text-slate-500 hover:text-slate-300'}"
					>
						Days
					</button>
				</div>
			</div>

			{#if intervalMode === 'minutes'}
				<input
					id="bundle-timer"
					type="range"
					bind:value={autoTimeSetting}
					min={30}
					max={1440}
					step={10}
					class="timer-slider w-full accent-violet-600"
				/>
				<div class="mt-1 flex justify-between text-[10px] text-slate-600">
					<span>30m</span>
					<span>6h</span>
					<span>12h</span>
					<span>24h</span>
				</div>
			{:else}
				<div class="flex items-center gap-3">
					<input
						type="number"
						value={dayInput}
						oninput={(e) => handleDayInput((e.target as HTMLInputElement).value)}
						min={1}
						max={365}
						class="w-24 rounded-xl border border-chat-border bg-chat-raised px-4 py-2.5 text-center text-sm text-slate-200 outline-none transition-colors focus:border-violet-500/40"
					/>
					<span class="text-xs text-slate-500">days ({dayInput * 24}h)</span>
				</div>
			{/if}
		</div>

		<!-- Prompt -->
		<div>
			<label for="bundle-prompt" class="mb-1.5 block text-xs font-medium text-slate-400"
				>Prompt (autoApplyText)</label
			>
			<textarea
				id="bundle-prompt"
				bind:value={autoApplyText}
				placeholder="Enter the analysis instruction..."
				rows={3}
				class="w-full resize-none rounded-xl border border-chat-border bg-chat-raised px-4 py-2.5 text-sm text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-violet-500/40"
			></textarea>
		</div>

		<!-- URLs -->
		<div>
			<p class="mb-1.5 text-xs font-medium text-slate-400">
				URLs (autoReferUrl) &middot; {autoReferUrl.filter((u) => u.trim()).length} configured
			</p>
			<div class="space-y-2">
				{#each autoReferUrl as url, i}
					<div class="flex items-center gap-2">
						<input
							type="url"
							value={url}
							oninput={(e) => updateUrl(i, (e.target as HTMLInputElement).value)}
							placeholder="https://..."
							class="flex-1 rounded-lg border border-chat-border bg-chat-raised px-3 py-2 text-sm text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-violet-500/40"
						/>
						{#if autoReferUrl.length > 1}
							<button
								onclick={() => removeUrl(i)}
								class="rounded-lg p-2 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
								aria-label="Remove URL"
							>
								<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
							</button>
						{/if}
					</div>
				{/each}
			</div>
			<button
				onclick={addUrl}
				class="mt-2 flex items-center gap-1.5 text-xs text-violet-400 transition-colors hover:text-violet-300"
			>
				<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 4v16m8-8H4"
					/>
				</svg>
				Add URL
			</button>
		</div>

		<!-- Web Search Toggle -->
		<div class="rounded-xl border border-chat-border bg-chat-raised/50 p-4">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<div class="flex h-8 w-8 items-center justify-center rounded-lg {enableWebSearch ? 'bg-teal-500/20 text-teal-400' : 'bg-slate-700/50 text-slate-500'}">
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
						</svg>
					</div>
					<div>
						<p class="text-xs font-medium text-slate-300">Web Search</p>
						<p class="text-[10px] text-slate-600">
							{enableWebSearch
								? 'Prompt based web search enabled'
								: 'Only attached URLs will be analyzed'}
						</p>
					</div>
				</div>
				<button
					onclick={() => (enableWebSearch = !enableWebSearch)}
					class="relative h-6 w-11 rounded-full transition-colors {enableWebSearch ? 'bg-teal-500' : 'bg-slate-700'}"
					aria-label="Toggle web search"
				>
					<span
						class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform {enableWebSearch ? 'translate-x-5' : 'translate-x-0'}"
					></span>
				</button>
			</div>
			{#if enableWebSearch}
				<p class="mt-2.5 rounded-lg bg-teal-500/5 px-3 py-2 text-[10px] leading-relaxed text-teal-400/80">
					Prompt 내용을 기반으로 오늘 날짜의 인터넷 검색 결과를 가져와 첨부 URL과 함께 분석합니다.
					검색 결과 상위 3개 페이지의 상세 내용도 추가로 수집합니다.
				</p>
			{/if}
		</div>

		<!-- Telegram -->
		<div class="rounded-xl border border-chat-border bg-chat-raised/50 p-4">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<div class="flex h-8 w-8 items-center justify-center rounded-lg {telegramEnabled ? 'bg-sky-500/20 text-sky-400' : 'bg-slate-700/50 text-slate-500'}">
						<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
							<path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.611-.06-2.558-.293-.752-.185-1.311-.305-1.26-.463.126-.416.1-.803-.188-1.101-.288-.299-1.165-1.139-1.697-1.628-.653-.6-.146-.931.408-1.477.276-.272.562-.715.73-1.103.13-.31.12-.576-.04-.792-.161-.216-.438-.447-.877-.719-.44-.272-1.304-.951-1.846-1.364-.542-.413-.936-.626-1.18-.638-.24-.013-.557.04-.847.24-.29.2-.494.468-.6.804-.106.335-.087.706.057 1.106z"/>
						</svg>
					</div>
					<div>
						<p class="text-xs font-medium text-slate-300">Telegram</p>
						<p class="text-[10px] text-slate-600">
							{telegramEnabled ? '결과를 텔레그램으로 전송' : '결과를 텔레그램으로 보내지 않음'}
						</p>
					</div>
				</div>
				<button
					onclick={() => (telegramEnabled = !telegramEnabled)}
					class="relative h-6 w-11 rounded-full transition-colors {telegramEnabled ? 'bg-sky-500' : 'bg-slate-700'}"
					aria-label="Toggle Telegram"
				>
					<span
						class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform {telegramEnabled ? 'translate-x-5' : 'translate-x-0'}"
					></span>
				</button>
			</div>
			{#if telegramEnabled}
				<div class="mt-3 space-y-3">
					<div>
						<label for="telegram-bot-select" class="block text-[10px] font-medium text-slate-500">봇 선택</label>
						<select
							id="telegram-bot-select"
							bind:value={telegramBotId}
							class="mt-1 w-full rounded-lg border border-chat-border bg-chat-raised px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-sky-500/40"
						>
							<option value="">선택하세요</option>
							{#each telegramConfigsStore.bots as bot (bot.id)}
								<option value={bot.id}>{bot.name}</option>
							{/each}
						</select>
					</div>
					<div>
						<label for="telegram-chat-select" class="block text-[10px] font-medium text-slate-500">수신처 선택</label>
						<div class="mt-1 flex flex-wrap items-center gap-2">
							<select
								id="telegram-chat-select"
								bind:value={telegramChatId}
								class="flex-1 min-w-[180px] rounded-lg border border-chat-border bg-chat-raised px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-sky-500/40"
							>
								<option value="">선택하세요</option>
								{#each telegramConfigsStore.chats as chat (chat.id)}
									<option value={chat.id}>{chat.name}</option>
								{/each}
							</select>
							<button
								onclick={() => {
									const bot = telegramBotId ? telegramConfigsStore.getBotById(telegramBotId) : undefined;
									const chat = telegramChatId ? telegramConfigsStore.getChatById(telegramChatId) : undefined;
									if (bot && chat) autoStore.sendTelegramTest(chat.chatId, bot.botToken);
								}}
								disabled={!telegramBotId || !telegramChatId || autoStore.telegramTestLoading}
								class="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-400 transition-all hover:bg-sky-500/20 disabled:opacity-50"
							>
								{autoStore.telegramTestLoading ? '전송 중...' : '테스트 전송'}
							</button>
						</div>
					</div>
					{#if autoStore.telegramTestResult}
						<p class="text-[10px] {autoStore.telegramTestResult.startsWith('Telegram') ? 'text-emerald-400' : 'text-red-400'}">
							{autoStore.telegramTestResult}
						</p>
					{/if}
					<p class="rounded-lg bg-sky-500/5 px-3 py-2 text-[10px] leading-relaxed text-slate-500">
						상단 <strong>텔레그램 봇 · 수신처 설정</strong>에서 봇과 수신처를 등록한 뒤, 위에서 각각 선택하세요.
					</p>
				</div>
			{/if}
		</div>
	</div>

	<!-- Actions bar -->
	<div
		class="flex flex-wrap items-center gap-2 border-t border-chat-border bg-chat-surface/50 px-5 py-3"
	>
		<button
			onclick={handleSave}
			class="rounded-xl bg-violet-600 px-4 py-2 text-xs font-medium text-white transition-all hover:bg-violet-500 active:scale-95"
		>
			{isNew ? 'Create Bundle' : 'Save Changes'}
		</button>

		{#if !isNew && bundle}
			<button
				onclick={handleRunNow}
				disabled={bundle.isExecuting}
				class="rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-2 text-xs font-medium text-teal-400 transition-all hover:bg-teal-500/20 disabled:opacity-50"
			>
				{bundle.isExecuting ? 'Running...' : 'Run Now'}
			</button>

			<button
				onclick={handleToggleActive}
				class="rounded-xl border px-4 py-2 text-xs font-medium transition-all {bundle.isActive
					? 'border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20'
					: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'}"
			>
				{bundle.isActive ? 'Stop Schedule' : 'Start Schedule'}
			</button>

			<button
				onclick={handleDelete}
				class="ml-auto rounded-xl border border-red-500/30 px-4 py-2 text-xs font-medium text-red-400 transition-all hover:bg-red-500/10"
			>
				Delete
			</button>
		{/if}
	</div>

	<!-- Result History -->
	{#if !isNew && bundle?.resultHistory && bundle.resultHistory.length > 0}
		<div class="border-t border-chat-border p-5">
			<div class="mb-3 flex items-center justify-between">
				<h4 class="text-xs font-medium text-slate-400">
					Result History
					<span class="ml-1.5 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] text-violet-400">
						{bundle.resultHistory.length}
					</span>
				</h4>
				{#if expandedHistoryIndex === -1}
					<button
						onclick={() => (expandedHistoryIndex = 0)}
						class="text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
					>
						Expand latest
					</button>
				{:else}
					<button
						onclick={() => (expandedHistoryIndex = -1)}
						class="text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
					>
						Collapse all
					</button>
				{/if}
			</div>
			<div class="space-y-2 max-h-[500px] overflow-y-auto">
				{#each bundle.resultHistory as item, idx}
					{@const executed = new Date(item.executedAt)}
					<div class="rounded-xl border border-chat-border bg-[#0d0d18] overflow-hidden">
						<button
							onclick={() => (expandedHistoryIndex = expandedHistoryIndex === idx ? -1 : idx)}
							class="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
						>
							<div class="flex items-center gap-3">
								<div class="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold {item.success ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}">
									{item.success ? '✓' : '✗'}
								</div>
								<div>
									<p class="text-xs font-medium text-slate-300">
										{executed.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })}
										<span class="ml-1 text-slate-500">
											{executed.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
										</span>
									</p>
									<p class="mt-0.5 max-w-md truncate text-[10px] text-slate-600">
										{item.result.slice(0, 80)}{item.result.length > 80 ? '...' : ''}
									</p>
								</div>
							</div>
							<svg
								class="h-4 w-4 text-slate-600 transition-transform {expandedHistoryIndex === idx ? 'rotate-180' : ''}"
								fill="none" stroke="currentColor" viewBox="0 0 24 24"
							>
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
							</svg>
						</button>
						{#if expandedHistoryIndex === idx}
							<div class="border-t border-chat-border px-4 py-4">
								<div class="max-h-[300px] overflow-y-auto">
									<MarkdownRenderer content={item.result} />
								</div>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{:else if !isNew && bundle?.researchResultText}
		<div class="border-t border-chat-border p-5">
			<div class="mb-2 flex items-center justify-between">
				<h4 class="text-xs font-medium text-slate-400">Last Result</h4>
				{#if bundle.lastExecutedAt}
					<span class="text-[10px] text-slate-600">
						{new Date(bundle.lastExecutedAt).toLocaleString()}
					</span>
				{/if}
			</div>
			<div class="max-h-[300px] overflow-y-auto rounded-xl border border-chat-border bg-[#0d0d18] p-4">
				<MarkdownRenderer content={bundle.researchResultText} />
			</div>
		</div>
	{/if}
</div>
