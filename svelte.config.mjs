import { sveltePreprocess } from 'svelte-preprocess'

// Shared by vite-plugin-svelte and svelte-check.
export default {
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
}
