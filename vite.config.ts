import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@privy-io/react-auth'],
  },
  ssr: {
    noExternal: ['@privy-io/react-auth'],
  },
})
