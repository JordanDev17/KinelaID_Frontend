import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements AfterViewInit, OnDestroy {

  constructor(private router: Router) {}

  @ViewChild('canvasContainer', { static: true })
  canvasRef!: ElementRef<HTMLDivElement>;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private mainModelGroup = new THREE.Group();
  private carouselGroup = new THREE.Group();
  private carouselModels: THREE.Object3D[] = [];

  private particles!: THREE.Points;
  private animationId!: number;
  private observer!: IntersectionObserver;
  private isVisible = true;

  private targetRotation = { x: 0, y: 0 };
  private currentRotation = { x: 0, y: 0 };

  public titleChars = 'KINELA·TECH'.split('');

  ngAfterViewInit(): void {
    this.initThree();
    this.addGlobalParticles();
    this.loadMainBust();
    this.loadCarouselModels();
    this.setupProfessionalScroll();
    this.setupVisibilityObserver();
    this.animate();

    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('touchmove', this.onTouchMove);
    window.addEventListener('resize', this.onResize);
  }

    // Go to login
    public goToLogin(): void {
    gsap.to('.page-container', {
      opacity: 0,
      duration: 0.6,
      onComplete: () => {
        this.router.navigate(['/login']);
      }
    });
  }


  // ---------- THREE CORE ----------

  private initThree(): void {
    const container = this.canvasRef.nativeElement;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      35,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );

    this.setResponsiveCamera();

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });

    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    const cyan = new THREE.DirectionalLight(0x00f0ff, 2);
    cyan.position.set(5, 5, 5);

    const magenta = new THREE.PointLight(0xff00ff, 1.5);
    magenta.position.set(-5, -2, 2);

    this.scene.add(ambient, cyan, magenta, this.mainModelGroup, this.carouselGroup);
  }

  private setResponsiveCamera() {
    const isMobile = window.innerWidth < 768;

    this.camera.position.set(
      0,
      0,
      isMobile ? 16 : 12
    );
  }

  // ---------- MODEL ----------

  private loadMainBust(): void {
    new GLTFLoader().load('/assets/models/model-headface.glb', (gltf) => {
      const model = gltf.scene;

      model.traverse((n: any) => {
        if (n.isMesh) {
          n.material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 1,
            roughness: 0.2
          });
        }
      });

      this.mainModelGroup.add(model);
      this.mainModelGroup.rotation.y = Math.PI;

      this.applyResponsiveScale();
      this.runIntro();
    });
  }

private loadCarouselModels(): void {
  const loader = new GLTFLoader();
  const assets = ['shield.glb', 'chip.glb', 'lock.glb'];

  assets.forEach((file, index) => {
    loader.load(`/assets/models/${file}`, (gltf) => {

      const model = gltf.scene;

      model.traverse((n: any) => {
        if (n.isMesh) {
          n.material = new THREE.MeshStandardMaterial({
            color: 0x00f0ff,
            metalness: 0.9,
            roughness: 0.3,
            emissive: 0x001122,
            emissiveIntensity: 0.8
          });
        }
      });

      model.scale.setScalar(0.7);

      // posición alineada con scroll real
      model.position.set(
        (index - 1) * 5,
        -14,
        -6
      );

      this.carouselGroup.add(model);
      this.carouselModels.push(model);
    });
  });
}

  private applyResponsiveScale() {
    const isMobile = window.innerWidth < 768;
    this.mainModelGroup.scale.setScalar(isMobile ? 4 : 5);
  }

  // ---------- SCROLL ----------

  private setupProfessionalScroll(): void {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: ".page-container",
        start: "top top",
        end: "bottom bottom",
        scrub: 1.5,
      }
    });

    tl.to('.hero-black-bg', { opacity: 0, duration: 1 }, 0);

    tl.to(this.mainModelGroup.position, { z: -10, y: 5, duration: 2 }, 0);
    tl.to(this.mainModelGroup.rotation, { x: 1, duration: 2 }, 0);

    tl.to(this.camera.position, { y: -15, duration: 3 }, 1);

    tl.to('.carousel-section', { opacity: 1, y: 0, duration: 2 }, 1.5);
  }

  // ---------- PERFORMANCE ----------

  private setupVisibilityObserver() {
    this.observer = new IntersectionObserver(
      ([entry]) => this.isVisible = entry.isIntersecting,
      { threshold: 0.1 }
    );

    this.observer.observe(this.canvasRef.nativeElement);
  }

  // ---------- INTERACTION ----------

  private onMouseMove = (e: MouseEvent) =>
    this.handleInteraction(e.clientX, e.clientY);

  private onTouchMove = (e: TouchEvent) =>
    this.handleInteraction(e.touches[0].clientX, e.touches[0].clientY);

  private handleInteraction(x: number, y: number): void {
    this.targetRotation.y = (x / window.innerWidth - 0.5) * 0.8;
    this.targetRotation.x = (y / window.innerHeight - 0.5) * 0.4;
  }

  // ---------- LOOP ----------

private animate = () => {
  this.animationId = requestAnimationFrame(this.animate);

  if (!this.isVisible) return;

  this.currentRotation.x += (this.targetRotation.x - this.currentRotation.x) * 0.05;
  this.currentRotation.y += (this.targetRotation.y - this.currentRotation.y) * 0.05;

  this.mainModelGroup.rotation.x = this.currentRotation.x;
  this.mainModelGroup.rotation.y = Math.PI + this.currentRotation.y;

  if (this.particles) this.particles.rotation.y += 0.001;

  // ✅ Rotación individual correcta
    this.carouselModels.forEach((model, i) => {
      const speed = 0.008 + i * 0.002;
      model.rotation.y += speed;
    });

  this.renderer.render(this.scene, this.camera);
};

  private addGlobalParticles(): void {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(2000 * 3);

    for (let i = 0; i < 2000 * 3; i++)
      pos[i] = (Math.random() - 0.5) * 30;

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    this.particles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.02,
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.4
      })
    );

    this.scene.add(this.particles);
  }

  private runIntro(): void {
    gsap.from('.char', {
      opacity: 0,
      y: 50,
      stagger: 0.05,
      duration: 1,
      ease: "power4.out"
    });
  }

  private onResize = () => {
    const container = this.canvasRef.nativeElement;

    this.camera.aspect = container.clientWidth / container.clientHeight;
    this.camera.updateProjectionMatrix();

    this.setResponsiveCamera();
    this.applyResponsiveScale();

    this.renderer.setSize(container.clientWidth, container.clientHeight);
  };

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animationId);
    this.renderer.dispose();
    ScrollTrigger.getAll().forEach(t => t.kill());
    this.observer.disconnect();
  }
}