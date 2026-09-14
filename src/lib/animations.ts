import gsap from 'gsap';

/** Only schedule animations for icons that exist in this canvas. */
export function scopedAnimations(root: SVGSVGElement | null) {
  return {
    to(selector: string, vars: gsap.TweenVars) {
      const targets = root?.querySelectorAll(selector);
      if (targets?.length) gsap.to(targets, vars);
    },
    fromTo(selector: string, from: gsap.TweenVars, to: gsap.TweenVars) {
      const targets = root?.querySelectorAll(selector);
      if (targets?.length) gsap.fromTo(targets, from, to);
    },
  };
}
