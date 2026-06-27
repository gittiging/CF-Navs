<script lang="ts">
  import type { Bookmark, CardStyle } from '../../shared/types'
  import { logoSurfIcon } from '../lib/icons'

  type AsyncVoid<T = void> = T | Promise<T>

  export let bookmark: Bookmark
  export let style: CardStyle = 'info'
  export let iconSize: number = 100
  export let showDescription: boolean = true
  export let width: number = 200
  export let height: number = 0
  export let canEdit = false
  export let onEdit: ((bookmark: Bookmark) => AsyncVoid) | undefined = undefined

  let useFallbackIcon = false
  let fallbackFailed = false
  let contextMenuOpen = false
  let iconStateKey = ''

  $: openInNewTab = bookmark.open_method === 1
  $: iconText = bookmark.title.trim().slice(0, 1) || '书'
  $: infoIconSize = Math.max(0, Math.min(height > 0 ? height : 70, width))
  $: compactIconSize = Math.max(0, iconSize)
  $: tooltipText = bookmark.description ? `${bookmark.title}\n${bookmark.description}` : bookmark.title
  $: nextIconStateKey = `${bookmark.id}:${bookmark.icon_source ?? ''}:${bookmark.icon ?? ''}:${bookmark.title}:${bookmark.url}`
  $: cardShellStyle =
    style === 'info'
      ? `min-width: ${width}px; ${height > 0 ? `height: ${height}px;` : ''}`
      : `width: ${compactIconSize}px; height: ${compactIconSize}px;`
  $: cardLinkStyle = height > 0 ? `height: ${height}px;` : ''
  $: if (nextIconStateKey !== iconStateKey) {
    iconStateKey = nextIconStateKey
    useFallbackIcon = false
    fallbackFailed = false
  }

  // 图标来源：有 URL 时优先加载；失败时尝试缓存；再失败用首字母
  $: iconUrl = (() => {
    if (bookmark.icon_source === 'logo_surf') return bookmark.icon || logoSurfIcon(bookmark.title, bookmark.url)
    if (!bookmark.icon) return ''
    if (useFallbackIcon) return `/api/icon/${bookmark.id}`
    return bookmark.icon
  })()
  $: hasRenderableIcon = Boolean(iconUrl) && !fallbackFailed

  function handleIconError() {
    if (bookmark.icon_source === 'logo_surf' || !bookmark.icon || !/^https?:\/\//i.test(bookmark.icon)) {
      fallbackFailed = true
      useFallbackIcon = false
      return
    }

    if (useFallbackIcon) {
      // 缓存也失败了 → 显示首字母
      fallbackFailed = true
      useFallbackIcon = false
    } else {
      // 外部图标失败 → 尝试本地缓存
      useFallbackIcon = true
    }
  }

  function handleIconLoad() {
    fallbackFailed = false
  }

  function closeContextMenu() {
    contextMenuOpen = false
  }

  function handleContextMenu(event: MouseEvent) {
    if (!canEdit || !onEdit) return
    event.preventDefault()
    event.stopPropagation()
    contextMenuOpen = true
  }

  async function handleEditClick() {
    closeContextMenu()
    await onEdit?.(bookmark)
  }


  function handleWindowClick() {
    if (contextMenuOpen) closeContextMenu()
  }

  function handleDocumentKeydown(event: KeyboardEvent) {
    if (contextMenuOpen && event.key === 'Escape') closeContextMenu()
  }

</script>

<svelte:window on:click={handleWindowClick} on:keydown={handleDocumentKeydown} />

<div
  class="bookmark-card-shell"
  class:is-info={style === 'info'}
  class:is-icon={style !== 'info'}
  style={cardShellStyle}
