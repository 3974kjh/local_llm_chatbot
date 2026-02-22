<script lang="ts">
	let { label = 'Thinking' }: { label?: string } = $props();
</script>

<div class="flex items-center gap-2 py-1">
	<span class="text-xs text-slate-500">{label}</span>
	<div class="flex items-center gap-1">
		<span class="dot-pulse h-1.5 w-1.5 rounded-full bg-violet-400"></span>
		<span class="dot-pulse h-1.5 w-1.5 rounded-full bg-violet-400"></span>
		<span class="dot-pulse h-1.5 w-1.5 rounded-full bg-violet-400"></span>
	</div>
</div>
