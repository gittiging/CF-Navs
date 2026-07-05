<script lang="ts">
  import { onDestroy } from 'svelte'
  import {
    DEFAULT_LOGO_SURF_SCHEME,
    getIconCandidates,
    iconifyIcon,
    iconifyNameFromUrl,
    iconifyProxyIcon,
    logoSurfIcon,
    normalizeIconifyName,
    type IconCandidate,
    type LogoSurfColorScheme,
  } from '../lib/icons'
  import { getErrorMessage, iconifyApi } from '../lib/api'
  import type { BookmarkFormValue } from '../lib/adminTypes'
  import {
    buildBookmarkSubmitPayload,
    canPreviewIcon,
    canPreviewIconAsImage,
    createBookmarkFormValue,
    emptyBookmarkForm,
    findLogoSchemeName,
    getCandidatePreviewUrl,
    getFormIconPreviewUrl,
    getIconifySearchQuery,
    getLogoSchemeByName,
    getTextIconPreview,
    isCandidateSelected,
  } from '../lib/bookmarkFormIcons'
  import ColorAlphaInput from './ColorAlphaInput.svelte'
  import IconifySelector from './IconifySelector.svelte'
  import LogoSchemeSelector from './LogoSchemeSelector.svelte'
  import type { IconifyCandidate as IconifySearchCandidate } from '../../shared/types'

  type BookmarkCategoryOption = {
    id: string | number
    title: string
  }

  export let open = false
  export let loading = false
  export let error = ''
  export let mode: 'create' | 'edit' = 'create'
  export let value: Partial<BookmarkFormValue> | null = null
  export let categories: BookmarkCategoryOption[] = []
  export let onSubmit: ((payload: BookmarkFormValue) => void | Promise<void>) | undefined = undefined
  export let onCancel: (() => void) | undefined = undefined
  export let onDelete: ((bookmark: { id: string | number; title: string }) => void | Promise<void>) | undefined = undefined
  export let deleting = false
  export let imageHostUrl = ''

  let form: BookmarkFormValue = { ...emptyBookmarkForm }
  let formKey = ''
  let faviconError = ''
  let selectedLogoSchemeName = DEFAULT_LOGO_SURF_SCHEME.name
  let iconifyName = ''
  let iconifyUseConfirmed = false
  let confirmedIconifyName = ''
  let iconifySearchCandidates: IconifySearchCandidate[] = []
  let iconifySearchLoading = false
  let iconifySearchError = ''
  let iconifySearchTimer: ReturnType<typeof setTimeout> | null = null
  let iconifySearchRequestId = 0
  let lastIconifySearchQuery = ''
  let previousBodyOverflow: string | null = null
  let previousDocumentOverflow: string | null = null

  // 当前链接下的图标候选
  let candidates: IconCandidate[] = []
  let candidateError = ''

  $: nextKey = JSON.stringify({ open, mode, value, categoryIds: categories.map((item) => item.id) })
  $: setPageScrollLocked(open)
  $: if (nextKey !== formKey) {
    formKey = nextKey
    faviconError = ''
    candidateError = ''
    const fallbackCategoryId = categories[0]?.id
    form = createBookmarkFormValue(value, fallbackCategoryId)
    selectedLogoSchemeName = findLogoSchemeName(form.icon) ?? DEFAULT_LOGO_SURF_SCHEME.name
    iconifyName = form.icon_source === 'iconify' ? iconifyNameFromUrl(form.icon) ?? '' : ''
    iconifyUseConfirmed = mode === 'edit' && form.icon_source === 'iconify' && Boolean(iconifyName)
    confirmedIconifyName = iconifyUseConfirmed ? iconifyName : ''
    iconifySearchCandidates = []
    iconifySearchError = ''
    iconifySearchLoading = false
    lastIconifySearchQuery = ''
    // 编辑模式也重新生成候选
    if (form.url.trim()) {
      candidates = getIconCandidates(form.url.trim(), form.title.trim())
    } else {
      candidates = []
    }
  }

  // 输入 URL 后实时生成候选
  $: if (form.url.trim() && formKey) {
    candidates = getIconCandidates(form.url.trim(), form.title.trim())
    candidateError = ''
  }

  $: currentLogoScheme = getLogoSchemeByName(selectedLogoSchemeName)
  $: normalizedIconifyName = normalizeIconifyName(iconifyName)
  $: iconifySourceUrl = iconifyIcon(iconifyName)
  $: iconifyPreviewUrl = iconifyProxyIcon(iconifyName)
  $: showLogoSchemes = form.icon_source === 'logo_surf' && Boolean(form.url.trim())
  $: showIconifyOptions = form.icon_source === 'iconify'
  $: iconifySelected =
    iconifyUseConfirmed &&
    Boolean(normalizedIconifyName) &&
    confirmedIconifyName === normalizedIconifyName
  $: scheduleIconifyCandidateSearch(showIconifyOptions, iconifyName)
  $: logoPreviewText = (form.title.trim() || 'NAV').slice(0, 4)
  $: if (iconifyUseConfirmed && normalizedIconifyName !== confirmedIconifyName) {
    iconifyUseConfirmed = false
  }
  $: if (form.icon_source === 'logo_surf' && form.url.trim()) {
    const nextLogoIcon = logoSurfIcon(form.title.trim(), form.url.trim(), currentLogoScheme)
    if (form.icon !== nextLogoIcon) {
      form.icon = nextLogoIcon
    }
  }
  $: if (form.icon_source === 'iconify' && normalizedIconifyName && form.icon !== iconifySourceUrl) {
    form.icon = iconifySourceUrl
  }

  function clearIconifySearchTimer() {
    if (iconifySearchTimer) {
      clearTimeout(iconifySearchTimer)
      iconifySearchTimer = null
    }
  }

  function scheduleIconifyCandidateSearch(enabled: boolean, value: string) {
    const query = enabled ? getIconifySearchQuery(value) : ''
    if (query === lastIconifySearchQuery) return

    lastIconifySearchQuery = query
    clearIconifySearchTimer()
    iconifySearchRequestId += 1
    iconifySearchError = ''

    if (!query) {
      iconifySearchCandidates = []
      iconifySearchLoading = false
      return
    }

    const requestId = iconifySearchRequestId
    iconifySearchLoading = true
    iconifySearchTimer = setTimeout(() => {
      void loadIconifyCandidates(query, requestId)
    }, 280)
  }

  async function loadIconifyCandidates(query: string, requestId: number) {
    try {
      const result = await iconifyApi.search(query)
      if (requestId !== iconifySearchRequestId) return

      iconifySearchCandidates = result.candidates
      iconifySearchError = ''
    } catch (searchError) {
      if (requestId !== iconifySearchRequestId) return

      iconifySearchCandidates = []
      iconifySearchError = getErrorMessage(searchError)
    } finally {
      if (requestId === iconifySearchRequestId) {
        iconifySearchLoading = false
      }
    }
  }

  function selectLogoColorScheme(scheme: LogoSurfColorScheme) {
    if (!form.url.trim()) return
    selectedLogoSchemeName = scheme.name
    form.icon = logoSurfIcon(form.title.trim(), form.url.trim(), scheme)
    form.icon_source = 'logo_surf'
    candidateError = ''
    faviconError = ''
  }

  function selectIconifyIcon() {
    if (!iconifySourceUrl) {
      candidateError = '请输入有效的 Iconify 图标名或 icon-sets 链接，例如 mdi:home 或 https://icon-sets.iconify.design/mdi/home/'
      return
    }

    form.icon = iconifySourceUrl
    form.icon_source = 'iconify'
    iconifyName = normalizedIconifyName
    iconifyUseConfirmed = true
    confirmedIconifyName = normalizedIconifyName
    candidateError = ''
    faviconError = ''
  }

  function selectIconifySearchCandidate(candidate: IconifySearchCandidate) {
    iconifyName = candidate.name
    form.icon = candidate.url
    form.icon_source = 'iconify'
    iconifyUseConfirmed = true
    confirmedIconifyName = candidate.name
    candidateError = ''
    faviconError = ''
  }

  function openIconifyLibrary() {
    window.open('https://icon-sets.iconify.design/', '_blank', 'noopener,noreferrer')
  }

  function setPageScrollLocked(locked: boolean) {
    if (typeof document === 'undefined') return

    if (locked && previousBodyOverflow === null) {
      previousBodyOverflow = document.body.style.overflow
      previousDocumentOverflow = document.documentElement.style.overflow
      document.documentElement.style.overflow = 'hidden'
      document.body.style.overflow = 'hidden'
      return
    }

    if (!locked && previousBodyOverflow !== null) {
      document.documentElement.style.overflow = previousDocumentOverflow ?? ''
      document.body.style.overflow = previousBodyOverflow
      previousBodyOverflow = null
      previousDocumentOverflow = null
    }
  }

  function selectCandidate(candidate: IconCandidate) {
    if (candidate.source === 'logo_surf') {
      selectLogoColorScheme(DEFAULT_LOGO_SURF_SCHEME)
      return
    }

    form.icon = candidate.url
    form.icon_source = candidate.source
    if (candidate.source === 'iconify') {
      iconifyName = iconifyNameFromUrl(candidate.url) ?? iconifyName
      iconifyUseConfirmed = false
      confirmedIconifyName = ''
    } else {
      iconifyName = ''
      iconifyUseConfirmed = false
      confirmedIconifyName = ''
    }
    candidateError = ''
    faviconError = ''
  }

  function markCustomIconInput() {
    form.icon_source = ''
    iconifyName = ''
    iconifyUseConfirmed = false
    confirmedIconifyName = ''
  }

  function openImageHost() {
    if (!imageHostUrl) return
    const base = imageHostUrl.endsWith('/') ? imageHostUrl.slice(0, -1) : imageHostUrl
    window.open(`${base}/upload`, '_blank', 'noopener,noreferrer')
  }

  async function handleSubmit() {
    await onSubmit?.(buildBookmarkSubmitPayload(form, iconifyName))
  }

  function handleCancel() {
    if (loading || deleting) {
      return
    }
    onCancel?.()
  }

  async function handleDelete() {
    if (!form.id || !onDelete || loading || deleting) return
    await onDelete({ id: form.id, title: form.title.trim() })
  }

  onDestroy(() => {
    clearIconifySearchTimer()
    setPageScrollLocked(false)
  })
