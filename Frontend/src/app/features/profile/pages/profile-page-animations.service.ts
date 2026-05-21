import { Injectable, NgZone } from '@angular/core';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

@Injectable()
export class ProfilePageAnimationsService {
  animateMenuOpen(zone: NgZone, host: HTMLElement): void {
    const menu = host.querySelector<HTMLElement>('.prj-card-menu');
    if (!menu) return;

    zone.runOutsideAngular(() => {
      gsap.fromTo(
        menu,
        { opacity: 0, scale: 0.88, y: 8, transformOrigin: 'bottom right' },
        { opacity: 1, scale: 1, y: 0, duration: 0.22, ease: 'back.out(1.7)' },
      );
    });
  }

  animateMenuClose(
    zone: NgZone,
    host: HTMLElement,
    onComplete: () => void,
  ): void {
    const menu = host.querySelector<HTMLElement>('.prj-card-menu');
    if (!menu) {
      onComplete();
      return;
    }

    zone.runOutsideAngular(() => {
      gsap.to(menu, {
        opacity: 0,
        scale: 0.88,
        y: 8,
        duration: 0.15,
        ease: 'power2.in',
        transformOrigin: 'bottom right',
        onComplete: () => zone.run(onComplete),
      });
    });
  }

  animateHero(zone: NgZone, host: HTMLElement): void {
    zone.runOutsideAngular(() => {
      const avatar = host.querySelector<HTMLElement>('.prf-ava');
      const name = host.querySelector<HTMLElement>('.prf-name');
      const handle = host.querySelector<HTMLElement>('.prf-handle');
      const stats = host.querySelectorAll<HTMLElement>('.prf-stat');
      const footer = host.querySelector<HTMLElement>('.prf-cover-foot');
      const bio = host.querySelector<HTMLElement>('.prf-bio');

      const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });

      if (avatar) {
        gsap.set(avatar, { opacity: 0, scale: 0.82, filter: 'blur(12px)' });
        timeline.to(avatar, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 0.8 }, 0);
      }

      if (name) {
        gsap.set(name, { opacity: 0, y: 18, filter: 'blur(8px)' });
        timeline.to(name, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.7 }, 0.18);
      }

      if (handle) {
        gsap.set(handle, { opacity: 0, y: 12, filter: 'blur(6px)' });
        timeline.to(handle, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.6 }, 0.28);
      }

      if (stats.length) {
        gsap.set(stats, { opacity: 0, y: 10 });
        timeline.to(stats, { opacity: 1, y: 0, duration: 0.55, stagger: 0.07 }, 0.38);
      }

      if (footer) {
        gsap.set(footer, { opacity: 0, y: 10 });
        timeline.to(footer, { opacity: 1, y: 0, duration: 0.5 }, 0.52);
      }

      if (bio) {
        gsap.set(bio, { opacity: 0, y: 8 });
        timeline.to(bio, { opacity: 1, y: 0, duration: 0.5 }, 0.6);
      }
    });
  }

  animateProjectCards(zone: NgZone, grid: HTMLElement): void {
    zone.runOutsideAngular(() => {
      const cards = grid.querySelectorAll<HTMLElement>('.prj-card');
      if (!cards.length) return;

      gsap.set(cards, { opacity: 0, y: 22, filter: 'blur(8px)' });
      gsap.to(cards, {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        duration: 0.6,
        stagger: 0.07,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: grid,
          start: 'top 92%',
          toggleActions: 'play none none none',
        },
      });
      requestAnimationFrame(() => ScrollTrigger.refresh());
    });
  }

  initScrollAnimations(zone: NgZone, host: HTMLElement): void {
    zone.runOutsideAngular(() => {
      const toolbarHead = host.querySelector<HTMLElement>('.prf-toolbar-head');
      const toolbarControls = host.querySelector<HTMLElement>('.prf-toolbar-controls');

      const scrollTriggerConfig = {
        start: 'top 92%',
        toggleActions: 'play none none none' as const,
      };

      if (toolbarHead) {
        gsap.set(toolbarHead, { opacity: 0, y: 18, filter: 'blur(10px)' });
        gsap.to(toolbarHead, {
          opacity: 1,
          y: 0,
          filter: 'blur(0px)',
          duration: 0.7,
          ease: 'power3.out',
          scrollTrigger: { trigger: toolbarHead, ...scrollTriggerConfig },
        });
      }

      if (toolbarControls) {
        gsap.set(toolbarControls, { opacity: 0, y: 12, filter: 'blur(8px)' });
        gsap.to(toolbarControls, {
          opacity: 1,
          y: 0,
          filter: 'blur(0px)',
          duration: 0.6,
          ease: 'power3.out',
          scrollTrigger: { trigger: toolbarControls, ...scrollTriggerConfig },
        });
      }

      requestAnimationFrame(() => ScrollTrigger.refresh());
    });
  }
}
