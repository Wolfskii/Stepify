import './styles/global.css'
import App from './App.svelte'

const root = document.getElementById('app')
if (!root) {
  throw new Error('Missing #app element')
}

const app = new App({
  target: root,
})

export default app