</script>

{#if open}
  <div class="modal-backdrop">
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="bookmark-modal-title">
      <div class="modal-header">
        <div>
          <p class="modal-eyebrow">书签管理</p>
          <h2 id="bookmark-modal-title">{mode === 'create' ? '新增书签' : '编辑书签'}</h2>
        </div>
        <button type="button" class="ghost-button" on:click={handleCancel} disabled={loading || deleting}>取消</button>
      </div>

      <form class="modal-form" on:submit|preventDefault={handleSubmit}>
        <label class="field-compact">
          <span>所属分类</span>
          <select bind:value={form.category_id} disabled={loading || categories.length === 0} required>
            {#if categories.length === 0}
              <option value="">暂无分类可选</option>
            {:else}
              {#each categories as category}
                <option value={category.id}>{category.title}</option>
              {/each}
            {/if}
          </select>
        </label>

        <label class="field-compact">
          <span>书签标题</span>
          <input bind:value={form.title} type="text" placeholder="例如：Svelte 官方网站" required />
        </label>

        <label class="field-compact">
          <span>链接地址</span>
          <input bind:value={form.url} type="url" placeholder="https://example.com" required />
        </label>

        <label class="field-compact">
          <span>打开方式</span>
          <select bind:value={form.open_method}>
            <option value="new_tab">新标签页</option>
            <option value="same_tab">当前标签页</option>
            <option value="modal">当前页弹层</option>
          </select>
        </label>

        <!-- 图标候选区 -->
        <div class="icon-picker-section field-compact">
          <span class="field-label">选择图标</span>

          {#if candidates.length > 0}
            <div class="icon-candidates">
              {#each candidates as candidate}
                <button
                  type="button"
                  class="candidate-card"
                  class:selected={isCandidateSelected(candidate, form)}
                  on:click={() => selectCandidate(candidate)}
                  title={candidate.label}
                >
                  <img
                    src={getCandidatePreviewUrl(candidate)}
                    alt={candidate.label}
                    loading="lazy"
                  />
                  <span class="candidate-label">{candidate.label}</span>
                </button>
              {/each}
            </div>
          {:else if form.url.trim()}
            <p class="hint-text">请输入有效链接以生成图标候选</p>
          {:else}
            <p class="hint-text">填写链接地址后将自动生成图标选项</p>
          {/if}
        </div>

        <div class="field-block field-compact">
          <span>图标背景色</span>
          <ColorAlphaInput
            bind:value={form.icon_background_color}
            placeholder="留空则使用默认背景"
            inputLabel="图标背景颜色值"
            swatchTitle="选择图标背景色"
            alphaText="图标背景透明度"
          />
          <small>可为单个书签图标设置背景色，留空则使用全局默认。</small>
        </div>

        {#if showIconifyOptions}
          <IconifySelector
            bind:iconifyName
            {iconifyPreviewUrl}
            {iconifySelected}
            {iconifyUseConfirmed}
            {confirmedIconifyName}
            {iconifySearchCandidates}
            {iconifySearchLoading}
            {iconifySearchError}
            {candidateError}
            {loading}
            onOpenLibrary={openIconifyLibrary}
            onSelectIcon={selectIconifyIcon}
            onSelectCandidate={selectIconifySearchCandidate}
          />
        {/if}

        {#if showLogoSchemes}
          <LogoSchemeSelector
            {selectedLogoSchemeName}
            iconSource={form.icon_source}
            {currentLogoScheme}
            {logoPreviewText}
            onSelectScheme={selectLogoColorScheme}
          />
        {/if}

        <label class="field-wide">
          <span>自定义图标 / 手动输入</span>
          <div class="icon-row">
            <input
              bind:value={form.icon}
              type="text"
              placeholder="图标 URL / 表情，如 ⭐"
              on:input={markCustomIconInput}
            />
            {#if form.icon && canPreviewIcon(form.icon)}
              <span class="icon-preview" title="图标预览">
                {#if canPreviewIconAsImage(form.icon)}
                  <img src={getFormIconPreviewUrl(form, iconifyName)} alt="图标预览" />
                {:else}
                  <span class="icon-preview-text">{getTextIconPreview(form.icon)}</span>
                {/if}
              </span>
            {/if}
            {#if imageHostUrl}
              <button
                type="button"
                class="ghost-button upload-button"
                on:click={openImageHost}
                disabled={loading}
                title="打开图床上传图标"
              >
                打开图床 ↗
              </button>
            {/if}
          </div>
          {#if faviconError}
            <small class="field-error">{faviconError}</small>
          {/if}
        </label>


        <label class="field-wide description-field">
          <span>描述</span>
          <textarea bind:value={form.description} rows="3" placeholder="补充说明，可选"></textarea>
        </label>


        {#if error}
          <p class="error-text">{error}</p>
        {/if}

        <div class="modal-actions">
          {#if mode === 'edit' && form.id && onDelete}
            <button type="button" class="danger-button" on:click={handleDelete} disabled={loading || deleting}>
              {#if deleting}删除中...{:else}删除{/if}
            </button>
          {/if}
          <button type="button" class="ghost-button" on:click={handleCancel} disabled={loading}>取消</button>
          <button
            type="submit"
            class="primary-button"
            disabled={loading || deleting || categories.length === 0 || !form.title.trim() || !form.url.trim()}
          >
            {#if loading}保存中...{:else}保存{/if}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    padding: 14px;
    background: rgba(15, 23, 42, 0.56);
    overflow: hidden;
    overscroll-behavior: contain;
  }

  .modal-backdrop::before {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(15, 23, 42, 0.18);
    backdrop-filter: blur(2px);
    pointer-events: none;
  }

  .modal-card {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    width: min(100%, 680px);
    height: min(720px, calc(100vh - 28px));
    height: min(720px, calc(100dvh - 28px));
    max-height: calc(100vh - 28px);
    max-height: calc(100dvh - 28px);
    min-height: 0;
    overflow: hidden;
    overscroll-behavior: contain;
    border-radius: 18px;
    background: #ffffff;
    box-shadow: 0 24px 60px rgba(15, 23, 42, 0.24);
    padding: 0;
    scrollbar-gutter: stable;
  }

  .modal-header {
    flex: 0 0 auto;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin: 0;
    padding: 12px 16px 9px;
    border-bottom: 1px solid #e2e8f0;
  }

  .modal-eyebrow {
    margin: 0 0 4px;
    font-size: 12px;
    color: #64748b;
  }

  h2 {
    margin: 0;
    font-size: 20px;
    color: #0f172a;
  }

  .modal-form {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(180px, 0.85fr);
    align-content: start;
    gap: 8px 10px;
    padding: 10px 14px 0;
  }

  label,
  .field-block {
    display: grid;
    min-width: 0;
    gap: 4px;
    color: #334155;
    font-size: 13px;
  }

  .field-wide {
    grid-column: 1 / -1;
  }

  .field-compact {
    grid-column: span 1;
  }

  .field-block > span {
    font-weight: 600;
  }

  input,
  select,
  textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid #cbd5e1;
    border-radius: 9px;
    padding: 6px 9px;
    font-size: 13px;
    color: #0f172a;
    background: #ffffff;
    font-family: inherit;
  }

  textarea {
    resize: vertical;
    min-height: 48px;
  }

  input:focus,
  select:focus,
  textarea:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
  }

  .field-label {
    color: #334155;
    font-size: 13px;
    font-weight: 600;
  }

  .hint-text {
    margin: 0;
    color: #94a3b8;
    font-size: 12px;
    line-height: 1.35;
    padding: 2px 0;
  }

  .error-text {
    grid-column: 1 / -1;
    margin: 0;
    color: #dc2626;
    font-size: 13px;
  }

  .icon-picker-section {
    display: grid;
    min-width: 0;
    gap: 5px;
  }

  .icon-candidates {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 5px;
  }

  .candidate-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    min-height: 46px;
    padding: 4px;
    border: 2px solid #e2e8f0;
    border-radius: 9px;
    background: #ffffff;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .candidate-card:hover {
    border-color: #93c5fd;
    background: #f0f5ff;
  }

  .candidate-card.selected {
    border-color: #2563eb;
    background: #eff6ff;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
  }

  .candidate-card img {
    width: 22px;
    height: 22px;
    object-fit: contain;
    border-radius: 6px;
  }

  .candidate-label {
    font-size: 10px;
    color: #475569;
    text-align: center;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  .candidate-card.selected .candidate-label {
    color: #1e40af;
    font-weight: 600;
  }

  .icon-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content max-content;
    gap: 6px;
    align-items: center;
  }

  .icon-row input {
    min-width: 0;
  }

  .upload-button {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .icon-preview {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: 1px solid #e2e8f0;
    border-radius: 9px;
    background: #f8fafc;
    box-sizing: border-box;
  }

  .icon-preview img {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    object-fit: cover;
  }

  .icon-preview-text {
    max-width: 100%;
    color: #475569;
    font-size: 14px;
    font-weight: 700;
    line-height: 1;
    overflow: hidden;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .field-error {
    margin: 0;
    color: #dc2626;
    font-size: 12px;
    line-height: 1.35;
  }

  .modal-actions {
    grid-column: 1 / -1;
    position: sticky;
    bottom: 0;
    z-index: 2;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin: 0 -14px;
    padding: 7px 14px 9px;
    border-top: 1px solid #e2e8f0;
    background: rgba(255, 255, 255, 0.96);
    backdrop-filter: blur(10px);
  }

  .primary-button,
  .ghost-button,
  .danger-button {
    border-radius: 10px;
    padding: 7px 12px;
    font-size: 13px;
    cursor: pointer;
    transition: 0.18s ease;
  }

  .primary-button {
    border: none;
    background: #2563eb;
    color: #ffffff;
  }

  .ghost-button {
    border: 1px solid #cbd5e1;
    background: #ffffff;
    color: #0f172a;
  }

  .danger-button {
    margin-right: auto;
    border: 1px solid #fecaca;
    background: #fef2f2;
    color: #dc2626;
  }

  .primary-button:disabled,
  .ghost-button:disabled,
  .danger-button:disabled,
  select:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .modal-card :global(.color-picker-row) {
    gap: 6px;
  }

  .modal-card :global(.color-picker-row input[type='text']) {
    border-radius: 9px;
    padding: 6px 9px;
    font-size: 13px;
  }

  .modal-card :global(.color-swatch) {
    width: 32px;
    height: 32px;
    flex-basis: 32px;
    border-radius: 9px;
  }

  @media (max-width: 500px) {
    .modal-backdrop {
      padding: 10px;
    }

    .modal-card {
      width: min(100%, 600px);
      height: calc(100vh - 20px);
      height: calc(100dvh - 20px);
      max-height: calc(100vh - 20px);
      max-height: calc(100dvh - 20px);
    }

    .modal-form {
      grid-template-columns: 1fr;
      gap: 8px;
      padding-right: 14px;
      padding-left: 14px;
    }

    .field-compact,
    .field-wide {
      grid-column: 1 / -1;
    }

    .icon-candidates {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .icon-row {
      align-items: stretch;
      grid-template-columns: minmax(0, 1fr) 32px;
    }

    .icon-row .upload-button {
      grid-column: 1 / -1;
    }

    .modal-actions {
      margin-right: -14px;
      margin-left: -14px;
      padding-right: 14px;
      padding-left: 14px;
    }
  }
</style>
