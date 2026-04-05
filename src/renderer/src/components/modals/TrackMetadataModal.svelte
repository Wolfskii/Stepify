<script lang="ts">
import { onDestroy } from 'svelte'
import { get } from 'svelte/store'
import type { MetadataSearchHit } from '@shared/types'
import {
  activeModal,
  trackMetadataQueueIds,
  trackMetadataWizardTotal,
  uiState,
  uiActions,
} from '../../stores/ui.store'
import { libraryState, libraryActions } from '../../stores/library.store'
import { fileToCoverEmbedDataUrl } from '../../utils/coverEmbed'
import { buildDefaultCatalogSearchQuery, buildMetadataSearchQuery } from '../../utils/metadataQuery'

const RESULTS_PAGE_SIZE = 5
/** iTunes ~25 + Spotify up to 30 (3×10 API pages); scoring reorders only. */
const RESULTS_MAX_PAGES = 11

$: queue = $trackMetadataQueueIds
$: total = $trackMetadataWizardTotal
$: currentTrackId = queue[0]
$: track =
  currentTrackId != null
    ? $libraryState.tracks.find((t) => t.id === currentTrackId)
    : undefined

$: indexInWizard = total > 0 && currentTrackId ? total - queue.length + 1 : 0

let hits: MetadataSearchHit[] = []
/** 0-based page index into `hits` */
let searchPage = 0
let searchLoading = false
/** Show “Search again” only after a failed catalog request */
let searchFetchFailed = false
let busy = false
let showManual = false
let manualTitle = ''
let manualArtist = ''
let manualAlbum = ''
/** Editable online catalog search query (pre-filled from filename/tags). */
let manualSearchQuery = ''
/** Picked cover file; encoded to JPEG before send so tags get a standard embedded image. */
let manualCoverFile: File | undefined
let manualCoverPreviewUrl: string | undefined
let lastInitId: string | null = null
let searchSeededFor: string | null = null
let coverFileInput: HTMLInputElement

$: catalogDefaultQuery = track ? buildDefaultCatalogSearchQuery(track) : ''
$: catalogResetEnabled =
  track != null && manualSearchQuery.trim() !== catalogDefaultQuery.trim()

$: if ($activeModal !== 'track-metadata') {
  searchSeededFor = null
}

$: searchResultsPageCount =
  hits.length === 0
    ? 0
    : Math.min(RESULTS_MAX_PAGES, Math.ceil(hits.length / RESULTS_PAGE_SIZE))

$: pageHits =
  searchResultsPageCount === 0
    ? []
    : hits.slice(
        searchPage * RESULTS_PAGE_SIZE,
        searchPage * RESULTS_PAGE_SIZE + RESULTS_PAGE_SIZE,
      )

function revokeCoverPreview(): void {
  if (manualCoverPreviewUrl) {
    URL.revokeObjectURL(manualCoverPreviewUrl)
    manualCoverPreviewUrl = undefined
  }
}

onDestroy(() => {
  revokeCoverPreview()
})

$: if (currentTrackId !== lastInitId) {
  lastInitId = currentTrackId ?? null
  hits = []
  searchPage = 0
  searchFetchFailed = false
  showManual = false
  revokeCoverPreview()
  manualCoverFile = undefined
  if (track) {
    manualTitle = track.title
    manualArtist = track.artist
    manualAlbum = track.album ?? ''
    manualSearchQuery = buildDefaultCatalogSearchQuery(track)
  }
}

$: if (
  $activeModal === 'track-metadata' &&
  currentTrackId &&
  track &&
  currentTrackId !== searchSeededFor
) {
  searchSeededFor = currentTrackId
  void runSearch()
}

