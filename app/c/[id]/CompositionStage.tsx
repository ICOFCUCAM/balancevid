'use client';

import { useEffect, useRef } from 'react';
import { LAYOUTS, TYPE_PRESENTATION } from '../../../src/domain/presentation.js';
import type { Layer } from '../../../src/domain/presentation.js';
import type { InterventionType } from '../../../src/domain/document.js';
import { HOUSE_FPS } from '../../../src/domain/time.js';
import Mark from './Mark.js';

/**
 * What the audience will see.  [Doctrine U-18, U-16, INV-00]
 *
 * The centre of the Studio, showing the actual relationship between the
 * source and the response: the layout's own layers, in the layout's own
 * rectangles, with the marks over them. Choosing a layout on the right rail
 * changes this immediately, because both read the same LAYOUTS data the
 * renderer reads.
 *
 * It is a PREVIEW, not a render. The finished video is composed by ffmpeg
 * from the plan (U-16); this is the same geometry drawn by the browser so the
 * author can see what they are choosing without waiting for an export. The
 * one thing it must not do is disagree with the renderer about where things
 * are — hence reading the layers rather than describing them again here.
 *
 * WHY MARKS ARE PLACED HERE AND NOT ON THE BARE SOURCE FRAME. Annotations are
 * canvas coordinates (U-12): the renderer draws them over the whole composed
 * frame, not inside the source panel. Marking a full-bleed source frame and
 * then exporting a side-by-side therefore puts the circle somewhere the
 * author never put it. Marking the composition is the only placement that
 * means the same thing in the export.
 */
export default function CompositionStage({
  conversationId, intervention, layoutId, drafts, children,
}: {
  conversationId: string;
  intervention: any;
  /** Overrides the intervention's own layout, for previewing a choice. */
  layoutId?: string | null;
  /** A mark being drawn right now, shown with the saved ones. */
  drafts?: any[];
  /** The pointer surface, when a tool is in hand. */
  children?: React.ReactNode;
}) {
  const fromType = TYPE_PRESENTATION[intervention.type as InterventionType];
  const layout = LAYOUTS[layoutId ?? intervention.layoutId ?? fromType.layoutId]
    ?? LAYOUTS['full_source']!;
  const take = (intervention.takes ?? [])
    .find((t: any) => t.id === intervention.selectedTakeId);
  const marks: any[] = [...(intervention.annotations ?? []), ...(drafts ?? [])];

  return (
    <div data-testid="composition-stage" data-layout={layout.id}
         style={{ position: 'absolute', inset: 0, background: '#000', overflow: 'hidden' }}>
      {/*
        The backdrop. Two 16:9 panels inside a 16:9 frame cannot fill it, and
        flat black bars are the difference between a video that looks composed
        and one that looks cropped — so the layout says what fills the gap and
        the preview honours it.
      */}
      {layout.backdrop === 'blur' && (
        <SourceFrame
          conversationId={conversationId}
          frame={intervention.anchor.tSourceFrame}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', filter: 'blur(28px) brightness(0.55)', transform: 'scale(1.15)',
          }}
        />
      )}

      {[...layout.layers].sort((a, b) => a.z - b.z).map((layer, i) => (
        <LayerBox key={i} layer={layer}>
          <LayerMedia
            layer={layer}
            conversationId={conversationId}
            intervention={intervention}
            take={take}
          />
        </LayerBox>
      ))}

      {/*
        Marks sit over the whole canvas, exactly as the renderer emits them.
        [U-12]
      */}
      <svg
        viewBox="0 0 1000 563" preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
          pointerEvents: 'none' }}
      >
        {marks.map((mark: any, i: number) => (
          <Mark key={mark.id ?? `draft-${i}`} mark={mark} />
        ))}
      </svg>

      {children}
    </div>
  );
}

function LayerBox({ layer, children }: { layer: Layer; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'absolute',
      left: `${layer.rect.x * 100}%`, top: `${layer.rect.y * 100}%`,
      width: `${layer.rect.w * 100}%`, height: `${layer.rect.h * 100}%`,
      overflow: 'hidden', lineHeight: 0,
    }}>
      {children}
    </div>
  );
}

function LayerMedia({
  layer, conversationId, intervention, take,
}: { layer: Layer; conversationId: string; intervention: any; take: any }) {
  const box: React.CSSProperties = {
    width: '100%', height: '100%', background: '#000',
    objectFit: layer.fit === 'contain' ? 'contain' : 'cover',
  };

  if (layer.source === 'source' || layer.source === 'still') {
    return (
      <SourceFrame
        conversationId={conversationId}
        frame={intervention.anchor.tSourceFrame}
        style={box}
      />
    );
  }
  if (layer.source === 'user') {
    if (!take || take.durationFrames === 0) {
      return (
        <div className="small muted" style={{
          width: '100%', height: '100%', display: 'grid', placeItems: 'center',
          background: '#141a20', lineHeight: 1.3, textAlign: 'center', padding: 8,
        }}>
          your response
        </div>
      );
    }
    return (
      <video
        src={`/api/conversations/${conversationId}/takes/${take.id}/media`}
        poster={`/api/conversations/${conversationId}/takes/${take.id}/media?kind=poster`}
        preload="metadata" muted playsInline
        style={box}
      />
    );
  }
  if (layer.source === 'evidence') {
    const evidence = (intervention.evidence ?? [])[0];
    return evidence
      ? <img alt="" style={box}
             src={`/api/conversations/${conversationId}/evidence/${evidence.id}/media`} />
      : <div style={{ width: '100%', height: '100%', background: '#0d1319' }} />;
  }
  return <div style={{ width: '100%', height: '100%', background: '#0d1319' }} />;
}

/** The anchor frame, held still. The moment the author was looking at. */
function SourceFrame({
  conversationId, frame, style,
}: { conversationId: string; frame: number; style: React.CSSProperties }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const seek = () => { video.currentTime = frame / HOUSE_FPS; };
    if (video.readyState >= 1) seek();
    else video.addEventListener('loadedmetadata', seek, { once: true });
  }, [frame]);
  return (
    <video
      ref={ref}
      src={`/api/conversations/${conversationId}/source`}
      preload="metadata" muted playsInline
      style={style}
    />
  );
}
