'use client';

import { Bot, Send, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/components/ui';
import { api } from '@/lib/api/client';
import { errorCode, errorMessage } from '@/lib/api/errors';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_TURNS = 12; // the API accepts up to 12 messages
const MAX_CHARS = 1000;

/**
 * Floating "Ask SwiftDrop" chatbot for the public tracking pages. Owner: M1.
 * It answers "Where is my parcel?" and "How much to send 2 kg to Kandy?" by calling the API's
 * public tools through the model; it never sees anything a signed-out visitor couldn't.
 */
export function AssistantChat({
  enabled,
  trackingNumber,
}: {
  enabled: boolean;
  trackingNumber?: string;
}) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const suggestions = [
    trackingNumber ? `Where is ${trackingNumber}?` : 'Where is my parcel?',
    'How much to send 2 kg to Kandy?',
    'Which cities do you deliver to?',
  ];

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [turns, pending]);

  async function send(text: string) {
    const content = text.trim().slice(0, MAX_CHARS);
    if (!content || pending) return;
    const next = [...turns, { role: 'user' as const, content }].slice(-MAX_TURNS);
    // The conversation sent to the API has to start with a user message.
    while (next.length && next[0].role !== 'user') next.shift();
    setTurns(next);
    setDraft('');
    setError(undefined);
    setPending(true);
    const { data, error: apiError } = await api.POST('/api/v1/assistant/chat', {
      body: { messages: next, ...(trackingNumber ? { trackingNumber } : {}) },
    });
    setPending(false);
    if (data) {
      setTurns([...next, { role: 'assistant', content: data.reply }]);
    } else {
      setError(
        errorCode(apiError) === 'RATE_LIMITED'
          ? 'Too many questions at once. Please wait a minute and try again.'
          : errorMessage(apiError, 'The assistant could not answer. Please try again.'),
      );
    }
  }

  return (
    <div className="fixed right-4 bottom-4 z-40 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6">
      {open && (
        <section
          role="dialog"
          aria-label="SwiftDrop assistant"
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          className="flex h-[30rem] max-h-[calc(100dvh-6rem)] w-[23rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card"
        >
          <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand">
                <Bot className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">SwiftDrop assistant</p>
                <p className="text-xs text-muted">Tracking, prices and service areas</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink"
              aria-label="Close assistant"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {!enabled ? (
              <p className="rounded-lg bg-surface-2 p-3 text-sm text-muted">
                The assistant is not switched on in this environment. You can still track a parcel
                with the form on this page.
              </p>
            ) : turns.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-muted">
                  Hi! Ask me where a parcel is or what a delivery costs.
                </p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-full border border-line px-3 py-1.5 text-xs text-ink hover:border-brand hover:text-brand"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              turns.map((t, i) => (
                <p
                  key={i}
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap',
                    t.role === 'user'
                      ? 'ml-auto bg-brand text-white'
                      : 'mr-auto bg-surface-2 text-ink',
                  )}
                >
                  <span className="sr-only">{t.role === 'user' ? 'You: ' : 'Assistant: '}</span>
                  {t.content}
                </p>
              ))
            )}
            {pending && <p className="mr-auto text-sm text-muted">Thinking…</p>}
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <div ref={endRef} />
          </div>

          <form
            className="flex items-end gap-2 border-t border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
          >
            <label htmlFor="assistant-input" className="sr-only">
              Your question
            </label>
            <textarea
              id="assistant-input"
              ref={inputRef}
              rows={1}
              maxLength={MAX_CHARS}
              value={draft}
              disabled={!enabled}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
              placeholder={enabled ? 'Ask about a parcel or a price…' : 'Assistant unavailable'}
              className="max-h-28 min-h-10 flex-1 resize-none rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!enabled || pending || !draft.trim()}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-white hover:bg-brand-hover disabled:opacity-50"
              aria-label="Send"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full bg-brand px-4 py-3 text-sm font-medium text-white shadow-card hover:bg-brand-hover"
      >
        {open ? (
          <X className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Bot className="h-4 w-4" aria-hidden="true" />
        )}
        {open ? 'Close' : 'Ask SwiftDrop'}
      </button>
    </div>
  );
}
