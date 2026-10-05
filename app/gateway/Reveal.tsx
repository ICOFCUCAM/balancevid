'use client';

import { useEffect } from 'react';

/**
 * The lift as a section comes into view.  [Doctrine D-04, U-19]
 *
 * THE OPACITY IS SET BY THE SCRIPT AND NOT BY THE STYLESHEET, and
 * that one detail is the whole of why this degrades properly: a
 * browser with no JavaScript, or one where this component never
 * mounts, shows every section at full opacity because nothing
 * ever hid them. A CSS rule that started them at zero would hand
 * that reader a page of empty rectangles. [U-19]
 *
 * AND IT ASKS FIRST. `prefers-reduced-motion` is a person telling
 * the browser that movement makes them ill, and the brief
 * answered it by walking the whole document after first paint and
 * setting `transition:none` on every element — which is both too
 * late to stop the first animation and too wide, since the
 * document also contains whatever else the application has
 * rendered. Here the question is asked before anything is hidden,
 * so there is nothing to animate back. [D-04]
 *
 * SCOPED TO THE PAGE, by searching inside the gateway's own root
 * rather than the document. Nothing in the control room should
 * fade in because a marketing page was open.
 */

/** What lifts, in the brief's own selector. */
const LIFTS = '.section-header,.download,.deploy-card,.product-panel';

export default function Reveal({ within }: { within: string }) {
  useEffect(() => {
    const root = document.querySelector(within);
    if (!root) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: .08 },
    );

    root.querySelectorAll<HTMLElement>(LIFTS).forEach((el) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(18px)';
      el.style.transition = 'opacity .7s ease,transform .7s ease';
      revealObserver.observe(el);
    });

    return () => revealObserver.disconnect();
  }, [within]);

  return null;
}
