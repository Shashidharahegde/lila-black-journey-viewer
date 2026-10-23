import { toast } from 'sonner'

/** Copies the current URL, which holds the whole view (guidelines P16); shared by the map and statistics top bars. */
export async function copyLink() {
  try {
    await navigator.clipboard.writeText(window.location.href)
    toast.success('Link copied')
  } catch {
    toast.error('Could not copy the link; copy it from the address bar')
  }
}
