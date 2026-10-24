import { CircleAlertIcon, SendIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { askChat, EXAMPLE_QUESTIONS, MAX_QUESTION_CHARS, type ChatResult } from '@/state/chat'
import PrimaryNav from './PrimaryNav'
import SettingsMenu from './SettingsMenu'

interface Turn {
  id: number
  question: string
  /** null while the answer is on its way */
  result: ChatResult | null
}

/** /chat: ask a question, get an answer written from the Overview's statistics (spec 09). Each question is answered on
 * its own, so the list below is a record for the reader, not a conversation the assistant remembers. */
export default function ChatPage() {
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const pending = turns.some((turn) => turn.result === null)
  const endRef = useRef<HTMLDivElement>(null)
  const nextId = useRef(0)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    const previous = document.title
    document.title = 'AI Chat · LILA BLACK Journeys'
    return () => {
      document.title = previous
      abort.current?.abort()
    }
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [turns])

  const ask = async (text: string) => {
    const question = text.trim()
    if (!question || pending) return
    const id = nextId.current++
    abort.current = new AbortController()
    setTurns((all) => [...all, { id, question, result: null }])
    setDraft('')
    const result = await askChat(question, fetch, abort.current.signal)
    setTurns((all) => all.map((turn) => (turn.id === id ? { ...turn, result } : turn)))
  }

  return (
    <div className="flex h-full flex-col">
      {/* hidden from the nav for now (S, 2026-10-24): the page is reached only at /chat */}
      <PrimaryNav current={null} actions={<SettingsMenu />} />
      <main className="flex min-h-0 flex-1 flex-col bg-background">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
            <header className="flex flex-col gap-1">
              <h1 className="text-xl font-semibold">Ask about the statistics</h1>
              <p className="text-sm text-muted-foreground">
                Answers are written from the same figures as the Overview, with the map, date and sample size they belong to.
              </p>
            </header>

            {turns.length === 0 && (
              <section aria-label="Example questions" className="flex flex-wrap gap-2">
                {EXAMPLE_QUESTIONS.map((question) => (
                  <Button key={question} variant="outline" onClick={() => void ask(question)}>
                    {question}
                  </Button>
                ))}
              </section>
            )}

            <div role="log" aria-live="polite" aria-label="Questions and answers" className="flex flex-col gap-4">
              {turns.map((turn) => (
                <div key={turn.id} className="flex flex-col gap-2">
                  <p className="max-w-[85%] self-end rounded-xl bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
                    {turn.question}
                  </p>
                  <Answer result={turn.result} />
                </div>
              ))}
              <div ref={endRef} />
            </div>
          </div>
        </div>

        <form
          className="shrink-0 border-t bg-card p-3"
          onSubmit={(event) => {
            event.preventDefault()
            void ask(draft)
          }}
        >
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
            <div className="flex gap-2">
              <label htmlFor="chat-question" className="sr-only">
                Your question
              </label>
              <Input
                id="chat-question"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={MAX_QUESTION_CHARS}
                placeholder="Ask about deaths, loot, movement or players…"
                autoComplete="off"
                className="h-9"
              />
              <Button type="submit" size="lg" disabled={pending || !draft.trim()}>
                <SendIcon data-icon="inline-start" />
                Ask
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Each question is answered on its own. Check important figures against the Overview.
            </p>
          </div>
        </form>
      </main>
    </div>
  )
}

function Answer({ result }: { result: ChatResult | null }) {
  if (!result) {
    // the same height as a short answer, so nothing jumps when it arrives
    return (
      <div className="flex max-w-[85%] flex-col gap-2 rounded-xl border bg-card p-3" aria-label="Waiting for the answer">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    )
  }
  if (!result.ok) {
    return (
      <p className="flex max-w-[85%] items-start gap-2 rounded-xl border bg-card p-3 text-sm text-muted-foreground">
        <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {result.message}
      </p>
    )
  }
  return <p className="max-w-[85%] rounded-xl border bg-card p-3 text-sm whitespace-pre-wrap">{result.answer}</p>
}
