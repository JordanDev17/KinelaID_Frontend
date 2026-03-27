import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  HostListener,
  ViewChildren,
  QueryList,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';

export interface DevEntry {
  id: number;
  year: string;
  tag: string;
  category: 'ia' | 'hardware' | '3d' | 'ui';
  title: string;
  desc: string;
  img: string;
  wide?: boolean;
}

export interface DevFilter {
  key: string;
  label: string;
}

export interface DevPhase {
  key: string;
  label: string;
  period: string;
}

export interface Particle {
  x: number;
  delay: number;
  duration: number;
}

@Component({
  selector: 'app-devkinela',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './devkinela.html',
  styleUrl: './devkinela.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Devkinela implements OnInit, AfterViewInit, OnDestroy {

  // ── Exponer String a la template ──
  String = String;

  // ── Estado de filtro ──
  activeFilter: string = 'all';

  // ── Lightbox ──
  lightboxOpen  = false;
  lightboxEntry: DevEntry | null = null;
  lightboxIndex = 0;
  loopNav       = true;

  // ── Animación de cards (IntersectionObserver) ──
  visibleCards = new Set<number>();
  private observer!: IntersectionObserver;

  // ── Decoración ──
  gridLines  = Array(6);
  particles: Particle[] = [];
  timelineProgress = 100;

  // ── Filtros ──
  filters: DevFilter[] = [
    { key: 'all',      label: 'TODO'       },
    { key: 'ia',       label: 'MOTOR IA'   },
    { key: 'hardware', label: 'HARDWARE'   },
    { key: '3d',       label: 'MODELO 3D'  },
    { key: 'ui',       label: 'INTERFAZ'   },
  ];

  // ── Timeline de fases ──
  phases: DevPhase[] = [
    { key: 'ia',       label: 'IA ENGINE',  period: 'Q1·2025' },
    { key: 'hardware', label: 'HARDWARE',   period: 'Q2·2025' },
    { key: '3d',       label: '3D MODEL',   period: 'Q3·2025' },
    { key: 'ui',       label: 'UI SYSTEM',  period: 'Q4·2025' },
  ];

  // ── Entradas del archivo ──
entries: DevEntry[] = [
    {
      id: 1,
      year: '2025 · Q1',
      tag: 'MOTOR_IA',
      category: 'ia',
      title: 'Arquitectura del Núcleo: Face Recognition',
      desc: 'El nacimiento de KinelaID. Implementé el motor de reconocimiento sobre Django, '
          + 'logrando la extracción de encodings faciales con una precisión del 87%. '
          + 'Fue el primer paso para transformar una señal de video en datos de identidad seguros.',
      img: '/assets/images/dev/ia-engine-01.jpg', // Busca una captura del VS Code con los encodings en consola
      wide: true,
    },
    {
      id: 2,
      year: '2025 · Q1',
      tag: 'MOTOR_IA',
      category: 'ia',
      title: 'Malla Geométrica: 468 Landmarks con MediaPipe',
      desc: 'Evolucionamos de la detección simple a la biometría 3D. Integramos FaceMesh '
          + 'para mapear puntos críticos del rostro en tiempo real (< 80ms), permitiendo '
          + 'validaciones de vida y mayor resistencia a suplantaciones por fotos.',
      img: '/assets/images/dev/mediapipe-mesh.jpg', // Busca una captura donde se vea la malla verde sobre tu cara
    },
    {
      id: 3,
      year: '2025 · Q2',
      tag: 'HARDWARE',
      category: 'hardware',
      title: 'Nervio Óptico: Integración Raspberry Pi 4',
      desc: 'Construcción del primer prototipo físico (Busto). Configuramos el módulo de '
          + 'cámara IR y el bus de datos para el streaming directo hacia el servidor Django, '
          + 'superando retos de latencia y temperatura en el hardware embebido.',
      img: '/assets/images/dev/hardware-pi4.jpg', // Foto de la Raspberry con la cámara conectada
    },
    {
      id: 4,
      year: '2025 · Q2',
      tag: 'HARDWARE',
      category: 'hardware',
      title: 'Control de Acceso Físico (GPIO)',
      desc: 'El código se vuelve tangible. Implementamos la lógica de control para el Relay de 5V '
          + 'y el anillo LED de estado. Tras una autenticación exitosa, el sistema libera la cerradura '
          + 'electromagnética, cerrando el ciclo de seguridad física.',
      img: '/assets/images/dev/relay-control.jpg', // Foto del cableado o el anillo LED encendido
    },
    {
      id: 5,
      year: '2025 · Q3',
      tag: 'MODELO_3D',
      category: '3d',
      title: 'Gemelo Digital: Modelado en Blender',
      desc: 'Diseñamos la réplica exacta del hardware en 3D. Aplicamos materiales PBR '
          + 'y optimizamos la malla para exportación .glb, asegurando que el modelo '
          + 'fuera visualmente impactante sin sacrificar el rendimiento web.',
      img: '/assets/images/dev/blender-modeling.jpg', // Captura de la interfaz de Blender con el modelo
      wide: true,
    },
    {
      id: 6,
      year: '2025 · Q3',
      tag: 'MODELO_3D',
      category: '3d',
      title: 'Renderizado en Tiempo Real (Three.js)',
      desc: 'Llevamos el modelo a la web. Usamos Three.js en Angular para renderizar el busto '
          + 'con iluminación HDRI y post-procesado Bloom, permitiendo que el usuario interactúe '
          + 'con el dispositivo en un entorno 3D fluido.',
      img: '/assets/images/dev/threejs-render.jpg', // Captura del modelo rotando en tu web
    },
    {
      id: 7,
      year: '2025 · Q4',
      tag: 'UI_SYSTEM',
      category: 'ui',
      title: 'CCTV Dashboard & WebSockets',
      desc: 'Desarrollamos el centro de mando. Un panel administrativo que recibe logs de acceso '
          + 'en tiempo real mediante WebSockets, permitiendo la gestión remota de usuarios '
          + 'y el monitoreo constante del flujo de seguridad.',
      img: '/assets/images/dev/dashboard-ui.jpg', // Captura del panel con las gráficas o la lista de logs
    },
    {
      id: 8,
      year: '2026 · Q1',
      tag: 'UI_SYSTEM',
      category: 'ui',
      title: 'Experiencia Kinela v3.0: GSAP & Partículas',
      desc: 'Pulido final de la interfaz. Implementamos animaciones fluidas con GSAP y un '
          + 'sistema de partículas reactivo para la landing page, consolidando la identidad '
          + 'visual de Kinela Future Tech como una startup de vanguardia.',
      img: '/assets/images/dev/final-landing.jpg', // Captura de la home actual con el hero 3D
    },
  ];

  // ──────────────────────────────────────
  constructor(private cdr: ChangeDetectorRef) {}

  // ──────────────────────────────────────
  ngOnInit(): void {
    this.buildParticles();
  }

  ngAfterViewInit(): void {
    this.initIntersectionObserver();
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    document.body.style.overflow = '';
  }

  // ── Getters ──────────────────────────

  get filtered(): DevEntry[] {
    return this.activeFilter === 'all'
      ? this.entries
      : this.entries.filter(e => e.category === this.activeFilter);
  }

  getFilterCount(key: string): number {
    return key === 'all'
      ? this.entries.length
      : this.entries.filter(e => e.category === key).length;
  }

  getCatLabel(cat: string): string {
    const map: Record<string, string> = {
      ia: 'MOTOR IA', hardware: 'HARDWARE', '3d': 'MODELO 3D', ui: 'INTERFAZ',
    };
    return map[cat] ?? cat.toUpperCase();
  }

  getYearSpan(): number {
    return 5; // Q1·2025 → Q1·2026
  }

  // ── Acciones ─────────────────────────

  setFilter(key: string): void {
    this.activeFilter = key;
    this.timelineProgress = key === 'all' ? 100 :
      (this.phases.findIndex(p => p.key === key) + 1) * 25;
    this.cdr.markForCheck();
    // Re-lanzar observer para nuevas cards
    setTimeout(() => this.observeCards(), 50);
  }

  openLightbox(entry: DevEntry): void {
    this.lightboxEntry = entry;
    this.lightboxIndex = this.filtered.findIndex(e => e.id === entry.id);
    this.lightboxOpen  = true;
    document.body.style.overflow = 'hidden';
    this.cdr.markForCheck();
  }

  closeLightbox(): void {
    this.lightboxOpen  = false;
    this.lightboxEntry = null;
    document.body.style.overflow = '';
    this.cdr.markForCheck();
  }

  prevEntry(): void {
    const n = this.filtered.length;
    this.lightboxIndex = (this.lightboxIndex - 1 + n) % n;
    this.lightboxEntry = this.filtered[this.lightboxIndex];
    this.cdr.markForCheck();
  }

  nextEntry(): void {
    const n = this.filtered.length;
    this.lightboxIndex = (this.lightboxIndex + 1) % n;
    this.lightboxEntry = this.filtered[this.lightboxIndex];
    this.cdr.markForCheck();
  }

  jumpTo(i: number): void {
    this.lightboxIndex = i;
    this.lightboxEntry = this.filtered[i];
    this.cdr.markForCheck();
  }

  // ── Imagen fallback ──────────────────

  onImgLoad(e: Event): void {
    const img = e.target as HTMLImageElement;
    img.style.opacity = '1';
  }

onImgError(e: Event): void {
  const img = e.target as HTMLImageElement;
  // En lugar de ocultarla, pon una imagen genérica de "Sistema"
  img.src = '/assets/images/dev/ia-01.jpg'; 
  img.style.opacity = '0.5';
}

  // ── Keyboard ─────────────────────────

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (!this.lightboxOpen) return;
    if (e.key === 'Escape')     this.closeLightbox();
    if (e.key === 'ArrowRight') this.nextEntry();
    if (e.key === 'ArrowLeft')  this.prevEntry();
  }

  // ── IntersectionObserver para stagger ─

  private initIntersectionObserver(): void {
    if (typeof IntersectionObserver === 'undefined') {
      this.entries.forEach(e => this.visibleCards.add(e.id));
      this.cdr.markForCheck();
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        let changed = false;
        entries.forEach(entry => {
          const id = Number((entry.target as HTMLElement).dataset['id']);
          if (entry.isIntersecting && !this.visibleCards.has(id)) {
            this.visibleCards.add(id);
            changed = true;
          }
        });
        if (changed) this.cdr.markForCheck();
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );

    this.observeCards();
  }

  private observeCards(): void {
    if (!this.observer) return;
    document.querySelectorAll('.dc-card').forEach((el, i) => {
      const id = this.filtered[i]?.id;
      if (id !== undefined) {
        (el as HTMLElement).dataset['id'] = String(id);
        this.observer.observe(el);
      }
    });
  }

  // ── Partículas ───────────────────────

  private buildParticles(): void {
    this.particles = Array.from({ length: 18 }, () => ({
      x:        Math.random() * 100,
      delay:    Math.random() * 8,
      duration: 10 + Math.random() * 12,
    }));
  }
}