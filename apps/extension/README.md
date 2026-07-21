# Fake News Analysis Chrome Extension

Slice 4 adds a Chrome Extension Manifest V3 client for the existing local FastAPI backend. The extension captures content after explicit user action and presents backend results; it does not run ModernBERT, OCR, web search, Gemini, or verdict logic.

## Developer Install

1. Start the API backend, usually at `http://127.0.0.1:8000`.
2. From `apps/extension`, run `node scripts/build.mjs`.
3. Open Chrome `chrome://extensions`.
4. Enable Developer mode.
5. Load unpacked extension from `apps/extension/dist`.

## Backend Settings

The default backend origin is `http://127.0.0.1:8000`. Open the extension options page to configure:

- backend origin
- optional local pairing token
- default deep-check behavior
- maximum model length
- request timeout
- automatic result overlay
- latest-analysis reference storage

Slice 4 local mode accepts only localhost or loopback backend origins. Pairing is extension-side only for now; if a token is configured it is sent as `X-FND-Pairing-Token`.

## Permissions

- `activeTab`: grants page access only after user interaction.
- `scripting`: injects the content script for selected user actions.
- `storage`: stores settings and lightweight active/latest analysis references.
- `contextMenus`: adds “Analyze selected text”.
- host permissions are limited to `http://127.0.0.1/*` and `http://localhost/*`.

The extension does not request `<all_urls>`, `tabs`, background screen capture, incognito access, or remote JavaScript.

## Analysis Modes

- Selected text: sends only the normalized selection to `/v1/analyses/text`.
- Current article: extracts article-like DOM text and metadata before calling `/v1/analyses/text`.
- Current page: extracts broader visible page text and warns that content may be mixed.
- Visible tab: captures the active visible tab once, uploads the PNG to `/v1/analyses/image`, monitors the job, and displays the final backend result.

DOM extraction is preferred over OCR. Screenshot OCR is one-time only in Slice 4; continuous live OCR belongs to a later slice.

## Privacy

The extension does not analyze pages on load. It does not store screenshot blobs or full article text by default. It stores only lightweight IDs, state, request IDs, trace IDs, and summaries unless later slices add explicit user-controlled history. Provider secrets remain in the backend and must not be placed in extension code.

## Troubleshooting

- Use Settings -> Test connection to call `/v1/health/live`, `/v1/health/ready`, and `/v1/models`.
- `BACKEND_UNAVAILABLE` usually means the API is not running or the origin is wrong.
- `BACKEND_NOT_READY` means the API is reachable but one or more backend capabilities are unavailable.
- `NO_SELECTED_TEXT` means no visible selection was detected.
- `ARTICLE_EXTRACTION_FAILED` means DOM extraction did not find coherent article content; use current-page or visible-tab analysis.

## Limitations

No authentication, tenant management, desktop capture, continuous OCR, cloud pairing, deepfake detection, or provider configuration is implemented in Slice 4.

