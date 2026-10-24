import { InfoIcon, KeyboardIcon, MoonIcon, Settings2Icon, SunIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ShortcutsContent } from './HelpPopovers'
import { isTypingTarget } from './shortcuts'
import { setTheme, useTheme, type Theme } from './theme'

const REPO_URL = 'https://github.com/Shashidharahegde/lila-black-journey-viewer'

// lucide-react dropped its brand icons, so the GitHub mark is inline (24×24, currentColor)
function GithubMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.76.11 3.05.74.8 1.18 1.82 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  )
}

interface Props {
  /** the page's own "About" panel: the data notes on the map pages, the statistics notes on the Overview */
  about?: { label: string; content: ReactNode }
  /** the map pages' keyboard shortcuts, also opened with "?" */
  shortcuts?: boolean
}

type Panel = 'about' | 'shortcuts'

/**
 * The secondary actions behind one button in the primary nav (S, 2026-10-24): theme, keyboard shortcuts, the page's About
 * panel and GitHub. An About or Shortcuts choice opens its panel under the same button once the menu has closed.
 */
export default function SettingsMenu({ about, shortcuts = false }: Props) {
  const theme = useTheme()
  const [panel, setPanel] = useState<Panel | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  // set when a menu item opens a panel, so the closing menu doesn't take focus back to the button (that would close the panel)
  const opening = useRef(false)

  useEffect(() => {
    if (!shortcuts) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return
      event.preventDefault()
      setPanel((p) => (p === 'shortcuts' ? null : 'shortcuts'))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcuts])

  const open = (next: Panel) => () => {
    opening.current = true
    setPanel(next)
  }

  return (
    <Popover open={panel !== null} onOpenChange={(isOpen) => !isOpen && setPanel(null)}>
      <DropdownMenu>
        <Tooltip>
          <PopoverAnchor asChild>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button ref={button} variant="ghost" size="icon" aria-label="Settings and help">
                  <Settings2Icon />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
          </PopoverAnchor>
          <TooltipContent>Settings and help</TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          align="end"
          className="w-56"
          onCloseAutoFocus={(event) => {
            if (!opening.current) return
            event.preventDefault()
            opening.current = false
          }}
        >
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
            <DropdownMenuRadioItem value="dark">
              <MoonIcon />
              Dark
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="light">
              <SunIcon />
              Light
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          {shortcuts && (
            <DropdownMenuItem onSelect={open('shortcuts')}>
              <KeyboardIcon />
              Keyboard shortcuts
              <DropdownMenuShortcut>?</DropdownMenuShortcut>
            </DropdownMenuItem>
          )}
          {about && (
            <DropdownMenuItem onSelect={open('about')}>
              <InfoIcon />
              {about.label}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              <GithubMark />
              GitHub
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <PopoverContent
        align="end"
        className={panel === 'about' ? 'w-96' : 'w-72'}
        // back to the button, which opened the panel through the menu
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          button.current?.focus()
        }}
      >
        {panel === 'shortcuts' ? <ShortcutsContent /> : about?.content}
      </PopoverContent>
    </Popover>
  )
}