async function runSearch() {
  if (!track) return
  const q = (
    manualSearchQuery.trim() ||
    buildDefaultCatalogSearchQuery(track) ||
    buildMetadataSearchQuery(track)
  ).trim()
  if (!q) {
    uiActions.notify('Enter a search query', 'warning')
    return
  }
  searchLoading = true
  hits = []
  searchPage = 0
  searchFetchFailed = false
  try {
    const r = await window.electronAPI.library.searchTrackMetadata(q)
    if (r.success && r.data) {
      hits = r.data
      searchFetchFailed = false
    } else {
      searchFetchFailed = true
      uiActions.notify(r.error ?? 'Search failed', 'warning')
    }
  } catch (e) {
    searchFetchFailed = true
    uiActions.notify(String(e), 'error')
  } finally {
    searchLoading = false
  }
}

function goSearchPage(next: number) {
  if (searchResultsPageCount <= 0) return
  searchPage = Math.max(0, Math.min(searchResultsPageCount - 1, next))
}

function resetCatalogSearchToDefault() {
  if (!track) return
  manualSearchQuery = buildDefaultCatalogSearchQuery(track)
  void runSearch()
}

function finishMetadataSession() {
  const assignIds = get(uiState).trackMetadataAfterWizardAssignIds
  uiActions.closeModal()
  if (assignIds?.length) {
    void libraryActions.afterMetadataWizardComplete(assignIds)
  }
}

function advanceOrClose() {
  uiActions.shiftMetadataQueue()
  if (get(uiState).trackMetadataQueueIds.length === 0) {
    finishMetadataSession()
  } else {
    showManual = false
  }
}

async function applyHit(hit: MetadataSearchHit) {
  if (!track) return
  busy = true
  try {
    const r = await window.electronAPI.library.updateTrackMetadata({
      trackId: track.id,
      title: hit.title,
      artist: hit.artist,
      album: hit.album,
      coverImageUrl: hit.artworkUrl || undefined,
    })
    if (!r.success || !r.data) {
      uiActions.notify(r.error ?? 'Could not apply match', 'error')
      return
    }
    await libraryActions.syncTrackFromMain(r.data)
    uiActions.notify('Track details updated', 'success')
    advanceOrClose()
  } finally {
    busy = false
  }
}

async function applyManual() {
  if (!track) return
  const title = manualTitle.trim()
  const artist = manualArtist.trim()
  if (!title || !artist) {
    uiActions.notify('Title and artist are required', 'warning')
    return
  }
  let coverDataUrl: string | undefined
  if (manualCoverFile) {
    coverDataUrl = await fileToCoverEmbedDataUrl(manualCoverFile)
    if (!coverDataUrl) {
      uiActions.notify(
        'Could not use that image as cover (try JPEG or PNG, or a smaller file)',
        'error',
      )
      return
    }
  }
  busy = true
  try {
    const r = await window.electronAPI.library.updateTrackMetadata({
      trackId: track.id,
      title,
      artist,
      album: manualAlbum.trim() || undefined,
      coverDataUrl,
    })
    if (!r.success || !r.data) {
      uiActions.notify(r.error ?? 'Could not save', 'error')
      return
    }
    await libraryActions.syncTrackFromMain(r.data)
    uiActions.notify('Track details saved', 'success')
    advanceOrClose()
  } finally {
    busy = false
  }
}

function skipKeepAsIs() {
  advanceOrClose()
}

function onCoverPick(e: Event) {
  const input = e.currentTarget as HTMLInputElement
  const f = input.files?.[0]
  if (!f) return
  revokeCoverPreview()
  manualCoverFile = f
  manualCoverPreviewUrl = URL.createObjectURL(f)
  input.value = ''
}

function fileLabel(path: string | undefined): string {
  if (!path) return ''
  const seg = path.split(/[/\\]/).pop() ?? path
  return seg
}
</script>

<svelte:window
  on:keydown={(e) =>
    $activeModal === 'track-metadata' && e.key === 'Escape' && !busy && finishMetadataSession()}
/>

