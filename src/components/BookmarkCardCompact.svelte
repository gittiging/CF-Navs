<script lang="ts">
  import type { PublicBookmark } from '../../shared/types'
  import BookmarkIcon from './BookmarkIcon.svelte'

  type AsyncVoid<T = void> = T | Promise<T>

  export let bookmark: PublicBookmark
  export let openInNewTab = true
  export let sortMode = false
  export let tooltipText = ''
  export let compactIconSize = 80
  export let compactIconStyle = ''
  export let showIconTitle = true
  export let iconUrl = ''
  export let iconText = ''
  export let hasCustomIconBackground = false
  export let onLinkClick: ((event: MouseEvent) => AsyncVoid) | undefined = undefined
  export let onContextMenu: ((event: MouseEvent) => AsyncVoid) | undefined = undefined
  export let onIconError: (() => AsyncVoid) | undefined = undefined
  export let onIconLoad: (() => AsyncVoid) | undefined = undefined

  function handleLinkClick(event: MouseEvent) {
    void onLinkClick?.(event)
  }

  function handleContextMenu(event: MouseEvent) {
    void onContextMenu?.(event)
  }
</script>

<a
  class="bookmark-card bookmark-card-icon"
  class:sort-mode={sortMode}
  href={bookmark.url}
  target={openInNewTab ? '_blank' : undefined}
  rel={openInNewTab ? 'noopener noreferrer' : undefined}
  style="width: {compactIconSize}px; height: {compactIconSize}px;"
  title={tooltipText}
  aria-label={tooltipText}
  data-tooltip={tooltipText}
  on:click={handleLinkClick}
  on:contextmenu={handleContextMenu}
>
  <BookmarkIcon
    title={bookmark.title}
    {iconUrl}
    {iconText}
    size={compactIconSize}
    iconStyle={compactIconStyle}
    hasCustomBackground={hasCustomIconBackground}
    variant="compact"
    onError={onIconError}
    onLoad={onIconLoad}
  />
</a>
{#if showIconTitle}
  <a
    class="bookmark-icon-title"
    href={bookmark.url}
    target={openInNewTab ? '_blank' : undefined}
    rel={openInNewTab ? 'noopener noreferrer' : undefined}
    on:click={handleLinkClick}
    on:contextmenu={handleContextMenu}
  >
    {bookmark.title}
  </a>
{/if}

<style>
  .bookmark-card {
    box-sizing: border-box;
    text-decoration: none;
    color: inherit;
    border: 1px solid rgba(255, 255, 255, 0.42);
    background:
      linear-gradient(135deg, rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.78)), rgba(255, 255, 255, 0.34)),
      rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.62));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.46),
      0 2px 8px rgba(15, 23, 42, 0.08);
    transition:
      transform 0.16s ease,
      border-color 0.16s ease;
  }

  .bookmark-card-icon {
    position: relative;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    aspect-ratio: 1 / 1;
    padding: 0;
    border-radius: 1.2rem;
    overflow: visible;
  }

  .bookmark-card-icon:hover {
    border-color: rgba(255, 255, 255, 0.62);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.58),
      0 6px 16px rgba(15, 23, 42, 0.1);
    transform: translateY(-1px);
  }

  .bookmark-card-icon::after {
    content: attr(data-tooltip);
    position: absolute;
    left: 50%;
    bottom: calc(100% + 10px);
    z-index: 20;
    width: max-content;
    max-width: 240px;
    padding: 0.45rem 0.65rem;
    border-radius: 0.55rem;
    background: rgba(15, 23, 42, 0.95);
    color: #ffffff;
    font-size: 0.78rem;
    line-height: 1.45;
    text-align: left;
    white-space: pre-line;
    box-shadow: 0 10px 28px rgba(15, 23, 42, 0.24);
    opacity: 0;
    pointer-events: none;
    transform: translate(-50%, 4px);
    transition: opacity 0.16s ease, transform 0.16s ease;
  }

  .bookmark-card-icon:hover::after,
  .bookmark-card-icon:focus-visible::after {
    opacity: 1;
    transform: translate(-50%, 0);
  }

  .bookmark-icon-title {
    display: block;
    width: 100%;
    margin-top: 0.45rem;
    color: var(--card-text-color, #0f172a);
    font-size: 0.82rem;
    font-weight: 600;
    line-height: 1.25;
    text-align: center;
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bookmark-card-icon.sort-mode {
    cursor: move;
    transform: none !important;
    transition: none;
    user-select: none;
  }

  .bookmark-card-icon.sort-mode:hover {
    transform: none !important;
  }

  .bookmark-card-icon.sort-mode::after {
    display: none;
  }

  :global([data-theme='dark']) .bookmark-card-icon {
    border-color: rgba(255, 255, 255, 0.1);
    background:
      linear-gradient(135deg, rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.15) * 0.82)), rgba(15, 23, 42, 0.22)),
      rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.15) * 0.7));
    color: var(--card-text-color, #e2e8f0);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 2px 10px rgba(0, 0, 0, 0.18);
  }

  :global([data-theme='dark']) .bookmark-card-icon:hover {
    border-color: rgba(125, 211, 252, 0.26);
  }

  :global([data-theme='dark']) .bookmark-icon-title {
    color: var(--card-text-color, #e5eefb);
  }
</style>
