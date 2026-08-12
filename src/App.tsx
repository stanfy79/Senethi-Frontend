import { useMemo, useState } from 'react'
import type { FormEvent } from 'react';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import ChatUI from "./components/ChatUI";
import './App.css'

const queryClient = new QueryClient();

function App() {
  const { ready } = usePrivy();

  if (!ready) return null;

  return (
    <>
      <QueryClientProvider client={queryClient}>
        {/* <ProviderContext> */}
          <ChatUI />
        {/* </ProviderContext> */}
      </QueryClientProvider>
    </>
  );
}

export default App;