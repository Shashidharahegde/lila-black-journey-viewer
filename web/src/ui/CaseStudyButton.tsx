import { HammerIcon } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

/** Opens How I built this (`/how-i-built-this`) from the primary nav, beside the About button (S, 2026-10-25). */
export default function CaseStudyButton() {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link to="/how-i-built-this">
        <HammerIcon aria-hidden="true" />
        {/* phones keep the icon only, like the nav links; the label stays for screen readers */}
        <span className="sr-only sm:not-sr-only">How I built this</span>
      </Link>
    </Button>
  )
}
