import { InfoIcon } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** Opens the About page (`/about`) from the primary nav, beside the other controls (S, 2026-10-24). */
export default function AboutButton() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button asChild variant="ghost" size="icon">
          <Link to="/about" aria-label="About the data and statistics">
            <InfoIcon />
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent>About the data and statistics</TooltipContent>
    </Tooltip>
  )
}
