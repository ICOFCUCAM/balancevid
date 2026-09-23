'use client';

import { LAYOUTS, TYPE_PRESENTATION } from '../../../src/domain/presentation.js';
import type { InterventionType } from '../../../src/domain/document.js';
import { formatTimecode } from '../../../src/domain/time.js';

/**
 * How I want to express this.  [Doctrine U-11, U-12, U-18]
 *
 * The right rail of the Studio. It describes ONE response — the one chosen in
 * the clip rail — and everything in it is a field of that response in the
 * Conversation Document. There is no second editing model here: the layout is
 * `intervention.layoutId`, the marks are `intervention.annotations`, and the
 * render is regenerated from them (INV-00). That is what makes every choice on
 * this rail changeable later without recording anything again.
 *
 * Two groups, because they answer different questions:
 *
 *   COMPOSITION  where the two of you are on screen while this plays
 *   EXPLAIN      what you are pointing at while you say it
 *
 * The explain tools arm the stage rather than opening an editor. The author
 * chooses "point", then clicks the thing on the picture — which is how a
 * person explains something to another person, and not how a video editor
 * works.
 */

/**
 * The layouts offered, in the order a person thinks of them.
 *
 * A subset of LAYOUTS: the vertical ones are chosen by the clip exporter per
 * aspect ratio (U-22), not by hand, and offering them here would let someone
 * set a 9:16 composition on a 16:9 export.
 */
export const COMPOSITION_LAYOUTS = [
  'full_source', 'side_by_side', 'pip', 'presenter_focus', 'triptych', 'full_user',
] as const;

/**
 * The explain tools.
 *
 * `place` means one click on the picture; `drag` means a shape pulled across
 * it. Anything not listed is not offered, and the rail says so rather than
 * showing a button that does nothing.
 */
export const EXPLAIN_TOOLS = [
  { kind: 'point', label: 'Point', hint: 'Click the thing you are talking about', gesture: 'place' },
  { kind: 'ellipse', label: 'Circle', hint: 'Draw a ring around it', gesture: 'drag' },
  { kind: 'arrow', label: 'Arrow', hint: 'Drag from anywhere to it', gesture: 'drag' },
  { kind: 'freehand', label: 'Draw', hint: 'Freehand over the frame', gesture: 'drag' },
  { kind: 'text', label: 'Label', hint: 'Put a word on the frame', gesture: 'place' },
  { kind: 'blur', label: 'Blur', hint: 'Hide part of the frame', gesture: 'drag' },
] as const;

export type ExplainTool = (typeof EXPLAIN_TOOLS)[number]['kind'];

