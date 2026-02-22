<script lang="ts">
	let { size = 32 }: { size?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 100 100"
	fill="none"
	xmlns="http://www.w3.org/2000/svg"
	class="flex-shrink-0"
	aria-label="JukimBot avatar"
>
	<!-- Antenna -->
	<line x1="50" y1="14" x2="50" y2="24" stroke="#a78bfa" stroke-width="2.5" stroke-linecap="round" />
	<circle cx="50" cy="11" r="3.5" fill="#a78bfa" />

	<!-- Head -->
	<rect x="18" y="24" width="64" height="58" rx="14" fill="#7c3aed" />

	<!-- Forehead label -->
	<text
		x="50"
		y="42"
		text-anchor="middle"
		font-size="10"
		font-weight="700"
		fill="#c4b5fd"
		font-family="system-ui, sans-serif"
		letter-spacing="0.5">Jukim</text
	>

	<!-- Eyes -->
	<circle cx="36" cy="56" r="6" fill="#1e1b4b" />
	<circle cx="64" cy="56" r="6" fill="#1e1b4b" />
	<circle cx="37" cy="55" r="3" fill="#818cf8" />
	<circle cx="65" cy="55" r="3" fill="#818cf8" />
	<circle cx="38.5" cy="53.5" r="1.2" fill="white" opacity="0.85" />
	<circle cx="66.5" cy="53.5" r="1.2" fill="white" opacity="0.85" />

	<!-- Mouth -->
	<path d="M40 70 Q50 77 60 70" stroke="#c4b5fd" stroke-width="2" fill="none" stroke-linecap="round" />

	<!-- Ears -->
	<rect x="10" y="44" width="8" height="14" rx="4" fill="#6d28d9" />
	<rect x="82" y="44" width="8" height="14" rx="4" fill="#6d28d9" />
</svg>
