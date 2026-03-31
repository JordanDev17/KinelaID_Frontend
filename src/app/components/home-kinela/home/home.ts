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
import { Devkinela } from "../../devkinela/devkinela";

gsap.registerPlugin(ScrollTrigger);

@Component({
  selector: 'app-home',
  imports: [CommonModule, Contact, Services, Prototipo, Devkinela],
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

  // ── Detección de dispositivo ────────────────────────────────────
  private readonly isTouch = navigator.maxTouchPoints > 0;
  // isMobile: dimensión mínima de pantalla ≤ 430px — cubre phones en cualquier orientación
  public readonly isMobile = Math.min(window.screen.width, window.screen.height) <= 430;
  // isTablet: touch device que no es teléfono (iPads, Android tablets en cualquier orientación)
  private readonly isTablet = this.isTouch && !this.isMobile;
  private lastWidth = window.innerWidth;

  // Sin partículas ni efectos pesados en touch devices
  private get isLowEnd(): boolean { return this.isMobile || this.isTablet; }
  // Modelo estático: sin animaciones de scroll ni cursor tracking
  private get isFixedModel(): boolean { return this.isMobile || this.isTablet; }

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

  // ── Cursor (solo dispositivos no-touch) ──────────────────────
  private cursorDot!: HTMLElement;
  private cursorRing!: HTMLElement;
  private cursorVisible = false;
  private introPlayed   = false;

  // ── GPU / Performance tier ────────────────────────────────────
  private isIntegratedGPU  = false;
  private lastInteractionTime = 0;
  private readonly IDLE_MS  = 1800;

  // ═══════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════

ngAfterViewInit(): void {
  this.ngZone.runOutsideAngular(() => {
    this.detectGPU();
    this.initThree();
    this.loadMainBust();
    this.animate();

    if (!this.isLowEnd) {
      this.addGlobalParticles();
    }

    this.setupScroll();
    this.initNavProgress();
    this.initHUD();
    this.initSectionDividerAnimations();
    this.initContactAnimation();
    this.runIntro();

    // Cursor: solo en dispositivos con mouse real
    if (!this.isTouch) {
      this.initCursor();
    }
  });

  // Mousemove: solo en desktop interactivo
  if (!this.isFixedModel && !this.isTouch) {
    window.addEventListener('mousemove', this.onMouseMove);
  }
  window.addEventListener('touchmove', this.onTouchMove, { passive: true });
  window.addEventListener('resize', this.onResize);

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

// ═══════════════════════════════════════════════════════════════
// DATA PARTICLES — Optimizadas para Desktop con flujo cinético
// ═══════════════════════════════════════════════════════════════

private initDataParticles(): void {
  // Mantener el skip para evitar lag en dispositivos menos potentes
  if (this.isLowEnd) return;

  const container = document.querySelector('.hm-particles-container') as HTMLElement;
  if (!container) return;

  // Strings más técnicos y coherentes con tu backend de Django
  const dataTokens = [
    '0x7F · 0xA3 · 0x2B', 'ID::SCAN_OK', '> AUTH_TOKEN',
    'FACE_MATCH::0.997', 'EMBED[468]::OK', '> GRANT_ACCESS',
    'VECTOR::CALCULATING', 'NODE::CONNECTED', 'SSL::ENCRYPTED'
  ];

  ScrollTrigger.create({
    trigger: '.video-section',
    start: 'top 55%',
    once: true,
    onEnter: () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      dataTokens.forEach((text, i) => {
        const el = document.createElement('span');
        el.className = 'hm-data-particle';
        el.textContent = text;
        
        // Estilo inicial por JS para asegurar visibilidad
        Object.assign(el.style, {
          position: 'absolute',
          color: '#00f0c8', // Cyan KinelaID
          fontFamily: 'monospace',
          fontSize: '10px',
          letterSpacing: '1px',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          textShadow: '0 0 8px rgba(0, 240, 200, 0.5)'
        });

        container.appendChild(el);

        // --- LÓGICA DE TRAYECTORIA ---
        // Punto de origen: Derecha (donde estaría el panel de control)
        const sx = vw * 0.85 + (Math.random() - 0.5) * 100;
        const sy = vh * 0.4 + (Math.random() - 0.5) * 200;
        
        // Punto de destino: Centro (hacia la cara/video)
        const ex = vw * 0.45 + (Math.random() - 0.5) * 150;
        const ey = vh * 0.45 + (Math.random() - 0.5) * 150;

        // Timeline para mayor control del flujo
        const tl = gsap.timeline({
          onComplete: () => el.remove()
        });

        tl.fromTo(el,
          { 
            x: sx, 
            y: sy, 
            opacity: 0, 
            scale: 0.5,
            filter: 'blur(4px)' 
          },
          { 
            x: ex, 
            y: ey, 
            opacity: 1, 
            scale: 1, 
            filter: 'blur(0px)',
            duration: 1.2, 
            delay: i * 0.15, 
            ease: 'expo.out' 
          }
        )
        .to(el, {
          // Efecto de "succión" o desvanecimiento hacia arriba
          y: ey - 60,
          opacity: 0,
          scale: 1.2,
          duration: 1.5,
          ease: 'power2.inOut'
        }, "+=0.3"); // Pequeña pausa antes de desvanecer
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

private detectGPU(): void {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
    if (!gl) return;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return;
    const renderer = (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string) ?? '';
    this.isIntegratedGPU = /intel|amd radeon\(tm\) graphics|apple m\d|llvmpipe|swiftshader|microsoft basic/i.test(renderer);
    console.debug('[GPU]', renderer, '→ integrated:', this.isIntegratedGPU);
  } catch {
    this.isIntegratedGPU = true; // fallback conservador
  }
}

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
    antialias: !this.isMobile,          // tablet + desktop: sí; móvil: no
    alpha: true,
    powerPreference: this.isFixedModel ? 'default' : 'high-performance',
  });
  this.renderer.setSize(container.clientWidth, container.clientHeight);
  
  const dpr = this.isMobile
    ? 0.85
    : this.isTablet
      ? Math.min(window.devicePixelRatio, 1.2)   // tablet: calidad razonable
      : this.isIntegratedGPU
        ? Math.min(window.devicePixelRatio, 1.0) // laptop integrada: fuerza 1x
        : Math.min(window.devicePixelRatio, 1.5);// desktop dedicada: máx 1.5x
  this.renderer.setPixelRatio(dpr);
  this.renderer.getContext().getExtension('EXT_texture_filter_anisotropic');
  this.renderer.shadowMap.enabled = false;

  container.appendChild(this.renderer.domElement);

  // ============================================================
  // CONFIGURACIÓN DE ILUMINACIÓN CENTRALIZADA Y ADAPTATIVA
  // ============================================================
  
  // 1. AMBIENT LIGHT (Casi nula en ambos para el look oscuro)
  const ambientIntensity = this.isMobile ? 0.01 : 0.02; // Súper oscuro en móvil
  const ambient = new THREE.AmbientLight(0xffffff, ambientIntensity);
  this.scene.add(ambient);

  // Inicializamos las luces sin posición aún
  this.keyLight = new THREE.DirectionalLight(0x00eaff);
  this.rimLight = new THREE.PointLight(0xff00aa);

  if (this.isMobile) {
    // ─── CONFIGURACIÓN SUTIL SÓLO PARA MÓVIL ──────────────────
    
    // Luz CIAN (Derecha): Menos potente para que no lave el color
    this.keyLight.intensity = 2.5; // Bajamos de 4.5 a 2.5
    // Posición: Bajita y a la derecha, pero no tan de frente
    this.keyLight.position.set(6, 2, 5); 

    // Luz MAGENTA (Izquierda): PointLight sutil y cercano
    this.rimLight.intensity = 12; // Bajamos de 25 a 12
    this.rimLight.distance = 12;   // Radio corto
    // Posición: La acercamos mucho al borde izquierdo del rostro
    this.rimLight.position.set(-3, 1, 3);

  } else {
    // ─── CONFIGURACIÓN DE ESCRITORIO (RESTAURADA A ORIGINAL) ──
    // *Esto asegura que el escritorio no cambie*
    
    // Luz CIAN (Derecha): Potencia media, posición alta
    this.keyLight.intensity = 2;
    this.keyLight.position.set(4, 5, 6); 

    // Luz MAGENTA (Izquierda): PointLight potente y lejano
    this.rimLight.intensity = 4;
    this.rimLight.distance = 40;
    // Posición: Muy arriba y atrás para bañar la silueta
    this.rimLight.position.set(-4, 2, 5);
  }

  // Añadimos las luces configuradas a la escena
  this.scene.add(this.keyLight);
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
        if (this.isMobile) {
          // Móvil: Phong, más barato
          n.material = new THREE.MeshPhongMaterial({
            color: 0x050505,
            specular: 0xffffff,
            shininess: 40,
            emissive: 0x000000
          });
        } else {
          // Tablet + laptop + desktop: PBR estándar
          n.material = new THREE.MeshStandardMaterial({
            color: 0xcfd8dc,
            metalness: 0.95,
            roughness: 0.25
          });
        }
        n.castShadow    = false;
        n.receiveShadow = false;
        n.frustumCulled = false;
      }
    });

    // Posición y escala según tier
    if (this.isFixedModel) {
      this.mainModelGroup.position.y = this.isMobile ? 0.5 : 0.3;
    }
    this.mainModelGroup.add(model);
    this.mainModelGroup.scale.setScalar(
      this.isMobile ? 3.5 : this.isTablet ? 4.5 : 5
    );
  });
}

  // ═══════════════════════════════════════════════════════════════
  // SCROLL
  // ═══════════════════════════════════════════════════════════════

  private setupScroll(): void {
    ScrollTrigger.config({ ignoreMobileResize: true });
    setTimeout(() => ScrollTrigger.refresh(), 300);
    setTimeout(() => ScrollTrigger.refresh(), 1200);

    // ── MODELO FIJO — móvil y tablet ──────────────────────────
    if (this.isFixedModel) {
      gsap.set('.hero-black-bg', { opacity: 0 });
      this.setupFixedModelObserver();
      setTimeout(() => this.initCounters(), 300);
      return; // sin animaciones de scroll para el modelo
    }

    // ── MODELO INTERACTIVO — laptop y desktop ─────────────────
    gsap.to('.hero-black-bg', {
      scrollTrigger: { trigger: '.about-section', start: 'top 90%', end: 'top 30%', scrub: true },
      opacity: 0
    });

    gsap.to(this.camera.position, {
      scrollTrigger: { trigger: '.about-section', start: 'top bottom', end: 'top center', scrub: 1 },
      z: 9
    });

    gsap.to(this, {
      scrollTrigger: {
        trigger: '.about-section', start: 'top center', end: 'bottom center', scrub: 1,
        onEnter:     () => { this.interactionEnabled = false; },
        onLeaveBack: () => { this.interactionEnabled = true; }
      },
      scrollRotationY: Math.PI - 0.5
    });

    gsap.to(this.mainModelGroup.position, {
      scrollTrigger: { trigger: '.about-section', start: 'top center', end: 'bottom center', scrub: 1 },
      x: 3
    });

    gsap.to(this, {
      scrollTrigger: { trigger: '.video-section', start: 'top center', end: 'bottom center', scrub: 1 },
      scrollRotationY: Math.PI - 0.2
    });

    gsap.to('.hm-canvas-blur', {
      scrollTrigger: { trigger: '.video-section', start: 'top 70%', end: 'top 20%', scrub: true },
      backgroundColor: 'rgba(2,2,2,0.55)', backdropFilter: 'blur(4px)', webkitBackdropFilter: 'blur(4px)'
    });
    gsap.to('.hm-canvas-blur', {
      scrollTrigger: { trigger: '.carousel-section', start: 'top 70%', end: 'top 30%', scrub: true },
      backgroundColor: 'rgba(2,2,2,0)', backdropFilter: 'blur(0px)', webkitBackdropFilter: 'blur(0px)'
    });

    this.initDataParticles();

    gsap.to(this.mainModelGroup.position, {
      scrollTrigger: { trigger: '.carousel-section', start: 'top center', end: 'bottom center', scrub: 1 },
      y: 7, z: -6
    });

    setTimeout(() => this.initCounters(), 300);
  }

  private setupFixedModelObserver(): void {
    const videoSection = document.querySelector('.video-section');
    if (!videoSection) return;

    let pastVideo = false;

    // Valores iniciales — deben coincidir con loadMainBust()
    const initialScale = this.isMobile ? 3.5 : 4.5;
    const initialY     = this.isMobile ? 0.5 : 0.3;
    const smallScale   = this.isMobile ? 2.2 : 3.0;
    const topY         = this.isMobile ? 4.2 : 3.8;
    const camZNear     = this.isMobile ? 14  : 11;
    const camZFar      = this.isMobile ? 20  : 16;

    const obs = new IntersectionObserver(entries => {
      const entry = entries[0];
      const scrolledPast = !entry.isIntersecting && entry.boundingClientRect.top < 0;

      if (scrolledPast && !pastVideo) {
        pastVideo = true;
        // Modelo se desplaza arriba y se reduce — efecto "queda arriba"
        gsap.to(this.mainModelGroup.position, { y: topY, x: 0, z: 0, duration: 0.7, ease: 'power2.inOut' });
        gsap.to(this.mainModelGroup.scale,    { x: smallScale, y: smallScale, z: smallScale, duration: 0.7, ease: 'power2.inOut' });
        gsap.to(this.camera.position,         { z: camZFar, duration: 0.7, ease: 'power2.inOut' });
      } else if (!scrolledPast && pastVideo) {
        pastVideo = false;
        // Vuelve al estado inicial al subir
        gsap.to(this.mainModelGroup.position, { y: initialY, x: 0, z: 0, duration: 0.7, ease: 'power2.inOut' });
        gsap.to(this.mainModelGroup.scale,    { x: initialScale, y: initialScale, z: initialScale, duration: 0.7, ease: 'power2.inOut' });
        gsap.to(this.camera.position,         { z: camZNear, duration: 0.7, ease: 'power2.inOut' });
      }
    }, { threshold: 0 });

    obs.observe(videoSection);
  }

    // ═══════════════════════════════════════════════════════════════
    // PARTÍCULAS THREE.js — solo desktop
    // ═══════════════════════════════════════════════════════════════

