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

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;

  private keyLight!: THREE.DirectionalLight;
  private rimLight!: THREE.PointLight;

  private mainModelGroup = new THREE.Group();

  private particles!: THREE.Points;
  private animationId!: number;

  // Separación limpia de rotaciones
  private scrollRotationY = Math.PI;
  private mouseOffsetY = 0;
  private mouseOffsetX = 0;

  private targetMouseY = 0;
  private targetMouseX = 0;

  private interactionEnabled = true;

  public titleChars = 'KINELA·TECH'.split('');

  // ============================
  // INIT
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
  }

  public handleContact(data: any): void {
    console.log('Formulario recibido:', data);
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

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });

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

    // Fade del fondo negro al salir del hero
    gsap.to('.hero-black-bg', {
      scrollTrigger: {
        trigger: '.about-section',
        start: 'top 90%',
        end: 'top 30%',
        scrub: true
      },
      opacity: 0
    });

    // Zoom de cámara al entrar en about
    gsap.to(this.camera.position, {
      scrollTrigger: {
        trigger: '.about-section',
        start: 'top bottom',
        end: 'top center',
        scrub: 1
      },
      z: 9
    });

    // Rotación del modelo en about
    gsap.to(this, {
      scrollTrigger: {
        trigger: '.about-section',
        start: 'top center',
        end: 'bottom center',
        scrub: 1,
        onEnter: () => this.interactionEnabled = false,
        onLeaveBack: () => this.interactionEnabled = true
      },
      scrollRotationY: Math.PI - 0.5
    });

    // Desplazamiento lateral del modelo al entrar en about
    gsap.to(this.mainModelGroup.position, {
      scrollTrigger: {
        trigger: '.about-section',
        start: 'top center',
        end: 'bottom center',
        scrub: 1
      },
      x: 3
    });

    // Salida del modelo al llegar a carousel-section (identity/historia)
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
  }

  // ============================
  // PARTICLES
  // ============================

  private addGlobalParticles(): void {
    const count = 3000;
    const geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();

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
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

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
  };

  private runIntro(): void {
    // Selecciona tanto .char como .hm-char para compatibilidad
    gsap.from('.char', {
      opacity: 0,
      y: 50,
      stagger: 0.05,
      duration: 1,
      ease: 'power4.out'
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animationId);
    this.renderer.dispose();
    ScrollTrigger.getAll().forEach(t => t.kill());
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('touchmove', this.onTouchMove);
    window.removeEventListener('resize', this.onResize);
  }
}