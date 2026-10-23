import type { ReactNode } from 'react'

interface Props {
  /** one image fills the banner; several sit side by side and blend into each other */
  images: string[]
  eyebrow: string
  title: string
  description: string
  /** the scope line and its badges, under the description */
  children?: ReactNode
  actions?: ReactNode
}

// Each image of a three-image banner: where it sits and which edges fade into its neighbour.
const TRIPTYCH = [
  'left-0 w-[45%] z-10 mask-r-from-60%',
  'left-1/4 w-1/2',
  'right-0 w-[45%] z-10 mask-l-from-60%',
]

/**
 * A full-width cinematic banner: the art fades into the page background at the bottom (gradient masking) and behind the
 * title on the left, so it blends into the page in both themes instead of sitting in a box.
 */
export default function PageHero({ images, eyebrow, title, description, children, actions }: Props) {
  return (
    <section className="relative isolate overflow-hidden">
      <div aria-hidden="true" className="absolute inset-0 -z-10 mask-b-from-35% mask-b-to-100%">
        {images.length === 1 ? (
          <img src={images[0]} alt="" className="size-full object-cover object-[50%_40%]" />
        ) : (
          images.slice(0, 3).map((src, i) => (
            <img key={src} src={src} alt="" className={`absolute inset-y-0 h-full object-cover ${TRIPTYCH[i] ?? ''}`} />
          ))
        )}
        <div className="absolute inset-0 z-20 bg-gradient-to-r from-background via-background/60 to-background/0 sm:via-background/40" />
        <div className="absolute inset-0 z-20 bg-background/15" />
      </div>
      {/* the title is a label for the page, not a headline competing with the statistics below it */}
      <div className="mx-auto flex min-h-44 max-w-6xl flex-wrap items-end justify-between gap-4 px-4 pt-12 pb-4 sm:min-h-56 lg:px-6">
        <div className="flex max-w-2xl flex-col gap-1">
          <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{eyebrow}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
          {children}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </section>
  )
}
