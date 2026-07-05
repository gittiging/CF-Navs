# Performance Audit

## 2026-07-05 Baseline

Target: `https://navs.bjlius.com/`, authenticated Chrome session, cache disabled for the cold-load run.

Observed:

- Logged-in home loaded 337 bookmarks across 11 categories.
- `/api/admin/data` dominated the load: about 1.8 MB transferred, 3.7 MB decoded, and 3.3 s duration.
- Field breakdown showed `bookmarks[].icon_blob` accounted for about 3.58 MB of the 3.73 MB decoded payload.
- Removing `icon_blob` from aggregate data would reduce the decoded admin payload to about 145 KB.
- Initial logged-in DOM was about 2,699 elements with 338 links and 41 images in the measured viewport.
- Browser storage usage was about 4 MB, mostly Cache Storage. The full admin-data cache was the main avoidable contributor.
- No 4xx/5xx responses, failed requests, runtime exceptions, or console errors were observed.

## Issues And Fixes

1. Aggregate data included cached image blobs.
   - Impact: Large network payloads, slower first authenticated load, larger Cache Storage use.
   - Fix: Public and admin aggregate bookmark queries now return `NULL AS icon_blob` plus a lightweight `icon_cached` flag. Full icon blobs remain available through `/api/icon/:id`.

2. Icon cache refresh invalidated aggregate data caches.
   - Impact: Fetching or generating an icon could invalidate public/admin runtime data even though aggregate responses no longer depend on `icon_blob`.
   - Fix: `/api/icon/:id` no longer invalidates aggregate runtime/public data after writing `icon_blob`.

3. Bookmark cards used external icon URLs for runtime display.
   - Impact: More third-party image requests and weaker reuse of the existing Worker/service-worker icon cache.
   - Fix: Bookmark cards now use same-origin `/api/icon/:id` for HTTP icons and `/api/iconify/...` for Iconify icons.

## Follow-Up Candidates

- Consider progressive rendering or virtualization for the public bookmark grid if bookmark count grows far beyond the current 337 items.
- Consider capping large client-side icon data URIs in localStorage and preferring Cache Storage for large icons.

## 2026-07-05 Round 1

Stress path: authenticated home, cold admin-data cache, full-page scroll sweep, repeated search queries, and three home/admin switches.

Observed:

- `/api/admin/data` stayed small after the previous optimization: about 38 KB transferred and 156 KB decoded.
- Full scroll/search triggered about 240 same-origin icon requests.
- Several `/api/icon/:id` requests returned 502 when the original remote icon could not be fetched.
- Browser storage grew from about 1.4 MB to about 4.6 MB after icon-heavy interactions.

Fix:

- `/api/icon/:id` now returns the existing cacheable fallback SVG when the remote icon fetch fails instead of returning 502.
