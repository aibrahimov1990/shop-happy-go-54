import { useEffect, useState } from 'react'
import { createFileRoute, useSearch } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

export const Route = createFileRoute('/unsubscribe')({
  head: () => ({ meta: [{ title: 'Unsubscribe — Sellier' }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' ? search.token : '',
  }),
  component: UnsubscribePage,
})

type Status = 'loading' | 'valid' | 'already' | 'invalid' | 'success' | 'error'

function UnsubscribePage() {
  const { token } = useSearch({ from: '/unsubscribe' })
  const [status, setStatus] = useState<Status>('loading')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) {
      setStatus('invalid')
      return
    }
    fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) return setStatus('invalid')
        if (data.valid) return setStatus('valid')
        if (data.reason === 'already_unsubscribed') return setStatus('already')
        setStatus('invalid')
      })
      .catch(() => setStatus('error'))
  }, [token])

  const confirm = async () => {
    setSubmitting(true)
    try {
      const r = await fetch('/email/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) return setStatus('error')
      if (data.success) return setStatus('success')
      if (data.reason === 'already_unsubscribed') return setStatus('already')
      setStatus('error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <p className="text-[10px] tracking-[0.3em] text-muted-foreground mb-6">SELLIER</p>
        {status === 'loading' && (
          <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
        )}
        {status === 'valid' && (
          <>
            <h1 className="font-serif text-2xl mb-3">Unsubscribe from emails?</h1>
            <p className="text-sm text-muted-foreground mb-6">
              You will no longer receive personal edits from Sellier.
            </p>
            <Button
              onClick={confirm}
              disabled={submitting}
              className="text-[10px] uppercase tracking-[0.25em]"
            >
              {submitting ? 'Processing…' : 'Confirm unsubscribe'}
            </Button>
          </>
        )}
        {status === 'success' && (
          <>
            <h1 className="font-serif text-2xl mb-3">You're unsubscribed</h1>
            <p className="text-sm text-muted-foreground">
              We won't email you again. You can re-subscribe any time by contacting us.
            </p>
          </>
        )}
        {status === 'already' && (
          <>
            <h1 className="font-serif text-2xl mb-3">Already unsubscribed</h1>
            <p className="text-sm text-muted-foreground">This address is already removed from our list.</p>
          </>
        )}
        {status === 'invalid' && (
          <>
            <h1 className="font-serif text-2xl mb-3">Invalid link</h1>
            <p className="text-sm text-muted-foreground">This unsubscribe link is invalid or expired.</p>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="font-serif text-2xl mb-3">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">Please try again later.</p>
          </>
        )}
      </div>
    </div>
  )
}