export default function CompositionRail({
  intervention, tool, onTool, onLayout, onRemoveMark, onTimeMark, onBack, disabled,
  embedded,
}: {
  intervention: any;
  /** The source plays on its own platform, so there are no frames to compose. */
  embedded?: boolean;
  tool: ExplainTool | null;
  onTool: (tool: ExplainTool | null) => void;
  onLayout: (layoutId: string | null) => void;
  onRemoveMark: (id: string) => void;
  onTimeMark: (id: string) => void;
  onBack: () => void;
  disabled: boolean;
}) {
  const fromType = TYPE_PRESENTATION[intervention.type as InterventionType];
  const effective = intervention.layoutId ?? fromType.layoutId;
  const marks: any[] = intervention.annotations ?? [];
  const take = intervention.takes?.find((t: any) => t.id === intervention.selectedTakeId);

  return (
    <aside data-testid="composition-rail" className="shell-scroll" style={{ paddingLeft: 2 }}>
      <div className="row" style={{ marginBottom: 10, gap: 8 }}>
        <span className="small muted grow" style={{
          textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 11,
        }}>
          Composition
        </span>
        <button className="small" data-testid="composition-back" onClick={onBack}>
          Done
        </button>
      </div>

      <div className="small muted" style={{ marginBottom: 12, lineHeight: 1.4 }}>
        Your {fromType.lowerThird.toLocaleLowerCase()} at{' '}
        <span className="mono">{formatTimecode(intervention.anchor.tSourceFrame).slice(0, 8)}</span>.
        Nothing here changes the recording — you can set it now or long after.
      </div>

      {/*
        An embedded source is played by its owner's player and never
        downloaded (U-35 §6), so there are no frames of it to place your
        response beside or to mark. Offering a layout here would be offering
        something the export cannot produce. [U-01, INV-01]
      */}
      {embedded && (
        <div data-testid="composition-embedded" className="panel" style={{
          padding: 12, lineHeight: 1.45, borderColor: 'var(--line)',
        }}>
          <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>
            This video plays on its own platform
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            We never hold its picture, so your response cannot be placed beside
            it or drawn on. What publishes instead is a player that runs the
            original and cuts to you at each of your moments — your recording,
            your words and the statement you answered all travel with it.
          </p>
          <p className="small muted" style={{ marginTop: 8, marginBottom: 0 }}>
            Upload a video instead to compose the two into one finished film.
          </p>
        </div>
      )}

      {/* ---- where the two of you are on screen ------------------------- */}
      {!embedded && (
      <>
      <div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>Layout</div>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 16,
      }}>
        {COMPOSITION_LAYOUTS.map((id) => {
          const layout = LAYOUTS[id];
          if (!layout) return null;
          const chosen = effective === id;
          return (
            <button
              key={id}
              data-testid="layout-option"
              data-layout-id={id}
              data-chosen={chosen ? 'true' : 'false'}
              disabled={disabled}
              /*
               * An explicit choice is stored explicitly, even when it happens
               * to match the type's default. Storing nothing would leave the
               * layout following the type, so changing the type later would
               * silently move a composition the author had already decided.
               */
              onClick={() => onLayout(id)}
              style={{
                padding: 6, textAlign: 'left', borderRadius: 6,
                background: chosen ? 'rgba(43,95,138,0.30)' : 'var(--panel-2)',
                border: `1px solid ${chosen ? '#6fb3e0' : 'var(--line)'}`,
              }}
            >
              <LayoutDiagram layoutId={id} />
              <div className="small" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.2 }}>
                {layout.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* ---- what you are pointing at ----------------------------------- */}
      <div className="small" style={{ fontWeight: 600, marginBottom: 2 }}>Explain</div>
      <div className="small muted" style={{ marginBottom: 6, lineHeight: 1.35 }}>
        Choose a tool, then mark the picture in the middle.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {EXPLAIN_TOOLS.map((option) => {
          const armed = tool === option.kind;
          return (
            <button
              key={option.kind}
              data-testid="explain-tool"
              data-tool={option.kind}
              data-armed={armed ? 'true' : 'false'}
              disabled={disabled}
              title={option.hint}
              onClick={() => onTool(armed ? null : option.kind)}
              style={{
                padding: '8px 6px', borderRadius: 6, fontSize: 12,
                background: armed ? '#2b5f8a' : 'var(--panel-2)',
                border: `1px solid ${armed ? '#6fb3e0' : 'var(--line)'}`,
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {tool && (
        <p className="small" data-testid="explain-hint"
           style={{ color: 'var(--source-accent)', marginTop: 8, marginBottom: 0 }}>
          {EXPLAIN_TOOLS.find((t) => t.kind === tool)!.hint}.
          Press Escape to stop.
        </p>
      )}

      {/* ---- the marks that exist --------------------------------------- */}
      {marks.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>
            On this frame
          </div>
          {marks.map((mark) => (
            <div key={mark.id} data-testid="composition-mark"
                 className="row small" style={{ gap: 6, padding: '4px 0', flexWrap: 'nowrap' }}>
              <span className="grow" style={{ minWidth: 0, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {labelFor(mark.kind)}{mark.text ? ` — “${mark.text}”` : ''}
              </span>
              <span className="mono muted" style={{ fontSize: 10, flex: '0 0 auto' }}>
                {mark.appearOffset !== undefined
                  ? formatTimecode(mark.appearOffset).slice(3, 8)
                  : 'all'}
              </span>
              {take?.durationFrames > 0 && (
                <button className="small" disabled={disabled}
                        title="Show this mark only from here to the end"
                        onClick={() => onTimeMark(mark.id)}
                        style={{ padding: '2px 6px', fontSize: 11 }}>
                  time
                </button>
              )}
              <button className="small" disabled={disabled}
                      onClick={() => onRemoveMark(mark.id)}
                      style={{ padding: '2px 6px', fontSize: 11 }}>
                remove
              </button>
            </div>
          ))}
        </div>
      )}

      </>
      )}

      {!embedded && (intervention.evidence ?? []).length > 0 && (
        <p className="small muted" style={{ marginTop: 14, lineHeight: 1.35 }}>
          Evidence takes the panel on this response, so the frame is not on
          screen and marks on it will not be drawn. Choose a layout that shows
          the frame, or remove the evidence.
        </p>
      )}
    </aside>
  );
}

function labelFor(kind: string): string {
  const known = EXPLAIN_TOOLS.find((t) => t.kind === kind);
  if (known) return known.label;
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

/**
 * The layout, drawn from the layout.
 *
 * Reading LAYOUTS rather than hand-drawing six thumbnails: a layout whose
 * rects change gets a picture that changes with it, and a layout added to the
 * data appears here correctly without anyone remembering to draw it. [U-18]
 */
function LayoutDiagram({ layoutId }: { layoutId: string }) {
  const layout = LAYOUTS[layoutId];
  if (!layout) return null;
  const colour = (source: string) =>
    source === 'user' ? 'var(--user-accent, #c2794f)' : 'var(--source-accent, #7f9bb5)';

  return (
    <div aria-hidden style={{
      position: 'relative', width: '100%', aspectRatio: '16 / 9',
      background: '#0d1319', borderRadius: 3, overflow: 'hidden',
      border: '1px solid var(--line)',
    }}>
      {[...layout.layers].sort((a, b) => a.z - b.z).map((layer, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: `${layer.rect.x * 100}%`, top: `${layer.rect.y * 100}%`,
          width: `${layer.rect.w * 100}%`, height: `${layer.rect.h * 100}%`,
          background: colour(layer.source),
          opacity: layer.source === 'still' ? 0.55 : 0.85,
          border: '1px solid rgba(0,0,0,0.5)',
        }} />
      ))}
    </div>
  );
}
