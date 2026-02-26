import { Injectable } from '@angular/core';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

@Injectable({
  providedIn: 'root'
})
export class Background {

  private initialized = false;

  constructor() { }

  /**
   * Inicializa el fondo animado
   * Debe llamarse cuando el DOM ya esté renderizado
   */
  initAnimatedBackground(containerId: string = 'animated-bg'): void {

    if (this.initialized) {
      console.warn('⚠️ Background ya inicializado');
      return;
    }

    const container = document.getElementById(containerId);

    if (!container) {
      console.error('❌ No se encontró el contenedor del background');
      return;
    }

    console.log('🎨 Inicializando background...');

    container.innerHTML = '';

    this.createGradientLayer(container);
    this.createGridLayer(container);
    this.createBlurCircles(container);
    this.createFloatingShapes(container);
    this.createScanLines(container);
    this.createDataStreams(container);

    this.initParallaxEffects();

    this.initialized = true;
    console.log('✅ Background inicializado correctamente');
  }

  private createGradientLayer(container: HTMLElement): void {
    const layer = document.createElement('div');
    layer.className = 'bg-gradient-layer';
    container.appendChild(layer);
  }

  private createGridLayer(container: HTMLElement): void {
    const layer = document.createElement('div');
    layer.className = 'bg-grid-layer';
    container.appendChild(layer);
  }

  private createBlurCircles(container: HTMLElement): void {
    const layer = document.createElement('div');
    layer.className = 'bg-circles-layer';

    const colors = [
      'rgba(59, 130, 246, 0.4)',
      'rgba(139, 92, 246, 0.35)',
      'rgba(6, 182, 212, 0.4)',
      'rgba(0, 255, 136, 0.3)',
      'rgba(236, 72, 153, 0.35)'
    ];

    for (let i = 0; i < 5; i++) {
      const circle = document.createElement('div');
      circle.className = `blur-circle blur-circle-${i + 1}`;
      circle.style.background = `radial-gradient(circle, ${colors[i]} 0%, transparent 70%)`;
      layer.appendChild(circle);
    }

    container.appendChild(layer);
  }

  private createFloatingShapes(container: HTMLElement): void {
    const layer = document.createElement('div');
    layer.className = 'floating-shapes-layer';

    const createShape = (className: string, count: number) => {
      for (let i = 0; i < count; i++) {
        const shape = document.createElement('div');
        shape.className = `floating-shape ${className}`;
        shape.style.top = `${Math.random() * 100}%`;
        shape.style.left = `${Math.random() * 100}%`;
        shape.style.animationDelay = `${Math.random() * 5}s`;
        shape.style.animationDuration = `${8 + Math.random() * 6}s`;
        layer.appendChild(shape);
      }
    };

    createShape('shape-circle', 15);
    createShape('shape-diamond', 10);
    createShape('shape-star', 12);
    createShape('shape-hexagon', 8);

    container.appendChild(layer);
  }

  private createScanLines(container: HTMLElement): void {
    const layer = document.createElement('div');
    layer.className = 'scan-lines-layer';

    for (let i = 0; i < 10; i++) {
      const line = document.createElement('div');
      line.className = 'scan-line-bg';
      line.style.top = `${Math.random() * 100}%`;
      line.style.animationDelay = `${Math.random() * 6}s`;
      line.style.animationDuration = `${8 + Math.random() * 4}s`;
      layer.appendChild(line);
    }

    container.appendChild(layer);
  }

  private createDataStreams(container: HTMLElement): void {
    const layer = document.createElement('div');
    layer.className = 'data-streams-layer';

    for (let i = 0; i < 8; i++) {
      const stream = document.createElement('div');
      stream.className = 'data-stream-bg';
      stream.style.left = `${Math.random() * 100}%`;
      stream.style.animationDelay = `${Math.random() * 5}s`;
      stream.style.animationDuration = `${10 + Math.random() * 5}s`;
      layer.appendChild(stream);
    }

    container.appendChild(layer);
  }

  private initParallaxEffects(): void {
    setTimeout(() => {

      if (document.querySelector('.bg-grid-layer')) {
        gsap.to('.bg-grid-layer', {
          scrollTrigger: {
            trigger: 'body',
            start: 'top top',
            end: 'bottom bottom',
            scrub: 1
          },
          y: '25%',
          ease: 'none'
        });
      }

    }, 100);
  }

  cleanup(): void {
    ScrollTrigger.getAll().forEach(trigger => trigger.kill());
    gsap.killTweensOf('*');
    this.initialized = false;
  }
}
