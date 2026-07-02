<script lang="ts">
  import { onMount, onDestroy } from 'svelte'

  export let items: Array<{ id: string | number; title: string; count?: number }> = []
  export let activeId: string | number | null = null
  export let onNavigate: ((id: string | number) => void) | undefined = undefined

  // 配置项
  const scrollOffset = 80 // 滚动偏移量
  const mobileWidth = 800 // 移动端宽度定义

  let isExpanded = false
  let isMobileView = false
  let mobileSidebarOpen = false

  function checkIsMobile() {
    isMobileView = window.innerWidth < mobileWidth
  }

  function handleResize() {
    checkIsMobile()
    if (isMobileView) {
      // 移动端：如果侧栏没有主动打开，保持收起状态
      if (!mobileSidebarOpen) {
        isExpanded = false
      }
    } else {
      // PC端：重置移动端状态
      mobileSidebarOpen = false
      isExpanded = false
    }
  }

  function debounce(func: () => void, wait: number) {
    let timeout: ReturnType<typeof setTimeout>
    return function () {
      clearTimeout(timeout)
      timeout = setTimeout(func, wait)
    }
  }

  const debouncedHandleResize = debounce(handleResize, 200)

  function handleMobileBtnClick() {
    if (isMobileView) {
      mobileSidebarOpen = !mobileSidebarOpen
      isExpanded = mobileSidebarOpen
    }
  }

  function handleCloseBtnClick(e: Event) {
    e.preventDefault()
    e.stopPropagation()

    mobileSidebarOpen = false
    isExpanded = false
  }

  function handleMouseEnter() {
    // PC端才响应 hover
    if (isMobileView) return
    isExpanded = true
  }

  function handleMouseLeave() {
    // PC端才响应 hover
    if (isMobileView) return
    isExpanded = false
  }

  function handleItemClick(id: string | number) {
    onNavigate?.(id)

    // 移动端点击后自动关闭
    if (isMobileView) {
      mobileSidebarOpen = false
      isExpanded = false
    }
  }

  onMount(() => {
    checkIsMobile()
    window.addEventListener('resize', debouncedHandleResize)
  })

  onDestroy(() => {
    window.removeEventListener('resize', debouncedHandleResize)
  })
</script>

<!-- 移动端触发按钮 -->
<button
  type="button"
  class="toc-mobile-btn"
  class:hidden={!isMobileView}
  on:click={handleMobileBtnClick}
  aria-label="目录导航"
>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path
      fill="currentColor"
      d="M17.5 4.5c-1.95 0-4.05.4-5.5 1.5c-1.45-1.1-3.55-1.5-5.5-1.5c-1.45 0-2.99.22-4.28.79C1.49 5.62 1 6.33 1 7.14v11.28c0 1.3 1.22 2.26 2.48 1.94c.98-.25 2.02-.36 3.02-.36c1.56 0 3.22.26 4.56.92c.6.3 1.28.3 1.87 0c1.34-.67 3-.92 4.56-.92c1 0 2.04.11 3.02.36c1.26.33 2.48-.63 2.48-1.94V7.14c0-.81-.49-1.52-1.22-1.85c-1.28-.57-2.82-.79-4.27-.79M21 17.23c0 .63-.58 1.09-1.2.98c-.75-.14-1.53-.2-2.3-.2c-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5c.92 0 1.83.09 2.7.28c.46.1.8.51.8.98z"
    />
    <path
      fill="currentColor"
      d="M13.98 11.01c-.32 0-.61-.2-.71-.52c-.13-.39.09-.82.48-.94c1.54-.5 3.53-.66 5.36-.45c.41.05.71.42.66.83s-.42.71-.83.66c-1.62-.19-3.39-.04-4.73.39c-.08.01-.16.03-.23.03m0 2.66c-.32 0-.61-.2-.71-.52c-.13-.39.09-.82.48-.94c1.53-.5 3.53-.66 5.36-.45c.41.05.71.42.66.83s-.42.71-.83.66c-1.62-.19-3.39-.04-4.73.39a1 1 0 0 1-.23.03m0 2.66c-.32 0-.61-.2-.71-.52c-.13-.39.09-.82.48-.94c1.53-.5 3.53-.66 5.36-.45c.41.05.71.42.66.83s-.42.7-.83.66c-1.62-.19-3.39-.04-4.73.39a1 1 0 0 1-.23.03"
    />
  </svg>
