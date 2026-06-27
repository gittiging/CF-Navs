# CF-Navs API 契约

共享类型定义见 `shared/types.ts`。前端和后端都应以共享类型为准；修改接口时同步更新本文件和 `shared/types.ts`。

## 通用约定

- 所有接口前缀为 `/api`。
- 常规响应使用统一包络：`{ code, msg, data }`。
- 业务错误通常仍返回 HTTP 200，用 `code` 区分；认证中间件拦截返回 HTTP 401 且 `code=1001`。
- 写操作使用 `Authorization: Bearer <token>` 鉴权。
- 时间戳使用毫秒数，即 `Date.now()`。

## 鉴权规则

- `authRequired`：读取 Bearer token，查 KV session；无效时返回 401。
- `publicOrAuth`：`settings.public_mode=true` 时放行；关闭公开模式时要求有效 token，否则返回 `code=1005`。

## 公开接口

| 方法 | 路径 | 鉴权 | 返回 |
| --- | --- | --- | --- |
| GET | `/api/health` | 无 | `{ status: "ok" }` |
| GET | `/api/config` | 无 | `SiteConfig` |
| GET | `/api/public/data` | 公开模式或登录 | `PublicData` |

`/api/public/data` 只返回公开设置子集，不包含 `admin_username`、`admin_password`、`public_mode` 等内部字段。

## 认证接口

| 方法 | 路径 | 请求 | 返回 |
| --- | --- | --- | --- |
| POST | `/api/login` | `LoginReq` | `LoginResp` |
| POST | `/api/logout` | 无 | `null` |
| GET | `/api/me` | 无 | `{ username: string }` |

管理员首次初始化使用 `INIT_ADMIN_USER` 和 `INIT_ADMIN_PASSWORD`。密码通过 WebCrypto PBKDF2 哈希后以 `salt:hash` 形式存入 `settings.admin_password`。

## 分类接口

全部需要登录。

| 方法 | 路径 | 请求 | 返回 |
| --- | --- | --- | --- |
| GET | `/api/categories` | 无 | `Category[]` |
| POST | `/api/categories` | `CategoryUpsertReq` | `Category` |
| PUT | `/api/categories/:id` | `CategoryUpsertReq` | `Category` |
| DELETE | `/api/categories/:id` | 无 | `null` |
| POST | `/api/categories/sort` | `SortReq` | `null` |

删除分类会显式删除该分类下的书签。

## 书签接口

全部需要登录。

| 方法 | 路径 | 请求 | 返回 |
| --- | --- | --- | --- |
| GET | `/api/bookmarks` | 无 | `Bookmark[]` |
| POST | `/api/bookmarks` | `BookmarkUpsertReq` | `Bookmark` |
| PUT | `/api/bookmarks/:id` | `BookmarkUpsertReq` | `Bookmark` |
| DELETE | `/api/bookmarks/:id` | 无 | `null` |
| POST | `/api/bookmarks/sort` | `SortReq` | `null` |

## 图标接口

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/fetch-favicon?url=` | 登录 | 服务端解析目标站 favicon，失败回退 Google s2 |
| GET | `/api/icon/:id` | 无 | 返回 D1 中缓存的图标 blob；无缓存时返回透明 1x1 PNG |

图标来源包括：

- `direct`：服务端解析目标站 HTML 的 `<link rel="icon">`，再回退 `/favicon.ico` 和 Google。
- `favicon_im`：使用 `https://favicon.im/{hostname}?larger=true`。
- `logo_surf`：本地生成完整标题文字 SVG data URI，支持新增/编辑书签时选择 logo.surf 风格配色。
- `google`：使用 Google s2 favicons 接口。
- `custom`：手动填写 URL、表情或图床地址。

创建或更新书签时，如果图标是 HTTP(S) 图片，后端会尝试异步缓存到 `bookmarks.icon_blob`。前台加载外部图标失败后回退 `/api/icon/:id`；文字图标优先使用已保存的 SVG data URI。

## 设置接口

全部需要登录。

| 方法 | 路径 | 请求 | 返回 |
| --- | --- | --- | --- |
| GET | `/api/settings` | 无 | `Settings` |
| PUT | `/api/settings` | `SettingsUpdateReq` | 更新后的 `Settings` |

设置存储在 D1 `settings` 表中，`value` 为 JSON 字符串。后端读取时聚合为完整 `Settings` 对象，并对缺失字段使用默认值。

## 导入接口

| 方法 | 路径 | 鉴权 | 请求 | 返回 |
| --- | --- | --- | --- | --- |
| POST | `/api/import` | 登录 | `ImportReq` | `ImportResp` |

导入是覆盖式操作：先清空分类和书签，再按传入数据重建；设置仅写入受支持的公开配置 key，不触碰管理员账号字段。
