import { resolve } from 'node:path'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { sveltePreprocess } from 'svelte-preprocess'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
      },
    },
    plugins: [
      svelte({
        // Component imports are only referenced from markup; TS would strip them as unused.
        preprocess: sveltePreprocess({
          typescript: {
            tsconfigFile: './tsconfig.web.json',
            compilerOptions: {
              noUnusedLocals: false,
              noUnusedParameters: false,
            },
          },
        }),
      }),
    ],
  },
})
