/**
 * login.component.ts — KinelaID Auth v3
 * ============================================================
 * Funcionalidad 100% compatible con v2.1.
 * Añadidos:
 *   - Cursor personalizado (.lg-cursor + .lg-cursor-ring)
 *   - Animación de entrada con scan line (igual que home)
 *   - Stagger de entrada de campos
 *   - Shake en error mejorado (eje Y + escala)
 * ============================================================
 */

import {
  Component, OnInit, OnDestroy, AfterViewInit,
  ElementRef, ViewChild, ChangeDetectorRef
} from '@angular/core';
import { CommonModule }  from '@angular/common';
import { FormsModule }   from '@angular/forms';
import { AuthService }   from '../../../services/auth.service';
import { Router }        from '@angular/router';
import { HttpClient }    from '@angular/common/http';
import { catchError }    from 'rxjs/operators';
import { of }            from 'rxjs';
import { gsap }          from 'gsap';

/**
 * Interfaz alineada al modelo real camera_hub/models.py.
 * Campos reales del serializer:
 *   id             → PK AutoField
 *   nombre         → CharField
 *   hardware_index → IntegerField (índice USB: 0, 1, 2…)
 *   nombre_area    → CharField read_only
 *   is_activa      → BooleanField
 *   stream_url     → propiedad: "/api/cameras/stream/{hardware_index}/"
 */
interface Camara {
  id:             number;
  nombre:         string;
  hardware_index: number;
  nombre_area?:   string;
  is_activa:      boolean;
  stream_url:     string;
}

