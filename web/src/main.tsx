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
import { parseTab } from './state/url'
import AboutPage from './ui/AboutPage'
import StatsPage from './ui/StatsPage'

/** `/` and unknown paths open the all-maps Overview. An old Explore link (`/explore?tab=…`) or a link to the old map root
 * (`/?map=…&match=…`) goes to the map page it meant, with its query; the map page then drops the old `tab=`. */
function RedirectToLanding() {
  const { pathname, search } = useLocation()
  if (pathname === '/explore' || search) return <Navigate to={`/${parseTab(new URLSearchParams(search))}${search}`} replace />
  return <Navigate to="/stats" replace />
}

createRoot(document.getElementById('root')!).render(
    <BrowserRouter>
      <TooltipProvider>
        {/* the three destinations: Overview (/stats, where `/` lands), Heatmaps and Journeys. The two map pages share one
            App, so switching between them keeps the map, its camera and the loaded files. /about is opened from the nav's info button. */}
        <Routes>
          <Route path="/stats" element={<StatsPage />} />
          <Route element={<App />}>
            <Route path="/heatmaps" />
            <Route path="/journeys" />
          </Route>
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<RedirectToLanding />} />
        </Routes>
      </TooltipProvider>
      <Toaster position="bottom-right" />
    </BrowserRouter>,
)
