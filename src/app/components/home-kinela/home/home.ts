import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy
} from '@angular/core';
import { Router } from '@angular/router';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Contact } from '../../modules/contact';
import { Services } from "../../modules/services";

gsap.registerPlugin(ScrollTrigger);

@Component({
  selector: 'app-home',
  imports: [Contact, Services],
  standalone: true,
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements AfterViewInit, OnDestroy {

  constructor(private router: Router) {}

  @ViewChild('canvasContainer', { static: true })
  canvasRef!: ElementRef<HTMLDivElement>;

  @ViewChild('videoTeaser')
  videoTeaserRef?: ElementRef<HTMLVideoElement>;

  @ViewChild('videoFull')
  videoFullRef?: ElementRef<HTMLVideoElement>;

  // ── THREE.js ──
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private keyLight!: THREE.DirectionalLight;
  private rimLight!: THREE.PointLight;
  private mainModelGroup = new THREE.Group();
  private particles!: THREE.Points;
  private animationId!: number;

  // ── Rotaciones separadas ──
  private scrollRotationY = Math.PI;
  private mouseOffsetY = 0;
  private mouseOffsetX = 0;
  private targetMouseY = 0;
  private targetMouseX = 0;
  private interactionEnabled = true;

  // ── UI state ──
  public titleChars = 'KINELA·TECH'.split('');
  public videoModalOpen = false;

  // ── Cursor ──
  private cursorDot!: HTMLElement;
  private cursorRing!: HTMLElement;
  private cursorVisible = false;

  // ============================
  // LIFECYCLE
  // ============================

  ngAfterViewInit(): void {
    this.initThree();
    this.addGlobalParticles();
    this.loadMainBust();
    this.setupScroll();
    this.animate();

    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('touchmove', this.onTouchMove);
    window.addEventListener('resize', this.onResize);

    // Inicializar sistemas de UI
    this.initCursor();
    this.initNavProgress();
    this.initHUD();
    this.initSectionDividerAnimations();
    this.initContactAnimation();
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animationId);
    this.renderer.dispose();
    ScrollTrigger.getAll().forEach(t => t.kill());

    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('touchmove', this.onTouchMove);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('mousemove', this.onCursorMove);
    document.removeEventListener('mouseenter', this.onDocumentMouseEnter);
    document.removeEventListener('mouseleave', this.onDocumentMouseLeave);
  }

  // ============================
  // NAVEGACIÓN
  // ============================

  public goToLogin(): void {
    gsap.to('.page-container', {
      opacity: 0,
      duration: 0.6,
      onComplete: () => {
        this.router.navigate(['/login']);
      }
    });
  }

  // ============================
  // VIDEO MODAL
  // ============================

  public openVideoModal(): void {
    this.videoModalOpen = true;
    document.body.style.overflow = 'hidden';
  }

  public closeVideoModal(): void {
    this.videoModalOpen = false;
    document.body.style.overflow = '';

    // Pausar el video al cerrar
    if (this.videoFullRef?.nativeElement) {
      this.videoFullRef.nativeElement.pause();
      this.videoFullRef.nativeElement.currentTime = 0;
    }
  }

  // ============================
  // CURSOR PERSONALIZADO
  // ============================

  private initCursor(): void {
    this.cursorDot  = document.querySelector('.hm-cursor') as HTMLElement;
    this.cursorRing = document.querySelector('.hm-cursor-ring') as HTMLElement;

    if (!this.cursorDot || !this.cursorRing) return;

    // Ocultar hasta que el mouse entre
    gsap.set([this.cursorDot, this.cursorRing], { opacity: 0 });

    window.addEventListener('mousemove', this.onCursorMove);
    document.addEventListener('mouseenter', this.onDocumentMouseEnter);
    document.addEventListener('mouseleave', this.onDocumentMouseLeave);

    // Efecto hover en elementos interactivos
    // Usamos un pequeño delay para que el DOM esté completamente renderizado
    setTimeout(() => {
      const interactables = document.querySelectorAll(
        'button, a, .hm-tech-tag, .hm-manifesto-card, .hm-vf-chip, .hm-tl-icon, .hm-timeline-item'
      );

      interactables.forEach(el => {
        el.addEventListener('mouseenter', () => {
          gsap.to(this.cursorRing, {
            scale: 2.2,
            borderColor: 'rgba(0, 240, 255, 0.9)',
            duration: 0.3,
            ease: 'power2.out'
          });
          gsap.to(this.cursorDot, { scale: 0.5, duration: 0.2 });
        });

        el.addEventListener('mouseleave', () => {
          gsap.to(this.cursorRing, {
            scale: 1,
            borderColor: 'rgba(0, 240, 255, 0.5)',
            duration: 0.4,
            ease: 'power2.out'
          });
          gsap.to(this.cursorDot, { scale: 1, duration: 0.2 });
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

    gsap.to(this.cursorDot, {
      x: e.clientX,
      y: e.clientY,
      duration: 0.02
    });

    gsap.to(this.cursorRing, {
      x: e.clientX,
      y: e.clientY,
      duration: 0.14,
      ease: 'power2.out'
    });
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

  // ============================
  // NAV PROGRESS BAR
  // ============================

  private initNavProgress(): void {
    const fill = document.querySelector('.hm-nav-progress-fill') as HTMLElement;
    if (!fill) return;

    ScrollTrigger.create({
      trigger: '.page-container',
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        fill.style.width = `${self.progress * 100}%`;
      }
    });
  }

  // ============================
  // HUD AMBIENT
  // ============================

  private initHUD(): void {
    const depthEl  = document.querySelector('.hm-hud-depth') as HTMLElement;
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

  // ============================
  // SECTION DIVIDERS — partículas de sección
  // ============================

  private initSectionDividerAnimations(): void {
    // Las partículas de los divisores ya son CSS puro (@keyframes hm-divider-travel)
    // Aquí añadimos el reveal de cada divisor con ScrollTrigger
    const dividers = document.querySelectorAll('.hm-section-divider');

    dividers.forEach(div => {
      gsap.from(div, {
        scrollTrigger: {
          trigger: div,
          start: 'top 90%',
          toggleActions: 'play none none reverse'
        },
        opacity: 0,
        scaleX: 0.8,
        transformOrigin: 'center',
        duration: 0.6,
        ease: 'power2.out'
      });
    });
  }

  // ============================
  // COUNTERS ANIMADOS
  // ============================

  private initCounters(): void {
    const counters = document.querySelectorAll('.hm-count[data-count]');

    counters.forEach(el => {
      const target = parseInt(el.getAttribute('data-count') || '0', 10);
      const isLarge = target > 9999;

      ScrollTrigger.create({
        trigger: el,
        start: 'top 88%',
        once: true,
        onEnter: () => {
          const obj = { val: 0 };
          gsap.to(obj, {
            val: target,
            duration: 2.2,
            ease: 'power2.out',
            onUpdate: () => {
              const v = Math.round(obj.val);
              // Formatear números grandes: 1000000 → 1M
              if (isLarge) {
                el.textContent = (v >= 1000000)
                  ? `${(v / 1000000).toFixed(1)}M`
                  : v.toString();
              } else {
                el.textContent = v.toString();
              }
            }
          });
        }
      });
    });
  }

  // ============================
  // DATA PARTICLES — líneas hex flotantes
  // ============================

  private initDataParticles(): void {
    const container = document.querySelector('.hm-particles-container') as HTMLElement;
    if (!container) return;

    const hexStrings = [
      '0x7F · 0xA3 · 0x2B',
      'ID::SCAN_OK',
      '> AUTH_TOKEN',
      '0xFF · 0x00 · 0x44',
      'FACE_MATCH::0.997',
      '< KINELA_V3',
      'EMBED[468]::OK',
      '> GRANT_ACCESS',
    ];

    ScrollTrigger.create({
      trigger: '.video-section',
      start: 'top 55%',
      once: true,
      onEnter: () => {
        // Determinar posición del modelo (lado derecho) vs video (centro)
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        hexStrings.forEach((text, i) => {
          const el = document.createElement('span');
          el.className = 'hm-data-particle';
          el.textContent = text;
          container.appendChild(el);

          // Las partículas flotan desde el lado derecho (donde está el modelo)
          // hacia el centro (donde está el video)
          const startX = vw * 0.72 + (Math.random() - 0.5) * 80;
          const startY = vh * 0.35 + Math.random() * vh * 0.3;
          const endX   = vw * 0.4  + (Math.random() - 0.5) * 200;
          const endY   = vh * 0.4  + (Math.random() - 0.5) * 100;

          gsap.fromTo(el,
            { x: startX, y: startY, opacity: 0, scale: 0.8 },
            {
              x: endX,
              y: endY,
              opacity: 0.8,
              scale: 1,
              duration: 1,
              delay: i * 0.12,
              ease: 'power2.out',
              onComplete: () => {
                gsap.to(el, {
                  opacity: 0,
                  y: endY - 30,
                  duration: 1.8,
                  delay: 0.4 + i * 0.05,
                  ease: 'power1.in',
                  onComplete: () => el.remove()
                });
              }
            }
          );
        });
      }
    });
  }

  // ============================
  // CONTACT — fix de animación
  // ============================

  private initContactAnimation(): void {
    // Apuntamos al wrapper .hm-contact-section, no al componente directamente,
    // para evitar que ScrollTrigger pierda la referencia en componentes standalone
    const section = document.querySelector('.hm-contact-section');
    if (!section) return;

    gsap.from(section, {
      scrollTrigger: {
        trigger: section,
        start: 'top 82%',
        toggleActions: 'play none none none',
        once: true
      },
      y: 70,
      opacity: 0,
      duration: 1.1,
      ease: 'power3.out'
    });
  }

  // ============================
  // THREE CORE
  // ============================

  private initThree(): void {
    const container = this.canvasRef.nativeElement;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x020202, 0.018);

    this.camera = new THREE.PerspectiveCamera(
      35,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );

    this.camera.position.set(0, 0, 11);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);

    this.keyLight = new THREE.DirectionalLight(0x00eaff, 2);
    this.keyLight.position.set(4, 5, 6);
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.PointLight(0xff00aa, 4, 40);
    this.rimLight.position.set(-4, 2, 5);
    this.scene.add(this.rimLight);

    this.scene.add(this.mainModelGroup);
  }

  // ============================
  // BUSTO 3D
  // ============================

  private loadMainBust(): void {
    new GLTFLoader().load('/assets/models/model-headface.glb', (gltf) => {
      const model = gltf.scene;

      model.traverse((n: any) => {
        if (n.isMesh) {
          n.material = new THREE.MeshStandardMaterial({
            color: 0xcfd8dc,
            metalness: 0.95,
            roughness: 0.25
          });
        }
      });

      this.mainModelGroup.add(model);
      this.mainModelGroup.scale.setScalar(5);

      this.runIntro();
    });
  }

  // ============================
  // SCROLL CONTROL
  // ⚠️ Triggers CRÍTICOS — dependen de .about-section y .carousel-section
  // ============================

  private setupScroll(): void {

    // ── Fade del fondo negro al salir del hero ──
    gsap.to('.hero-black-bg', {
      scrollTrigger: {
        trigger: '.about-section',
        start: 'top 90%',
        end: 'top 30%',
        scrub: true
      },
      opacity: 0
    });

    // ── Zoom de cámara al entrar en about ──
    gsap.to(this.camera.position, {
      scrollTrigger: {
        trigger: '.about-section',
        start: 'top bottom',
        end: 'top center',
        scrub: 1
      },
      z: 9
    });

    // ── Rotación del modelo en about ──
    gsap.to(this, {
      scrollTrigger: {
        trigger: '.about-section',
        start: 'top center',
        end: 'bottom center',
        scrub: 1,
        onEnter:     () => { this.interactionEnabled = false; },
        onLeaveBack: () => { this.interactionEnabled = true;  }
      },
      scrollRotationY: Math.PI - 0.5
    });

    // ── Desplazamiento lateral del modelo (about) ──
    gsap.to(this.mainModelGroup.position, {
      scrollTrigger: {
        trigger: '.about-section',
        start: 'top center',
        end: 'bottom center',
        scrub: 1
      },
      x: 3
    });

    // ── VIDEO SECTION: modelo gira levemente hacia el centro
    //    como si "mirara" el video ──
    gsap.to(this, {
      scrollTrigger: {
        trigger: '.video-section',
        start: 'top center',
        end: 'bottom center',
        scrub: 1
      },
      scrollRotationY: Math.PI - 0.2
    });

    // ── VIDEO SECTION: canvas se difumina para poner video en primer plano ──
    gsap.to('.hm-canvas-blur', {
      scrollTrigger: {
        trigger: '.video-section',
        start: 'top 70%',
        end: 'top 20%',
        scrub: true
      },
      backgroundColor: 'rgba(2, 2, 2, 0.55)',
      backdropFilter: 'blur(4px)',
      webkitBackdropFilter: 'blur(4px)',
    });

    // Deshacer el blur al salir de video section
    gsap.to('.hm-canvas-blur', {
      scrollTrigger: {
        trigger: '.carousel-section',
        start: 'top 70%',
        end: 'top 30%',
        scrub: true
      },
      backgroundColor: 'rgba(2, 2, 2, 0)',
      backdropFilter: 'blur(0px)',
      webkitBackdropFilter: 'blur(0px)',
    });

    // Inicializar partículas cuando video section sea visible
    this.initDataParticles();

    // ── Salida del modelo al llegar a carousel-section ──
    gsap.to(this.mainModelGroup.position, {
      scrollTrigger: {
        trigger: '.carousel-section',
        start: 'top center',
        end: 'bottom center',
        scrub: 1
      },
      y: 7,
      z: -6
    });

    // ── Counters al entrar la banda de métricas ──
    // Los inicializamos con un pequeño delay para que ScrollTrigger
    // haya calculado todas las posiciones primero
    setTimeout(() => this.initCounters(), 300);
  }

  // ============================
  // PARTICLES
  // ============================

  private addGlobalParticles(): void {
    const count = 3000;
    const geometry = new THREE.BufferGeometry();
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

    const texture = new THREE.TextureLoader().load('assets/textures/particle.png');

    const material = new THREE.PointsMaterial({
      size: 0.6,
      map: texture,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  }

  // ============================
  // LOOP DE ANIMACIÓN
  // ============================

  private animate = () => {
    this.animationId = requestAnimationFrame(this.animate);

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

  // ============================
  // INTERACTION
  // ============================

  private onMouseMove = (e: MouseEvent) =>
    this.handleInteraction(e.clientX, e.clientY);

  private onTouchMove = (e: TouchEvent) =>
    this.handleInteraction(e.touches[0].clientX, e.touches[0].clientY);

  private handleInteraction(x: number, y: number): void {
    if (!this.interactionEnabled) return;
    this.targetMouseY = (x / window.innerWidth  - 0.5) * 0.6;
    this.targetMouseX = (y / window.innerHeight - 0.5) * 0.3;
  }

  private onResize = () => {
    const container = this.canvasRef.nativeElement;
    this.camera.aspect = container.clientWidth / container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    ScrollTrigger.refresh();
  };

  // ============================
  // INTRO ANIMACIÓN — con scan line
  // ============================

  private runIntro(): void {
    // 1. Crear scan line de sistema
    const scanLine = document.createElement('div');
    scanLine.style.cssText = `
      position: fixed;
      top: 50%;
      left: 0;
      width: 100vw;
      height: 2px;
      background: linear-gradient(90deg, transparent, #00f0ff, transparent);
      box-shadow: 0 0 16px rgba(0, 240, 255, 0.8);
      z-index: 9990;
      pointer-events: none;
      transform-origin: left center;
    `;
    document.body.appendChild(scanLine);

    // 2. Timeline de entrada
    const tl = gsap.timeline({
      onComplete: () => {
        gsap.to(scanLine, {
          opacity: 0,
          duration: 0.3,
          onComplete: () => scanLine.remove()
        });
      }
    });

    // Scan line barre la pantalla
    tl.fromTo(scanLine,
      { scaleX: 0, opacity: 0 },
      { scaleX: 1, opacity: 0.9, duration: 0.55, ease: 'power2.inOut' }
    )
    .to(scanLine, { opacity: 0, duration: 0.2 })

    // Chars del título entran
    .from('.hm-char', {
      opacity: 0,
      y: 55,
      stagger: 0.05,
      duration: 1.1,
      ease: 'power4.out'
    }, '-=0.05')

    // Eyebrow
    .from('.hm-hero-eyebrow', {
      opacity: 0,
      y: 18,
      duration: 0.7
    }, '-=0.85')

    // Separador + subtítulo
    .from('.hm-separator, .hm-subtitle', {
      opacity: 0,
      y: 14,
      stagger: 0.12,
      duration: 0.6
    }, '-=0.6')

    // Stats del hero
    .from('.hm-hero-stats', {
      opacity: 0,
      y: 10,
      duration: 0.5
    }, '-=0.45')

    // Scroll cue
    .from('.hm-scroll-cue', {
      opacity: 0,
      duration: 0.5
    }, '-=0.35')

    // Esquinas del hero
    .from('.hm-hero-corner', {
      opacity: 0,
      scale: 0.5,
      stagger: 0.08,
      duration: 0.4,
      transformOrigin: 'center center'
    }, '-=0.4')

    // HUD
    .from('.hm-hud', {
      opacity: 0,
      x: 20,
      duration: 0.6,
      ease: 'power2.out'
    }, '-=0.3');
  }
}