private addGlobalParticles(): void {
  // --- AJUSTE DE CANTIDAD: Menos es más ---
  // Reducimos drásticamente para limpiar el fondo.
  const count = this.isIntegratedGPU ? 300 : 600; // Antes era 900/1800

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();

  for (let i = 0; i < count; i++) {
    // --- DISTRIBUCIÓN EXPANSIVA ---
    // Aumentamos el rango de X e Y para que las partículas se alejen del centro (el rostro)
    // X: de -40 a 40 | Y: de -30 a 30
    positions[i * 3]     = (Math.random() - 0.5) * 80; 
    positions[i * 3 + 1] = (Math.random() - 0.5) * 60;
    
    // PROFUNDIDAD DINÁMICA
    // Z: Algunas muy cerca de la cámara, otras muy al fondo (de -100 a 20)
    // Esto crea el efecto de túnel o polvo estelar tecnológico
    const z = (Math.random() * 120) - 100;
    positions[i * 3 + 2] = z;
  
    // COLOR SEGÚN PROFUNDIDAD
    // Partículas lejanas (Z negativo alto) son más oscuras para dar profundidad real
    const depthFactor = (z + 100) / 120; // 0 a 1
    const l = 0.2 + (depthFactor * 0.5); 
    
    color.setHSL(0.55 + Math.random() * 0.1, 0.8, l);
    
    colors[i * 3]     = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // --- NUEVA CONFIGURACIÓN DE SHADER (MÁS NÍTIDA) ---
  const material = new THREE.ShaderMaterial({
    uniforms: {
      // AJUSTE DE TAMAÑO: Súper pequeñas para que sean puntos nítidos
      uSize: { value: this.isIntegratedGPU ? 10.0 : 15.0 }, // Antes era ~35.0
      // AJUSTE DE OPACIDAD: Más transparentes
      uOpacity: { value: 0.6 } // Antes era 0.8
    },
    vertexShader: `
      attribute vec3 color;
      varying vec3 vColor;
      uniform float uSize;
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
        // Atenuación de tamaño por distancia: más natural
        gl_PointSize = uSize * ( 300.0 / -mvPosition.z );
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      uniform float uOpacity;
      void main() {
        float dist = distance(gl_PointCoord, vec2(0.5));
        
        // BORDE DURO: Si está fuera del radio 0.5, desaparece.
        // Esto elimina las "manchas borrosas" por completo.
        if (dist > 0.5) discard;
        
        // Brillo interno extremadamente sutil (look "píxel redondo")
        float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
        
        gl_FragColor = vec4( vColor, alpha * uOpacity );
      }
    `,
    transparent: true,
    depthWrite: false,
    // Mantenemos AdditiveBlending porque los puntos son pequeños y no saturarán
    blending: THREE.AdditiveBlending 
  });

  this.particles = new THREE.Points(geometry, material);
  this.scene.add(this.particles);

  console.log(`[Particles] Optimizadas: ${count} puntos nítidos.`);
}

    // ═══════════════════════════════════════════════════════════════
    // LOOP — 30fps en móvil, 60fps en desktop
    // ═══════════════════════════════════════════════════════════════

    private animate = () => {
      this.animationId = requestAnimationFrame(this.animate);
    
      // Throttle por tier
      if (this.isFixedModel) {
        this.frameCount++;
        if (this.frameCount % 3 !== 0) return; // ~20fps en móvil y tablet
      } else if (this.isIntegratedGPU) {
        const isIdle = (performance.now() - this.lastInteractionTime) > this.IDLE_MS;
        if (isIdle) {
          this.frameCount++;
          if (this.frameCount % 2 !== 0) return; // ~30fps idle en laptop
        }
        // Con interacción activa → 60fps completos
      }
      // Desktop dedicado: siempre 60fps
    
      // Rotación del modelo
      if (this.isFixedModel) {
        // Estático: sin cursor ni scroll
        this.mainModelGroup.rotation.y = this.scrollRotationY; // Math.PI fijo
        this.mainModelGroup.rotation.x = 0;
      } else {
        const lerpFactor = this.isIntegratedGPU ? 0.04 : 0.05;
        this.mouseOffsetY += (this.targetMouseY - this.mouseOffsetY) * lerpFactor;
        this.mouseOffsetX += (this.targetMouseX - this.mouseOffsetX) * lerpFactor;
      
        if (!this.interactionEnabled) {
          this.mouseOffsetY *= 0.9;
          this.mouseOffsetX *= 0.9;
        }
      
        this.mainModelGroup.rotation.y = this.scrollRotationY + this.mouseOffsetY;
        this.mainModelGroup.rotation.x = this.mouseOffsetX;
      }
    
      this.keyLight.position.x = this.mainModelGroup.position.x + 2;
      this.keyLight.position.y = this.mainModelGroup.position.y + 3;
      this.rimLight.position.x = this.mainModelGroup.position.x - 3;
      this.rimLight.position.y = this.mainModelGroup.position.y + 1;
    
      if (this.particles) {
        this.particles.rotation.y += this.isIntegratedGPU ? 0.0004 : 0.0008;
      }
    
      this.renderer.render(this.scene, this.camera);
    };

  // ═══════════════════════════════════════════════════════════════
  // INTERACTION
  // ═══════════════════════════════════════════════════════════════

  private onMouseMove = (e: MouseEvent) => this.handleInteraction(e.clientX, e.clientY);
  private onTouchMove = (e: TouchEvent) => this.handleInteraction(e.touches[0].clientX, e.touches[0].clientY);

  private handleInteraction(x: number, y: number): void {
    if (!this.interactionEnabled || this.isFixedModel) return;
    this.lastInteractionTime = performance.now();
    const factor = 0.6;
    this.targetMouseY = (x / window.innerWidth  - 0.5) * factor;
    this.targetMouseX = (y / window.innerHeight - 0.5) * (factor / 2);
  }

  private onResize = () => {
    // Filtrar saltos de barra de herramientas en touch devices
    if (this.isFixedModel && Math.abs(window.innerWidth - this.lastWidth) < 50) {
      return;
    }
    this.lastWidth = window.innerWidth;
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