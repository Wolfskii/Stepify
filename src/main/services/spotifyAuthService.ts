import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { shell } from 'electron'
import Store from 'electron-store'
import type { SpotifyCredentials } from '../../shared/types'

interface SpotifyStore {
  credentials: SpotifyCredentials | null
}

const spotifyStore = new Store<SpotifyStore>({
  name: 'spotify-auth',
  defaults: { credentials: null },
})

const REDIRECT_URI = 'http://localhost:8888/callback'
const SCOPES = [
  'streaming',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'user-library-read',
].join(' ')

function generateCodeVerifier(): string {
  return randomBytes(64).toString('base64url')
}

function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

/**
 * Spotify PKCE OAuth service for Electron.
 *
 * Flow:
 * 1. Generate code verifier + challenge
 * 2. Open system browser with Spotify auth URL
 * 3. Start local HTTP server to capture redirect
 * 4. Exchange code for tokens
 * 5. Persist tokens in electron-store
 *
 * TODO: Wire up the actual Spotify Web API token exchange once a Client ID
 * is configured by the user in Settings.
 */
export const spotifyAuthService = {
  async login(clientId: string): Promise<boolean> {
    const verifier = generateCodeVerifier()
    const challenge = generateCodeChallenge(verifier)
    const state = randomBytes(16).toString('hex')

    const authUrl = new URL('https://accounts.spotify.com/authorize')
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
    authUrl.searchParams.set('scope', SCOPES)
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('code_challenge_method', 'S256')
    authUrl.searchParams.set('code_challenge', challenge)

    await shell.openExternal(authUrl.toString())

    // Wait for the redirect callback on our local server
    const code = await this.waitForCallback(state)
    if (!code) return false

    // TODO: Exchange code for tokens via Spotify token endpoint
    // const tokens = await this.exchangeCode(clientId, code, verifier)
    // this.saveCredentials(tokens)
    console.log('[Spotify] Auth code received — token exchange not yet implemented')

    return true
  },

  waitForCallback(expectedState: string): Promise<string | null> {
    return new Promise((resolve) => {
      const server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', `http://localhost:8888`)
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')

        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(
          '<html><body><h1>Stepify</h1><p>Authentication complete. You can close this tab.</p></body></html>',
        )

        server.close()

        if (state === expectedState && code) {
          resolve(code)
        } else {
          resolve(null)
        }
      })

      server.listen(8888, '127.0.0.1')

      // Timeout after 5 minutes
      setTimeout(
        () => {
          server.close()
          resolve(null)
        },
        5 * 60 * 1000,
      )
    })
  },

  logout(): void {
    spotifyStore.set('credentials', null)
  },

  getCredentials(): SpotifyCredentials | null {
    return spotifyStore.get('credentials', null)
  },

  isAuthenticated(): boolean {
    const creds = this.getCredentials()
    if (!creds) return false
    return creds.expiresAt > Date.now()
  },

  saveCredentials(credentials: SpotifyCredentials): void {
    spotifyStore.set('credentials', credentials)
  },
}
