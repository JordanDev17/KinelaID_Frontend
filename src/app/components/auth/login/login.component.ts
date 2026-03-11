/**
 * login.component.ts — KinelaID Auth v2.1
 * ============================================================
 *
 * BUGS CORREGIDOS EN ESTA VERSIÓN:
 *
 *  1. SecurityError "Tainted canvas":
 *     El <img> que apunta a un stream cross-origin (8000 → 4200)
 *     contamina el canvas aunque CORS esté configurado, porque
 *     M-JPEG es un stream multipart y el browser lo trata de forma
 *     especial. No se puede hacer toDataURL() sobre él.
 *
 *     SOLUCIÓN: Se separan dos responsabilidades:
 *       - <img>: SOLO previsualización visual del stream.
 *       - Captura real: fetch() a /api/cameras/capture/{hw_index}/
 *         que devuelve un JPEG puro → se convierte a base64 con
 *         FileReader (sin canvas, sin taint de origen cruzado).
 *
 *  2. /stream/undefined/:
 *     La interfaz Camara tenía `camara_id` pero el modelo real
 *     tiene `id` (PK) y `hardware_index` (índice USB).
 *
 *  3. NG0955 Duplicated keys:
 *     El @for usaba `track cam.camara_id` que era undefined
 *     para todos → todas las keys colisionaban en "".
 *     Corregido a `track cam.id`.
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
 * Interfaz alineada al modelo real camera_hub/models.py
 * y serializer (campos que devuelve el API):
 *   id             → PK AutoField
 *   nombre         → CharField
 *   hardware_index → IntegerField (índice USB: 0, 1, 2…)
 *   nombre_area    → CharField read_only (serializer)
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

  @ViewChild('loginCard')     loginCard!:  ElementRef;
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
  selectedCamId: number   = -1;   // id (PK) de la cámara activa en el selector

  /** URL absoluta del stream M-JPEG — solo para el <img> de preview */
  streamPreviewUrl: string | null = null;

  /** El <img> de preview emitió (error) — stream no disponible */
  streamError = false;

  /**
   * Modo de captura activo:
   *   'stream' → preview con <img>, captura via fetch snapshot endpoint
   *   'local'  → getUserMedia directo (fallback)
   */
  modoCaptura: 'stream' | 'local' = 'stream';

  fotoCapturada = false;
  fotoBase64    = '';
  capturando    = false;

  private localStream: MediaStream | null = null;

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
        // Solo cámaras marcadas como activas
        this.camaras = cams.filter(c => c.is_activa);
        if (this.camaras.length > 0) {
          this.selectedCamId = this.camaras[0].id;
        }
        this.cdr.detectChanges();
      });
  }

  ngAfterViewInit(): void {
    gsap.from(this.loginCard.nativeElement, {
      duration: 1, y: 30, opacity: 0, ease: 'power4.out', delay: 0.2,
    });
  }

  ngOnDestroy(): void {
    this.detenerCamaraLocal();
  }

  /* ════════════════════════════════════════════════════
     PASO 1: CREDENCIALES
  ════════════════════════════════════════════════════ */

  onSubmit(): void {
    if (!this.credentials.username || !this.credentials.password) {
      this.errorMessage = 'Completa todos los campos.';
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
        gsap.to(this.loginCard.nativeElement, { x: 10, duration: 0.08, repeat: 4, yoyo: true });
      },
    });
  }

  /* ════════════════════════════════════════════════════
     TRANSICIÓN AL PASO BIOMÉTRICO
  ════════════════════════════════════════════════════ */

  private irABiometrico(): void {
    gsap.to('.form-content', {
      opacity: 0, x: -20, duration: 0.3,
      onComplete: () => {
        this.step      = 'BIOMETRIC';
        this.isLoading = false;
        this.cdr.detectChanges();

        gsap.from('.biometric-content', {
          opacity: 0, x: 20, duration: 0.4,
          onComplete: () => this.activarModoCaptura(),
        });
      },
    });
  }

  /** Activa el preview y determina la estrategia de captura */
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

  /** Construye la URL absoluta del stream M-JPEG para el <img> de preview */
  buildPreviewUrl(camId: number): string {
    const cam = this.camaras.find(c => c.id === camId);
    if (!cam) return '';
    // stream_url llega como "/api/cameras/stream/0/" (relativa)
    return `http://127.0.0.1:8000/api${cam.stream_url}`;
  }

  /** hardware_index de la cámara actualmente seleccionada */
  get hwIdx(): number {
    return this.camaras.find(c => c.id === this.selectedCamId)?.hardware_index ?? 0;
  }

  /** El usuario cambia de cámara en el selector */
  cambiarCamara(rawId: any): void {
    const camId = Number(rawId);   // ngModel puede dar string desde <select>
    const cam   = this.camaras.find(c => c.id === camId);
    if (!cam) return;

    this.selectedCamId    = camId;
    this.streamPreviewUrl = this.buildPreviewUrl(camId);
    this.streamError      = false;
    this.fotoCapturada    = false;
    this.fotoBase64       = '';
    this.cdr.detectChanges();
  }

  /** El <img> del stream emitió un error de red */
  onStreamError(): void {
    console.warn('[KinelaID] Stream preview no disponible.');
    this.streamError = true;
    this.cdr.detectChanges();
  }

  /** Etiqueta legible para el <select> de cámaras */
  getCamLabel(cam: Camara): string {
    const area = cam.nombre_area ? ` · ${cam.nombre_area}` : '';
    return `${cam.nombre}${area} — idx:${cam.hardware_index}`;
  }

  /* ════════════════════════════════════════════════════
     CAPTURA DEL FRAME (sin Tainted Canvas)
     
     Estrategia A (modoCaptura==='stream'):
       fetch() al endpoint de snapshot /api/cameras/capture/{idx}/
       → devuelve JPEG → FileReader.readAsDataURL() → base64
       Sin canvas, sin cross-origin taint.
     
     Estrategia B (modoCaptura==='local' o si A falla):
       <video> de getUserMedia → canvas.drawImage() → toDataURL()
       Mismo origen → sin restricciones CORS.
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

  /**
   * Pide un frame estático al backend.
   * Necesita el endpoint en camera_hub/views.py:
   *
   *   @api_view(['GET'])
   *   def capture_frame(request, hw_idx):
   *       cap = cv2.VideoCapture(int(hw_idx))
   *       success, frame = cap.read()
   *       cap.release()
   *       if not success:
   *           return HttpResponse(status=503)
   *       _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
   *       return HttpResponse(buf.tobytes(), content_type='image/jpeg')
   *
   *   # urls.py de camera_hub:
   *   path('cameras/capture/<int:hw_idx>/', capture_frame),
   */
  private async capturarViaSnapshot(): Promise<void> {
    const url = `${this.API}/cameras/capture/${this.hwIdx}/`;

    try {
      const res = await fetch(url, { mode: 'cors' });

      if (!res.ok) {
        // Endpoint no existe o cámara no disponible → fallback getUserMedia
        console.warn(`[KinelaID] /cameras/capture/ → ${res.status}. Fallback a cámara local.`);
        this.capturando  = false;
        this.modoCaptura = 'local';
        this.cdr.detectChanges();
        await this.iniciarCamaraLocal();
        return;
      }

      // Convertir el blob JPEG a base64 SIN canvas → sin taint
      const blob   = await res.blob();
      const base64 = await this.blobToBase64(blob);

      this.fotoBase64    = base64;
      this.fotoCapturada = true;
      this.capturando    = false;
      this.cdr.detectChanges();

    } catch (err) {
      // Error de red (CORS no configurado, servidor apagado, etc.)
      console.warn('[KinelaID] fetch snapshot falló → fallback local:', err);
      this.capturando  = false;
      this.modoCaptura = 'local';
      this.cdr.detectChanges();
      await this.iniciarCamaraLocal();
    }
  }

  /** FileReader: Blob → data URL base64. No usa canvas → sin CORS taint. */
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader     = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror   = reject;
      reader.readAsDataURL(blob);
    });
  }

  /** Captura desde getUserMedia — mismo origen, canvas libre de taint */
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

    // Espejo horizontal para selfie natural
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();

    this.fotoBase64    = canvas.toDataURL('image/jpeg', 0.92);
    this.fotoCapturada = true;
    this.cdr.detectChanges();
  }

  /** Descarta la foto y permite volver a capturar */
  repetirCaptura(): void {
    this.fotoCapturada = false;
    this.fotoBase64    = '';
    const c = this.canvasRef?.nativeElement;
    if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    this.cdr.detectChanges();
  }

  /* ════════════════════════════════════════════════════
     FALLBACK: CÁMARA LOCAL (getUserMedia)
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
      if (!this.fotoBase64) return;  // Captura falló, detenerse
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
        gsap.to(this.loginCard.nativeElement, { x: 8, duration: 0.08, repeat: 4, yoyo: true });
      },
    });
  }

  /* ════════════════════════════════════════════════════
     UTILIDADES PRIVADAS
  ════════════════════════════════════════════════════ */

  private successTransition(): void {
    gsap.to(this.loginCard.nativeElement, {
      scale: 0.8, opacity: 0, duration: 0.5, ease: 'expo.in',
      onComplete: () => {this.router.navigate(['/dashboard'])},
    });
  }

  private detenerCamaraLocal(): void {
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
  }
}