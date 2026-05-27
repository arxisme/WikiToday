<script lang="ts">
	import { onMount } from 'svelte';
	import { invoke } from '@tauri-apps/api/core';
	import { categories } from '$lib/topics';
	import { toasts, addToast, removeToast } from '$lib/stores/toast';
	import { fade } from 'svelte/transition';

	// Svelte 5 Reactive Runes state management
	let bookmarks = $state<any[]>([]);
	let history = $state<any[]>([]);

	let activeArticle = $state<{
		title: string;
		slug: string;
		html: string;
		description: string;
		image: string | null;
		related: string[];
		wordCount: number;
		linksCount: number;
		referencesCount: number;
	} | null>(null);
	
	let breadcrumbs = $state<string[]>([]);
	let isLoading = $state(false);
	let searchError = $state('');
	let searchQuery = $state('');
	
	let currentView = $state<'gateway' | 'reader' | 'library'>('gateway');
	let expandedCategory = $state<string | null>('Computer Science');
	let fontSize = $state<'sm' | 'md' | 'lg' | 'xl'>('md');
	let scrollProgress = $state(0);
	
	let isMobileSidebarOpen = $state(false);
	let isMobileSpecsOpen = $state(false);

	let theme = $state<'light' | 'dark'>('light');
	
	$effect(() => {
		if (typeof window !== 'undefined') {
			document.documentElement.setAttribute('data-theme', theme);
		}
	});
	
	let calculatedCoherenceTime = $state('150 µs');
	let calculatedDepth = $state('Level 3 - Expert');

	let suggestedRandomPicks = $state<{ category: string; topic: string }[]>([]);
	let visibleAccordionTopics = $state<{ [subcategoryName: string]: string[] }>({});

	function toggleTheme() {
		theme = theme === 'light' ? 'dark' : 'light';
		if (typeof window !== 'undefined') {
			localStorage.setItem('wikitoday-theme', theme);
		}
	}

	function refreshSuggestions() {
		suggestedRandomPicks = categories.map(cat => {
			const allTopics: string[] = [];
			cat.subcategories.forEach(sub => {
				allTopics.push(...sub.topics);
			});
			const randomTopic = allTopics[Math.floor(Math.random() * allTopics.length)] || 'Foundations';
			const shortCategoryName = cat.name.includes('&') ? cat.name.split('&')[0].trim() : cat.name;
			return {
				category: shortCategoryName,
				topic: randomTopic
			};
		});
	}
	
	function generateAccordionTopics() {
		const newAccordionTopics: { [subcategoryName: string]: string[] } = {};
		categories.forEach(cat => {
			cat.subcategories.forEach(sub => {
				const shuffled = [...sub.topics].sort(() => 0.5 - Math.random());
				newAccordionTopics[sub.name] = shuffled.slice(0, 5);
			});
		});
		visibleAccordionTopics = newAccordionTopics;
	}
	
	function handleReaderScroll(event: Event) {
		const target = event.target as HTMLElement;
		const docHeight = target.scrollHeight - target.clientHeight;
		if (docHeight > 0) {
			scrollProgress = (target.scrollTop / docHeight) * 100;
		} else {
			scrollProgress = 0;
		}
	}

	onMount(async () => {
		if (typeof window !== 'undefined') {
			const storedTheme = localStorage.getItem('wikitoday-theme');
			if (storedTheme === 'dark' || storedTheme === 'light') {
				theme = storedTheme as 'light' | 'dark';
			} else {
				theme = 'light';
			}
		}
		await loadUserData();
		refreshSuggestions();
		generateAccordionTopics();
		
		// Parse query parameters
		const params = new URLSearchParams(window.location.search);
		const initialArticle = params.get('article');
		if (initialArticle) {
			loadArticle(decodeURIComponent(initialArticle));
		}
	});

	// Load bookmarks/history locally from native Tauri Rust backend
	async function loadUserData() {
		try {
			const loadedBookmarks = await invoke<any[]>('load_bookmarks');
			const loadedHistory = await invoke<any[]>('load_history');
			bookmarks = loadedBookmarks || [];
			history = loadedHistory || [];
		} catch (e) {
			console.error('Failed to load local data from Rust backend:', e);
			// Fallback: If Tauri commands fail, use browser localStorage
			if (typeof window !== 'undefined') {
				try {
					const localBookmarks = localStorage.getItem('wikitoday-bookmarks');
					const localHistory = localStorage.getItem('wikitoday-history');
					if (localBookmarks) bookmarks = JSON.parse(localBookmarks);
					if (localHistory) history = JSON.parse(localHistory);
				} catch (err) {
					console.error('LocalStorage fallback error:', err);
				}
			}
		}
	}

	// Fetch Wikipedia parsed content & page summary details
	async function loadArticle(title: string, addToBreadcrumbs = true) {
		if (!title) return;
		
		isLoading = true;
		searchError = '';
		scrollProgress = 0;
		isMobileSidebarOpen = false;
		
		const cleanTitle = title.trim().replace(/\s+/g, '_');
		const seed = cleanTitle.length;
		calculatedCoherenceTime = `${(100 + (seed % 15) * 10).toFixed(0)} µs`;
		calculatedDepth = seed % 3 === 0 ? 'Level 4 - Advanced Dive' : seed % 2 === 0 ? 'Level 3 - Expert Dive' : 'Level 2 - Core Entry';
		
		try {
			// 1. Fetch summary from Wikipedia REST API (for description & banner image)
			const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanTitle)}`;
			const summaryRes = await fetch(summaryUrl);
			let summaryData: any = null;
			if (summaryRes.ok) {
				summaryData = await summaryRes.json();
			}

			// 2. Fetch parsed HTML content
			const parseUrl = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(cleanTitle)}&redirects=true&prop=text|images|displaytitle|links&format=json&origin=*`;
			const parseRes = await fetch(parseUrl);
			if (!parseRes.ok) throw new Error('Parse request failed');
			
			const parseData = await parseRes.json();
			
			if (parseData.error) {
				await handleSearch(title);
				return;
			}
			
			const rawDisplayTitle = parseData.parse.displaytitle || title;
			const displayTitle = rawDisplayTitle.replace(/<[^>]*>/g, '');
			
			let htmlContent = parseData.parse.text['*'];
			htmlContent = htmlContent.replace(/<span class="mw-editsection">.*?<\/span>/g, '');
			
			const rawLinks = parseData.parse.links || [];
			const filteredLinks = rawLinks
				.filter((l: any) => l.ns === 0 && !l['*'].includes(':'))
				.slice(0, 5)
				.map((l: any) => l['*']);

			// Save session history natively
			await syncHistory(displayTitle, cleanTitle);
			
			// Update browser history query parameters if window available
			if (typeof window !== 'undefined') {
				const newUrl = `${window.location.pathname}?article=${encodeURIComponent(cleanTitle)}`;
				window.history.pushState({ path: newUrl }, '', newUrl);
			}

			// Update active article state
			activeArticle = {
				title: displayTitle,
				slug: cleanTitle,
				html: htmlContent,
				description: summaryData?.description || summaryData?.extract || 'An exhaustive inquiry into this subject.',
				image: summaryData?.originalimage?.source || summaryData?.thumbnail?.source || null,
				related: filteredLinks.length > 0 ? filteredLinks : ['Quantum Computing', 'Information Theory', 'Complexity Theory'],
				wordCount: htmlContent.split(/\s+/).length,
				linksCount: rawLinks.length,
				referencesCount: (htmlContent.match(/class="reference"/g) || []).length
			};
			
			if (addToBreadcrumbs) {
				if (breadcrumbs.length === 0 || breadcrumbs[breadcrumbs.length - 1] !== cleanTitle) {
					breadcrumbs = [...breadcrumbs, cleanTitle];
				}
			}
			
			currentView = 'reader';

			const readerContainer = document.getElementById('reader-scroll-container');
			if (readerContainer) {
				readerContainer.scrollTop = 0;
			}
		} catch (e) {
			console.error('Failed to fetch Wikipedia article:', e);
			searchError = `Could not load "${title}". Wikipedia might be down or page does not exist.`;
			addToast(`Failed to load article: ${title}`, 'error');
		} finally {
			isLoading = false;
		}
	}

	// Search Wikipedia if direct slug match is not found
	async function handleSearch(queryText: string) {
		if (!queryText.trim()) return;
		
		isLoading = true;
		searchError = '';
		isMobileSidebarOpen = false;
		
		try {
			const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(queryText)}&format=json&origin=*`;
			const response = await fetch(searchUrl);
			if (!response.ok) throw new Error('Search request failed');
			
			const data = await response.json();
			const results = data.query?.search || [];
			
			if (results.length > 0) {
				const bestMatchTitle = results[0].title;
				await loadArticle(bestMatchTitle);
			} else {
				searchError = `No Wikipedia articles found for "${queryText}".`;
				addToast('No articles found', 'info');
				isLoading = false;
			}
		} catch (e) {
			console.error('Wikipedia search error:', e);
			searchError = 'An error occurred during search. Please try again.';
			isLoading = false;
		}
	}

	// Intercept clicks on links in the parsed Wikipedia text
	function handleContentClick(event: MouseEvent) {
		const anchor = (event.target as HTMLElement).closest('a');
		if (!anchor) return;
		
		const href = anchor.getAttribute('href');
		if (!href) return;
		
		if (href.startsWith('/wiki/')) {
			event.preventDefault();
			const targetSlug = href.substring(6);
			
			if (
				targetSlug.startsWith('File:') ||
				targetSlug.startsWith('Help:') ||
				targetSlug.startsWith('Special:') ||
				targetSlug.startsWith('Category:') ||
				targetSlug.startsWith('Wikipedia:') ||
				targetSlug.startsWith('Template:')
			) {
				if (targetSlug.startsWith('File:')) {
					const cleanFilename = targetSlug.substring(5);
					window.open(`https://en.wikipedia.org/wiki/File:${cleanFilename}`, '_blank');
				}
				return;
			}
			
			loadArticle(decodeURIComponent(targetSlug));
		} else if (href.startsWith('#')) {
			event.preventDefault();
			const targetId = href.substring(1);
			const targetEl = document.getElementById(targetId);
			if (targetEl) {
				targetEl.scrollIntoView({ behavior: 'smooth' });
			}
		} else {
			anchor.setAttribute('target', '_blank');
			anchor.setAttribute('rel', 'noopener noreferrer');
		}
	}

	// Sync session history to Rust local backend
	async function syncHistory(title: string, slug: string) {
		history = history.filter((h: any) => h.slug !== slug);
		history = [
			{
				title,
				slug,
				timestamp: Date.now()
			},
			...history
		];
		if (history.length > 50) {
			history = history.slice(0, 50);
		}
		
		try {
			await invoke('save_history', { history });
		} catch (e) {
			console.error('Failed to sync history to Rust backend:', e);
			if (typeof window !== 'undefined') {
				localStorage.setItem('wikitoday-history', JSON.stringify(history));
			}
		}
	}

	// Toggle bookmark and save natively to Rust local backend
	async function toggleLike() {
		if (!activeArticle) return;
		
		const { title, slug } = activeArticle;
		const isBookmarked = bookmarks.some((b) => b.slug === slug);
		
		if (isBookmarked) {
			bookmarks = bookmarks.filter((b: any) => b.slug !== slug);
			addToast('Removed from favorites', 'info');
		} else {
			bookmarks = [
				{
					title,
					slug,
					description: activeArticle.description,
					timestamp: Date.now()
				},
				...bookmarks
			];
			addToast('Saved to deep dive library!', 'success');
		}
		
		try {
			await invoke('save_bookmarks', { bookmarks });
		} catch (e) {
			console.error('Failed to save bookmarks to Rust backend:', e);
			if (typeof window !== 'undefined') {
				localStorage.setItem('wikitoday-bookmarks', JSON.stringify(bookmarks));
			}
		}
	}

	// Remove bookmark directly and sync with Rust local backend
	async function removeBookmark(slug: string) {
		bookmarks = bookmarks.filter((b: any) => b.slug !== slug);
		try {
			await invoke('save_bookmarks', { bookmarks });
		} catch (e) {
			console.error('Failed to remove bookmark from Rust backend:', e);
			if (typeof window !== 'undefined') {
				localStorage.setItem('wikitoday-bookmarks', JSON.stringify(bookmarks));
			}
		}
		addToast('Removed from library', 'info');
	}

	// Clear local reading history in Rust local backend
	async function clearHistory() {
		if (!confirm('Are you sure you want to clear your reading history?')) return;
		history = [];
		try {
			await invoke('save_history', { history });
		} catch (e) {
			console.error('Failed to clear history on Rust backend:', e);
			if (typeof window !== 'undefined') {
				localStorage.setItem('wikitoday-history', JSON.stringify(history));
			}
		}
		addToast('Reading history cleared', 'info');
	}

	function jumpToBreadcrumb(slug: string, index: number) {
		breadcrumbs = breadcrumbs.slice(0, index + 1);
		loadArticle(slug, false);
	}

	function surpriseMe() {
		const allTopics: string[] = [];
		categories.forEach(c => {
			c.subcategories.forEach(s => {
				allTopics.push(...s.topics);
			});
		});
		
		if (allTopics.length === 0) return;
		
		const randomIndex = Math.floor(Math.random() * allTopics.length);
		const randomTopic = allTopics[randomIndex];
		
		breadcrumbs = [];
		loadArticle(randomTopic);
	}

	function copyBibTeX() {
		if (!activeArticle) return;
		const cleanTitle = activeArticle.title.replace(/<[^>]*>/g, '');
		const bibtex = `@misc{wikitoday_${activeArticle.slug},\n  author = {Wikipedia Contributors},\n  title = {${cleanTitle}},\n  howpublished = {WikiToday Research Desktop v1.0},\n  year = {2026},\n  url = {https://en.wikipedia.org/wiki/${activeArticle.slug}}\n}`;
		
		navigator.clipboard.writeText(bibtex).then(() => {
			addToast('BibTeX copied to clipboard!', 'success');
		}).catch(() => {
			addToast('Copy failed', 'error');
		});
	}

	function toggleCategory(catName: string) {
		expandedCategory = expandedCategory === catName ? null : catName;
	}

	function formatDate(timestamp: number): string {
		const date = new Date(timestamp);
		return date.toLocaleDateString('en-GB', {
			day: '2-digit',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// Svelte 5 Derived Runes
	let isLiked = $derived(activeArticle ? bookmarks.some((b) => b.slug === activeArticle!.slug) : false);
	let activeCategoryName = $derived(activeArticle?.slug
		? (categories.find((c) => 
			c.subcategories.some((s) => 
				s.topics.some((t) => t.toLowerCase().replace(/\s+/g, '_') === activeArticle!.slug.toLowerCase())
			)
		  )?.name || 'Foundations')
		: 'Foundations');
</script>

<!-- Immersive Dark/Light Fullscreen deep dive console view -->
<div class="fixed inset-0 z-[100] theme-bg-primary theme-text-primary flex flex-col font-sans overflow-hidden select-none wikitoday-container {theme === 'dark' ? 'dark-mode' : 'light-mode'}">
	
	<!-- Top Navigation Header -->
	<header class="h-[64px] border-b theme-border theme-bg-secondary flex items-center justify-between px-6 shrink-0 relative z-30">
		<div class="flex items-center gap-4">
			<!-- Mobile Hamburger toggle -->
			<button 
				on:click={() => isMobileSidebarOpen = !isMobileSidebarOpen}
				class="lg:hidden w-10 h-10 border theme-border rounded-lg theme-bg-tertiary flex items-center justify-center text-muted hover:text-[#e8590c] cursor-pointer"
				aria-label="Toggle Navigation Drawer"
			>
				<i class="fas fa-bars"></i>
			</button>

			<!-- Monospace Breadcrumb Timeline -->
			<div class="flex items-center gap-2 font-mono text-[0.7rem] uppercase tracking-wider text-muted overflow-hidden max-w-[500px]">
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<span class="hover:theme-text-white cursor-pointer transition-colors" on:click={() => currentView = 'gateway'}>Wikitoday Desktop</span>
				<span class="opacity-30">/</span>
				{#if activeArticle}
					<span class="text-muted/80">{activeCategoryName}</span>
					<span class="opacity-30">/</span>
					<span class="text-[#e8590c] font-bold truncate max-w-[200px]">{activeArticle.title.replace(/<[^>]*>/g, '')}</span>
				{:else}
					<span class="text-muted/80">Gateway</span>
				{/if}
			</div>
		</div>

		<!-- Top Right Info & Controls -->
		<div class="flex items-center gap-4">
			<!-- Quick Navigation Tags (Desktop only) -->
			{#if activeArticle}
				<div class="hidden md:flex items-center gap-3 font-mono text-[0.65rem] uppercase tracking-wider">
					{#each activeArticle.related.slice(0, 3) as rel}
						<button 
							on:click={() => loadArticle(rel)}
							class="px-2.5 py-1 border theme-border rounded-md theme-bg-tertiary hover:border-[var(--accent-blue)] hover:text-[var(--accent-blue)] transition-all cursor-pointer text-muted max-w-[120px] truncate"
						>
							{rel}
						</button>
					{/each}
				</div>
			{/if}

			<!-- Theme Toggle Button -->
			<div class="flex items-center gap-3 border-l theme-border pl-4">
				<button 
					on:click={toggleTheme}
					class="w-10 h-10 border theme-border rounded-lg theme-bg-tertiary flex items-center justify-center text-[#e8590c] hover:bg-[#e8590c]/5 cursor-pointer transition-all"
					title="Toggle theme (Light / Dark)"
				>
					{#if theme === 'light'}
						<i class="fas fa-moon text-xs"></i>
					{:else}
						<i class="fas fa-sun text-xs"></i>
					{/if}
				</button>
			</div>
		</div>
	</header>

	<!-- Main Console Space -->
	<div class="flex-grow flex w-full relative overflow-hidden">
		
		<!-- LEFT SIDEBAR: CONSOLE DASHBOARD (Desktop) & SLIDE OUT DRAWER (Mobile) -->
		<aside 
			class="w-[260px] border-r theme-border theme-bg-secondary flex flex-col shrink-0 relative z-30 transition-transform duration-300
				max-lg:fixed max-lg:top-[64px] max-lg:bottom-0 max-lg:left-0 
				{isMobileSidebarOpen ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full'}"
		>
			<!-- Logo Monospace block -->
			<div class="p-6 border-b theme-border shrink-0">
				<div class="font-anta text-lg font-black tracking-[-0.04em] text-[#e8590c] leading-none uppercase">
					Wikitoday
				</div>
				<div class="font-mono text-[0.55rem] font-bold tracking-[0.18em] uppercase text-muted mt-1.5">
					Desktop Deep Dive Engine
				</div>
			</div>

			<!-- Quick Search input inside sidebar -->
			<div class="p-4 border-b theme-border shrink-0">
				<form on:submit|preventDefault={() => handleSearch(searchQuery)} class="relative">
					<input
						type="text"
						bind:value={searchQuery}
						placeholder="Search topics..."
						class="w-full theme-bg-primary border theme-border focus:border-[var(--accent-orange)] outline-none font-mono text-[0.7rem] rounded-lg pl-3 pr-8 py-2 theme-text-white placeholder-muted"
					/>
					<button type="submit" class="absolute right-2 top-2 text-muted hover:theme-text-white cursor-pointer transition-colors" aria-label="Submit Search">
						<i class="fas fa-search text-[0.65rem]"></i>
					</button>
				</form>
			</div>

			<!-- Main View Navigation links -->
			<nav class="flex-grow overflow-y-auto p-4 space-y-4">
				<div class="space-y-1">
					<button
						on:click={() => { currentView = 'gateway'; isMobileSidebarOpen = false; }}
						class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-mono text-[0.75rem] uppercase tracking-wider text-left transition-all cursor-pointer 
							{currentView === 'gateway' ? 'text-[var(--accent-orange)] bg-[var(--accent-orange-bg)] border-l-2 border-[var(--accent-orange)]' : 'text-muted hover:theme-text-white hover:bg-[var(--bg-tertiary)]'}"
					>
						<i class="fas fa-house-chimney text-xs"></i> Gateway
					</button>
					<button
						on:click={() => { currentView = 'library'; isMobileSidebarOpen = false; }}
						class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-mono text-[0.75rem] uppercase tracking-wider text-left transition-all cursor-pointer 
							{currentView === 'library' ? 'text-[var(--accent-orange)] bg-[var(--accent-orange-bg)] border-l-2 border-[var(--accent-orange)]' : 'text-muted hover:theme-text-white hover:bg-[var(--bg-tertiary)]'}"
					>
						<i class="fas fa-folder-open text-xs"></i> Desktop Library ({bookmarks.length})
					</button>
				</div>

				<!-- Random suggestions picks from each category -->
				<div class="border-t theme-border pt-4 space-y-2">
					<div class="flex items-center justify-between px-3">
						<span class="font-mono text-[0.55rem] font-black uppercase text-muted tracking-widest block">🎲 Category Picks</span>
						<button 
							on:click={refreshSuggestions}
							class="text-muted hover:theme-text-white transition-colors cursor-pointer"
							title="Refresh Suggestions"
							aria-label="Refresh Suggestions"
						>
							<i class="fas fa-arrows-rotate text-[0.65rem]"></i>
						</button>
					</div>
					<div class="space-y-1.5 font-mono text-[0.65rem] px-0.5">
						{#each suggestedRandomPicks as pick}
							<div class="p-2 border theme-border-muted rounded-lg theme-bg-primary flex flex-col gap-1 hover:border-[var(--accent-orange)] transition-all group relative overflow-hidden">
								<span class="text-muted text-[0.52rem] uppercase tracking-wider block font-bold group-hover:text-[var(--accent-orange)] transition-colors">
									{pick.category}
								</span>
								<button
									on:click={() => { breadcrumbs = []; loadArticle(pick.topic); }}
									class="text-left font-bold theme-text-white hover:text-[var(--accent-orange)] transition-colors truncate block w-full cursor-pointer pl-2.5 relative"
									title="Deep dive into {pick.topic}"
								>
									<span class="absolute left-0 text-[#e8590c] font-black">▶</span>
									{pick.topic}
								</button>
							</div>
						{/each}
					</div>
				</div>

				<!-- Categories Accordion List inside Left Sidebar -->
				<div class="border-t theme-border pt-4 space-y-2">
					<div class="flex items-center justify-between px-3 mb-2">
						<span class="font-mono text-[0.55rem] font-black uppercase text-muted tracking-widest block">Scientific Branches</span>
						<button 
							on:click={generateAccordionTopics}
							class="text-muted hover:theme-text-white transition-colors cursor-pointer"
							title="Reroll Branch Suggestions"
							aria-label="Reroll Branch Suggestions"
						>
							<i class="fas fa-arrows-rotate text-[0.65rem]"></i>
						</button>
					</div>
					{#each categories as category}
						<div class="border theme-border-muted rounded-lg overflow-hidden theme-bg-primary">
							<button
								on:click={() => toggleCategory(category.name)}
								class="w-full flex items-center justify-between p-2.5 text-left cursor-pointer"
							>
								<span class="font-mono text-[0.65rem] font-bold text-muted uppercase flex items-center gap-2">
									<i class="{category.icon} text-[0.75rem] text-[#e8590c]/80"></i> {category.name}
								</span>
								<i class="fas fa-chevron-down text-[0.55rem] text-muted transition-transform duration-200 {expandedCategory === category.name ? 'rotate-180 text-[#e8590c]' : ''}"></i>
							</button>

							{#if expandedCategory === category.name}
								<div class="border-t theme-border-muted p-2.5 theme-bg-secondary space-y-3 font-mono text-[0.65rem]">
									{#each category.subcategories as sub}
										<div class="space-y-1">
											<span class="font-bold text-[var(--accent-orange)]/70 uppercase tracking-[0.05em] block mb-1 text-[0.6rem] border-b theme-border-muted pb-0.5">
												{sub.name}
											</span>
											<div class="flex flex-col gap-1">
												{#each (visibleAccordionTopics[sub.name] || sub.topics) as topic}
													<button
														on:click={() => { breadcrumbs = []; loadArticle(topic); }}
														class="text-left text-muted hover:theme-text-white hover:translate-x-1 py-1 transition-all truncate block cursor-pointer"
													>
														▶ {topic}
													</button>
												{/each}
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</nav>

			<!-- Sidebar Footer controls -->
			<div class="p-4 border-t theme-border shrink-0 theme-bg-secondary space-y-3.5">
				<button 
					on:click={surpriseMe}
					class="w-full py-2.5 bg-[#e8590c] hover:bg-[#e8590c]/90 text-[#0c0c0e] font-mono text-[0.7rem] font-bold uppercase tracking-widest rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(232,89,12,0.2)] hover:shadow-[0_0_20px_rgba(232,89,12,0.4)]"
				>
					<i class="fas fa-shuffle"></i> Surprise Me
				</button>
				<div class="flex items-center justify-between font-mono text-[0.55rem] text-muted uppercase">
					<span>DESKTOP STORAGE: ACTIVE</span>
				</div>
			</div>
		</aside>

		<!-- MAIN ARTICLE STAGE & SPEC PANEL COLUMNS -->
		<div class="flex-grow flex relative overflow-hidden theme-bg-primary">
			
			<!-- CENTER COLUMN: WRAPPER READER (Fills remaining or shares with specs) -->
			<div class="flex-grow flex flex-col relative overflow-hidden">
				
				<!-- Main scrolling container -->
				<div 
					id="reader-scroll-container"
					on:scroll={handleReaderScroll}
					class="flex-grow overflow-y-auto px-6 md:px-12 py-10"
				>
					<div class="max-w-[760px] mx-auto relative">
						
						{#if isLoading}
							<!-- High-fidelity Console Loading skeleton -->
							<div class="space-y-8 animate-pulse py-8">
								<div class="flex gap-4">
									<div class="h-4 theme-bg-tertiary w-20 rounded"></div>
									<div class="h-4 theme-bg-tertiary w-28 rounded"></div>
								</div>
								<div class="h-10 theme-bg-tertiary w-full rounded"></div>
								<div class="h-6 theme-bg-tertiary w-5/6 rounded"></div>
								<div class="h-64 theme-bg-tertiary border border-dashed theme-border rounded-2xl w-full flex items-center justify-center">
									<i class="fas fa-atom text-2xl text-[#e8590c]/40 animate-spin"></i>
								</div>
								<div class="space-y-4">
									<div class="h-4 theme-bg-tertiary w-full rounded"></div>
									<div class="h-4 theme-bg-tertiary w-full rounded"></div>
									<div class="h-4 theme-bg-tertiary w-4/5 rounded"></div>
								</div>
							</div>
						{:else if searchError}
							<!-- Error stage -->
							<div class="flex flex-col items-center justify-center py-20 text-center border border-dashed border-[#ff3b22]/30 bg-[#ff3b22]/5 rounded-2xl p-8">
								<div class="w-14 h-14 rounded-full bg-[#ff3b22]/10 flex items-center justify-center mb-4 text-[#ff3b22] border border-[#ff3b22]/20">
									<i class="fas fa-triangle-exclamation text-lg"></i>
								</div>
								<h3 class="font-mono text-xs font-bold uppercase tracking-widest text-[#ff3b22] mb-2">Search Failure</h3>
								<p class="font-content text-sm text-muted max-w-[340px] leading-relaxed mb-6">
									{searchError}
								</p>
								<button 
									on:click={surpriseMe} 
									class="px-4 py-2 bg-[#e8590c] text-black font-mono text-[0.7rem] font-bold uppercase tracking-widest rounded-lg cursor-pointer"
								>
									Random Deep Dive
								</button>
							</div>
						{:else if currentView === 'gateway'}
							<!-- GATEWAY: INTRO LANDING SCREEN -->
							<div class="flex flex-col py-12 text-center max-w-[620px] mx-auto">
								<div class="w-20 h-20 rounded-2xl border border-[var(--accent-orange)]/40 bg-[var(--accent-orange-bg)] flex items-center justify-center mx-auto mb-8 text-[#e8590c] shadow-[0_0_20px_var(--glow)]">
									<i class="fas fa-satellite-dish text-3xl"></i>
								</div>
								<h1 class="font-heading text-3xl md:text-4xl font-extrabold theme-text-white tracking-tight mb-4 uppercase">
									Wikitoday Desktop
								</h1>
								<p class="font-content text-sm text-muted leading-relaxed mb-8">
									An immersive offline-ready desktop console interface to explore Wikipedia's deepest rabbit holes. Choose a scientific branch from the left selector, input a query, or trigger the Surprise Me randomizer. All bookmarks and browsing history are saved natively on your machine!
								</p>

								<!-- Quick start grid -->
								<div class="grid grid-cols-2 gap-4 text-left font-mono text-[0.7rem] mb-12">
									<button 
										on:click={() => loadArticle('Quantum computing')}
										class="p-4 border theme-border theme-bg-secondary hover:border-[var(--accent-orange)] rounded-xl cursor-pointer transition-all group"
									>
										<span class="text-[#e8590c] block mb-1 group-hover:translate-x-1 transition-transform">01 / QUANTUM COMPUTING ➔</span>
										<span class="text-muted text-[0.6rem] block">Explore quantum logic gates and qubits.</span>
									</button>
									<button 
										on:click={() => loadArticle('Artificial intelligence')}
										class="p-4 border theme-border theme-bg-secondary hover:border-[var(--accent-orange)] rounded-xl cursor-pointer transition-all group"
									>
										<span class="text-[#e8590c] block mb-1 group-hover:translate-x-1 transition-transform">02 / MACHINE LEARNING ➔</span>
										<span class="text-muted text-[0.6rem] block">Neural nets and information synthesis.</span>
									</button>
									<button 
										on:click={() => loadArticle('General relativity')}
										class="p-4 border theme-border theme-bg-secondary hover:border-[var(--accent-orange)] rounded-xl cursor-pointer transition-all group"
									>
										<span class="text-[#e8590c] block mb-1 group-hover:translate-x-1 transition-transform">03 / COSMOLOGY & RELATIVITY ➔</span>
										<span class="text-muted text-[0.6rem] block">Spacetime metric tensors and gravity.</span>
									</button>
									<button 
										on:click={() => loadArticle('Game theory')}
										class="p-4 border theme-border theme-bg-secondary hover:border-[var(--accent-orange)] rounded-xl cursor-pointer transition-all group"
									>
										<span class="text-[#e8590c] block mb-1 group-hover:translate-x-1 transition-transform">04 / APPLIED MATHEMATICS ➔</span>
										<span class="text-muted text-[0.6rem] block">Strategic models of dynamic utility payoffs.</span>
									</button>
								</div>
								
								<div class="flex items-center justify-center gap-3">
									<button 
										on:click={surpriseMe} 
										class="px-6 py-3 bg-[#e8590c] text-black font-mono text-[0.7rem] font-bold uppercase tracking-widest rounded-lg cursor-pointer hover:bg-[#e8590c]/90 transition-all shadow-[0_0_15px_rgba(232,89,12,0.2)]"
									>
										Surprise Me
									</button>
								</div>
							</div>

						{:else if currentView === 'library'}
							<!-- LIBRARY: SAVED BOOKMARKS AND HISTORY LISTS -->
							<div class="space-y-10 py-4 max-w-[680px] mx-auto">
								<div class="border-b theme-border pb-4">
									<h2 class="font-heading text-2xl font-black theme-text-white uppercase flex items-center gap-3">
										<i class="fas fa-folder-open text-[#e8590c]"></i> Deep Library Console
									</h2>
									<p class="font-content text-xs text-muted mt-1">Manage deep dive research entries saved locally on your desktop.</p>
								</div>

								<!-- Bookmarks list -->
								<div class="space-y-4">
									<h3 class="font-mono text-xs font-bold uppercase tracking-wider text-[#e8590c] flex items-center justify-between">
										<span>❤️ Local Bookmarks ({bookmarks.length})</span>
									</h3>
									{#if bookmarks.length === 0}
										<div class="text-center py-10 border border-dashed theme-border rounded-2xl theme-bg-secondary">
											<i class="fas fa-heart-crack text-muted/30 text-xl mb-3 block"></i>
											<p class="font-mono text-[0.7rem] text-muted m-0">No bookmarks saved locally. Like an article to bookmark it.</p>
										</div>
									{:else}
										<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
											{#each bookmarks as fav}
												<div class="p-4 border theme-border theme-bg-secondary hover:border-[var(--accent-orange)] rounded-xl flex justify-between items-start group transition-all">
													<div class="flex-1 truncate mr-2">
														<button
															on:click={() => { breadcrumbs = []; loadArticle(fav.slug); }}
															class="font-mono text-[0.75rem] font-bold theme-text-white hover:text-[var(--accent-orange)] text-left truncate block w-full cursor-pointer"
														>
															{fav.title}
														</button>
														<span class="font-mono text-[0.55rem] text-muted mt-1 block uppercase">Wikitoday Local File</span>
													</div>
													<button 
														on:click={() => removeBookmark(fav.slug)}
														class="text-muted hover:text-[#ff3b22] opacity-0 group-hover:opacity-100 transition-opacity text-xs p-1 cursor-pointer"
														title="Delete Bookmark"
													>
														<i class="fas fa-trash"></i>
													</button>
												</div>
											{/each}
										</div>
									{/if}
								</div>

								<!-- History logs -->
								<div class="space-y-4">
									<div class="flex items-center justify-between border-b theme-border-muted pb-2">
										<h3 class="font-mono text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-2">
											<i class="fas fa-clock-rotate-left"></i> Local Browsing Logs
										</h3>
										{#if history.length > 0}
											<button on:click={clearHistory} class="font-mono text-[0.6rem] text-[#ff3b22] hover:underline cursor-pointer">CLEAR ALL</button>
										{/if}
									</div>
									
									{#if history.length === 0}
										<div class="text-center py-10 border border-dashed theme-border rounded-2xl theme-bg-secondary">
											<i class="fas fa-history text-muted/30 text-xl mb-3 block"></i>
											<p class="font-mono text-[0.7rem] text-muted m-0">No reading logs stored locally.</p>
										</div>
									{:else}
										<div class="space-y-2.5 max-h-[40vh] overflow-y-auto pr-1">
											{#each history as hist}
												<div class="p-3 border theme-border-muted theme-bg-secondary hover:border-muted rounded-xl flex items-center justify-between font-mono text-[0.7rem] transition-all">
													<button
														on:click={() => { breadcrumbs = []; loadArticle(hist.slug); }}
														class="font-bold theme-text-white hover:text-[var(--accent-orange)] text-left truncate flex-1 cursor-pointer"
													>
														{hist.title}
													</button>
													<span class="text-muted text-[0.6rem] ml-4 shrink-0">
														{formatDate(hist.timestamp)}
													</span>
												</div>
											{/each}
										</div>
									{/if}
								</div>
							</div>

						{:else if activeArticle}
							<!-- READER STAGE: HIGH-FIDELITY ARTICLE WRAPPER -->
							
							<!-- Scroll Progress Indicator -->
							<div class="absolute top-0 left-0 right-0 h-0.5 theme-bg-tertiary overflow-hidden z-20">
								<div class="h-full bg-gradient-to-r from-[#e8590c] to-[#ff3b22] shadow-[0_0_8px_rgba(232,89,12,0.4)]" style="width: {scrollProgress}%"></div>
							</div>

							<!-- Breadcrumbs Timeline Navigation -->
							{#if breadcrumbs.length > 1}
								<div class="flex items-center gap-1.5 flex-wrap font-mono text-[0.6rem] text-muted mb-6 theme-bg-secondary border theme-border px-3 py-2 rounded-lg">
									<span class="text-[#e8590c]"><i class="fas fa-route"></i> DIVE TRAIL:</span>
									{#each breadcrumbs as crumb, idx}
										{#if idx > 0}
											<span class="text-muted/40 font-bold">➔</span>
										{/if}
										<button 
											on:click={() => jumpToBreadcrumb(crumb, idx)}
											class="hover:theme-text-white transition-colors truncate max-w-[120px] font-bold cursor-pointer {idx === breadcrumbs.length - 1 ? 'text-[var(--accent-blue)]' : ''}"
											title={crumb.replace(/_/g, ' ')}
										>
											{crumb.replace(/_/g, ' ')}
										</button>
									{/each}
								</div>
							{/if}

							<article class="space-y-8">
								<!-- Tags & Reading Specs row -->
								<div class="flex items-center gap-4 shrink-0">
									<span class="px-2.5 py-0.5 border border-[var(--accent-blue)] bg-[var(--accent-blue-bg)] text-[var(--accent-blue)] rounded font-mono text-[0.6rem] font-black uppercase tracking-wider">
										Core Concept
									</span>
									<span class="font-mono text-[0.6rem] text-muted tracking-widest uppercase">
										Reading Time: {Math.max(1, Math.ceil(activeArticle.wordCount / 200))}m
									</span>
								</div>

								<!-- Main Header Title -->
								<div class="border-b theme-border pb-6">
									<div class="flex flex-col md:flex-row md:items-start justify-between gap-4">
										<h1 class="font-heading text-3xl md:text-4xl font-extrabold theme-text-white leading-tight m-0 uppercase">
											{@html activeArticle.title}
										</h1>
										
										<!-- Reader Toolbar buttons -->
										<div class="flex items-center gap-2 shrink-0">
											<!-- Font size toggles -->
											<div class="flex border theme-border rounded-lg theme-bg-secondary overflow-hidden font-mono text-[0.65rem] font-bold shrink-0">
												<button on:click={() => fontSize = 'sm'} class="px-2 py-1 border-r theme-border hover:bg-[var(--bg-tertiary)] cursor-pointer {fontSize === 'sm' ? 'text-[var(--accent-orange)] bg-[var(--bg-primary)]' : 'text-muted'}">A-</button>
												<button on:click={() => fontSize = 'md'} class="px-2 py-1 border-r theme-border hover:bg-[var(--bg-tertiary)] cursor-pointer {fontSize === 'md' ? 'text-[var(--accent-orange)] bg-[var(--bg-primary)]' : 'text-muted'}">A</button>
												<button on:click={() => fontSize = 'lg'} class="px-2 py-1 border-r theme-border hover:bg-[var(--bg-tertiary)] cursor-pointer {fontSize === 'lg' ? 'text-[var(--accent-orange)] bg-[var(--bg-primary)]' : 'text-muted'}">A+</button>
												<button on:click={() => fontSize = 'xl'} class="px-2 py-1 hover:bg-[var(--bg-tertiary)] cursor-pointer {fontSize === 'xl' ? 'text-[var(--accent-orange)] bg-[var(--bg-primary)]' : 'text-muted'}">A++</button>
											</div>

											<!-- Like heart outline button -->
											<button
												on:click={toggleLike}
												class="w-7 h-7 rounded-lg border theme-border flex items-center justify-center theme-bg-secondary hover:bg-[var(--bg-tertiary)] transition-all cursor-pointer {isLiked ? 'text-[#ff3b22] border-[#ff3b22]/30' : 'text-muted'}"
												title={isLiked ? 'Saved' : 'Save to Desktop Library'}
											>
												<i class="fas {isLiked ? 'fa-heart' : 'fa-heart-crack'} text-xs"></i>
											</button>
											
											<!-- Sync offline button -->
											<button 
												on:click={toggleLike}
												class="px-2.5 py-1 text-[0.6rem] font-mono font-bold uppercase tracking-wider rounded-lg border theme-border theme-bg-secondary text-muted hover:theme-text-white hover:theme-border transition-all cursor-pointer"
											>
												Save Offline
											</button>
										</div>
									</div>

									<!-- Italicized Slate Subtitle -->
									{#if activeArticle.description}
										<p class="text-[0.95rem] font-content italic text-muted mt-4 leading-relaxed max-w-[680px]">
											{activeArticle.description.replace(/<[^>]*>/g, '')}
										</p>
									{/if}
								</div>

								<!-- Massive High-Fidelity Banner Image -->
								{#if activeArticle.image}
									<div class="border theme-border rounded-2xl overflow-hidden theme-bg-secondary p-2 shrink-0">
										<div class="aspect-video max-h-[360px] w-full rounded-xl overflow-hidden bg-white flex items-center justify-center">
											<img 
												src={activeArticle.image} 
												alt={activeArticle.title.replace(/<[^>]*>/g, '')}
												class="w-full h-full object-contain opacity-90 hover:opacity-100 hover:scale-[1.01] transition-all duration-500 bg-white"
											/>
										</div>
										<!-- Figure caption -->
										<div class="px-2 py-3 font-mono text-[0.65rem] border-t theme-border-muted mt-2 text-muted">
											<span class="text-[#e8590c] font-black mr-2">FIG. 4.2-A</span> Snap-synthesis.
										</div>
									</div>
								{/if}

								<!-- Render Wikipedia Parsed HTML Content -->
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
								<article 
									on:click={handleContentClick}
									class="wiki-content prose max-w-none theme-text-primary font-content overflow-x-hidden leading-relaxed
										{fontSize === 'sm' ? 'text-xs md:text-sm' : ''}
										{fontSize === 'md' ? 'text-sm md:text-base' : ''}
										{fontSize === 'lg' ? 'text-base md:text-lg' : ''}
										{fontSize === 'xl' ? 'text-lg md:text-xl' : ''}"
								>
									{@html activeArticle.html}
								</article>

								<!-- PREVIOUS / NEXT DIVE FOOTER (Desktop & Mobile) -->
								<div class="border-t theme-border pt-8 flex items-center justify-between font-mono text-[0.7rem] tracking-wider uppercase shrink-0">
									{#if history.length > 1}
										<!-- Previous dive link -->
										<button
											on:click={() => { breadcrumbs = []; loadArticle(history[1].slug); }}
											class="flex items-center gap-2 text-muted hover:text-[#e8590c] transition-colors text-left cursor-pointer"
										>
											<i class="fas fa-arrow-left"></i>
											<div>
												<span class="text-muted/40 block text-[0.55rem]">PREVIOUS DIVE</span>
												<span class="font-bold truncate max-w-[150px] block">{history[1].title}</span>
											</div>
										</button>
									{:else}
										<div class="w-10"></div>
									{/if}

									<!-- Surprise me next dive link -->
									<button
										on:click={surpriseMe}
										class="flex items-center gap-2 text-muted hover:text-[var(--accent-blue)] transition-colors text-right cursor-pointer"
									>
										<div>
											<span class="text-muted/40 block text-[0.55rem]">NEXT DIVE</span>
											<span class="font-bold block">Surprise Me <i class="fas fa-arrow-right ml-1"></i></span>
										</div>
									</button>
								</div>
							</article>
						{/if}

					</div>
				</div>

				<!-- Mobile bottom floating bar (for toggling technical specs drawer) -->
				{#if activeArticle && currentView === 'reader'}
					<div class="xl:hidden h-[48px] border-t theme-border theme-bg-secondary flex items-center justify-between px-6 shrink-0 relative z-30">
						<span class="font-mono text-[0.65rem] text-muted">ACTIVE SPECS: {calculatedCoherenceTime}</span>
						<button 
							on:click={() => isMobileSpecsOpen = !isMobileSpecsOpen}
							class="font-mono text-[0.65rem] font-bold text-[#e8590c] hover:underline cursor-pointer uppercase"
						>
							<i class="fas fa-table-list mr-1"></i> {isMobileSpecsOpen ? 'Hide Metrics' : 'View Metrics'}
						</button>
					</div>
				{/if}
			</div>

			<!-- RIGHT SIDEBAR: HIGH-TECH METRICS CONSOLE (Desktop only or floating mobile drawer) -->
			{#if activeArticle && currentView === 'reader'}
				<aside 
					class="w-[300px] border-l theme-border theme-bg-secondary p-5 shrink-0 relative z-30 transition-transform duration-300 overflow-y-auto space-y-5
						max-xl:fixed max-xl:top-[64px] max-xl:bottom-[48px] max-xl:right-0 
						{isMobileSpecsOpen ? 'max-xl:translate-x-0' : 'max-xl:translate-x-full'}"
				>
					
					<!-- Spec 1: RELATED CONCEPTS -->
					<div class="border theme-border rounded-2xl theme-bg-primary p-4.5 shadow-sm space-y-4">
						<h3 class="font-mono text-[0.65rem] font-bold theme-text-white uppercase border-b theme-border pb-2 flex items-center gap-2">
							<i class="fas fa-network-wired text-[#e8590c]"></i> Related Concepts
						</h3>
						<div class="space-y-3 font-mono text-[0.65rem]">
							{#each activeArticle.related as rel}
								<div class="p-2.5 border theme-border theme-bg-secondary hover:border-[var(--accent-orange)] transition-all">
									<button
										on:click={() => loadArticle(rel)}
										class="font-bold theme-text-white hover:text-[var(--accent-orange)] text-left truncate block w-full cursor-pointer"
										title={rel}
									>
										{rel}
									</button>
									<span class="text-muted text-[0.55rem] block mt-1">Conceptual Node connection</span>
								</div>
							{/each}
						</div>
					</div>

					<!-- Spec 2: TECHNICAL METRICS -->
					<div class="border theme-border rounded-2xl theme-bg-primary p-4.5 shadow-sm space-y-3.5">
						<h3 class="font-mono text-[0.65rem] font-bold theme-text-white uppercase border-b theme-border pb-2 flex items-center gap-2">
							<i class="fas fa-chart-simple text-[#e8590c]"></i> Technical Metrics
						</h3>
						<div class="font-mono text-[0.65rem] space-y-2.5">
							<div class="flex items-center justify-between border-b theme-border-muted pb-1.5">
								<span class="text-muted">Depth Index</span>
								<span class="theme-text-white font-bold">{calculatedDepth}</span>
							</div>
							<div class="flex items-center justify-between border-b theme-border-muted pb-1.5">
								<span class="text-muted">Coherence Time</span>
								<span class="text-[#e8590c] font-black">{calculatedCoherenceTime}</span>
							</div>
							<div class="flex items-center justify-between border-b theme-border-muted pb-1.5">
								<span class="text-muted">Link Connections</span>
								<span class="theme-text-white font-bold">{activeArticle.linksCount} nodes</span>
							</div>
							<div class="flex items-center justify-between border-b theme-border-muted pb-1.5">
								<span class="text-muted">Citation Counter</span>
								<span class="text-[#e8590c] font-black">{activeArticle.referencesCount} citations</span>
							</div>
							<div class="flex items-center justify-between">
								<span class="text-muted">Data Footprint</span>
								<span class="theme-text-white font-bold">{(activeArticle.wordCount * 6 / 1024).toFixed(1)} KB</span>
							</div>
						</div>
					</div>

					<!-- Spec 3: CITE ENTRY -->
					<div class="border theme-border rounded-2xl theme-bg-primary p-4.5 shadow-sm space-y-4">
						<h3 class="font-mono text-[0.65rem] font-bold theme-text-white uppercase border-b theme-border pb-2 flex items-center gap-2">
							<i class="fas fa-quote-left text-[#e8590c]"></i> Cite This Entry
						</h3>
						<div class="font-mono text-[0.6rem] text-muted leading-relaxed theme-bg-secondary border theme-border p-3 rounded-lg">
							Wikitoday Desktop. (2026). "{activeArticle.title.replace(/<[^>]*>/g, '')}". Local deep file library. DOI: 10.1052/WT.QDCS.001
						</div>
						<button 
							on:click={copyBibTeX}
							class="w-full py-2 border border-[#e8590c]/30 hover:border-[#e8590c] hover:bg-[#e8590c]/5 text-[#e8590c] font-mono text-[0.65rem] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2"
						>
							<i class="fas fa-copy"></i> Copy BibTeX
						</button>
					</div>

				</aside>
			{/if}

		</div>
	</div>
</div>

<!-- Floating Glassmorphic Toast Container -->
<div class="toast-container">
	{#each $toasts as toast (toast.id)}
		<div 
			transition:fade={{ duration: 180 }}
			class="toast-item {toast.type === 'success' ? 'toast-success' : ''} {toast.type === 'error' ? 'toast-error' : ''} {toast.type === 'info' ? 'toast-info' : ''}"
		>
			<i class="fas 
				{toast.type === 'success' ? 'fa-circle-check' : ''}
				{toast.type === 'error' ? 'fa-circle-xmark' : ''}
				{toast.type === 'info' ? 'fa-circle-info' : ''}
				mr-2
			"></i>
			<span>{toast.message}</span>
			<button on:click={() => removeToast(toast.id)} class="toast-close-btn" aria-label="Close Toast">
				<i class="fas fa-xmark"></i>
			</button>
		</div>
	{/each}
</div>

<style>
	/* Theme Variables definitions */
	.wikitoday-container {
		/* DEFAULT: LIGHT & DARK MODE variables inherited from :root */
		--bg-primary: var(--bg-base);
		--bg-secondary: var(--bg-surface);
		--bg-tertiary: var(--bg-panel);
		--bg-card: var(--bg-surface);
		--border-color: var(--border-default);
		--border-color-muted: var(--border-subtle);
		--text-primary: var(--text-primary);
		--text-secondary: var(--text-muted);
		--text-white: var(--text-primary);
		--text-muted-color: var(--text-faint);
		--accent-orange: var(--accent-gold);
		--accent-orange-bg: var(--accent-gold-bg);
		--accent-blue: var(--text-link);
		--accent-blue-bg: var(--accent-gold-bg);
		--scrollbar-bg: var(--bg-base);
		--scrollbar-thumb: var(--border-strong);
		--card-shadow: 0 4px 20px rgba(15, 23, 42, 0.05);
		--glow: var(--accent-gold-bg);
		--font-content: 'Lora', Georgia, 'Times New Roman', serif;
		--font-heading: 'Lora', Georgia, serif;
		--font-mono: monospace;
	}

	.wikitoday-container.dark-mode {
		/* DARK MODE Specific overrides */
		--card-shadow: 0 4px 10px rgba(0,0,0,0.3);
	}

	/* Theme utility classes */
	.theme-bg-primary { background-color: var(--bg-primary) !important; }
	.theme-bg-secondary { background-color: var(--bg-secondary) !important; }
	.theme-bg-tertiary { background-color: var(--bg-tertiary) !important; }
	.theme-border { border-color: var(--border-color) !important; }
	.theme-border-muted { border-color: var(--border-color-muted) !important; }
	.theme-text-primary { color: var(--text-primary) !important; }
	.theme-text-secondary { color: var(--text-secondary) !important; }
	.theme-text-white { color: var(--text-white) !important; }
	.theme-text-muted { color: var(--text-muted-color) !important; }
	
	.hover\:theme-text-white:hover { color: var(--text-white) !important; }
	.hover\:theme-border:hover { border-color: var(--border-color) !important; }

	.wikitoday-container :global(.text-muted) {
		color: var(--text-muted-color) !important;
	}
	.wikitoday-container :global(.text-muted\/80) {
		color: var(--text-muted-color) !important;
		opacity: 0.8;
	}
	.wikitoday-container :global(.text-muted\/40) {
		color: var(--text-muted-color) !important;
		opacity: 0.4;
	}
	.wikitoday-container :global(.text-muted\/30) {
		color: var(--text-muted-color) !important;
		opacity: 0.3;
	}
	.wikitoday-container .text-muted {
		color: var(--text-muted-color) !important;
	}
	.wikitoday-container .text-muted\/80 {
		color: var(--text-muted-color) !important;
		opacity: 0.8;
	}
	.wikitoday-container .text-muted\/40 {
		color: var(--text-muted-color) !important;
		opacity: 0.4;
	}
	.wikitoday-container .text-muted\/30 {
		color: var(--text-muted-color) !important;
		opacity: 0.3;
	}
	.wikitoday-container ::placeholder {
		color: var(--text-muted-color) !important;
		opacity: 0.7;
	}

	.wiki-content {
		font-family: var(--font-content);
		color: var(--text-secondary);
		counter-reset: wiki-h2;
	}

	.wiki-content :global(a) {
		color: var(--accent-blue) !important;
		font-weight: 700;
		transition: opacity 0.2s ease-in-out;
		cursor: pointer;
	}

	.wiki-content :global(a:hover) {
		opacity: 0.8;
	}

	.wiki-content :global(p) {
		margin-top: 0;
		margin-bottom: 1.5rem;
		line-height: 1.75;
		color: var(--text-secondary);
	}

	.wiki-content :global(h3), 
	.wiki-content :global(h4) {
		font-family: var(--font-heading);
		font-weight: 800;
		line-height: 1.3;
		color: var(--text-white);
		margin-top: 2.5rem;
		margin-bottom: 1rem;
	}

	.wiki-content :global(h2) {
		display: flex;
		align-items: center;
	}

	.wiki-content :global(h2::before) {
		counter-increment: wiki-h2;
		content: counter(wiki-h2, decimal-leading-zero);
		color: var(--accent-orange);
		font-family: var(--font-mono);
		font-weight: 900;
		font-size: 0.8em;
		margin-right: 0.75rem;
		border: 1px solid rgba(232,89,12,0.2);
		background-color: var(--accent-orange-bg);
		padding: 0.05rem 0.3rem;
		border-radius: 0.25rem;
	}

	.wiki-content :global(h3) {
		font-size: 1.1em;
	}

	.wiki-content :global(blockquote) {
		border-left: 2px solid var(--accent-orange) !important;
		background-color: var(--accent-orange-bg);
		padding: 1.25rem 1.5rem !important;
		margin: 2rem 0 !important;
		border-radius: 0 0.75rem 0.75rem 0;
	}

	.wiki-content :global(blockquote p) {
		font-style: italic !important;
		font-size: 1.1em !important;
		color: var(--text-white) !important;
		line-height: 1.6 !important;
		margin-bottom: 0 !important;
	}

	.wiki-content :global(.infobox),
	.wiki-content :global(.sidebar),
	.wiki-content :global(.vertical-navbox) {
		border: 1px solid var(--border-color) !important;
		background-color: var(--bg-secondary) !important;
		border-collapse: collapse;
		float: right;
		clear: right;
		width: 100% !important;
		max-width: 300px !important;
		margin: 0.5rem 0 1.5rem 1.5rem !important;
		font-size: 0.75rem !important;
		border-radius: 0.75rem;
		overflow: hidden;
		box-shadow: var(--card-shadow);
	}

	@media (max-width: 768px) {
		.wiki-content :global(.infobox),
		.wiki-content :global(.sidebar),
		.wiki-content :global(.vertical-navbox) {
			float: none !important;
			margin: 1.5rem auto !important;
			max-width: 100% !important;
			width: 100% !important;
			display: table !important;
		}
	}

	.wiki-content :global(.infobox th), 
	.wiki-content :global(.infobox td),
	.wiki-content :global(.sidebar th), 
	.wiki-content :global(.sidebar td),
	.wiki-content :global(.vertical-navbox th), 
	.wiki-content :global(.vertical-navbox td) {
		padding: 0.5rem 0.6rem;
		border-bottom: 1px solid var(--border-color);
		color: var(--text-secondary);
	}

	.wiki-content :global(.infobox th),
	.wiki-content :global(.sidebar th),
	.wiki-content :global(.vertical-navbox th) {
		background-color: var(--bg-primary);
		color: var(--text-white);
		font-family: var(--font-mono);
		font-weight: 700;
		text-align: left;
	}

	.wiki-content :global(.infobox-title) {
		font-size: 1.05em;
		font-family: var(--font-heading);
		font-weight: 800;
		text-align: center !important;
		background-color: var(--accent-orange) !important;
		color: #ffffff !important;
	}

	table.wikitable {
		border: 1px solid var(--border-color) !important;
		background-color: var(--bg-secondary) !important;
		border-collapse: collapse;
		width: 100%;
		margin: 1.5rem 0;
		font-size: 0.75rem;
		border-radius: 0.75rem;
		overflow: hidden;
	}

	table.wikitable th,
	table.wikitable td {
		border: 1px solid var(--border-color) !important;
		padding: 0.5rem 0.75rem !important;
		color: var(--text-secondary);
	}

	table.wikitable th {
		background-color: var(--bg-primary) !important;
		color: var(--text-white) !important;
		font-weight: 700;
		font-family: var(--font-mono);
		text-align: left;
	}

	.wiki-content :global(code) {
		font-family: var(--font-mono) !important;
		background-color: var(--bg-secondary);
		padding: 0.15rem 0.35rem;
		border-radius: 0.25rem;
		font-size: 0.95em;
		border: 1px solid var(--border-color);
		color: var(--accent-blue);
	}

	.wiki-content :global(pre) {
		font-family: var(--font-mono) !important;
		background-color: var(--bg-secondary);
		padding: 1.25rem;
		overflow-x: auto;
		border-radius: 0.75rem;
		border: 1px solid var(--border-color);
		border-left: 2px solid var(--accent-orange);
		margin: 1.75rem 0;
		color: var(--accent-blue);
	}

	.wiki-content :global(.thumb) {
		margin: 1.75rem 0;
		clear: both;
	}

	.wiki-content :global(.thumbinner) {
		border: 1px solid var(--border-color);
		background-color: var(--bg-secondary);
		padding: 0.5rem;
		border-radius: 0.75rem;
		display: inline-block;
		max-width: 100%;
		text-align: center;
	}

	.wiki-content :global(.thumbimage) {
		border: 1px solid var(--border-color);
		border-radius: 0.35rem;
		max-width: 100%;
		height: auto;
		background: #ffffff !important;
		transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.wiki-content :global(img) {
		background-color: #ffffff !important;
	}

	.wiki-content :global(.thumbimage:hover) {
		transform: scale(1.01);
	}

	.wiki-content :global(.thumbcaption) {
		font-size: 0.75rem !important;
		color: var(--text-secondary) !important;
		line-height: 1.5;
		padding: 0.5rem 0.2rem 0;
		text-align: center;
		font-family: var(--font-mono);
	}

	.wiki-content :global(.mw-empty-elt) {
		display: none !important;
	}

	.wiki-content :global(.catlinks), 
	.wiki-content :global(.navbox), 
	.wiki-content :global(.metadata), 
	.wiki-content :global(.ambox),
	.wiki-content :global(.hatnote),
	.wiki-content :global(.portal) {
		display: none !important;
	}

	.wiki-content :global(.reference) {
		font-size: 0.7rem;
		font-weight: 700;
		vertical-align: super;
		padding: 0 0.1rem;
		line-height: 0;
	}

	.wiki-content :global(ul) {
		list-style-type: disc !important;
		padding-left: 1.25rem;
		margin-bottom: 1.5rem;
		color: var(--text-secondary);
	}

	.wiki-content :global(ol) {
		list-style-type: decimal !important;
		padding-left: 1.25rem;
		margin-bottom: 1.5rem;
		color: var(--text-secondary);
	}

	.wiki-content :global(li) {
		margin-bottom: 0.4rem;
		line-height: 1.6;
	}

	#reader-scroll-container::-webkit-scrollbar {
		width: 6px;
	}

	#reader-scroll-container::-webkit-scrollbar-track {
		background: var(--scrollbar-bg);
	}

	#reader-scroll-container::-webkit-scrollbar-thumb {
		background: var(--scrollbar-thumb);
		border-radius: 3px;
	}

	#reader-scroll-container::-webkit-scrollbar-thumb:hover {
		background: var(--accent-orange);
	}

	/* Floating Glassmorphic Toast Notifications */
	.toast-container {
		position: fixed;
		bottom: 24px;
		right: 24px;
		z-index: 200;
		display: flex;
		flex-direction: column;
		gap: 12px;
		pointer-events: none;
		max-width: 380px;
		width: calc(100% - 48px);
	}

	.toast-item {
		pointer-events: auto;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		border-radius: 12px;
		border: 1px solid var(--border-color);
		box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		font-family: var(--font-content);
		font-size: 0.75rem;
		font-weight: 600;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		animation: toast-slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}

	.toast-success {
		background-color: rgba(16, 185, 129, 0.08);
		border-color: rgba(16, 185, 129, 0.3);
		color: #10b981;
	}

	.toast-error {
		background-color: rgba(239, 68, 68, 0.08);
		border-color: rgba(239, 68, 68, 0.3);
		color: #ef4444;
	}

	.toast-info {
		background-color: rgba(14, 165, 233, 0.08);
		border-color: rgba(14, 165, 233, 0.3);
		color: #0ea5e9;
	}

	.toast-close-btn {
		background: none;
		border: none;
		color: currentColor;
		opacity: 0.6;
		cursor: pointer;
		padding: 4px;
		margin-left: auto;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.8rem;
		transition: opacity 0.2s;
	}

	.toast-close-btn:hover {
		opacity: 1;
	}

	@keyframes toast-slide-in {
		from {
			transform: translateY(12px) scale(0.95);
			opacity: 0;
		}
		to {
			transform: translateY(0) scale(1);
			opacity: 1;
		}
	}
</style>
