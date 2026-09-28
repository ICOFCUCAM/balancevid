'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Asking before something irreversible.  [Doctrine D-04, CHANNEL §9]
 *
 * WHAT THIS REPLACES. Nineteen calls to `window.confirm` and
 * `window.prompt`, gating end-live, emergency cut-aways, block removal and
 * every delete in the product. They work, and they are the single most
 * jarring thing left in the interface: a native dialog is unstyleable, it
 * arrives in the operating system's typography at the top of the window
 * far from the control that raised it, and on a broadcast desk in a dark
 * room it is a white box that ruins night vision at the exact moment
 * somebody is deciding whether to cut the air.
 *
 * WHY IT IS NOT SIMPLY A PRETTIER BOX. A confirmation is the last thing
 * between a person and an action they cannot take back, so the only
 * interesting question about it is whether it makes them think. Three
 * things do that and native dialogs do none of them:
 *
 *   THE VERB IS ON THE BUTTON. "OK" tells you nothing about what you are
 *     about to do; "End the broadcast" cannot be pressed by accident by
 *     somebody who meant to cancel.
 *   THE DANGEROUS ONE IS NOT WHERE THE SAFE ONE USUALLY IS. Cancel takes
 *     the position muscle memory reaches for, and the destructive action
 *     sits apart from it.
 *   IT SAYS WHAT WILL BE LOST, in the sentence, not in the title.
 *
 * ESCAPE AND THE BACKDROP BOTH CANCEL, and the primary focus lands on
 * CANCEL rather than on the destructive control — because a person who
 * hits Return out of habit should not thereby end a live broadcast.
 *
 * Built on <dialog>, which brings the focus trap, the inert background,
 * Escape-to-close and the top-layer stacking for free. A hand-rolled
 * modal is three of those bugs waiting to be found by somebody on a
 * keyboard. [U-19]
 */

export interface Ask {
  /** What is about to happen, in a sentence that names what is lost. */
  question: string;
  /** The verb, on the button. Never "OK". */
  verb: string;
  /** Destructive actions colour their button and lose the default focus. */
  danger?: boolean;
  /**
   * ASKING FOR A VALUE, not only for a yes.
   *
   * `window.prompt` is the worse half of the pair it replaces: as well as
   * everything wrong with a native confirm, it gives a single unlabelled
   * line with no room to say what shape the answer should take. A field
   * with a real label and a placeholder can say "HH:MM" where a prompt
   * can only put it in the question and hope.
   *
   * When this is set the dialog grows a field, focus lands on the FIELD
   * rather than on Cancel — there is nothing destructive to guard against
   * when the person is being asked to type something — and the verb is
   * disabled until it holds a value.
   */
  field?: { label: string; placeholder?: string; initial?: string; optional?: boolean };
  /** Runs only if they say yes. Carries the field's value when there is one. */
  go: (value: string) => void;
}

export function useConfirm() {
  const [ask, setAsk] = useState<Ask | null>(null);
  const confirm = useCallback((next: Ask) => setAsk(next), []);
  const dialog = <ConfirmDialog ask={ask} onClose={() => setAsk(null)} />;
  return { confirm, dialog };
}

function ConfirmDialog({ ask, onClose }: { ask: Ask | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const fieldRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (ask && !element.open) {
      setValue(ask.field?.initial ?? '');
      element.showModal();
      /*
       * FOCUS LANDS ON CANCEL FOR A DECISION and on the FIELD when there
       * is something to type. `showModal` focuses the first focusable
       * child, and if that were the destructive button then Return —
       * which somebody pressing quickly has already half-pressed — would
       * confirm it. Moving focus explicitly is the whole safeguard, and
       * it does not apply when the answer is a value rather than a yes.
       */
      if (ask.field) {
        window.requestAnimationFrame(() => fieldRef.current?.select());
      } else {
        cancelRef.current?.focus();
      }
    }
    if (!ask && element.open) element.close();
  }, [ask]);

  const ready = !ask?.field || ask.field.optional === true || value.trim() !== '';

  return (
    <dialog
      ref={ref}
      data-testid="confirm-dialog"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      /* The backdrop is outside the panel, so a click on it is a cancel. */
      onClick={(event) => { if (event.target === ref.current) onClose(); }}
      style={{
        padding: 0, border: 0, background: 'transparent',
        maxWidth: 'min(420px, calc(100vw - 32px))',
        color: 'var(--text)',
      }}
    >
      {ask && (
        <div style={{
          background: 'var(--surface-lift)',
          border: 'var(--border) solid var(--line-strong)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--elev-4)',
          padding: 'var(--space-7)',
          display: 'flex', flexDirection: 'column', gap: 'var(--space-6)',
        }}>
          <p style={{
            margin: 0, fontSize: 'var(--text-md)',
            lineHeight: 'var(--leading-snug)',
          }}>{ask.question}</p>

          {ask.field && (
            <label style={{ margin: 0 }}>
              {ask.field.label}
              <input
                ref={fieldRef} data-testid="confirm-field"
                value={value} placeholder={ask.field.placeholder}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  /* Return submits, which is what a one-field form means. */
                  if (event.key === 'Enter' && ready) {
                    event.preventDefault();
                    ask.go(value.trim());
                    onClose();
                  }
                }}
                style={{ marginTop: 'var(--space-2)' }}
              />
            </label>
          )}
          <div className="row" style={{
            gap: 'var(--space-4)', justifyContent: 'flex-end',
          }}>
            <button
              ref={cancelRef} type="button" className="quiet"
              data-testid="confirm-cancel" onClick={onClose}
            >Cancel</button>
            <button
              type="button"
              className={ask.danger ? 'danger' : 'primary'}
              data-testid="confirm-go" disabled={!ready}
              onClick={() => { ask.go(value.trim()); onClose(); }}
            >{ask.verb}</button>
          </div>
        </div>
      )}
    </dialog>
  );
}
