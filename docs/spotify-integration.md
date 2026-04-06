# Spotify Integration

## Status: Stub — Not Yet Functional

The Spotify integration is scaffolded with typed interfaces and a PKCE auth skeleton. The OAuth callback server is implemented. Token exchange, the Spotify Web API, and the Web Playback SDK are not yet wired up.

---

## Architecture

```
User triggers Spotify login from the future **Settings** panel (sidebar footer **Settings** is reserved for this; no longer a separate Spotify footer row)
        │
        ▼
spotifyService.login()  [renderer]
        │
        │  window.electronAPI.spotify.login()
        ▼
spotifyAuthService.login(clientId)  [main process]
        │
        ├─ Generate PKCE code verifier + challenge
        ├─ Open system browser → accounts.spotify.com/authorize
        ├─ Start local HTTP server on port 8888
        │
        ▼
User grants permission in browser
        │
        ▼
Spotify redirects to http://localhost:8888/callback?code=...
        │
        ▼
Local server captures code, closes
        │
        ▼
Exchange code for access + refresh token  [TODO]
        │
        ▼
Store tokens in electron-store  [TODO]
        │
        ▼
ipcMain sends 'spotify:login-complete' → renderer
        │
        ▼
spotifyService.checkAuthStatus() → updates spotifyState
```

---

## Setup Requirements

1. Register an application at [developer.spotify.com](https://developer.spotify.com/dashboard)
2. Set the **Redirect URI** to: `http://localhost:8888/callback`
3. Copy the **Client ID**
4. In Stepify Settings, enter the Client ID (stored in `electron-store`)

No Client Secret is needed — PKCE flow is used for public clients.

---

## PKCE Flow Details

PKCE (Proof Key for Code Exchange) is the recommended OAuth flow for desktop apps since they cannot securely store a client secret.

```
1. Generate code_verifier = 64 random bytes (base64url)
2. code_challenge = SHA256(code_verifier) (base64url, no padding)
3. Authorization URL includes:
   - code_challenge_method=S256
   - code_challenge=<challenge>
4. Auth server returns code
5. Token request includes code_verifier (proves same client)
6. Server verifies: SHA256(verifier) === challenge
```

---

## Token Exchange (TODO)

```typescript
// POST https://accounts.spotify.com/api/token
const body = new URLSearchParams({
  grant_type: 'authorization_code',
  code: authCode,
  redirect_uri: REDIRECT_URI,
  client_id: clientId,
  code_verifier: verifier
})

const response = await fetch('https://accounts.spotify.com/api/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body
})

const tokens = await response.json()
// { access_token, refresh_token, expires_in }
```

---

## Spotify Web API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /v1/me` | Get current user's display name |
| `GET /v1/search?type=track` | Search for tracks |
| `GET /v1/tracks/{id}` | Get track details |
| `GET /v1/audio-features/{id}` | Get BPM (tempo field) |

### BPM from Spotify

The Audio Features endpoint returns a `tempo` field (BPM, float). This is extremely useful for automatically tagging tracks with their BPM without manual entry.

```typescript
const features = await fetch(`https://api.spotify.com/v1/audio-features/${trackId}`, {
  headers: { Authorization: `Bearer ${accessToken}` }
})
const { tempo } = await features.json()  // e.g. 126.004
```

---

## Web Playback SDK (TODO)

The Spotify Web Playback SDK creates an in-browser Spotify Connect player. Stepify then appears as a device in the user's Spotify app.

Requirements:
- Spotify Premium account
- Valid access token with `streaming` scope

Setup:

```html
<!-- In index.html, loaded only after auth -->
<script src="https://sdk.scdn.co/spotify-player.js"></script>
```

```typescript
// In spotifyService.initPlaybackSDK()
window.onSpotifyWebPlaybackSDKReady = () => {
  const player = new window.Spotify.Player({
    name: 'Stepify',
    getOAuthToken: (cb) => cb(accessToken),
    volume: 0.8
  })

  player.addListener('player_state_changed', (state) => {
    // Update playerState store
  })

  player.connect()
}
```

---

## Rate Limits

Spotify's Web API rate limits are not documented precisely but in practice:
- ~1 request per 0.1s for search
- BPM lookups: batch via `/audio-features?ids=id1,id2,...` (max 100)

Always debounce search input (300ms minimum).

---

## Persistence

Spotify track mappings (track ID → dance categories) are stored in `electron-store` alongside local tracks. The `Track` interface uses `source: 'spotify'` and `spotifyId` to identify them.

Refresh tokens persist across sessions. Access tokens are refreshed automatically before expiry.
