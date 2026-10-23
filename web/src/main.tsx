import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/geist-mono/latin-400.css'
import '@fontsource/geist-mono/latin-500.css'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import './index.css'
import App from './App.tsx'
import StatsPage from './ui/StatsPage'

/** `/` and unknown paths open the all-maps Overview. A query string means a legacy link to the old map root
 * (`/?map=…&match=…`), so those still go to Explore with it. */
function RedirectToLanding() {
  const { search } = useLocation()
  return <Navigate to={search ? `/explore${search}` : '/stats'} replace />
}

createRoot(document.getElementById('root')!).render(
    <BrowserRouter>
      <TooltipProvider>
        {/* the three top-level destinations: Overview (/stats, the landing page) and Explore (/explore) */}
        <Routes>
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/explore" element={<App />} />
          <Route path="*" element={<RedirectToLanding />} />
        </Routes>
      </TooltipProvider>
      <Toaster position="bottom-right" />
    </BrowserRouter>,
)