@Component({
  selector:    'app-login',
  standalone:  true,
  imports:     [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls:   ['./login.component.css'],
})
export class LoginComponent implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('streamImg')     streamImg!:  ElementRef<HTMLImageElement>;
  @ViewChild('videoLocal')    videoLocal!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasCaptura') canvasRef!:  ElementRef<HTMLCanvasElement>;

  /* ── Estado general ── */
  step: 'CREDENTIALS' | 'BIOMETRIC' = 'CREDENTIALS';
  isLoading    = false;
  errorMessage: string | null = null;
  credentials  = { username: '', password: '' };
  tempUserId:  number | null = null;

  /* ── camera_hub ── */
  private readonly API  = 'http://127.0.0.1:8000/api';
  camaras:       Camara[] = [];
  selectedCamId: number   = -1;

  streamPreviewUrl: string | null = null;
  streamError = false;

  modoCaptura: 'stream' | 'local' = 'stream';

  fotoCapturada = false;
  fotoBase64    = '';
  capturando    = false;

  private localStream: MediaStream | null = null;

  /* ── Cursor ── */
  private cursorDot!:  HTMLElement;
  private cursorRing!: HTMLElement;

  constructor(
    private auth:   AuthService,
    private router: Router,
    private http:   HttpClient,
    private cdr:    ChangeDetectorRef
  ) {}

  /* ════════════════════════════════════════════════════
     LIFECYCLE
  ════════════════════════════════════════════════════ */

  ngOnInit(): void {
    this.http.get<Camara[]>(`${this.API}/cameras/`)
      .pipe(catchError(() => of([])))
      .subscribe((cams: Camara[]) => {
        this.camaras = cams.filter(c => c.is_activa);
        if (this.camaras.length > 0) {
          this.selectedCamId = this.camaras[0].id;
        }
        this.cdr.detectChanges();
      });
  }

  ngAfterViewInit(): void {
    this.initCursor();
    this.runIntro();
  }

  ngOnDestroy(): void {
    this.detenerCamaraLocal();
    window.removeEventListener('mousemove', this.onCursorMove);
    document.removeEventListener('mouseleave', this.onMouseLeave);
    document.removeEventListener('mouseenter', this.onMouseEnter);
  }

  /* ════════════════════════════════════════════════════
     CURSOR
  ════════════════════════════════════════════════════ */

  private initCursor(): void {
    this.cursorDot  = document.querySelector('.lg-cursor')      as HTMLElement;
    this.cursorRing = document.querySelector('.lg-cursor-ring') as HTMLElement;

    if (!this.cursorDot || !this.cursorRing) return;

    gsap.set([this.cursorDot, this.cursorRing], { opacity: 0 });

    window.addEventListener('mousemove', this.onCursorMove);
    document.addEventListener('mouseleave', this.onMouseLeave);
    document.addEventListener('mouseenter', this.onMouseEnter);

    // Hover en interactables
    setTimeout(() => {
      const interactables = document.querySelectorAll(
        'button, input, select, .lg-tech-tag'
      );

      interactables.forEach(el => {
        el.addEventListener('mouseenter', () => {
          gsap.to(this.cursorRing, { scale: 2, borderColor: 'rgba(0, 240, 255, 0.9)', duration: 0.3 });
          gsap.to(this.cursorDot,  { scale: 0.4, duration: 0.2 });
        });
        el.addEventListener('mouseleave', () => {
          gsap.to(this.cursorRing, { scale: 1, borderColor: 'rgba(0, 240, 255, 0.45)', duration: 0.35 });
          gsap.to(this.cursorDot,  { scale: 1, duration: 0.2 });
        });
      });
    }, 300);
  }

  private onCursorMove = (e: MouseEvent): void => {
    if (!this.cursorDot) return;
    gsap.to(this.cursorDot,  { x: e.clientX, y: e.clientY, duration: 0.02 });
    gsap.to(this.cursorRing, { x: e.clientX, y: e.clientY, duration: 0.12, ease: 'power2.out' });
    gsap.to([this.cursorDot, this.cursorRing], { opacity: 1, duration: 0.25, overwrite: 'auto' });
  };

  private onMouseLeave = (): void => {
    gsap.to([this.cursorDot, this.cursorRing], { opacity: 0, duration: 0.3 });
  };

  private onMouseEnter = (): void => {
    gsap.to([this.cursorDot, this.cursorRing], { opacity: 1, duration: 0.3 });
  };

  /* ════════════════════════════════════════════════════
     INTRO ANIMATION — scan line → stagger de elementos
  ════════════════════════════════════════════════════ */

  private runIntro(): void {
    // 1. Scan line horizontal
    const scanLine = document.createElement('div');
    scanLine.style.cssText = `
      position: fixed;
      top: 50%;
      left: 0;
      width: 100vw;
      height: 2px;
      background: linear-gradient(90deg, transparent, #00f0ff, transparent);
      box-shadow: 0 0 14px rgba(0, 240, 255, 0.8);
      z-index: 9990;
      pointer-events: none;
      transform-origin: left center;
    `;
    document.body.appendChild(scanLine);

    const tl = gsap.timeline({
      onComplete: () => {
        gsap.to(scanLine, { opacity: 0, duration: 0.25, onComplete: () => scanLine.remove() });
      }
    });

    // Scan line barre
    tl.fromTo(scanLine,
      { scaleX: 0, opacity: 0 },
      { scaleX: 1, opacity: 0.85, duration: 0.5, ease: 'power2.inOut' }
    )
    .to(scanLine, { opacity: 0, duration: 0.2 })

    // Panel de estado
    .from('.lg-status-panel', {
      x: -30, opacity: 0, duration: 0.6, ease: 'power3.out'
    }, '-=0.1')

    // Barra de título del terminal
    .from('.lg-terminal-bar', {
      y: -14, opacity: 0, duration: 0.5, ease: 'power2.out'
    }, '-=0.45')

    // Header del paso
    .from('.lg-step-header', {
      y: 18, opacity: 0, duration: 0.55, ease: 'power3.out'
    }, '-=0.4')

    // Campos con stagger
    .from('.lg-field', {
      y: 16, opacity: 0, stagger: 0.1, duration: 0.45, ease: 'power2.out'
    }, '-=0.38')

    // Botón
    .from('.lg-btn-primary', {
      y: 12, opacity: 0, duration: 0.4, ease: 'power2.out'
    }, '-=0.3')

    // Footer
    .from('.lg-step-footer', {
      opacity: 0, duration: 0.4
    }, '-=0.25')

    // Esquinas del viewport
    .from('.lg-corner', {
      scale: 0.4, opacity: 0, stagger: 0.06, duration: 0.4,
      transformOrigin: 'center center', ease: 'back.out(2)'
    }, '-=0.35');
  }

  /* ════════════════════════════════════════════════════
     PASO 1: CREDENCIALES
  ════════════════════════════════════════════════════ */

  onSubmit(): void {
    if (!this.credentials.username || !this.credentials.password) {
      this.errorMessage = 'Completa todos los campos.';
      this.shakeForm();
      return;
    }
    this.isLoading    = true;
    this.errorMessage = null;

    this.auth.loginStepOne(this.credentials).subscribe({
      next: (res) => {
        if (res.status === 'SUCCESS') {
          this.successTransition();
        } else if (res.status === 'FACE_2FA_REQUIRED') {
          this.tempUserId = res.user_id!;
          this.irABiometrico();
        }
      },
      error: (err) => {
        this.errorMessage = err.error?.error || 'Credenciales inválidas.';
        this.isLoading    = false;
        this.shakeForm();
      },
    });
  }

  private shakeForm(): void {
    const form = document.querySelector('.lg-step--creds');
    if (!form) return;
    gsap.fromTo(form,
      { x: 0 },
      { x: 10, duration: 0.07, repeat: 5, yoyo: true, ease: 'none' }
    );
  }

  /* ════════════════════════════════════════════════════
     TRANSICIÓN AL PASO BIOMÉTRICO
  ════════════════════════════════════════════════════ */

  private irABiometrico(): void {
    const currentStep = document.querySelector('.lg-step--creds');

    gsap.to(currentStep, {
      opacity: 0,
      x: -28,
      duration: 0.35,
      ease: 'power2.in',
      onComplete: () => {
        this.step      = 'BIOMETRIC';
        this.isLoading = false;
        this.cdr.detectChanges();

        const bioStep = document.querySelector('.lg-step--bio');
        gsap.fromTo(bioStep,
          { opacity: 0, x: 28 },
          {
            opacity: 1,
            x: 0,
            duration: 0.45,
            ease: 'power3.out',
            onComplete: () => this.activarModoCaptura()
          }
        );
      },
    });
  }

  activarModoCaptura(): void {
    this.streamError   = false;
    this.fotoCapturada = false;
    this.fotoBase64    = '';

    if (this.camaras.length > 0 && this.selectedCamId > 0) {
      this.modoCaptura      = 'stream';
      this.streamPreviewUrl = this.buildPreviewUrl(this.selectedCamId);
    } else {
      this.modoCaptura = 'local';
      this.iniciarCamaraLocal();
    }
    this.cdr.detectChanges();
  }

  buildPreviewUrl(camId: number): string {
    const cam = this.camaras.find(c => c.id === camId);
    if (!cam) return '';
    return `http://127.0.0.1:8000/api${cam.stream_url}`;
  }

  get hwIdx(): number {
    return this.camaras.find(c => c.id === this.selectedCamId)?.hardware_index ?? 0;
  }

  cambiarCamara(rawId: any): void {
    const camId = Number(rawId);
    const cam   = this.camaras.find(c => c.id === camId);
    if (!cam) return;

    this.selectedCamId    = camId;
    this.streamPreviewUrl = this.buildPreviewUrl(camId);
    this.streamError      = false;
    this.fotoCapturada    = false;
    this.fotoBase64       = '';
    this.cdr.detectChanges();
  }

  onStreamError(): void {
    console.warn('[KinelaID] Stream preview no disponible.');
    this.streamError = true;
    this.cdr.detectChanges();
  }

  getCamLabel(cam: Camara): string {
    const area = cam.nombre_area ? ` · ${cam.nombre_area}` : '';
    return `${cam.nombre}${area} — idx:${cam.hardware_index}`;
  }

  /* ════════════════════════════════════════════════════
     CAPTURA (sin Tainted Canvas)
  ════════════════════════════════════════════════════ */

  async capturarFrame(): Promise<void> {
    if (this.capturando) return;
    this.capturando   = true;
    this.errorMessage = null;

    if (this.modoCaptura === 'stream') {
      await this.capturarViaSnapshot();
    } else {
      this.capturarDesdeLocal();
      this.capturando = false;
    }
  }

  private async capturarViaSnapshot(): Promise<void> {
    const url = `${this.API}/cameras/capture/${this.hwIdx}/`;

    try {
      const res = await fetch(url, { mode: 'cors' });

      if (!res.ok) {
        console.warn(`[KinelaID] /cameras/capture/ → ${res.status}. Fallback a cámara local.`);
        this.capturando  = false;
        this.modoCaptura = 'local';
        this.cdr.detectChanges();
        await this.iniciarCamaraLocal();
        return;
      }

      const blob   = await res.blob();
      const base64 = await this.blobToBase64(blob);

      this.fotoBase64    = base64;
      this.fotoCapturada = true;
      this.capturando    = false;
      this.cdr.detectChanges();

    } catch (err) {
      console.warn('[KinelaID] fetch snapshot falló → fallback local:', err);
      this.capturando  = false;
      this.modoCaptura = 'local';
      this.cdr.detectChanges();
      await this.iniciarCamaraLocal();
    }
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader     = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror   = reject;
      reader.readAsDataURL(blob);
    });
  }

  private capturarDesdeLocal(): void {
    const canvas = this.canvasRef?.nativeElement;
    const video  = this.videoLocal?.nativeElement;

    if (!canvas || !video || video.videoWidth === 0) {
      this.errorMessage = 'La cámara aún no está lista. Espera un momento.';
      this.cdr.detectChanges();
      return;
    }

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();

    this.fotoBase64    = canvas.toDataURL('image/jpeg', 0.92);
    this.fotoCapturada = true;
    this.cdr.detectChanges();
  }

  repetirCaptura(): void {
    this.fotoCapturada = false;
    this.fotoBase64    = '';
    const c = this.canvasRef?.nativeElement;
    if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    this.cdr.detectChanges();
  }

  /* ════════════════════════════════════════════════════
     FALLBACK: CÁMARA LOCAL
  ════════════════════════════════════════════════════ */

  async iniciarCamaraLocal(): Promise<void> {
    this.streamPreviewUrl = null;
    this.errorMessage     = null;

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      });

      await new Promise(r => setTimeout(r, 120));

      const v = this.videoLocal?.nativeElement;
      if (!v) { this.errorMessage = 'Elemento de video no disponible.'; return; }

      v.srcObject = this.localStream;
      await v.play();
      this.cdr.detectChanges();

    } catch (err: any) {
      this.errorMessage = err?.name === 'NotAllowedError'
        ? 'Sin permisos de cámara. Habilítalos en el navegador.'
        : `Error de cámara: ${err?.message || err}`;
      this.cdr.detectChanges();
    }
  }

  /* ════════════════════════════════════════════════════
     VERIFICACIÓN BIOMÉTRICA
  ════════════════════════════════════════════════════ */

  async captureAndVerify(): Promise<void> {
    if (!this.fotoCapturada) {
      await this.capturarFrame();
      if (!this.fotoBase64) return;
    }

    this.isLoading    = true;
    this.errorMessage = null;

    this.auth.loginStepTwoFace(this.tempUserId!, this.fotoBase64).subscribe({
      next: (res) => {
        if (res.status === 'SUCCESS') {
          const conf = res.confidence ?? 0;
          console.log(
            `%c KINELAID SECURITY %c 👤 ${res.user_data?.username} %c 🛡️ ${(conf*100).toFixed(1)}%`,
            'background:#00ff88;color:#000;font-weight:bold;padding:4px;border-radius:4px 0 0 4px;',
            'background:#1e293b;color:#fff;padding:4px;',
            'background:#3b82f6;color:#fff;padding:4px;border-radius:0 4px 4px 0;',
          );
          this.detenerCamaraLocal();
          this.successTransition();
        }
      },
      error: (err) => {
        console.error('[KinelaID 2FA]', err);
        this.errorMessage  = err.error?.error || 'Identidad no reconocida.';
        this.isLoading     = false;
        this.fotoCapturada = false;
        this.fotoBase64    = '';

        // Shake en el bio step
        const bioStep = document.querySelector('.lg-step--bio');
        gsap.fromTo(bioStep,
          { x: 0 },
          { x: 8, duration: 0.07, repeat: 5, yoyo: true, ease: 'none' }
        );
      },
    });
  }

  /* ════════════════════════════════════════════════════
     UTILIDADES PRIVADAS
  ════════════════════════════════════════════════════ */

  private successTransition(): void {
    // Flash de confirmación + salida
    gsap.timeline()
      .to('.lg-terminal-body', {
        opacity: 0,
        scale: 1.02,
        duration: 0.25,
        ease: 'power2.in'
      })
      .to('.lg-shell', {
        opacity: 0,
        duration: 0.4,
        ease: 'power2.in',
        onComplete: () => {this.router.navigate(['/dashboard'])}
      }, '-=0.1');
  }

  private detenerCamaraLocal(): void {
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
  }
}