>
  {#if style === 'info'}
    <!-- 详情风格：水平布局 -->
    <a
      class="bookmark-card bookmark-card-info"
      href={bookmark.url}
      target={openInNewTab ? '_blank' : undefined}
      rel={openInNewTab ? 'noopener noreferrer' : undefined}
      style={cardLinkStyle}
      on:contextmenu={handleContextMenu}
    >
      <div class="bookmark-icon" style="width: {infoIconSize}px; height: {infoIconSize}px; max-width: 100%;">
        {#if hasRenderableIcon}
          <img src={iconUrl} alt={bookmark.title} loading="lazy" on:error={handleIconError} on:load={handleIconLoad} />
        {:else}
          <span class="icon-text">{iconText}</span>
        {/if}
      </div>

      <div class="bookmark-text">
        <h3 class="bookmark-title">{bookmark.title}</h3>
        {#if showDescription && bookmark.description}
          <p class="bookmark-description">{bookmark.description}</p>
        {/if}
      </div>
    </a>
  {:else}
    <!-- 极简风格：垂直布局 -->
    <a
      class="bookmark-card bookmark-card-icon"
      href={bookmark.url}
      target={openInNewTab ? '_blank' : undefined}
      rel={openInNewTab ? 'noopener noreferrer' : undefined}
      style="width: {compactIconSize}px; height: {compactIconSize}px;"
      title={tooltipText}
      aria-label={tooltipText}
      data-tooltip={tooltipText}
      on:contextmenu={handleContextMenu}
    >
      <div class="bookmark-icon">
        {#if hasRenderableIcon}
          <img src={iconUrl} alt={bookmark.title} loading="lazy" on:error={handleIconError} on:load={handleIconLoad} />
        {:else}
          <span class="icon-text">{iconText}</span>
        {/if}
      </div>
    </a>
  {/if}

  {#if contextMenuOpen}
    <div class="bookmark-context-menu">
      <button type="button" on:click={handleEditClick}>编辑</button>
    </div>
  {/if}
</div>

<style>
  .bookmark-card-shell {
    position: relative;
    min-width: 0;
  }

  .bookmark-card-shell.is-info {
    width: 100%;
  }

  .bookmark-card-shell.is-icon {
    flex: 0 0 auto;
  }

  /* 通用卡片样式 */
  .bookmark-card {
    text-decoration: none;
    color: inherit;
    transition: all 0.2s ease;
  }

  /* 详情风格 */
  .bookmark-card-info {
    display: flex;
    align-items: center;
    width: 100%;
    height: 70px; /* 默认高度，可被内联样式覆盖 */
    padding: 0;
    border-radius: 1.2rem;
    background: rgb(var(--card-bg-rgb, 255 255 255) / var(--card-bg-opacity, 0.9));
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
    overflow: hidden;
  }

  .bookmark-card-info:hover {
    box-shadow: 0 0 20px 10px rgba(0, 0, 0, 0.2);
    transform: translateY(-2px);
  }

  .bookmark-card-info .bookmark-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    padding: 0 1rem; /* 添加左右内边距 */
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .bookmark-card-info .bookmark-title {
    font-size: 0.9rem;
    font-weight: 600;
    margin: 0;
    line-height: 1.2;
    text-shadow: 2px 2px 5px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bookmark-card-info .bookmark-description {
    font-size: 0.75rem;
    color: rgba(71, 85, 105, 0.92);
    margin: 0.25rem 0 0 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.2;
  }

  /* 极简风格 */
  .bookmark-card-icon {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border-radius: 1.2rem;
    background: rgb(var(--card-bg-rgb, 255 255 255) / var(--card-bg-opacity, 0.9));
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
  }

  .bookmark-card-icon:hover {
    box-shadow: 0 0 20px 10px rgba(0, 0, 0, 0.2);
    transform: translateY(-2px);
  }

  .bookmark-card-icon .bookmark-icon {
    width: 100%;
    height: 100%;
    border-radius: inherit;
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

  /* 图标样式 */
  .bookmark-icon {
    flex-shrink: 0;
    min-width: 0;
    max-width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.5);
  }

  /* 详情风格的图标填充整个高度 */
  .bookmark-card-info .bookmark-icon {
    height: 100%; /* 填充整个卡片高度 */
    border-radius: 1.2rem 0 0 1.2rem;
  }

  .bookmark-icon img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .bookmark-icon .icon-text {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow-wrap: anywhere;
    font-size: 2.5rem;
    font-weight: 600;
    color: #475569;
  }

  /* 暗色主题适配 */
  :global([data-theme='dark']) .bookmark-card-info,
  :global([data-theme='dark']) .bookmark-card-icon {
    background: rgb(var(--card-bg-rgb, 255 255 255) / var(--card-bg-opacity, 0.15));
    color: #e2e8f0;
  }

  :global([data-theme='dark']) .bookmark-card-info:hover,
  :global([data-theme='dark']) .bookmark-card-icon:hover {
    box-shadow: 0 0 20px 10px rgba(255, 255, 255, 0.1);
  }

  :global([data-theme='dark']) .bookmark-card-info .bookmark-description {
    color: rgba(203, 213, 225, 0.92);
  }

  :global([data-theme='dark']) .bookmark-icon {
    background: rgba(255, 255, 255, 0.1);
  }

  :global([data-theme='dark']) .bookmark-icon .icon-text {
    color: #cbd5e1;
  }

  .bookmark-context-menu {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 80;
    min-width: 88px;
    padding: 6px;
    border: 1px solid rgba(148, 163, 184, 0.32);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 14px 32px rgba(15, 23, 42, 0.18);
    backdrop-filter: blur(10px);
  }

  .bookmark-context-menu button {
    width: 100%;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #0f172a;
    cursor: pointer;
    font-size: 13px;
    padding: 7px 12px;
    text-align: left;
  }

  .bookmark-context-menu button:hover {
    background: #eff6ff;
    color: #1d4ed8;
  }

  :global([data-theme='dark']) .bookmark-context-menu {
    border-color: rgba(148, 163, 184, 0.28);
    background: rgba(15, 23, 42, 0.94);
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.32);
  }

  :global([data-theme='dark']) .bookmark-context-menu button {
    color: #e5eefb;
  }

  :global([data-theme='dark']) .bookmark-context-menu button:hover {
    background: rgba(59, 130, 246, 0.18);
    color: #93c5fd;
  }
</style>
