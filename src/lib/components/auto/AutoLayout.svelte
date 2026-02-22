<script lang="ts">
	import BotAvatar from '../BotAvatar.svelte';
	import ModeToggle from '../ModeToggle.svelte';
	import BundleEditor from './BundleEditor.svelte';
	import { autoStore } from '$lib/stores/auto.svelte';

	function formatTimer(minutes: number): string {
		if (minutes >= 1440) {
			const d = Math.floor(minutes / 1440);
			const remainH = Math.floor((minutes % 1440) / 60);
			if (remainH > 0) return `${d}d${remainH}h`;
			return `${d}d`;
		}
		if (minutes >= 60) {
			const h = Math.floor(minutes / 60);
			const m = minutes % 60;
			return m > 0 ? `${h}h${m}m` : `${h}h`;
		}
		return `${minutes}m`;
	}
</script>

<div class="flex h-screen overflow-hidden bg-chat-bg text-slate-200">
	<!-- Bundle List Sidebar -->
	<div class="flex w-72 flex-shrink-0 flex-col border-r border-chat-border bg-chat-surface">
		<!-- Sidebar Header -->
		<div class="p-4">
			<div class="mb-4 flex items-center gap-3">
				<BotAvatar size={36} />
				<div>
					<h2 class="text-sm font-semibold text-slate-200">JukimBot</h2>
					<p class="text-[10px] text-slate-500">Auto Mode</p>
				</div>
			</div>

			<button
				onclick={() => autoStore.startCreating()}
				class="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-600/20 transition-all hover:bg-violet-500 active:scale-[0.98]"
			>
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 4v16m8-8H4"
					/>
				</svg>
				New Bundle
			</button>
		</div>

		<!-- Bundle List -->
		<div class="flex-1 overflow-y-auto px-2 pb-4">
			{#if autoStore.bundles.length === 0 && !autoStore.isCreating}
				<div class="px-3 py-8 text-center text-xs text-slate-600">No bundles yet</div>
			{:else}
				{#each autoStore.bundles as bundle (bundle.id)}
					<button
						onclick={() => autoStore.selectBundle(bundle.id)}
						class="group mb-1 w-full rounded-lg px-3 py-2.5 text-left transition-all {bundle.id ===
						autoStore.selectedId
							? 'bg-chat-raised text-slate-200'
							: 'text-slate-400 hover:bg-chat-raised/50 hover:text-slate-300'}"
					>
						<div class="flex items-center gap-2">
							<div
								class="h-2 w-2 flex-shrink-0 rounded-full {bundle.isActive
									? 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
									: bundle.isExecuting
										? 'animate-pulse bg-amber-500'
										: 'bg-slate-600'}"
							></div>
							<p class="flex-1 truncate text-sm font-medium">{bundle.title}</p>
						</div>
						<div class="mt-1 flex items-center gap-2 pl-4 text-[10px] text-slate-600">
							<span>{formatTimer(bundle.autoTimeSetting)}</span>
							<span>&middot;</span>
							<span>{bundle.autoReferUrl.length} URL{bundle.autoReferUrl.length > 1 ? 's' : ''}</span>
							{#if bundle.isActive}
								<span class="text-emerald-500">Active</span>
							{/if}
						</div>
					</button>
				{/each}
			{/if}
		</div>

		<!-- Kakao Status -->
		<div class="border-t border-chat-border p-3">
			{#if autoStore.kakaoConnected}
				<div class="space-y-2">
					<div class="flex items-center gap-2 text-[10px]">
						<div class="h-2 w-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50"></div>
						<span class="text-emerald-400">Kakao Connected</span>
					</div>
					<button
						onclick={() => autoStore.sendTestMessage()}
						disabled={autoStore.kakaoTestLoading}
						class="flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-400 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
					>
						{#if autoStore.kakaoTestLoading}
							<svg class="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
								<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.25" />
								<path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
							</svg>
							Sending...
						{:else}
							<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
							</svg>
							Test Send
						{/if}
					</button>
					{#if autoStore.kakaoTestResult}
						<p class="text-[10px] {autoStore.kakaoTestResult.startsWith('Test message sent')
							? 'text-emerald-400'
							: 'text-red-400'}">
							{autoStore.kakaoTestResult}
						</p>
					{/if}
					<a
						href="/api/auto/kakao/connect"
						class="block text-center text-[10px] text-slate-600 transition-colors hover:text-slate-400"
					>
						Reconnect
					</a>
				</div>
			{:else if autoStore.kakaoHasTokens && autoStore.kakaoTokenExpired}
				<div class="space-y-2">
					<div class="flex items-center gap-2 text-[10px]">
						<div class="h-2 w-2 rounded-full bg-amber-500"></div>
						<span class="text-amber-400">Token Expired</span>
					</div>
					<a
						href="/api/auto/kakao/connect"
						class="flex items-center justify-center gap-1.5 rounded-lg bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-400 transition-colors hover:bg-amber-500/20"
					>
						Reconnect Kakao Talk
					</a>
				</div>
			{:else}
				<a
					href="/api/auto/kakao/connect"
					class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] text-slate-500 transition-colors hover:bg-chat-raised hover:text-amber-400"
				>
					<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
						/>
					</svg>
					Connect Kakao Talk
				</a>
			{/if}
		</div>
	</div>

	<!-- Main Content -->
	<div class="flex min-w-0 flex-1 flex-col">
		<!-- Header -->
		<header
			class="flex items-center justify-between border-b border-chat-border bg-chat-surface/60 px-4 py-3 backdrop-blur-md"
		>
			<div class="flex items-center gap-3">
				<BotAvatar size={32} />
				<div>
					<h1 class="text-sm font-semibold">Auto Mode</h1>
					<p class="text-[10px] text-slate-500">Scheduled URL analysis &amp; Kakao notifications</p>
				</div>
			</div>

			<ModeToggle />
		</header>

		<!-- Content -->
		{#if autoStore.isCreating}
			<BundleEditor isNew={true} />
		{:else if autoStore.selectedBundle}
			{#key autoStore.selectedId}
				<BundleEditor bundle={autoStore.selectedBundle} />
			{/key}
		{:else}
			<!-- Empty state -->
			<div class="flex flex-1 flex-col items-center justify-center px-4 text-center">
				<div
					class="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-chat-raised text-slate-500"
				>
					<svg class="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="1.5"
							d="M13 10V3L4 14h7v7l9-11h-7z"
						/>
					</svg>
				</div>
				<h2 class="mb-2 text-lg font-semibold text-slate-300">Create your first bundle</h2>
				<p class="max-w-sm text-sm text-slate-500">
					Set up automated URL analysis with custom prompts. Results are sent to your Kakao Talk on
					a schedule you define.
				</p>
				<button
					onclick={() => autoStore.startCreating()}
					class="mt-6 rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-medium text-white transition-all hover:bg-violet-500"
				>
					New Bundle
				</button>
			</div>
		{/if}
	</div>
</div>