{#if $activeModal === 'track-metadata'}
{#if track}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-backdrop" role="presentation" on:click={() => !busy && finishMetadataSession()}>
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="meta-title"
      on:click|stopPropagation
    >
      <h2 id="meta-title" class="modal__title">Complete track information</h2>
      {#if total > 1}
        <p class="modal__step">Song {indexInWizard} of {total}</p>
      {/if}
      <p class="modal__file" title={track.localPath ?? ''}>
        {track.source === 'local' ? fileLabel(track.localPath) : 'Spotify track'}
      </p>

      <div class="modal__gaps" aria-label="Missing metadata">
        {#if track.missingEmbeddedTitle}
          <span class="gap-tag">No title in file</span>
        {/if}
        {#if track.missingEmbeddedArtist}
          <span class="gap-tag">No artist in file</span>
        {/if}
        {#if track.missingEmbeddedArt}
          <span class="gap-tag">No cover art</span>
        {/if}
        {#if !track.missingEmbeddedTitle && !track.missingEmbeddedArtist && !track.missingEmbeddedArt}
          <span class="gap-tag gap-tag--ok">Editing details</span>
        {/if}
      </div>

      <div class="modal__catalog-search">
        <label for="meta-catalog-query" class="modal__catalog-label">Search catalog</label>
        <div class="modal__catalog-row">
          <button
            type="button"
            class="modal__catalog-reset"
            title="Restore filename + known artist and search again"
            disabled={busy || searchLoading || !catalogResetEnabled}
            on:click={resetCatalogSearchToDefault}
          >
            Reset to default
          </button>
          <input
            id="meta-catalog-query"
            class="modal__catalog-input"
            type="search"
            autocomplete="off"
            placeholder="Artist, title, album, or other keywords"
            bind:value={manualSearchQuery}
            disabled={busy || searchLoading}
            on:keydown={(e) => {
              if (e.key === 'Enter' && !busy && !searchLoading) {
                e.preventDefault()
                void runSearch()
              }
            }}
          />
          <button
            type="button"
            class="modal__catalog-btn"
            disabled={busy || searchLoading}
            on:click={() => runSearch()}
          >
            Search
          </button>
        </div>
        <p class="modal__catalog-hint">
          Prefilled from the file name and any artist already read from the file. Edit and press Search; when
          the text differs from that default, use Reset to default to restore it and search again.
        </p>
      </div>

      <div class="modal__section-head">
        <span>Suggested matches</span>
        {#if searchFetchFailed}
          <button
            type="button"
            class="modal__linkish"
            disabled={busy || searchLoading}
            on:click={() => runSearch()}
          >
            Search again
          </button>
        {/if}
      </div>

      {#if searchLoading}
        <p class="modal__muted">Searching catalog…</p>
      {:else if hits.length === 0}
        <p class="modal__muted">
          No matches — adjust the search above, try “Enter details yourself”, or rename the file on disk.
        </p>
      {:else}
        {#if searchResultsPageCount > 1}
          <div class="hits-pagination" role="navigation" aria-label="Search results pages">
            {#each Array.from({ length: searchResultsPageCount }, (_, i) => i) as i (i)}
              <button
                type="button"
                class="hits-pagination__page"
                class:hits-pagination__page--active={searchPage === i}
                disabled={busy}
                aria-current={searchPage === i ? 'page' : undefined}
                aria-label="Page {i + 1} of {searchResultsPageCount}"
                on:click={() => goSearchPage(i)}
              >
                {i + 1}
              </button>
            {/each}
          </div>
        {/if}
        <ul class="hits" aria-label="Catalog matches">
          {#each pageHits as hit}
            <li class="hit">
              {#if hit.artworkUrl}
                <img class="hit__art" src={hit.artworkUrl} alt="" loading="lazy" />
              {:else}
                <div class="hit__art hit__art--ph" aria-hidden="true"></div>
              {/if}
              <div class="hit__meta">
                <div class="hit__title" title={hit.title}>{hit.title}</div>
                <div class="hit__artist" title={hit.artist}>{hit.artist}</div>
                {#if hit.album}
                  <div class="hit__album" title={hit.album}>{hit.album}</div>
                {/if}
                <div class="hit__src" title={hit.sourceLabel}>{hit.sourceLabel}</div>
              </div>
              <button
                type="button"
                class="hit__use"
                disabled={busy}
                on:click={() => applyHit(hit)}
              >
                Use match
              </button>
            </li>
          {/each}
        </ul>
      {/if}

      <button
        type="button"
        class="modal__toggle-manual"
        disabled={busy}
        on:click={() => (showManual = !showManual)}
        aria-expanded={showManual}
      >
        {showManual ? 'Hide custom fields' : 'Enter details yourself'}
      </button>

      {#if showManual}
        <div class="manual">
          <label class="manual__label" for="m-title">Title</label>
          <input id="m-title" class="manual__input" bind:value={manualTitle} disabled={busy} />
          <label class="manual__label" for="m-artist">Artist</label>
          <input id="m-artist" class="manual__input" bind:value={manualArtist} disabled={busy} />
          <label class="manual__label" for="m-album">Album (optional)</label>
          <input id="m-album" class="manual__input" bind:value={manualAlbum} disabled={busy} />
          <span class="manual__label" id="meta-cover-label">Cover image</span>
          <div class="manual__cover-row" aria-labelledby="meta-cover-label">
            <button
              type="button"
              class="manual__file-btn"
              disabled={busy}
              on:click={() => coverFileInput?.click()}
            >
              Choose image…
            </button>
            <input
              bind:this={coverFileInput}
              type="file"
              accept="image/*"
              class="sr-only"
              on:change={onCoverPick}
            />
            {#if manualCoverPreviewUrl}
              <img class="manual__preview" src={manualCoverPreviewUrl} alt="Cover preview" />
            {/if}
          </div>
          <button type="button" class="modal__primary manual__save" disabled={busy} on:click={applyManual}>
            Save custom details
          </button>
        </div>
      {/if}

      <div class="modal__footer">
        <button type="button" class="modal__secondary" disabled={busy} on:click={skipKeepAsIs}>
          Skip — keep file as-is
        </button>
        <button type="button" class="modal__ghost" disabled={busy} on:click={finishMetadataSession}>
          Stop reviewing
        </button>
      </div>
    </div>
  </div>
{/if}
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
    padding: var(--space-6);
  }

  .modal {
    width: var(--modal-width-wide);
    max-width: 100%;
    max-height: var(--modal-max-height-lg);
    overflow: auto;
    padding: var(--space-6);
    border-radius: var(--radius-lg);
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border-subtle);
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
  }

  .modal__title {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: var(--space-1);
  }

  .modal__step {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-accent);
    margin-bottom: var(--space-2);
  }

  .modal__file {
    font-size: 12px;
    color: var(--color-text-muted);
    margin-bottom: var(--space-3);
    word-break: break-all;
  }

  .modal__gaps {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-bottom: var(--space-4);
  }

  .gap-tag {
    font-size: 10px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    background: rgba(255, 180, 80, 0.2);
    color: #fdba74;
  }

  .gap-tag--ok {
    background: rgba(120, 200, 140, 0.2);
    color: #86efac;
  }

  .modal__catalog-search {
    margin-bottom: var(--space-4);
    padding-bottom: var(--space-4);
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .modal__catalog-label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-secondary);
    margin-bottom: var(--space-2);
  }

  .modal__catalog-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: stretch;
  }

  .modal__catalog-input {
    flex: 1;
    min-width: 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-bg-base);
    color: var(--color-text-primary);
    font-size: 13px;
  }

  .modal__catalog-input:focus {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 2px var(--color-accent-muted);
  }

  .modal__catalog-input:disabled {
    opacity: 0.55;
  }

  .modal__catalog-btn {
    flex-shrink: 0;
    padding: 0 var(--space-4);
    border-radius: var(--radius-md);
    font-size: 13px;
    font-weight: 600;
    color: var(--color-bg-surface);
    background: var(--color-accent);
    border: none;
    cursor: pointer;
    transition: filter var(--duration-fast);
  }

  .modal__catalog-btn:hover:not(:disabled) {
    filter: brightness(1.08);
  }

  .modal__catalog-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .modal__catalog-reset {
    flex-shrink: 0;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-secondary);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    cursor: pointer;
    transition:
      color var(--duration-fast),
      border-color var(--duration-fast),
      background var(--duration-fast);
  }

  .modal__catalog-reset:hover:not(:disabled) {
    color: var(--color-text-primary);
    border-color: var(--color-text-muted);
  }

  .modal__catalog-reset:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .modal__catalog-hint {
    font-size: 11px;
    color: var(--color-text-muted);
    margin: var(--space-2) 0 0;
    line-height: 1.4;
  }

  .modal__section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-2);
    font-size: 13px;
    font-weight: 600;
  }

  .modal__linkish {
    border: none;
    background: none;
    color: var(--color-accent);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    padding: 0;
  }

  .modal__linkish:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .modal__muted {
    font-size: 13px;
    color: var(--color-text-muted);
    margin-bottom: var(--space-3);
  }

  .hits-pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-bottom: var(--space-3);
  }

  .hits-pagination__page {
    min-width: 32px;
    height: 32px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-subtle);
    background: var(--color-bg-base);
    color: var(--color-text-secondary);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .hits-pagination__page--active {
    border-color: var(--color-accent);
    background: var(--color-accent-muted);
    color: var(--color-accent);
  }

  .hits-pagination__page:disabled {
    cursor: default;
  }

  .hits {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .hit {
    display: grid;
    grid-template-columns: 52px 1fr auto;
    gap: var(--space-3);
    align-items: center;
    padding: var(--space-2);
    border-radius: var(--radius-md);
    background: var(--color-bg-base);
    border: 1px solid var(--color-border-subtle);
  }

  .hit__art {
    width: 52px;
    height: 52px;
    border-radius: var(--radius-sm);
    object-fit: cover;
  }

  .hit__art--ph {
    background: var(--color-bg-overlay);
  }

  .hit__meta {
    min-width: 0;
    overflow: hidden;
  }

  .hit__title,
  .hit__artist,
  .hit__album,
  .hit__src {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hit__title {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .hit__artist {
    font-size: 12px;
    color: var(--color-text-secondary);
  }

  .hit__album {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .hit__src {
    font-size: 10px;
    color: var(--color-text-muted);
    margin-top: 2px;
  }

  .hit__use {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: none;
    background: var(--color-accent);
    color: var(--color-bg-base);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .hit__use:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .modal__toggle-manual {
    width: 100%;
    margin-bottom: var(--space-3);
    padding: var(--space-2);
    border-radius: var(--radius-md);
    border: 1px dashed var(--color-border-subtle);
    background: transparent;
    color: var(--color-text-primary);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .modal__toggle-manual:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .manual {
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-bg-base);
    border: 1px solid var(--color-border-subtle);
    margin-bottom: var(--space-4);
  }

  .manual__label {
    display: block;
    font-size: 11px;
    font-weight: 600;
    color: var(--color-text-muted);
    margin-bottom: var(--space-1);
  }

  .manual__input {
    width: 100%;
    margin-bottom: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-subtle);
    background: var(--color-bg-surface);
    color: var(--color-text-primary);
    font-size: 14px;
  }

  .manual__cover-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }

  .manual__file-btn {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-subtle);
    background: var(--color-bg-surface);
    color: var(--color-text-primary);
    font-size: 12px;
    cursor: pointer;
  }

  .manual__preview {
    width: 48px;
    height: 48px;
    border-radius: var(--radius-sm);
    object-fit: cover;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }

  .modal__primary {
    width: 100%;
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-md);
    border: none;
    background: var(--color-accent);
    color: var(--color-bg-base);
    font-weight: 600;
    cursor: pointer;
  }

  .modal__primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .modal__footer {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
    justify-content: space-between;
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-border-subtle);
  }

  .modal__secondary {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-subtle);
    background: transparent;
    color: var(--color-text-primary);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .modal__secondary:disabled,
  .modal__ghost:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .modal__ghost {
    margin-left: auto;
    padding: var(--space-2) var(--space-3);
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    font-size: 13px;
    cursor: pointer;
  }
</style>
