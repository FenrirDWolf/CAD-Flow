import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';
import { ThemeProvider } from './components/ThemeProvider';
import { ClerkProvider } from '@clerk/clerk-react';
import { dark } from '@clerk/themes';
import { CLERK_PUBLISHABLE_KEY } from './config';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container missing in index.html');
}

const PUBLISHABLE_KEY = CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing Publishable Key")
}

const root = createRoot(container);

root.render(
  <React.StrictMode>
    <ClerkProvider 
      publishableKey={PUBLISHABLE_KEY} 
      afterSignOutUrl="/"
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: '#6366f1',
        },
        elements: {
          rootBox: "w-full flex justify-center",
          cardBox: "w-full max-w-[1000px]",
          card: "w-full max-w-[1000px] shadow-sm border border-border"
        }
      }}
    >
      <ThemeProvider defaultTheme="dark" storageKey="cadflow-theme">
        <App />
      </ThemeProvider>
    </ClerkProvider>
  </React.StrictMode>
);

