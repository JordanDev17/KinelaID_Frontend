import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  NgZone,
  Output,
  EventEmitter,
  Input,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import * as THREE from 'three';
import { gsap } from 'gsap';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

type LoadState = 'idle' | 'loading' | 'success' | 'error';

@Component({
  selector: 'app-prototipo',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './prototipo.html',
  styleUrl: './prototipo.css',
})
export class Prototipo implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('rendererContainer') rendererContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('loadingBar') loadingBar!: ElementRef<HTMLDivElement>;

  @Input()  active = false;
  @Output() closeModal = new EventEmitter<void>();

  loadState: LoadState = 'idle';
  errorMessage = '';
  modelInfo = { vertices: 0, meshes: 0, animations: 0, size: '' };

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private clock = new THREE.Clock();
  private animationMixer?: THREE.AnimationMixer;
  private loadedModel?: THREE.Group;
  private animFrameId?: number;
  private resizeObserver?: ResizeObserver;
  private dracoLoader?: DRACOLoader;
  private initialized = false;

  // ── Performance tier ──────────────────────────────────────
  private isIntegratedGPU = false;
  private isTouch = navigator.maxTouchPoints > 0;
  private frameCount = 0;
  private lastInteractionTime = 0;
  private readonly IDLE_MS = 2000;
  private userIsInteracting = false;








  // ── Luces hijas de la cámara ─────────────────────────────────
  // Al estar adjuntas a la cámara, siempre iluminan desde el mismo
  // ángulo relativo al punto de vista → sin artefactos al rotar.
  private camLightLeft!: THREE.DirectionalLight;   // cenital izquierda — cyan
  private camLightRight!: THREE.DirectionalLight;  // cenital derecha   — cyan
  private camLightFill!: THREE.DirectionalLight;   // frontal suave      — blanco neutro
  private camRim!: THREE.PointLight;               // borde magenta      — fijo en escena

  ngAfterViewInit(): void { /* lazy — espera a [active] */ }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['active']) return;

    if (this.active) {
      // Abrir: inicializar (o reinicializar si fue cerrado antes)
      this.initialized = true;
      requestAnimationFrame(() => this.boot());

    } else {
      // Cerrar: detener loop Y liberar GPU completamente
      this.stopAndDispose();
    }
  }

    private stopAndDispose(): void {
    // 1. Detener loop de animación
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = undefined;
    }

    // 2. Parar animaciones del modelo
    this.animationMixer?.stopAllAction();
    this.animationMixer = undefined;

    // 3. Limpiar controles
    this.controls?.dispose();

    // 4. Purgar escena: geometrías + materiales + texturas
    this.scene?.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => {
          if (!m) return;
          // Disponer texturas del material
          Object.values(m).forEach((v: any) => {
            if (v instanceof THREE.Texture) v.dispose();
          });
          m.dispose();
        });
      }
    });

    // 5. Limpiar environment map (el más pesado en VRAM)
    if (this.scene?.environment) {
      this.scene.environment.dispose();
      this.scene.environment = null;
    }

    // 6. Remover el canvas del DOM y liberar contexto WebGL
    if (this.renderer) {
      this.renderer.renderLists.dispose();
      this.renderer.forceContextLoss(); // libera contexto WebGL inmediatamente
      this.renderer.dispose();
      const canvas = this.renderer.domElement;
      canvas.parentElement?.removeChild(canvas);
    }

    // 7. Resetear estado para permitir reinicialización
    this.loadedModel   = undefined;
    this.loadState     = 'idle';
    this.initialized   = false;
    this.frameCount    = 0;

    // 8. Forzar GC sugiriéndole al browser liberar recursos
    this.renderer = undefined!;
    this.scene    = undefined!;
    this.camera   = undefined!;
    this.controls = undefined!;
  }

  ngOnDestroy(): void {
    this.stopAndDispose();
    this.resizeObserver?.disconnect();
    this.dracoLoader?.dispose();
  }

  constructor(private ngZone: NgZone) {}

  private detectGPU(): void {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') as WebGLRenderingContext | null;
    if (!gl) { this.isIntegratedGPU = true; return; }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) { this.isIntegratedGPU = true; return; }
    const r = (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string) ?? '';
    this.isIntegratedGPU = this.isTouch ||
      /intel|amd radeon\(tm\) graphics|apple m\d|llvmpipe|swiftshader|microsoft basic/i.test(r);
  } catch {
    this.isIntegratedGPU = true;
  }
}




  // ─────────────────────────────────────────────────────────────
  // BOOT
  // ─────────────────────────────────────────────────────────────

  private boot(): void {
    this.initScene();
    this.setupResizeObserver();
    const ready = (MeshoptDecoder as any).ready ?? Promise.resolve(MeshoptDecoder);
    Promise.resolve(ready).then(() => this.loadModel()).catch(() => this.loadModel());
    this.ngZone.runOutsideAngular(() => this.animate());
  }

  // ─────────────────────────────────────────────────────────────
  // ESCENA
  // ─────────────────────────────────────────────────────────────

