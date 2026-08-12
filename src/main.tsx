import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivyProvider } from '@privy-io/react-auth';
import './index.css'
import App from './App.tsx'

declare global {
  interface ImportMetaEnv {
    readonly VITE_PRIVY_APP_ID: string
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID}
      config={{
        embeddedWallets: {
          ethereum: {
            createOnLogin: "all-users"
          }
        },
        // disableAnalytics: true,
        appearance: { walletChainType: "ethereum-and-solana" },
      }}
    >
    <App />
    </PrivyProvider>
  </StrictMode>,
)
