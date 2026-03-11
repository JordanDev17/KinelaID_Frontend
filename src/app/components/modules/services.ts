import {
  Component,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  NgZone
} from '@angular/core';
import { CommonModule } from '@angular/common';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import SplitType from 'split-type';

gsap.registerPlugin(ScrollTrigger);

@Component({
  selector: 'app-services',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './services.html',
  styleUrl: './services.css'
})
export class Services implements AfterViewInit, OnDestroy {

  @ViewChild('servicesSection') section!: ElementRef<HTMLElement>;

  private observers: IntersectionObserver[] = [];

  constructor(private ngZone: NgZone) {}

  ngAfterViewInit(): void {
    this.ngZone.runOutsideAngular(() => {
      setTimeout(() => this.initAnimations(), 100);
    });
  }

  private initAnimations(): void {
    const el = this.section?.nativeElement;
    if (!el) return;

    /* ── 1. Título con SplitType ── */
    const titleLines = el.querySelectorAll<HTMLElement>('.sv-ht-line');
    titleLines.forEach(line => {
      const split = new SplitType(line, { types: 'chars' });
      gsap.from(split.chars!, {
        opacity: 0,
        y: 60,
        rotateX: -90,
        stagger: 0.04,
        duration: 0.7,
        ease: 'power4.out',
        scrollTrigger: {
          trigger: line,
          start: 'top 85%',
          once: true
        }
      });
    });

    /* ── 2. Eyebrow y descripción ── */
    gsap.from('.sv-header-eyebrow', {
      opacity: 0,
      y: 20,
      duration: 0.8,
      ease: 'power3.out',
      scrollTrigger: { trigger: '.sv-header', start: 'top 85%', once: true }
    });

    gsap.from('.sv-header-desc', {
      opacity: 0,
      y: 20,
      duration: 0.8,
      delay: 0.3,
      ease: 'power3.out',
      scrollTrigger: { trigger: '.sv-header', start: 'top 80%', once: true }
    });

    gsap.from('.sv-rule-fill', {
      scaleX: 0,
      transformOrigin: 'left center',
      duration: 1.2,
      ease: 'expo.out',
      stagger: 0.15,
      scrollTrigger: { trigger: '.sv-header-rule', start: 'top 90%', once: true }
    });

    /* ── 3. Featured card ── */
    gsap.from('.sv-featured', {
      opacity: 0,
      y: 60,
      duration: 1,
      ease: 'expo.out',
      scrollTrigger: { trigger: '.sv-featured', start: 'top 80%', once: true }
    });

    /* ── 4. Grid cards en cascada ── */
    const cards = el.querySelectorAll('.sv-card');
    cards.forEach((card, i) => {
      gsap.from(card, {
        opacity: 0,
        y: 50,
        duration: 0.7,
        delay: (i % 4) * 0.1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: card,
          start: 'top 88%',
          once: true
        }
      });
    });

    /* ── 5. CTA footer ── */
    gsap.from('.sv-cta', {
      opacity: 0,
      y: 40,
      duration: 0.9,
      ease: 'power3.out',
      scrollTrigger: { trigger: '.sv-cta', start: 'top 90%', once: true }
    });

    gsap.from('.sv-cta-line', {
      scaleX: 0,
      transformOrigin: 'left center',
      duration: 1.5,
      ease: 'expo.out',
      scrollTrigger: { trigger: '.sv-cta', start: 'top 90%', once: true }
    });
  }

  /* ── Hover handlers (GSAP micro-interactions) ── */
  onCardHover(id: string): void {
    this.ngZone.runOutsideAngular(() => {
      const selector = id === 'featured' ? '.sv-featured' : `.sv-card:nth-child(${this.cardIndex(id)})`;
      gsap.to(`[data-card="${id}"] .sv-card-icon`, {
        scale: 1.1,
        duration: 0.3,
        ease: 'power2.out'
      });
    });
  }

  onCardLeave(id: string): void {
    this.ngZone.runOutsideAngular(() => {
      gsap.to(`[data-card="${id}"] .sv-card-icon`, {
        scale: 1,
        duration: 0.25,
        ease: 'power2.out'
      });
    });
  }

  private cardIndex(id: string): number {
    const map: Record<string, number> = {
      access: 1, register: 2, analytics: 3, api: 4, surveillance: 5
    };
    return map[id] ?? 1;
  }

  exploreService(service: string): void {
    /* Aquí puedes conectar con el router cuando existan las rutas de servicio */
    console.log(`Exploring service: ${service}`);
  }

  scrollToContact(): void {
    const contact = document.querySelector('app-contact');
    if (contact) {
      contact.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  ngOnDestroy(): void {
    ScrollTrigger.getAll().forEach(t => t.kill());
    this.observers.forEach(o => o.disconnect());
  }
}