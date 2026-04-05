import { resolve } from 'node:path'
import { config } from 'dotenv'

/** Load project-root `.env` into `process.env` before other main-process code runs. */
config({ path: resolve(process.cwd(), '.env') })
