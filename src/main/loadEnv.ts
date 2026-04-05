import { config } from 'dotenv'
import { resolve } from 'node:path'

/** Load project-root `.env` into `process.env` before other main-process code runs. */
config({ path: resolve(process.cwd(), '.env') })