</button>

<!-- 移动端遮罩层 -->
{#if isMobileView && mobileSidebarOpen}
  <button type="button" class="sidebar-overlay" on:click={handleCloseBtnClick} aria-label="关闭目录导航"></button>
{/if}

<!-- 侧栏 -->
<aside
  class="toc-sidebar"
  class:expanded={isExpanded}
  class:mobile-hidden={isMobileView && !mobileSidebarOpen}
  on:mouseenter={handleMouseEnter}
  on:mouseleave={handleMouseLeave}
>
  <!-- 关闭按钮（仅移动端展开时显示）-->
  <button
    type="button"
    class="toc-close-btn"
    class:visible={isMobileView && isExpanded}
    on:click={handleCloseBtnClick}
    aria-label="收起目录"
  >
    ‹
  </button>

  <!-- 导航列表 -->
  <nav class="toc-nav">
    {#each items as item (item.id)}
      <button
        type="button"
        class="toc-item"
        class:active={activeId === item.id}
        on:click={() => handleItemClick(item.id)}
      >
        <span class="toc-slip"></span>
        <span class="toc-title">{item.title}</span>
      </button>
    {/each}
  </nav>
</aside>

<style>
  /* 分类快速选择栏和移动端触发按钮共用书签卡片玻璃变量 */
  .toc-mobile-btn,
  .toc-sidebar {
    --toc-surface:
      linear-gradient(135deg, rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.78)), rgba(255, 255, 255, 0.34)),
      rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.62));
    --toc-surface-strong:
      linear-gradient(135deg, rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.86)), rgba(255, 255, 255, 0.42)),
      rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.7));
    --toc-item-bg: rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.28));
    --toc-item-hover-bg: rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.9) * 0.44));
    --toc-border: rgba(255, 255, 255, 0.42);
    --toc-text: var(--home-text-color, #0f172a);
    --toc-accent: var(--home-accent-color, #2563eb);
    --toc-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.52),
      0 10px 26px rgba(15, 23, 42, 0.11);
    --toc-slip: rgba(15, 23, 42, 0.72);
    --toc-slip-shadow: 0 5px 14px rgba(15, 23, 42, 0.18);
  }

  :global([data-theme='dark']) .toc-mobile-btn,
  :global([data-theme='dark']) .toc-sidebar {
    --toc-surface:
      linear-gradient(135deg, rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.15) * 0.82)), rgba(15, 23, 42, 0.22)),
      rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.15) * 0.7));
    --toc-surface-strong:
      linear-gradient(135deg, rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.15) * 0.92)), rgba(15, 23, 42, 0.28)),
      rgb(var(--card-bg-rgb, 255 255 255) / calc(var(--card-bg-opacity, 0.15) * 0.78));
    --toc-item-bg: rgba(15, 23, 42, 0.18);
    --toc-item-hover-bg: rgba(30, 41, 59, 0.38);
    --toc-border: rgba(255, 255, 255, 0.1);
    --toc-text: var(--home-text-color, #e5eefb);
    --toc-accent: var(--home-accent-color, #7dd3fc);
    --toc-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 14px 32px rgba(0, 0, 0, 0.24);
    --toc-slip: rgba(226, 232, 240, 0.82);
    --toc-slip-shadow: 0 5px 16px rgba(0, 0, 0, 0.24);
  }

  .toc-mobile-btn {
    position: fixed;
    top: 20px;
    left: 20px;
    z-index: 40;
    width: 46px;
    height: 46px;
    border: 1px solid var(--toc-border);
    border-radius: 0.9rem;
    background: var(--toc-surface);
    backdrop-filter: blur(14px) saturate(1.18);
    -webkit-backdrop-filter: blur(14px) saturate(1.18);
    color: var(--toc-text);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: var(--toc-shadow);
    transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
  }

  .toc-mobile-btn svg {
    width: 21px;
    height: 21px;
  }

  .toc-mobile-btn:hover {
    background: var(--toc-surface-strong);
    border-color: color-mix(in srgb, var(--toc-accent) 46%, var(--toc-border));
    transform: scale(1.05);
  }

  .toc-mobile-btn.hidden {
    display: none;
  }

  /* 移动端遮罩层 */
  .sidebar-overlay {
    position: fixed;
    border: 0;
    padding: 0;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 30;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
    cursor: pointer;
  }

  /* 侧栏 */
  .toc-sidebar {
    position: fixed;
    top: 0;
    left: 0;
    height: 100%;
    width: 40px;
    z-index: 50;  /* 从 35 提升到 50，高于 header (40) */
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 10px;
    overflow: hidden;
    border: 1px solid var(--toc-border);
    border-left: none;
    border-top-right-radius: 20px;
    border-bottom-right-radius: 20px;
    background: var(--toc-surface);
    box-shadow: var(--toc-shadow);
    backdrop-filter: blur(14px) saturate(1.18);
    -webkit-backdrop-filter: blur(14px) saturate(1.18);
    transition: width 0.3s ease, background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
  }

  .toc-sidebar.expanded {
    width: 200px;
    background: var(--toc-surface);
  }

  .toc-sidebar.mobile-hidden {
    display: none;
  }

  /* 关闭按钮 */
  .toc-close-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 40px;
    height: 40px;
    border: 1px solid var(--toc-border);
    border-radius: 0.8rem;
    background: var(--toc-item-bg);
    backdrop-filter: blur(10px) saturate(1.12);
    -webkit-backdrop-filter: blur(10px) saturate(1.12);
    color: var(--toc-text);
    font-size: 24px;
    line-height: 1;
    display: none;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 2;
    transition: background 0.2s ease, transform 0.1s ease;
    touch-action: manipulation;
  }

  .toc-close-btn.visible {
    display: flex !important;
  }

  .toc-close-btn:hover {
    background: var(--toc-item-hover-bg);
  }

  .toc-close-btn:active {
    background: var(--toc-item-hover-bg);
    transform: scale(0.95);
  }

  /* 导航列表 */
  .toc-nav {
    width: 200px;
    margin-top: 56px;
    display: grid;
    gap: 6px;
  }

  /* 导航项 */
  .toc-item {
    width: calc(100% - 20px);
    border: none;
    border-radius: 0.9rem;
    background: transparent;
    display: flex;
    align-items: center;
    cursor: pointer;
    padding: 0 10px 0 0;
    margin: 0;
    color: var(--toc-text);
    transition: background 0.18s ease, transform 0.18s ease;
  }

  .toc-sidebar.expanded .toc-item {
    background: var(--toc-item-bg);
  }

  .toc-sidebar.expanded .toc-item:hover,
  .toc-sidebar.expanded .toc-item.active {
    background: var(--toc-item-hover-bg);
    transform: translateX(2px);
  }

  /* 条纹指示器 */
  .toc-slip {
    width: 20px;
    height: 6px;
    background-color: var(--toc-slip);
    border-radius: 4px;
    margin: 13px 0;
    flex-shrink: 0;
    transition: width 0.3s ease, height 0.3s ease, box-shadow 0.3s ease, background 0.18s ease;
    box-shadow: var(--toc-slip-shadow);
  }

  .toc-sidebar.expanded .toc-slip {
    box-shadow: none;
  }

  .toc-item:hover .toc-slip {
    width: 40px;
  }

  .toc-item.active .toc-slip {
    background-color: var(--toc-accent);
  }

  /* 标题文字 */
  .toc-title {
    opacity: 0;
    white-space: nowrap;
    font-size: 14px;
    color: var(--toc-text);
    margin-left: 0;
    transition: opacity 0.3s ease, margin-left 0.3s ease, font-size 0.3s ease;
  }

  .toc-sidebar.expanded .toc-title {
    opacity: 1;
    margin-left: 10px;
  }

  .toc-item:hover .toc-title {
    font-size: 16px;
  }

  .toc-item.active .toc-title {
    color: var(--toc-accent);
  }

  /* 移动端适配 */
  @media (max-width: 799px) {
    .toc-sidebar {
      width: 200px;
    }
  }
</style>
