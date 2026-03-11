import {
  Component,
  AfterViewInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  NgZone,
  ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';
import gsap from 'gsap';

interface TechPoint {
  name: string;
  coords: L.LatLngTuple;
  type: 'primary' | 'node' | 'relay' | 'sensor';
  description: string;
  status: string;
}

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './contact.html',
  styleUrl: './contact.css'
})
export class Contact implements AfterViewInit, OnDestroy {

  @ViewChild('mapContainer') mapContainer!: ElementRef<HTMLDivElement>;
  private map!: L.Map;
  private clockInterval!: ReturnType<typeof setInterval>;

  public currentTime = '';

  public techPoints: TechPoint[] = [
    {
      name: 'HQ_KINELA',
      coords: [4.7059, -74.2302],
      type: 'primary',
      description: 'Sede principal · Desarrollo & Operaciones',
      status: 'ACTIVO'
    },
    {
      name: 'NODE_RELAY_ALPHA',
      coords: [4.7130, -74.2150],
      type: 'relay',
      description: 'Nodo de redundancia · Failover automático',
      status: 'STANDBY'
    },
    {
      name: 'SENSOR_GRID_01',
      coords: [4.6980, -74.2380],
      type: 'sensor',
      description: 'Punto de monitoreo · Reconocimiento facial',
      status: 'ACTIVO'
    },
    {
      name: 'DATACENTER_WEST',
      coords: [4.7100, -74.2450],
      type: 'node',
      description: 'Centro de datos · Procesamiento edge',
      status: 'ACTIVO'
    }
  ];

  private typeConfig: Record<string, { size: number }> = {
    primary: { size: 36 },
    relay:   { size: 28 },
    sensor:  { size: 26 },
    node:    { size: 28 }
  };

  constructor(
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  ngAfterViewInit(): void {
    this.startClock();

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          this.ngZone.runOutsideAngular(() => {
            setTimeout(() => {
              this.initMap();
              this.initAnimations();
            }, 150);
          });
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(this.mapContainer.nativeElement);
  }

  private startClock(): void {
    const update = () => {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      this.currentTime = `${h}:${m}:${s}`;
      this.cdr.detectChanges();
    };
    update();
    this.clockInterval = setInterval(update, 1000);
  }

  private initMap(): void {
    if (this.map) return;

    const initialCoords: L.LatLngTuple = [4.7059, -74.2302];

    this.map = L.map(this.mapContainer.nativeElement, {
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false
    }).setView(initialCoords, 14);

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      { maxZoom: 19 }
    ).addTo(this.map);

    this.techPoints.forEach(point => {
      const cfg = this.typeConfig[point.type];
      const half = cfg.size / 2;

      /*
       * IMPORTANTE: Las clases .ck-mh, .ck-mh--*, .ck-mp, .ck-mc
       * deben estar en styles.css GLOBAL.
       * Leaflet crea los divIcon fuera del DOM de Angular,
       * por lo que el encapsulado _ngcontent no aplica.
       */
      const customIcon = L.divIcon({
        className: `ck-mh ck-mh--${point.type}`,
        html: `
          <div class="ck-mp"></div>
          <div class="ck-mc"></div>
        `,
        iconSize:      [cfg.size, cfg.size],
        iconAnchor:    [half, half],
        tooltipAnchor: [0, -(half + 8)]
      });

      const marker = L.marker(point.coords, { icon: customIcon }).addTo(this.map);

      const popupContent = `
        <div class="ck-popup">
          <div class="ck-popup-header">
            <span class="ck-popup-type">${point.type.toUpperCase()}</span>
            <span class="ck-popup-status ck-popup-status--${point.status.toLowerCase()}">${point.status}</span>
          </div>
          <div class="ck-popup-name">${point.name}</div>
          <div class="ck-popup-desc">${point.description}</div>
          <div class="ck-popup-coords">${point.coords[0].toFixed(4)}° N · ${Math.abs(point.coords[1]).toFixed(4)}° W</div>
        </div>
      `;

      marker.bindPopup(popupContent, {
        className: 'ck-popup-wrap',
        closeButton: false,
        offset: [0, -(half + 6)],
        maxWidth: 240
      });

      const el = marker.getElement();
      if (el) {
        el.addEventListener('mouseenter', () => marker.openPopup());
        el.addEventListener('mouseleave', () => {
          setTimeout(() => marker.closePopup(), 300);
        });

        this.ngZone.runOutsideAngular(() => {
          el.addEventListener('mouseenter', () => {
            gsap.to(el, { scale: 1.4, duration: 0.25, ease: 'back.out(2)' });
          });
          el.addEventListener('mouseleave', () => {
            gsap.to(el, { scale: 1, duration: 0.2, ease: 'power2.out' });
          });
        });
      }
    });

    setTimeout(() => this.map.invalidateSize(), 250);
    setTimeout(() => this.map.invalidateSize(), 750);
  }

  public focusLocation(coords: L.LatLngTuple): void {
    if (!this.map) return;
    this.map.flyTo(coords, 16, { animate: true, duration: 1.5 });
  }

  public openGmail(): void {
    window.open(
      `https://mail.google.com/mail/?view=cm&fs=1&to=j.rodriguez.dev@gmail.com&su=KINELA_CONTACT`,
      '_blank'
    );
  }

  private initAnimations(): void {
    // Estado inicial — evita flash al re-visitar
    gsap.set('.ck-header', { opacity: 0, y: -30 });
    gsap.set('.ck-col-labels', { opacity: 0 });
    gsap.set('.ck-panel', { opacity: 0, x: -24 });
    gsap.set('.ck-footer-row', { opacity: 0 });
    gsap.set('.ck-map-col', { opacity: 0, x: 24 });

    const tl = gsap.timeline({ delay: 0.05 });

    // 1. Header cae desde arriba
    tl.to('.ck-header', {
      opacity: 1,
      y: 0,
      duration: 0.7,
      ease: 'power3.out'
    });

    // 2. Labels de columna
    tl.to('.ck-col-labels', {
      opacity: 1,
      duration: 0.4,
      ease: 'power2.out'
    }, '-=0.3');

    // 3. Paneles en cascada desde izquierda
    tl.to('.ck-panel', {
      opacity: 1,
      x: 0,
      duration: 0.55,
      stagger: 0.09,
      ease: 'power3.out'
    }, '-=0.2');

    // 4. Footer
    tl.to('.ck-footer-row', {
      opacity: 1,
      duration: 0.4,
      ease: 'power2.out'
    }, '-=0.3');

    // 5. Mapa desde derecha, en paralelo con los paneles
    tl.to('.ck-map-col', {
      opacity: 1,
      x: 0,
      duration: 0.8,
      ease: 'expo.out'
    }, 0.4); // empieza a los 0.4s absolutos de la timeline
  }

  ngOnDestroy(): void {
    if (this.map) this.map.remove();
    if (this.clockInterval) clearInterval(this.clockInterval);
  }
}