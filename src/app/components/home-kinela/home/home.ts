import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  NgZone,
  ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Contact } from '../../modules/contact';
import { Services } from '../../modules/services';
import { Prototipo } from '../../prototipo/prototipo';

gsap.registerPlugin(ScrollTrigger);

@Component({
  selector: 'app-home',
  imports: [CommonModule, Contact, Services, Prototipo],
  standalone: true,
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements AfterViewInit, OnDestroy {

  constructor(
    private router: Router,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  @ViewChild('canvasContainer', { static: true })
  canvasRef!: ElementRef<HTMLDivElement>;

  @ViewChild('videoTeaser')
  videoTeaserRef?: ElementRef<HTMLVideoElement>;

  // ── Detección de dispositivo (una sola vez) ───────────────────
  private readonly isMobile = window.innerWidth <= 768;
  private readonly isTablet = window.innerWidth > 768 && window.innerWidth <= 1024;

  // En móvil NO renderizamos partículas ni efectos pesados
  private get isLowEnd(): boolean {
    return this.isMobile || this.isTablet;
  }

  // ── THREE.js ──────────────────────────────────────────────────
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private keyLight!: THREE.DirectionalLight;
  private rimLight!: THREE.PointLight;
  private mainModelGroup = new THREE.Group();
  private particles?: THREE.Points;
  private animationId!: number;
  private frameCount = 0;

  // ── Rotaciones ───────────────────────────────────────────────
  private scrollRotationY  = Math.PI;
  private mouseOffsetY     = 0;
  private mouseOffsetX     = 0;
  private targetMouseY     = 0;
  private targetMouseX     = 0;
  private interactionEnabled = true;

  // ── UI ───────────────────────────────────────────────────────
  public titleChars     = 'KINELA·TECH'.split('');
  public videoModalOpen = false;
  public teaserCargado  = false;
  public teaserError    = false;

  // ── Cursor (solo desktop) ─────────────────────────────────────
  private cursorDot!: HTMLElement;
  private cursorRing!: HTMLElement;
  private cursorVisible = false;
  private introPlayed   = false;

  // ═══════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════

  ngAfterViewInit(): void {
    this.ngZone.runOutsideAngular(() => {
      this.initThree();
      this.loadMainBust();
      this.animate();

      // Partículas: solo desktop, 0 en móvil/tablet
      if (!this.isLowEnd) {
        this.addGlobalParticles();
      }

      this.setupScroll();
      this.initNavProgress();
      this.initHUD();
      this.initSectionDividerAnimations();
      this.initContactAnimation();
      this.runIntro();

      if (!this.isMobile) {
        this.initCursor();
      }
    });

    if (!this.isMobile) {
      window.addEventListener('mousemove', this.onMouseMove);
    }
    window.addEventListener('touchmove', this.onTouchMove, { passive: true });
    window.addEventListener('resize', this.onResize);

    // Teaser video
    setTimeout(() => {
      const v = this.videoTeaserRef?.nativeElement;
      if (!v) return;
      v.muted = true;
      v.play().catch(() => {});
      this.ngZone.runOutsideAngular(() => {
        v.addEventListener('loadeddata', () => {
          this.ngZone.run(() => {
            this.teaserCargado = true;
            this.cdr.markForCheck();
          });
        }, { once: true });
      });
    }, 1500);
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animationId);
    this.renderer?.dispose();
    ScrollTrigger.getAll().forEach(t => t.kill());
    window.removeEventListener('mousemove',    this.onMouseMove);
    window.removeEventListener('touchmove',    this.onTouchMove);
    window.removeEventListener('resize',       this.onResize);
    window.removeEventListener('mousemove',    this.onCursorMove);
    document.removeEventListener('mouseenter', this.onDocumentMouseEnter);
    document.removeEventListener('mouseleave', this.onDocumentMouseLeave);
  }

  // ═══════════════════════════════════════════════════════════════
  // NAVEGACIÓN
  // ═══════════════════════════════════════════════════════════════

  public goToLogin(): void {
    gsap.to('.page-container', {
      opacity: 0, duration: 0.6,
      onComplete: () => {this.router.navigate(['/login'])}
    });
  }

  public scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    gsap.to(this.mainModelGroup.position, { x: 0, y: 0, z: 0, duration: 0.8, ease: 'power2.out' });
    gsap.to(this, { scrollRotationY: Math.PI, duration: 0.8, ease: 'power2.out' });
    gsap.to(this.camera.position, { z: this.isMobile ? 14 : 11, duration: 0.8, ease: 'power2.out' });
    setTimeout(() => ScrollTrigger.refresh(), 900);
  }

  // ═══════════════════════════════════════════════════════════════
  // MODAL
  // ═══════════════════════════════════════════════════════════════

  public openVideoModal(): void {
    this.videoModalOpen = true;
    document.body.style.overflow = 'hidden';
  }

  public closeVideoModal(): void {
    this.videoModalOpen = false;
    document.body.style.overflow = '';
  }

  // ═══════════════════════════════════════════════════════════════
  // CURSOR (solo desktop)
  // ═══════════════════════════════════════════════════════════════

  private initCursor(): void {
    this.cursorDot  = document.querySelector('.hm-cursor')      as HTMLElement;
    this.cursorRing = document.querySelector('.hm-cursor-ring') as HTMLElement;
    if (!this.cursorDot || !this.cursorRing) return;

    gsap.set([this.cursorDot, this.cursorRing], { opacity: 0 });
    window.addEventListener('mousemove',    this.onCursorMove);
    document.addEventListener('mouseenter', this.onDocumentMouseEnter);
    document.addEventListener('mouseleave', this.onDocumentMouseLeave);

    setTimeout(() => {
      document.querySelectorAll(
        'button, a, .hm-tech-tag, .hm-manifesto-card, .hm-vf-chip, .hm-tl-icon, .hm-timeline-item'
      ).forEach(el => {
        el.addEventListener('mouseenter', () => {
          gsap.to(this.cursorRing, { scale: 2.2, borderColor: 'rgba(0,240,255,0.9)', duration: 0.3, ease: 'power2.out' });
          gsap.to(this.cursorDot,  { scale: 0.5, duration: 0.2 });
        });
        el.addEventListener('mouseleave', () => {
          gsap.to(this.cursorRing, { scale: 1,   borderColor: 'rgba(0,240,255,0.5)', duration: 0.4, ease: 'power2.out' });
          gsap.to(this.cursorDot,  { scale: 1,   duration: 0.2 });
        });
      });
    }, 400);
  }

  private onCursorMove = (e: MouseEvent): void => {
    if (!this.cursorDot || !this.cursorRing) return;
    if (!this.cursorVisible) {
      this.cursorVisible = true;
      gsap.to([this.cursorDot, this.cursorRing], { opacity: 1, duration: 0.3 });
    }
    gsap.to(this.cursorDot,  { x: e.clientX, y: e.clientY, duration: 0.02 });
    gsap.to(this.cursorRing, { x: e.clientX, y: e.clientY, duration: 0.14, ease: 'power2.out' });
  };

  private onDocumentMouseEnter = (): void => {
    if (!this.cursorDot) return;
    gsap.to([this.cursorDot, this.cursorRing], { opacity: 1, duration: 0.3 });
    this.cursorVisible = true;
  };

  private onDocumentMouseLeave = (): void => {
    if (!this.cursorDot) return;
    gsap.to([this.cursorDot, this.cursorRing], { opacity: 0, duration: 0.3 });
    this.cursorVisible = false;
  };

  // ═══════════════════════════════════════════════════════════════
  // NAV PROGRESS
  // ═══════════════════════════════════════════════════════════════

  private initNavProgress(): void {
    const fill = document.querySelector('.hm-nav-progress-fill') as HTMLElement;
    if (!fill) return;
    ScrollTrigger.create({
      trigger: '.page-container',
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => { fill.style.width = `${self.progress * 100}%`; }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // HUD (solo desktop)
  // ═══════════════════════════════════════════════════════════════

  private initHUD(): void {
    if (this.isMobile) return;
    const depthEl  = document.querySelector('.hm-hud-depth')    as HTMLElement;
    const progress = document.querySelector('.hm-hud-progress') as HTMLElement;
    if (!depthEl) return;
    ScrollTrigger.create({
      trigger: '.page-container',
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        const pct = Math.round(self.progress * 100);
        depthEl.textContent = pct.toString().padStart(3, '0');
        if (progress) progress.style.height = `${pct}%`;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION DIVIDERS
  // ═══════════════════════════════════════════════════════════════

  private initSectionDividerAnimations(): void {
    document.querySelectorAll('.hm-section-divider').forEach(div => {
      gsap.from(div, {
        scrollTrigger: { trigger: div, start: 'top 90%', once: true },
        opacity: 0, scaleX: 0.95, transformOrigin: 'center',
        duration: 0.5, ease: 'power2.out'
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // COUNTERS — IntersectionObserver en móvil, ScrollTrigger en desktop
  // ═══════════════════════════════════════════════════════════════

  private initCounters(): void {
    document.querySelectorAll('.hm-count[data-count]').forEach(el => {
      const target  = parseInt(el.getAttribute('data-count') || '0', 10);
      const isLarge = target > 9999;

      const run = () => {
        const obj = { val: 0 };
        gsap.to(obj, {
          val: target, duration: 2.2, ease: 'power2.out',
          onUpdate: () => {
            const v = Math.round(obj.val);
            el.textContent = isLarge && v >= 1_000_000
              ? `${(v / 1_000_000).toFixed(1)}M`
              : v.toString();
          }
        });
      };

      if (this.isMobile) {
        const obs = new IntersectionObserver(entries => {
          if (entries[0].isIntersecting) { run(); obs.disconnect(); }
        }, { threshold: 0.3 });
        obs.observe(el);
      } else {
        ScrollTrigger.create({ trigger: el, start: 'top 88%', once: true, onEnter: run });
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // DATA PARTICLES — SOLO desktop, skip en móvil/tablet
  // ═══════════════════════════════════════════════════════════════

  private initDataParticles(): void {
    if (this.isLowEnd) return;

    const container = document.querySelector('.hm-particles-container') as HTMLElement;
    if (!container) return;

    const hexStrings = [
      '0x7F · 0xA3 · 0x2B', 'ID::SCAN_OK', '> AUTH_TOKEN',
      '0xFF · 0x00 · 0x44', 'FACE_MATCH::0.997',
      '< KINELA_V3', 'EMBED[468]::OK', '> GRANT_ACCESS',
    ];

    ScrollTrigger.create({
      trigger: '.video-section', start: 'top 55%', once: true,
      onEnter: () => {
        const vw = window.innerWidth, vh = window.innerHeight;
        hexStrings.forEach((text, i) => {
          const el = document.createElement('span');
          el.className = 'hm-data-particle';
          el.textContent = text;
          container.appendChild(el);
          const sx = vw * 0.72 + (Math.random() - 0.5) * 80;
          const sy = vh * 0.35 + Math.random() * vh * 0.3;
          const ex = vw * 0.4  + (Math.random() - 0.5) * 200;
          const ey = vh * 0.4  + (Math.random() - 0.5) * 100;
          gsap.fromTo(el,
            { x: sx, y: sy, opacity: 0, scale: 0.8 },
            { x: ex, y: ey, opacity: 0.8, scale: 1, duration: 1, delay: i * 0.12, ease: 'power2.out',
              onComplete: () => {gsap.to(el, { opacity: 0, y: ey - 30, duration: 1.8, delay: 0.4 + i * 0.05, ease: 'power1.in', onComplete: () => el.remove() })}
            }
          );
        });
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // CONTACT ANIMATION
  // ═══════════════════════════════════════════════════════════════

  private initContactAnimation(): void {
    const section = document.querySelector('.hm-contact-section');
    if (!section) return;

    if (this.isMobile) {
      const obs = new IntersectionObserver(entries => {
        if (!entries[0].isIntersecting) return;
        const root = section.querySelector('.ck-page');
        if (!root) return;
        root.querySelectorAll('.ck-header, .ck-col-labels, .ck-panel, .ck-footer-row, .ck-map-col')
          .forEach((el, i) => {
            gsap.fromTo(el, { opacity: 0, y: 16 },
              { opacity: 1, y: 0, duration: 0.5, delay: i * 0.06, ease: 'power2.out', clearProps: 'all' });
          });
        obs.disconnect();
      }, { threshold: 0.05 });
      obs.observe(section);
      return;
    }

    setTimeout(() => {
      const root = section.querySelector('.ck-page');
      if (!root) return;
      const q = (sel: string) => root.querySelectorAll(sel);
      gsap.set(q('.ck-header'),     { opacity: 0, y: -20 });
      gsap.set(q('.ck-col-labels'), { opacity: 0 });
      gsap.set(q('.ck-panel'),      { opacity: 0, x: -20 });
      gsap.set(q('.ck-footer-row'), { opacity: 0 });
      gsap.set(q('.ck-map-col'),    { opacity: 0, x: 20 });
      ScrollTrigger.create({
        trigger: section, start: 'top 80%', once: true,
        onEnter: () => gsap.timeline()
          .to(q('.ck-header'),     { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' })
          .to(q('.ck-col-labels'), { opacity: 1, duration: 0.4 }, '-=0.3')
          .to(q('.ck-panel'),      { opacity: 1, x: 0, duration: 0.5, stagger: 0.08, ease: 'power3.out' }, '-=0.2')
          .to(q('.ck-footer-row'), { opacity: 1, duration: 0.4 }, '-=0.3')
          .to(q('.ck-map-col'),    { opacity: 1, x: 0, duration: 0.7, ease: 'expo.out' }, 0.4)
      });
    }, 500);
  }

  // ═══════════════════════════════════════════════════════════════
  // THREE CORE — configuración adaptativa
  // ═══════════════════════════════════════════════════════════════

  private initThree(): void {
    const container = this.canvasRef.nativeElement;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x020202, this.isMobile ? 0.025 : 0.018);

    this.camera = new THREE.PerspectiveCamera(
      35,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 0, this.isMobile ? 14 : 11);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isMobile,       // sin antialias en móvil
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);

    // DPR: 1 en móvil, 1.5 en tablet, 2 en desktop
    const dpr = this.isMobile ? 1 : this.isTablet ? 1.5 : Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.shadowMap.enabled = false;   // sin sombras → rendimiento

    container.appendChild(this.renderer.domElement);

    // Iluminación — más intensa en móvil porque no hay partículas ni ambiente extra
    const ambient = new THREE.AmbientLight(0xffffff, this.isLowEnd ? 0.7 : 0.4);
    this.scene.add(ambient);

    this.keyLight = new THREE.DirectionalLight(0x00eaff, this.isLowEnd ? 3.5 : 2);
    this.keyLight.position.set(4, 5, 6);
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.PointLight(0xff00aa, this.isLowEnd ? 7 : 4, 40);
    this.rimLight.position.set(-4, 2, 5);
    this.scene.add(this.rimLight);

    this.scene.add(this.mainModelGroup);
  }

  // ═══════════════════════════════════════════════════════════════
  // BUSTO 3D
  // ═══════════════════════════════════════════════════════════════

  private loadMainBust(): void {
    new GLTFLoader().load('/assets/models/model-headfaces.glb', (gltf) => {
      const model = gltf.scene;
      model.traverse((n: any) => {
        if (n.isMesh) {
          n.material = new THREE.MeshStandardMaterial({
            color: 0xcfd8dc,
            metalness: 0.95,
            roughness: 0.25
          });
          n.castShadow    = false;
          n.receiveShadow = false;
        }
      });
      this.mainModelGroup.add(model);
      this.mainModelGroup.scale.setScalar(this.isMobile ? 4 : 5);
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // SCROLL
  // ═══════════════════════════════════════════════════════════════

  private setupScroll(): void {
    ScrollTrigger.config({ ignoreMobileResize: true });
    setTimeout(() => ScrollTrigger.refresh(), 300);
    setTimeout(() => ScrollTrigger.refresh(), 1200);

    // En móvil quitamos el overlay negro directamente — el trigger no es fiable en iOS
    if (this.isMobile) {
      gsap.set('.hero-black-bg', { opacity: 0 });
    } else {
      gsap.to('.hero-black-bg', {
        scrollTrigger: { trigger: '.about-section', start: 'top 90%', end: 'top 30%', scrub: true },
        opacity: 0
      });
    }

    // Zoom cámara
    gsap.to(this.camera.position, {
      scrollTrigger: { trigger: '.about-section', start: 'top bottom', end: 'top center', scrub: 1 },
      z: this.isMobile ? 12 : 9
    });

    // Rotación en about
    gsap.to(this, {
      scrollTrigger: {
        trigger: '.about-section', start: 'top center', end: 'bottom center', scrub: 1,
        onEnter:     () => { this.interactionEnabled = false; },
        onLeaveBack: () => { this.interactionEnabled = true; }
      },
      scrollRotationY: Math.PI - 0.5
    });

    // Desplazamiento lateral solo en desktop
    if (!this.isMobile) {
      gsap.to(this.mainModelGroup.position, {
        scrollTrigger: { trigger: '.about-section', start: 'top center', end: 'bottom center', scrub: 1 },
        x: 3
      });
    }

    // Rotación en video section
    gsap.to(this, {
      scrollTrigger: { trigger: '.video-section', start: 'top center', end: 'bottom center', scrub: 1 },
      scrollRotationY: Math.PI - 0.2
    });

    // Canvas blur solo en desktop
    if (!this.isMobile) {
      gsap.to('.hm-canvas-blur', {
        scrollTrigger: { trigger: '.video-section', start: 'top 70%', end: 'top 20%', scrub: true },
        backgroundColor: 'rgba(2,2,2,0.55)', backdropFilter: 'blur(4px)', webkitBackdropFilter: 'blur(4px)'
      });
      gsap.to('.hm-canvas-blur', {
        scrollTrigger: { trigger: '.carousel-section', start: 'top 70%', end: 'top 30%', scrub: true },
        backgroundColor: 'rgba(2,2,2,0)', backdropFilter: 'blur(0px)', webkitBackdropFilter: 'blur(0px)'
      });
    }

    this.initDataParticles();

    // Salida del modelo
    gsap.to(this.mainModelGroup.position, {
      scrollTrigger: { trigger: '.carousel-section', start: 'top center', end: 'bottom center', scrub: 1 },
      y: 7, z: -6
    });

    setTimeout(() => this.initCounters(), 300);
  }

  // ═══════════════════════════════════════════════════════════════
  // PARTÍCULAS THREE.js — solo desktop
  // ═══════════════════════════════════════════════════════════════

  private addGlobalParticles(): void {
    // Desktop: 3000 | Tablet: 0 (isLowEnd) | Móvil: 0 (isLowEnd)
    const count = 3000;

    const geometry  = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors    = new Float32Array(count * 3);
    const color     = new THREE.Color();

    for (let i = 0; i < count; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 40;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 40;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 80;
      color.setHSL(0.55 + Math.random() * 0.15, 0.8, 0.6);
      colors[i * 3]     = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color',    new THREE.BufferAttribute(colors, 3));

    const texture  = new THREE.TextureLoader().load('assets/textures/particle.png');
    const material = new THREE.PointsMaterial({
      size: 0.6, map: texture, vertexColors: true,
      transparent: true, opacity: 0.9,
      depthWrite: false, blending: THREE.AdditiveBlending
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  }

  // ═══════════════════════════════════════════════════════════════
  // LOOP — 30fps en móvil, 60fps en desktop
  // ═══════════════════════════════════════════════════════════════

  private animate = () => {
    this.animationId = requestAnimationFrame(this.animate);

    // Móvil: renderizar cada 2 frames → ~30fps
    if (this.isMobile) {
      this.frameCount++;
      if (this.frameCount % 2 !== 0) return;
    }

    this.mouseOffsetY += (this.targetMouseY - this.mouseOffsetY) * 0.05;
    this.mouseOffsetX += (this.targetMouseX - this.mouseOffsetX) * 0.05;

    if (!this.interactionEnabled) {
      this.mouseOffsetY *= 0.9;
      this.mouseOffsetX *= 0.9;
    }

    this.mainModelGroup.rotation.y = this.scrollRotationY + this.mouseOffsetY;
    this.mainModelGroup.rotation.x = this.mouseOffsetX;

    this.keyLight.position.x = this.mainModelGroup.position.x + 2;
    this.keyLight.position.y = this.mainModelGroup.position.y + 3;
    this.rimLight.position.x = this.mainModelGroup.position.x - 3;
    this.rimLight.position.y = this.mainModelGroup.position.y + 1;

    if (this.particles) this.particles.rotation.y += 0.0008;

    this.renderer.render(this.scene, this.camera);
  };

  // ═══════════════════════════════════════════════════════════════
  // INTERACTION
  // ═══════════════════════════════════════════════════════════════

  private onMouseMove = (e: MouseEvent) => this.handleInteraction(e.clientX, e.clientY);
  private onTouchMove = (e: TouchEvent) => this.handleInteraction(e.touches[0].clientX, e.touches[0].clientY);

  private handleInteraction(x: number, y: number): void {
    if (!this.interactionEnabled) return;
    const factor = this.isMobile ? 0.25 : 0.6;
    this.targetMouseY = (x / window.innerWidth  - 0.5) * factor;
    this.targetMouseX = (y / window.innerHeight - 0.5) * (factor / 2);
  }

  private onResize = () => {
    const container = this.canvasRef.nativeElement;
    this.camera.aspect = container.clientWidth / container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    setTimeout(() => ScrollTrigger.refresh(), 200);
  };

  // ═══════════════════════════════════════════════════════════════
  // INTRO
  // ═══════════════════════════════════════════════════════════════

  private runIntro(): void {
    if (this.introPlayed) return;
    this.introPlayed = true;

    gsap.set('.hm-char',         { opacity: 0, y: 40 });
    gsap.set('.hm-hero-eyebrow', { opacity: 0, y: 16 });
    gsap.set('.hm-separator',    { opacity: 0, y: 12 });
    gsap.set('.hm-subtitle',     { opacity: 0, y: 12 });
    gsap.set('.hm-hero-stats',   { opacity: 0, y: 8  });
    gsap.set('.hm-scroll-cue',   { opacity: 0        });
    gsap.set('.hm-hero-corner',  { opacity: 0        });
    gsap.set('.hm-hud',          { opacity: 0, x: 16 });

    gsap.timeline({ delay: 0.2 })
      .to('.hm-char',         { opacity: 1, y: 0, stagger: 0.04, duration: 0.85, ease: 'power3.out', clearProps: 'all' })
      .to('.hm-hero-eyebrow', { opacity: 1, y: 0, duration: 0.5,  clearProps: 'all' }, '-=0.65')
      .to('.hm-separator',    { opacity: 1, y: 0, duration: 0.45, clearProps: 'all' }, '-=0.4')
      .to('.hm-subtitle',     { opacity: 1, y: 0, duration: 0.45, clearProps: 'all' }, '-=0.35')
      .to('.hm-hero-stats',   { opacity: 1, y: 0, duration: 0.4,  clearProps: 'all' }, '-=0.3')
      .to('.hm-scroll-cue',   { opacity: 1,       duration: 0.35, clearProps: 'opacity' }, '-=0.25')
      .to('.hm-hero-corner',  { opacity: 0.3,     duration: 0.3, stagger: 0.05, clearProps: 'transform' }, '-=0.25')
      .to('.hm-hud',          { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out', clearProps: 'transform' }, '-=0.2');
  }
}