private initScene(): void {
  this.detectGPU();
  const el = this.rendererContainer.nativeElement;
  const w  = el.offsetWidth  || window.innerWidth;
  const h  = el.offsetHeight || window.innerHeight;

  // ── Escena ────────────────────────────────────────────────
  this.scene = new THREE.Scene();
  this.scene.background = new THREE.Color(0x020202);
  // Niebla solo en desktop dedicado — cálculo por pixel innecesario en integrada
  if (!this.isIntegratedGPU) {
    this.scene.fog = new THREE.FogExp2(0x020202, 0.008);
  }

  // ── Cámara ────────────────────────────────────────────────
  this.camera = new THREE.PerspectiveCamera(35, w / h, 0.01, 2000);
  this.camera.position.set(0, 1, 7);

  // ── Renderer ──────────────────────────────────────────────
  this.renderer = new THREE.WebGLRenderer({
    antialias:              !this.isIntegratedGPU,  // sin antialias en integrada
    logarithmicDepthBuffer: !this.isIntegratedGPU,  // muy caro en integrada
    alpha:                  false,
    powerPreference:        this.isIntegratedGPU ? 'default' : 'high-performance',
  });

  // DPR adaptativo
  const dpr = this.isIntegratedGPU
    ? Math.min(window.devicePixelRatio, 1.0)   // integrada: fuerza 1x
    : Math.min(window.devicePixelRatio, 1.5);  // dedicada:  máx 1.5x
  this.renderer.setPixelRatio(dpr);
  this.renderer.setSize(w, h);
  this.renderer.outputColorSpace   = THREE.SRGBColorSpace;
  this.renderer.toneMapping        = THREE.ACESFilmicToneMapping;
  this.renderer.toneMappingExposure = this.isIntegratedGPU ? 1.2 : 1.4;

  // Sombras: solo en desktop dedicado
  this.renderer.shadowMap.enabled = !this.isIntegratedGPU;
  if (!this.isIntegratedGPU) {
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  el.appendChild(this.renderer.domElement);

  // ── Environment map ───────────────────────────────────────
  // Resolución reducida en integrada — la textura PMREM es el
  // mayor consumo de VRAM en esta escena después del GLB
  const pmrem = new THREE.PMREMGenerator(this.renderer);
  pmrem.compileEquirectangularShader();
  this.scene.environment = pmrem.fromScene(
    new RoomEnvironment(),
    this.isIntegratedGPU ? 0.01 : 0.02
  ).texture;
  pmrem.dispose();

  // ── OrbitControls ─────────────────────────────────────────
  this.controls = new OrbitControls(this.camera, this.renderer.domElement);
  this.controls.enableDamping  = true;
  this.controls.dampingFactor  = 0.06;
  this.controls.minDistance    = 0.5;
  this.controls.maxDistance    = 40;
  this.controls.mouseButtons   = {
    LEFT:   THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT:  THREE.MOUSE.PAN,
  };
  this.controls.update();

  // Registrar interacción para throttle adaptativo en animate()
  this.renderer.domElement.addEventListener('pointerdown', () => {
    this.userIsInteracting      = true;
    this.lastInteractionTime    = performance.now();
  });
  this.renderer.domElement.addEventListener('pointerup', () => {
    this.userIsInteracting      = false;
    this.lastInteractionTime    = performance.now();
  });

  // ══════════════════════════════════════════════════════════
  // ILUMINACIÓN
  //
  // Esquema: 3 luces hijas de la CÁMARA + 1 rim fija en escena
  //
  // Al estar adjuntas a la cámara, se mueven con ella → siempre
  // iluminan desde el mismo ángulo visual, sin artefactos
  // al rotar el modelo con OrbitControls.
  //
  //  camLightLeft  — cenital izquierda,  cyan   #00eaff
  //  camLightRight — cenital derecha,    cyan   #00eaff  (más intensa)
  //  camLightFill  — frontal suave,      blanco neutro (relleno)
  //  camRim        — punto de borde,     magenta #ff00aa, fijo en escena
  // ══════════════════════════════════════════════════════════

  // Ambiente mínimo — base para que nada quede totalmente negro
  const ambient = new THREE.AmbientLight(0x112233, 0.6);
  this.scene.add(ambient);

  // ── Cenital izquierda (cyan) — hija de cámara ─────────────
  this.camLightLeft = new THREE.DirectionalLight(0x00eaff, 2.8);
  this.camLightLeft.position.set(-1.5, 3, 1);
  this.camLightLeft.castShadow = false; // sombras solo en la derecha
  this.camera.add(this.camLightLeft);

  // ── Cenital derecha (cyan más intensa) — hija de cámara ───
  this.camLightRight = new THREE.DirectionalLight(0x00eaff, 3.8);
  this.camLightRight.position.set(1.5, 4, 1);
  // Sombras solo en GPU dedicada — shadow map es el mayor costo single-pass
  this.camLightRight.castShadow = !this.isIntegratedGPU;
  if (!this.isIntegratedGPU) {
    this.camLightRight.shadow.mapSize.set(1024, 1024);
    this.camLightRight.shadow.camera.near   = 0.5;
    this.camLightRight.shadow.camera.far    = 50;
    this.camLightRight.shadow.camera.left   = -5;
    this.camLightRight.shadow.camera.right  = 5;
    this.camLightRight.shadow.camera.top    = 5;
    this.camLightRight.shadow.camera.bottom = -5;
    this.camLightRight.shadow.bias          = -0.002;
  }
  this.camera.add(this.camLightRight);

  // ── Relleno frontal (blanco neutro) — hija de cámara ──────
  // Elimina las sombras duras en la cara frontal del modelo
  this.camLightFill = new THREE.DirectionalLight(0xd0eeff, 1.4);
  this.camLightFill.position.set(0, 0.5, 3); // casi frontal, ligeramente arriba
  this.camera.add(this.camLightFill);

  // CRÍTICO: la cámara debe estar en la escena para que sus
  // hijos (luces) afecten al renderer
  this.scene.add(this.camera);

  // ── Rim magenta — FIJO en la escena (no sigue a la cámara) ─
  // Se reposiciona tras cargar el modelo en onModelLoaded()
  this.camRim = new THREE.PointLight(0xff00aa, 4, 0, 2);
  this.camRim.position.set(-3, 3, 2);
  this.scene.add(this.camRim);
}
  // ─────────────────────────────────────────────────────────────
  // CARGA DEL MODELO
  // ─────────────────────────────────────────────────────────────

  loadModel(): void {
    this.setLoadState('loading');

    const manager = new THREE.LoadingManager();
    manager.onProgress = (_: string, loaded: number, total: number) => {
      const pct = total > 0 ? (loaded / total) * 100 : 0;
      gsap.to(this.loadingBar.nativeElement, { width: `${pct}%`, duration: 0.2, ease: 'none' });
    };
    manager.onError = (url: string) => this.setError(`No se pudo cargar: ${url}`);

    const loader = new GLTFLoader(manager);
    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    this.dracoLoader.preload();
    loader.setDRACOLoader(this.dracoLoader);
    loader.setMeshoptDecoder(MeshoptDecoder);

    loader.load(
      'assets/models/prototipo_escenas.glb',
      (gltf) => this.onModelLoaded(gltf),
      (xhr: ProgressEvent) => {
        if (xhr.total > 0) {
          gsap.to(this.loadingBar.nativeElement, {
            width: `${(xhr.loaded / xhr.total) * 100}%`,
            duration: 0.15,
            ease: 'none',
          });
        }
      },
      (err: unknown) => this.setError(`Error GLB: ${err instanceof Error ? err.message : err}`)
    );
  }

  private onModelLoaded(gltf: any): void {
    this.loadedModel = gltf.scene as THREE.Group;
    if (!this.loadedModel) { this.setError('gltf.scene es null'); return; }

    let meshCount = 0, vertexCount = 0;

    this.loadedModel.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      meshCount++;
      const pos = (child.geometry as THREE.BufferGeometry).getAttribute('position');
      if (pos) vertexCount += pos.count;
      child.castShadow    = true;
      child.receiveShadow = true;
      child.frustumCulled = true;
      this.fixMaterial(child);
    });

    if (meshCount === 0) { this.setError('Sin geometría visible'); return; }

    // ── Escalar y centrar ──────────────────────────────────────
    const box = new THREE.Box3().setFromObject(this.loadedModel);
    if (box.isEmpty()) { this.setError('Bounding box vacío'); return; }

    const size   = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    // Normalizar: eje mayor → 4 unidades
    const scale = 4.0 / Math.max(size.x, size.y, size.z);
    this.loadedModel.scale.setScalar(scale);

    // Recalcular tras escalar
    box.setFromObject(this.loadedModel);
    box.getSize(size);
    box.getCenter(center);

    // Base sobre y=0, centrado en xz
    this.loadedModel.position.set(-center.x, -box.min.y, -center.z);

    this.ngZone.run(() => {
      this.modelInfo = {
        meshes:     meshCount,
        vertices:   vertexCount,
        animations: gltf.animations?.length ?? 0,
        size:       `${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)}`,
      };
    });

    this.scene.add(this.loadedModel);

    // ── Rim: posicionar a altura media del modelo ─────────────
    // La luz de borde va en el lateral izquierdo a media altura
    this.camRim.position.set(
      -size.x * 1.2,
      size.y * 0.6,
      size.z * 0.3
    );
    // Rango: que alcance toda la escena
    this.camRim.distance = size.y * 5;

    // ── Cámara al modelo ──────────────────────────────────────
    this.fitCameraToModel(size);

    // ── Animaciones del modelo ────────────────────────────────
    if (gltf.animations?.length > 0) {
      this.animationMixer = new THREE.AnimationMixer(this.loadedModel);
      (gltf.animations as THREE.AnimationClip[]).forEach((clip) =>
        this.animationMixer!.clipAction(clip).play()
      );
    }

    this.setLoadState('success');
    this.animateCameraIntro();
  }

  private fixMaterial(mesh: THREE.Mesh): void {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((mat) => {
      if (!mat) return;
      mat.visible = true;
      if (mat instanceof THREE.MeshStandardMaterial) {
        if (mat.metalness === 0 && mat.roughness === 0) {
          mat.roughness = 0.55;
          mat.metalness = 0.15;
        }
        if (mat.transparent && mat.opacity === 0) {
          mat.opacity     = 1;
          mat.transparent = false;
        }
        mat.envMapIntensity = 0.4;
        mat.needsUpdate = true;
      }
    });
  }

  private fitCameraToModel(size: THREE.Vector3): void {
    const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist   = (size.y / 2) / Math.tan(fovRad / 2) * 1.4;

    // Vista levemente lateral (más cómoda para una escena de escritorio)
    this.camera.position.set(size.x * 0.25, size.y * 0.45, dist);
    this.camera.near = maxDim * 0.001;
    this.camera.far  = maxDim * 200;
    this.camera.updateProjectionMatrix();

    // Target al tercio superior — donde está el rostro
    this.controls.target.set(0, size.y * 0.65, 0);
    this.controls.minDistance = maxDim * 0.15;
    this.controls.maxDistance = maxDim * 6;
    this.controls.update();
  }

  // ─────────────────────────────────────────────────────────────
  // LOOP
  // ─────────────────────────────────────────────────────────────

  private animate = (): void => {
    this.animFrameId = requestAnimationFrame(this.animate);
    if (!this.renderer || !this.controls) return;

    // ── Throttle por tier ──────────────────────────────────
    if (this.isIntegratedGPU) {
      const idle = !this.userIsInteracting &&
        (performance.now() - this.lastInteractionTime) > this.IDLE_MS;
      if (idle) {
        this.frameCount++;
        if (this.frameCount % 2 !== 0) return; // ~30fps en reposo
      }
      // Con interacción activa → 60fps completos
    }

    const delta   = this.clock.getDelta();
    const elapsed = this.clock.elapsedTime;

    this.animationMixer?.update(delta);

    // Pulso de luces: solo en desktop dedicado (sin Math.sin en integrada)
    if (!this.isIntegratedGPU) {
      if (this.camLightRight) {
        this.camLightRight.intensity = 3.8 + Math.sin(elapsed * 0.6) * 0.4;
      }
      if (this.camRim) {
        this.camRim.intensity = 4.0 + Math.sin(elapsed * 0.9 + 1.0) * 0.8;
      }
    }

    // Rotación automática: más lenta en integrada
    if (this.loadedModel && this.loadState === 'success' && !this.userIsInteracting) {
      this.loadedModel.rotation.y += this.isIntegratedGPU ? 0.0003 : 0.0008;
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  // ─────────────────────────────────────────────────────────────
  // GSAP
  // ─────────────────────────────────────────────────────────────

  private animateCameraIntro(): void {
    const final = this.camera.position.clone();
    this.camera.position.copy(final.clone().multiplyScalar(2.0));
    gsap.to(this.camera.position, { x: final.x, y: final.y, z: final.z, duration: 2.5, ease: 'power3.out' });
    if (this.loadedModel) {
      gsap.fromTo(this.loadedModel.rotation, { y: -Math.PI }, { y: 0, duration: 2.2, ease: 'power2.out' });
    }
  }

  resetView(): void {
    if (!this.loadedModel || this.loadState !== 'success') return;
    const box  = new THREE.Box3().setFromObject(this.loadedModel);
    const size = new THREE.Vector3();
    box.getSize(size);
    const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const dist   = (size.y / 2) / Math.tan(fovRad / 2) * 1.4;
    const target = new THREE.Vector3(size.x * 0.25, size.y * 0.45, dist);
    gsap.to(this.camera.position, { x: target.x, y: target.y, z: target.z, duration: 1.4, ease: 'back.out(1.4)' });
    gsap.to(this.controls.target, {
      x: 0, y: size.y * 0.65, z: 0,
      duration: 1.4, ease: 'back.out(1.4)',
      onUpdate: () => { this.controls.update(); },
    });
  }

  onClose(): void { this.closeModal.emit(); }

  // ─────────────────────────────────────────────────────────────
  // INTERNALS
  // ─────────────────────────────────────────────────────────────

  private setLoadState(state: LoadState, msg = ''): void {
    this.ngZone.run(() => { this.loadState = state; if (msg) this.errorMessage = msg; });
    if (state === 'success') {
      gsap.to(this.loadingBar.nativeElement, {
        width: '100%', duration: 0.3,
        onComplete: () => {gsap.to(this.loadingBar.nativeElement, { opacity: 0, duration: 0.6, delay: 0.3 })},
      });
    }
  }

  private setError(msg: string): void {
    console.error('[Prototipo3D]', msg);
    this.setLoadState('error', msg);
  }

  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => this.onWindowResize());
    this.resizeObserver.observe(this.rendererContainer.nativeElement);
  }

  private onWindowResize(): void {
    const el = this.rendererContainer.nativeElement;
    const w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private disposeScene(): void {
    this.scene?.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => m?.dispose());
      }
    });
    this.renderer?.dispose();
  }
}