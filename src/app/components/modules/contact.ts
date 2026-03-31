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
      coords: [4.716206946669707, -74.2214449806638],
      type: 'primary',
      description: 'Sede principal · Desarrollo & Operaciones · Control central de IA',
      status: 'ACTIVO'
    },
    {
      name: 'PARQUE EMPRESARIAL TECNOLOGICO',
      coords: [4.744898764127665, -74.13999925725251],
      type: 'node',
      description: 'Hub tecnológico · Integración I+D · Conectividad empresarial',
      status: 'ACTIVO'
    },
    {
      name: 'CC UNILAGO',
      coords: [4.7477015490879735, -74.14109419381164],
      type: 'relay',
      description: 'Zona principal de distribución y mantenimiento, Hardware y Software',
      status: 'ACTIVO'
    },
    {
      name: 'CONNECTA 26',
      coords: [4.686678583155332, -74.12046307682988],
      type: 'sensor',
      description: 'Zona de empresas y startups tecnológicas.',
      status: 'ACTIVO'
    },
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
            setTimeout(() => this.initMap(), 150);
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
      const pad = (n: number) => String(n).padStart(2, '0');
      this.currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      this.cdr.detectChanges();
    };
    update();
    this.clockInterval = setInterval(update, 1000);
  }

  private initMap(): void {
    if (this.map) return;

    const initialCoords: L.LatLngTuple = [4.716206946669707, -74.2214449806638];

    this.map = L.map(this.mapContainer.nativeElement, {
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false,
      // Better touch handling for mobile
    }).setView(initialCoords, 13);

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      { maxZoom: 19 }
    ).addTo(this.map);

    // Keep map sized correctly on resize
    const onResize = () => {
      this.ngZone.run(() => this.map?.invalidateSize());
    };
    window.addEventListener('resize', onResize);

    this.techPoints.forEach(point => {
      const cfg = this.typeConfig[point.type];
      const half = cfg.size / 2;

      const customIcon = L.divIcon({
        className: `ck-mh ck-mh--${point.type}`,
        html: `<div class="ck-mp"></div><div class="ck-mc"></div>`,
        iconSize:      [cfg.size, cfg.size],
        iconAnchor:    [half, half],
        tooltipAnchor: [0, -(half + 8)]
      });

      const marker = L.marker(point.coords, { icon: customIcon }).addTo(this.map);

      const popup = `
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

      marker.bindPopup(popup, {
        className: 'ck-popup-wrap',
        closeButton: false,
        offset: [0, -(half + 6)],
        maxWidth: 240
      });

      const el = marker.getElement();
      if (el) {
        // Mouse events (desktop)
        el.addEventListener('mouseenter', () => marker.openPopup());
        el.addEventListener('mouseleave', () => setTimeout(() => marker.closePopup(), 300));

        // GSAP scale animation — only outside Angular zone
        this.ngZone.runOutsideAngular(() => {
          el.addEventListener('mouseenter', () => {
            gsap.to(el, { scale: 1.4, duration: 0.25, ease: 'back.out(2)' });
          });
          el.addEventListener('mouseleave', () => {
            gsap.to(el, { scale: 1, duration: 0.2, ease: 'power2.out' });
          });
          // Touch: toggle popup on tap
          el.addEventListener('touchend', (e) => {
            e.preventDefault();
            if (this.map.hasLayer(marker)) {
              marker.openPopup();
            }
          });
        });
      }
    });

    // Ensure map renders correctly after paint
    setTimeout(() => this.map.invalidateSize(), 250);
    setTimeout(() => this.map.invalidateSize(), 800);
  }

  public focusLocation(coords: L.LatLngTuple): void {
    if (!this.map) return;
    this.map.flyTo(coords, 16, { animate: true, duration: 1.2 });
  }

  public openGmail(
    to: string = 'jordanrodriguez1707@gmail.com',
    subject: string = 'KINELA_CONTACT',
    body: string = 'Hola, me gustaría obtener más información sobre KinelaID.'
  ): void {
    const url = `https://mail.google.com/mail/?view=cm&fs=1`
      + `&to=${encodeURIComponent(to)}`
      + `&su=${encodeURIComponent(subject)}`
      + `&body=${encodeURIComponent(body)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  ngOnDestroy(): void {
    if (this.map) this.map.remove();
    if (this.clockInterval) clearInterval(this.clockInterval);
  }
}