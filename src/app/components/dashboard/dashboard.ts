/**
 * ============================================================
 * dashboard.ts — KinelaID Command Center v3
 * ============================================================
 *
 * NOVEDADES v3:
 *  - Vista MONITOREO: consume streams M-JPEG de camera_hub
 *    via <img src="..."> nativo del browser (multipart/x-mixed-replace)
 *  - Captura biométrica en modal: prioriza stream de camera_hub
 *    (drawImage desde <img> a canvas), con fallback a getUserMedia
 *  - Permisos de área: alineados al modelo real de Django
 *    PermisoArea { permiso_id, rol(FK), area(FK), puede_acceder, fecha_modificacion }
 *    unique_together = ('rol', 'area') → usa PATCH si existe, POST si no
 *  - Modelo Usuario: SIN campo 'cargo' (no existe en models.py)
 *    Campos reales: nombre_completo, identificacion, email, rol, face_embedding
 *  - Layout: fondo global transparente, paneles con backdrop-filter blur
 *
 * MAPA DE ENDPOINTS (confirmado con core/urls.py):
 *   GET/POST   /api/users/empleados/               ← UsuarioViewSet
 *   PUT/DELETE /api/users/empleados/{id}/
 *   GET        /api/users/roles/
 *   GET/POST   /api/audit/areas/                   ← AreaViewSet
 *   PUT/DELETE /api/audit/areas/{id}/
 *   GET/POST   /api/audit/permisosarea/            ← PermisoAreaViewSet (agregar)
 *   PATCH      /api/audit/permisosarea/{id}/
 *   GET/POST   /api/audit/registros/
 *   GET        /api/audit/registros/estadisticas/
 *   GET        /api/audit/registros/exportar_csv/
 *   GET        /api/cameras/                       ← CamaraListCreateView
 *   GET        /api/cameras/stream/{idx}/          ← VideoStreamView (M-JPEG)
 *   GET        /api/cameras/detectar/              ← detectar_camaras_fisicas
 *   GET/POST   /api/auth-interfaz/usuarios/        ← InterfazUsuarioViewSet
 *   PUT/DELETE /api/auth-interfaz/usuarios/{id}/
 * ============================================================
 */

import {
  Component, OnInit, OnDestroy, AfterViewInit,
  ElementRef, ViewChild, ChangeDetectorRef, NgZone
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule }            from '@angular/forms';
import { Router }                 from '@angular/router';
import { HttpClient }             from '@angular/common/http';
import { interval, Subscription, forkJoin, of } from 'rxjs';
import { switchMap, catchError }  from 'rxjs/operators';

import { AuthService }         from '../../services/auth.service';
import { Api, RegistroAcceso } from '../../services/api';
import gsap from 'gsap';

/* ─────────────────────────────────────────────────────────────
   INTERFACES — contrato tipado con el backend Django
───────────────────────────────────────────────────────────── */

/** /api/audit/registros/estadisticas/ */
interface Estadisticas {
  total_eventos: number;
  exitosos:      number;
  fallidos:      number;
  tasa_exito:    number;
  label:         string;
}

/** /api/users/roles/ — Rol model */
interface Rol {
  rol_id: number;
  nombre: string;
  descripcion?: string;
}

/**
 * /api/audit/areas/ — Area model
 * Campos reales: area_id, nombre, ubicacion, camara_ip
 * camara_ip contiene la URL del stream: http://server/api/cameras/stream/{idx}/
 */
interface Area {
  area_id:    number;
  nombre:     string;
  ubicacion?: string;
  camara_ip:  string;   // URL del stream M-JPEG — único y obligatorio
}

/**
 * /api/audit/permisosarea/ — PermisoArea model
 * Campos reales: permiso_id, rol(FK), area(FK), puede_acceder, fecha_modificacion
 * unique_together = ('rol', 'area')
 */
interface PermisoArea {
  permiso_id?:        number;   // Undefined = no existe todavía en DB
  rol:                number;   // FK → rol_id
  rol_nombre:         string;
  area:               number;   // FK → area_id
  puede_acceder:      boolean;
  fecha_modificacion?: string;
  // Estado de UI
  guardando?:         boolean;
}

/**
 * /api/users/empleados/ — Usuario model
 * Campos: usuario_id, nombre_completo,
 * identificacion, email, activo, rol(FK), face_embedding, fecha_creacion
 */
interface Empleado {
  usuario_id:      number;
  nombre_completo: string;
  identificacion:  string;
  email?:          string | null;
  activo:          boolean;
  face_embedding?: number[] | null;
  rol?:            { rol_id: number; nombre: string };
}

/**
 * /api/cameras/ — Camara model (camera_hub)
 * camara_id es el índice físico del dispositivo USB
 */
interface Camara {
  id: number;
  nombre: string;
  hardware_index: number; // Este es el 'idx' que necesita el stream
  nombre_area?: string;
  is_activa: boolean;
  stream_url: string;     // El backend ya te da la ruta relativa
  // Campos locales para el frontend
  activa?: boolean;
  error?: boolean;
  procesandoIA?: boolean;
}

/** /api/auth-interfaz/usuarios/ — InterfazUsuario model */
interface UsuarioSistema {
  id:             number;
  username:       string;
  is_active:      boolean;
  perfil_id?:     number;
  perfil_nombre?: string;
  rol_nombre?:    string;
  tiene_2fa?:     boolean;
}

/** Actividad por área para mapa de calor y lista */
interface AreaActivity extends Area {
  count: number;
  pct:   number;
}

interface ChartBar {
  x: number; y: number; w: number; h: number; color: string; label: string;
}

/* ─────────────────────────────────────────────────────────────
   CONSTANTES
───────────────────────────────────────────────────────────── */

const ESTADO_COLORS: Record<string, string> = {
  APROBADO:                '#00ff88',
  DENEGADO_RECONOCIMIENTO: '#ff3366',
  DENEGADO_DESCONOCIDO:    '#ff3366',
  DENEGADO_PERMISO:        '#ffb800',
};

const ROL_SCOPE: Record<string, string> = {
  'Administrador':        'CRUD · Zonas · Monitoreo · Usuarios Sistema',
  'Operador de Registro': 'Crear & Actualizar Empleados · Biometría',
  'Auditor':              'Consulta de Logs · Generación de Reportes',
  'Empleado':             'Sin acceso al panel',
};

const ROL_DESC: Record<string, string> = {
  'Administrador':        'Acceso total al sistema',
  'Operador de Registro': 'Gestión biométrica de empleados',
  'Auditor':              'Solo lectura de logs y reportes',
  'Empleado':             'Sin acceso al panel admin',
};

type ViewName = 'overview' | 'empleados' | 'logs' | 'reportes' | 'areas' | 'usuarios-sistema' | 'monitoreo';

/* ─────────────────────────────────────────────────────────────
   COMPONENTE
───────────────────────────────────────────────────────────── */

@Component({
  selector:    'app-dashboard',
  standalone:  true,
  imports:     [CommonModule, FormsModule, DatePipe],
  templateUrl: './dashboard.html',
  styleUrl:    './dashboard.css'
})
export class Dashboard implements OnInit, AfterViewInit, OnDestroy {

  /** Elemento <video> para cámara local (fallback) */
  @ViewChild('videoElement')  videoRef!:     ElementRef<HTMLVideoElement>;

  /** Canvas donde se dibuja el frame capturado */
  @ViewChild('canvasElement') canvasRef!:    ElementRef<HTMLCanvasElement>;

  /**
   * Elemento <img> que muestra el stream M-JPEG de camera_hub.
   * Al capturar, se hace drawImage() de este <img> al canvas.
   * Requiere que el stream sea same-origin o tenga CORS habilitado.
   */
  @ViewChild('streamPreview') streamPreviewRef!: ElementRef<HTMLImageElement>;

  /* ════════ ESTADO DE UI ════════ */

  activeView:       ViewName = 'overview';
  sidebarCollapsed: boolean  = false;
  isLoading:        boolean  = false;
  currentTime:      string   = '';

  get viewLabel(): string {
    return ({
      overview:           'PANEL DE CONTROL',
      empleados:          'GESTIÓN EMPLEADOS',
      logs:               'LOGS DE ACCESO',
      reportes:           'GENERACIÓN REPORTES',
      areas:              'ZONAS DE CONTROL',
      'usuarios-sistema': 'USUARIOS DEL SISTEMA',
      monitoreo:          'MONITOREO · SISTEMA VMS',
    } as Record<ViewName, string>)[this.activeView] ?? 'DASHBOARD';
  }

  /* ════════ USUARIO AUTENTICADO ════════ */

  currentUser: any = null;

  get userInitials(): string {
    const n: string = this.currentUser?.nombre_completo || '';
    return n.split(' ').slice(0,2).map((w: string) => w[0]).join('').toUpperCase() || 'OP';
  }

  get rolSlug(): string { return (this.currentUser?.rol_nombre||'').toLowerCase().replace(/\s+/g,'-'); }
  get rolScope(): string { return ROL_SCOPE[this.currentUser?.rol_nombre||''] ?? '—'; }
  getRolDesc(nombre: string): string { return ROL_DESC[nombre] ?? '—'; }

  /* ════════ DATOS DEL SERVIDOR ════════ */

  stats:              Estadisticas | null = null;
  registros:          RegistroAcceso[]    = [];
  registrosFiltrados: RegistroAcceso[]    = [];
  empleados:          Empleado[]          = [];
  empleadosFiltrados: Empleado[]          = [];
  roles:              Rol[]               = [];
  areas:              Area[]              = [];
  areaActivity:       AreaActivity[]      = [];
  alertCount:         number              = 0;
  usuariosSistema:          UsuarioSistema[] = [];
  usuariosSistemaFiltrados: UsuarioSistema[] = [];

  get denegadosPct(): number {
    return parseFloat((100 - (this.stats?.tasa_exito ?? 0)).toFixed(1));
  }
  get empleadosConBio(): number {
    return this.empleados.filter(e => e.face_embedding && e.face_embedding.length > 0).length;
  }

  /* ════════ GRÁFICO SVG ════════ */

  chartBars: ChartBar[] = [];
  chartWidth = 600;

  /* ════════ POLLING ════════ */

  pollingInterval   = 30;
  private pollSub?: Subscription;
  private clockInt?: ReturnType<typeof setInterval>;

  /* ════════ FILTROS LOGS ════════ */

  searchQuery:     string         = '';
  filtroPermitido: boolean | null = null;
  fechaDesde:      string         = '';
  fechaHasta:      string         = '';
  sortColumn:      string         = 'registro_id';
  sortAsc:         boolean        = false;

  /* ════════ FILTROS EMPLEADOS ════════ */

  searchEmpleado:  string         = '';
  filtroBio:       boolean | null = null;

  /* ════════ FILTROS USUARIOS SISTEMA ════════ */

  searchUsuarioSistema: string = '';

  /* ════════ REPORTES ════════ */

  reporteTipo       = 'general';
  reporteDesde      = '';
  reporteHasta      = '';
  reporteEmpleadoId = '';
  reporteAreaId     = '';
  reporteData:       RegistroAcceso[] = [];
  reporteGenerado    = false;
  reporteStats = { total: 0, aprobados: 0, denegados: 0, tasa: 0 };

  /* ════════ MODAL EMPLEADO ════════ */

  modalEmpleadoOpen  = false;
  empleadoEditando:  Empleado | null = null;
  isSaving           = false;
  formError          = '';
  formSuccess        = '';

  /**
   * Formulario de empleado.
   * SIN campo 'cargo' — no existe en el modelo Django Usuario.
   */
  formEmpleado = {
    nombre_completo: '',
    identificacion:  '',
    email:           '',
    rol:             '' as string | number,
  };

  /* ════════ MODAL ELIMINAR EMPLEADO ════════ */

  modalEliminarOpen  = false;
  empleadoAEliminar: Empleado | null = null;

  /* ════════ MODAL ÁREA ════════ */

  modalAreaOpen    = false;
  areaEditando:    AreaActivity | null = null;
  formArea         = { nombre: '', ubicacion: '', camara_ip: '' };
  formAreaError    = '';
  formAreaSuccess  = '';

  /* ════════ MODAL ELIMINAR ÁREA ════════ */

  modalEliminarAreaOpen = false;
  areaAEliminar:    AreaActivity | null = null;

  /* ════════ PERMISOS DE ÁREA ════════ */

  areaPermisoSeleccionada: AreaActivity | null = null;
  permisosArea: PermisoArea[] = [];
  permisoSaveMsg = '';
  private permisoSaveMsgTimer?: ReturnType<typeof setTimeout>;

  /* ════════ MODAL USUARIO SISTEMA ════════ */

  modalUsuarioSistemaOpen    = false;
  usuarioSistemaEditando:    UsuarioSistema | null = null;
  formUsuarioSistema         = { username:'', password:'', perfil_id: '' as string|number, is_active: true };
  formUsuarioSistemaError    = '';
  formUsuarioSistemaSuccess  = '';

  /* ════════ WEBCAM / CAPTURA BIOMÉTRICA ════════ */

  webcamActiva:   boolean = false;
  fotoCapturada:  boolean = false;
  fotoBase64:     string  = '';
  streamCapturaError = false;

  /**
   * ID de la cámara seleccionada para captura biométrica.
   * '' = usar cámara local (getUserMedia).
   * número = usar stream de camera_hub (camara_id).
   */
  camaraCaptura: string | number = '';

  private localStream: MediaStream | null = null;

  /* ════════ MONITOREO — SISTEMA VMS ════════ */

  /**
   * Lista de cámaras registradas en camera_hub.
   * Se carga desde /api/cameras/
   * La propiedad 'activa' es estado de UI (no persiste en DB),
   * controla si el <img src="stream_url"> está activo.
   */
  camaras:           Camara[] = [];
  isLoadingCamaras:  boolean  = false;

  /**
   * Layout de la matriz de video.
   * 'grid-2' → 2 columnas | 'grid-3' → 3 columnas | 'fullscreen' → 1 celda grande
   */
  layoutMonitor: 'grid-2' | 'grid-3' | 'fullscreen' = 'grid-2';

  /**
   * camara_id de la cámara en modo foco (doble click).
   * null = ninguna en foco.
   */
  camFocusIndex: number | null = null;

  /** Número de streams actualmente activos (para el badge del sidebar) */
  get streamsActivos(): number {
    return this.camaras.filter(c => c.activa && !c.error).length;
  }

  /* ════════ BASE URL ════════ */

  private readonly BASE = 'http://127.0.0.1:8000/api';

  constructor(
    private authService: AuthService,
    private api:         Api,
    private http:        HttpClient,
    private router:      Router,
    private cdr:         ChangeDetectorRef,
    private ngZone:      NgZone
  ) {}

  /* ════════════════════════════════════════════════════════
     LIFECYCLE
  ════════════════════════════════════════════════════════ */

  ngOnInit(): void {
    // 1. Verificar autenticación
    this.currentUser = this.authService.userValue;
    if (!this.currentUser) { this.router.navigate(['/login']); return; }
    if (this.currentUser?.rol_nombre === 'Empleado') { this.router.navigate(['/login']); return; }

    // 2. Vista inicial según rol
    if (!this.canView('overview') && this.canView('logs')) this.activeView = 'logs';

    this.startClock();
    this.loadAll();
    this.startPolling();

    // 3. Animaciones de entrada
    this.ngZone.runOutsideAngular(() => setTimeout(() => {
      gsap.from('.db-shell', { opacity: 0, duration: 0.5, ease: 'power2.out' });
      gsap.from('.db-sidebar', { x: -18, opacity: 0, duration: 0.4, ease: 'power2.out', delay: 0.08 });
    }, 40));
  }

  ngAfterViewInit(): void {}

  ngOnDestroy(): void {
    this.detenerStreamLocal();
    this.pollSub?.unsubscribe();
    if (this.clockInt) clearInterval(this.clockInt);
    if (this.permisoSaveMsgTimer) clearTimeout(this.permisoSaveMsgTimer);
  }

  /* ════════════════════════════════════════════════════════
     CONTROL DE ACCESO POR ROL
  ════════════════════════════════════════════════════════ */

  private get rol(): string { return this.currentUser?.rol_nombre || ''; }

  /**
   * Matriz de permisos de vistas por rol.
   * 'monitoreo' → solo Administrador (acceso al sistema VMS / camera_hub).
   */
  canView(view: string): boolean {
    const m: Record<string, string[]> = {
      overview:           ['Administrador', 'Operador de Registro', 'Auditor'],
      empleados:          ['Administrador', 'Operador de Registro'],
      logs:               ['Administrador', 'Auditor'],
      reportes:           [],
      areas:              ['Administrador'],
      'usuarios-sistema': ['Administrador'],
      monitoreo:          ['Administrador'],
    };
    return (m[view] ?? []).includes(this.rol);
  }

  canCreate(): boolean { return ['Administrador', 'Operador de Registro'].includes(this.rol); }
  canDelete(): boolean { return this.rol === 'Administrador'; }

  /* ════════════════════════════════════════════════════════
     RELOJ DEL SISTEMA
  ════════════════════════════════════════════════════════ */

  private startClock(): void {
    const tick = () => {
      const n = new Date();
      this.currentTime = [n.getHours(), n.getMinutes(), n.getSeconds()]
        .map(x => String(x).padStart(2,'0')).join(':');
      this.cdr.detectChanges();
    };
    tick();
    this.clockInt = setInterval(tick, 1000);
  }

  /* ════════════════════════════════════════════════════════
     CARGA DE DATOS — forkJoin paralelo
  ════════════════════════════════════════════════════════ */

  loadAll(): void {
    this.isLoading = true;

    forkJoin({
      registros:      this.api.getRegistros().pipe(catchError(() => of([]))),
      stats:          this.http.get<Estadisticas>(`${this.BASE}/audit/registros/estadisticas/`).pipe(catchError(() => of(null))),
      empleados:      this.http.get<Empleado[]>(`${this.BASE}/users/empleados/`).pipe(catchError(() => of([]))),
      roles:          this.http.get<Rol[]>(`${this.BASE}/users/roles/`).pipe(catchError(() => of([]))),
      areas:          this.http.get<Area[]>(`${this.BASE}/audit/areas/`).pipe(catchError(() => of([]))),
      usuariosSistema:this.http.get<UsuarioSistema[]>(`${this.BASE}/auth-interfaz/usuarios/`).pipe(catchError(() => of([]))),
    }).subscribe(({ registros, stats, empleados, roles, areas, usuariosSistema }) => {
      this.registros        = registros        as RegistroAcceso[];
      this.stats            = stats            as Estadisticas | null;
      this.empleados        = empleados        as Empleado[];
      this.roles            = roles            as Rol[];
      this.areas            = areas            as Area[];
      this.usuariosSistema  = usuariosSistema  as UsuarioSistema[];

      this.applyFilter();
      this.applyEmpleadoFilter();
      this.applyUsuarioSistemaFilter();
      this.buildAreaActivity();
      this.buildChart();
      this.countAlerts();

      this.isLoading = false;
      this.cdr.detectChanges();

      this.ngZone.runOutsideAngular(() => setTimeout(() => {
        gsap.from('.db-kpi', { opacity: 0, y: 18, stagger: 0.07, duration: 0.45, ease: 'power2.out' });
      }, 50));
    });
  }

  private startPolling(): void {
    this.pollSub = interval(this.pollingInterval * 1000).pipe(
      switchMap(() => forkJoin({
        registros: this.api.getRegistros().pipe(catchError(() => of([]))),
        stats:     this.http.get<Estadisticas>(`${this.BASE}/audit/registros/estadisticas/`).pipe(catchError(() => of(null))),
      }))
    ).subscribe(({ registros, stats }) => {
      this.registros = registros as RegistroAcceso[];
      this.stats     = stats     as Estadisticas | null;
      this.applyFilter();
      this.buildAreaActivity();
      this.buildChart();
      this.countAlerts();
      this.cdr.detectChanges();
    });
  }

  refreshData(): void { this.loadAll(); }

  /* ════════════════════════════════════════════════════════
     MONITOREO — SISTEMA VMS
     Consume el API de camera_hub:
       GET /api/cameras/          → lista de Camara registradas
       GET /api/cameras/stream/{idx}/ → M-JPEG stream
  ════════════════════════════════════════════════════════ */

  /**
   * Carga la lista de cámaras desde camera_hub.
   * Se activa automáticamente al navegar a la vista 'monitoreo'.
   * Las cámaras inician con activa=false para no consumir recursos
   * hasta que el admin las active individualmente.
   */
  loadCamaras(): void {
    this.isLoadingCamaras = true;
    this.http.get<Camara[]>(`${this.BASE}/cameras/`)
      .pipe(catchError(() => of([])))
      .subscribe((camaras: Camara[]) => {
        this.camaras = camaras.map(c => {
          const existing = this.camaras.find(e => e.id === c.id);
          return {
            ...c,
            // Mapeamos 'is_activa' del server a nuestra propiedad local 'activa'
            activa: existing?.activa ?? false,
            error: existing?.error ?? false,
            procesandoIA: existing?.procesandoIA ?? false,
          };
        });
        this.isLoadingCamaras = false;
        this.cdr.detectChanges();
      });
  }

       /**
      * Permite a Angular rastrear cada elemento de la lista por su ID único.
      * Esto evita que el stream de video se reinicie (parpadee) cada vez 
      * que la lista de cámaras se actualiza.
      */
  trackByCamId(index: number, cam: Camara): number {
    return cam.id;
  }

  /** Refresca la lista de cámaras manualmente */
  refreshCamaras(): void { this.loadCamaras(); }

  /**
   * Construye la URL del stream M-JPEG para una cámara.
   * El backend VideoStreamView responde en:
   * GET /api/cameras/stream/{cam_idx}/
   * El browser renderiza el stream directamente con <img src="...">
   * usando el protocolo multipart/x-mixed-replace.
   */
  getStreamUrl(cam: Camara): string {
    // BASE debería ser http://127.0.0.1:8000
    // Si cam.stream_url es "/api/cameras/stream/0/", el resultado es perfecto.
    return `${this.BASE}${cam.stream_url}`;
  }

  /**
   * Construye la URL del stream dado un camara_id.
   * Usado en el selector del modal de empleado.
   */
  getStreamUrlById(id: string | number): string {
    return `${this.BASE}/cameras/stream/${id}/`;
  }

  /**
   * Busca el nombre del Área que tiene configurada esta cámara
   * (Area.camara_ip contiene la URL del stream).
   * Permite mostrar la zona en la celda de la cámara.
   */
  getAreaDeCamara(cam: Camara): string | null {
    const streamUrl = this.getStreamUrl(cam);
    const area = this.areas.find(a => a.camara_ip === streamUrl);
    return area?.nombre ?? null;
  }

  /**
   * Devuelve el último RegistroAcceso del área vinculada a esta cámara.
   * Permite mostrar el último evento biométrico sobre el feed de video.
   */
  getUltimoEventoArea(cam: Camara): RegistroAcceso | null {
    const areaNombre = this.getAreaDeCamara(cam);
    if (!areaNombre) return null;
    return this.registros.find(r => r.area_nombre === areaNombre) ?? null;
  }

  /**
   * Activa o desactiva el stream de una cámara.
   * Activar = asignar src al <img> → el browser inicia la petición HTTP.
   * Desactivar = quitar src → el browser cierra la conexión.
   */
  toggleCamara(cam: Camara): void {
    cam.activa = !cam.activa;
    cam.error  = false;
    this.cdr.detectChanges();
  }

  /** Maneja el evento (error) del <img> del stream */
  onStreamError(cam: Camara): void {
    cam.error = true;
    this.cdr.detectChanges();
  }

  /** Maneja el evento (load) del <img> — primera carga exitosa del stream */
  onStreamLoad(cam: Camara): void {
    cam.error = false;
    this.cdr.detectChanges();
  }

  /**
   * Activa/desactiva el modo foco en una cámara (doble click).
   * En modo foco, esa cámara ocupa toda la grilla.
   */
  toggleFocusCam(id: number): void {
    this.camFocusIndex = this.camFocusIndex === id ? null : id;
  }

  /** Cambia el layout de la matriz de video */
  setLayoutMonitor(layout: 'grid-2' | 'grid-3' | 'fullscreen'): void {
    this.layoutMonitor = layout;
  }

  /**
   * Captura un frame manualmente desde el stream.
   * Dibuja el <img> del stream en un canvas temporal y lo descarga.
   * Útil para evidencia forense desde el panel.
   */
  async capturarFrameManual(cam: Camara): Promise<void> {
    const url = `${this.BASE}/cameras/capture/${cam.hardware_index}/`;

    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error('Error en snapshot');

      const blob = await res.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        const link = document.createElement('a');
        link.href = reader.result as string;
        link.download = `kinelaid_cap_${cam.nombre || cam.id}_${Date.now()}.jpg`;
        link.click();
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.error('[KinelaID] Captura manual falló:', err);
      alert('No se pudo capturar la imagen del servidor.');
    }
  }

  /* ════════════════════════════════════════════════════════
     FILTROS
  ════════════════════════════════════════════════════════ */

  applyFilter(): void {
    let r = [...this.registros];
    if (this.filtroPermitido !== null) r = r.filter(x => x.permitido === this.filtroPermitido);
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      r = r.filter(x =>
        (x.usuario_nombre||'').toLowerCase().includes(q) ||
        (x.area_nombre||'').toLowerCase().includes(q)    ||
        (x.estado||'').toLowerCase().includes(q)         ||
        (x.rol_nombre||'').toLowerCase().includes(q)
      );
    }
    if (this.fechaDesde) r = r.filter(x => x.fecha_formateada >= this.fechaDesde);
    if (this.fechaHasta) r = r.filter(x => x.fecha_formateada <= this.fechaHasta + ' 23:59');
    r.sort((a, b) => {
      const av = String((a as any)[this.sortColumn] ?? '');
      const bv = String((b as any)[this.sortColumn] ?? '');
      const c  = av.localeCompare(bv, 'es', { numeric: true });
      return this.sortAsc ? c : -c;
    });
    this.registrosFiltrados = r;
  }

  setPermitidoFilter(v: boolean | null): void { this.filtroPermitido = v; this.applyFilter(); }

  sortBy(col: string): void {
    this.sortAsc    = this.sortColumn === col ? !this.sortAsc : true;
    this.sortColumn = col;
    this.applyFilter();
  }

  sortIndicator(col: string): string {
    return this.sortColumn !== col ? '' : this.sortAsc ? ' ↑' : ' ↓';
  }

  applyEmpleadoFilter(): void {
    let r = [...this.empleados];
    if (this.searchEmpleado.trim()) {
      const q = this.searchEmpleado.toLowerCase();
      r = r.filter(e => e.nombre_completo.toLowerCase().includes(q) || e.identificacion.includes(q));
    }
    if (this.filtroBio === true)  r = r.filter(e => e.face_embedding && e.face_embedding.length > 0);
    if (this.filtroBio === false) r = r.filter(e => !e.face_embedding || e.face_embedding.length === 0);
    this.empleadosFiltrados = r;
  }

  setBioFilter(v: boolean | null): void { this.filtroBio = v; this.applyEmpleadoFilter(); }

  applyUsuarioSistemaFilter(): void {
    if (!this.searchUsuarioSistema.trim()) {
      this.usuariosSistemaFiltrados = [...this.usuariosSistema];
      return;
    }
    const q = this.searchUsuarioSistema.toLowerCase();
    this.usuariosSistemaFiltrados = this.usuariosSistema.filter(u =>
      (u.username||'').toLowerCase().includes(q) || (u.perfil_nombre||'').toLowerCase().includes(q)
    );
  }

  /* ════════════════════════════════════════════════════════
     GRÁFICO Y ACTIVIDAD POR ÁREA
  ════════════════════════════════════════════════════════ */

  private buildChart(): void {
    const counts: Record<string, number> = {};
    for (const r of this.registros) counts[r.estado] = (counts[r.estado]||0)+1;
    const estados = Object.keys(counts);
    if (!estados.length) { this.chartBars = []; return; }
    const maxVal = Math.max(...Object.values(counts));
    const barW   = Math.min(55, (this.chartWidth-40)/estados.length - 10);
    const gap    = (this.chartWidth-20)/estados.length;
    this.chartBars = estados.map((e, i) => ({
      x: 20+i*gap+(gap-barW)/2, y: 0, w: barW,
      h: Math.max(4, Math.round((counts[e]/maxVal)*160)),
      color: ESTADO_COLORS[e] ?? '#00f0ff',
      label: e.replace('DENEGADO_','DEN.').slice(0,10),
    }));
  }

  private buildAreaActivity(): void {
    const counts: Record<string, number> = {};
    for (const r of this.registros) counts[r.area_nombre] = (counts[r.area_nombre]||0)+1;
    const max = Math.max(...Object.values(counts), 1);
    const base = this.areas.length > 0
      ? this.areas
      : Object.keys(counts).map((n, i) => ({ area_id: i, nombre: n, camara_ip: '', ubicacion: '' }));
    this.areaActivity = base.map(a => ({
      ...a,
      count: counts[a.nombre] || 0,
      pct:   Math.round(((counts[a.nombre]||0) / max) * 100),
    }));
  }

  private countAlerts(): void {
    this.alertCount = this.registros.filter(r => !r.permitido).length;
  }

  /* ════════════════════════════════════════════════════════
     NAVEGACIÓN
  ════════════════════════════════════════════════════════ */

  setView(view: ViewName): void {
    if (!this.canView(view)) return;
    this.activeView = view;

    // Carga lazy de cámaras al entrar a monitoreo
    if (view === 'monitoreo' && this.camaras.length === 0) {
      this.loadCamaras();
    }

    this.ngZone.runOutsideAngular(() => setTimeout(() => {
      gsap.fromTo('.db-view > *',
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, stagger: 0.04, duration: 0.3, ease: 'power2.out' }
      );
    }, 10));
  }

  toggleSidebar(): void { this.sidebarCollapsed = !this.sidebarCollapsed; }

  /* ════════════════════════════════════════════════════════
     CRUD EMPLEADOS
     Modelo: nombre_completo, identificacion, email, rol
     SIN campo 'cargo'
  ════════════════════════════════════════════════════════ */

  openModalEmpleado(): void {
    this.empleadoEditando = null; this.formError = ''; this.formSuccess = '';
    this.fotoCapturada = false; this.fotoBase64 = ''; this.webcamActiva = false;
    this.camaraCaptura = ''; this.streamCapturaError = false;
    this.formEmpleado  = { nombre_completo:'', identificacion:'', email:'', rol:'' };
    this.modalEmpleadoOpen = true;
  }

  editarEmpleado(emp: Empleado): void {
    this.empleadoEditando = emp; this.formError = ''; this.formSuccess = '';
    this.fotoCapturada = false; this.fotoBase64 = ''; this.webcamActiva = false;
    this.camaraCaptura = ''; this.streamCapturaError = false;
    this.formEmpleado = {
      nombre_completo: emp.nombre_completo,
      identificacion:  emp.identificacion,
      email:           emp.email ?? '',
      rol:             emp.rol?.rol_id ?? '',
    };
    this.modalEmpleadoOpen = true;
  }

  cerrarModalEmpleado(): void {
    this.detenerStreamLocal();
    this.modalEmpleadoOpen = false;
  }

  guardarEmpleado(): void {
    if (!this.formEmpleado.nombre_completo.trim()) { this.formError='Nombre obligatorio.'; return; }
    if (!this.formEmpleado.identificacion.trim())  { this.formError='Identificación obligatoria.'; return; }
    if (!this.formEmpleado.rol)                    { this.formError='Seleccione un rol.'; return; }
    if (!this.empleadoEditando && !this.fotoBase64){ this.formError='Capture una foto biométrica.'; return; }

    this.isSaving = true; this.formError = '';

    const payload: any = {
      nombre_completo: this.formEmpleado.nombre_completo.trim(),
      identificacion:  this.formEmpleado.identificacion.trim(),
      email:           this.formEmpleado.email?.trim() || null,
      rol:             Number(this.formEmpleado.rol),
    };

    // El backend (UsuarioViewSet.create) espera 'foto_registro' para
    // extraer el face_embedding con face_recognition.
    if (this.fotoBase64) payload['foto_registro'] = this.fotoBase64;

    const req = this.empleadoEditando
      ? this.http.put<Empleado>(`${this.BASE}/users/empleados/${this.empleadoEditando.usuario_id}/`, payload)
      : this.http.post<Empleado>(`${this.BASE}/users/empleados/`, payload);

    req.subscribe({
      next: () => {
        this.formSuccess = this.empleadoEditando ? '✓ Empleado actualizado.' : '✓ Empleado registrado con biometría.';
        this.isSaving = false; this.loadAll();
        setTimeout(() => this.cerrarModalEmpleado(), 1500);
      },
      error: (err) => { this.formError = this.parseApiError(err); this.isSaving = false; }
    });
  }

  confirmarEliminar(emp: Empleado): void  { this.empleadoAEliminar = emp; this.modalEliminarOpen = true; }
  cancelarEliminar(): void                { this.empleadoAEliminar = null; this.modalEliminarOpen = false; }

  eliminarEmpleado(): void {
    if (!this.empleadoAEliminar) return;
    this.isSaving = true;
    this.http.delete(`${this.BASE}/users/empleados/${this.empleadoAEliminar.usuario_id}/`).subscribe({
      next: () => { this.isSaving = false; this.modalEliminarOpen = false; this.empleadoAEliminar = null; this.loadAll(); },
      error: () => { this.isSaving = false; this.modalEliminarOpen = false; }
    });
  }

  /* ════════════════════════════════════════════════════════
     CRUD ÁREAS
     Modelo: area_id, nombre, ubicacion, camara_ip
     camara_ip = URL del stream, debe ser único y no nulo
  ════════════════════════════════════════════════════════ */

  openModalArea(): void {
    this.areaEditando = null; this.formAreaError = ''; this.formAreaSuccess = '';
    this.formArea = { nombre:'', ubicacion:'', camara_ip:'' };
    this.modalAreaOpen = true;
  }

  editarArea(a: AreaActivity): void {
    this.areaEditando = a; this.formAreaError = ''; this.formAreaSuccess = '';
    this.formArea = { nombre: a.nombre, ubicacion: a.ubicacion||'', camara_ip: a.camara_ip||'' };
    this.modalAreaOpen = true;
  }

  cerrarModalArea(): void { this.modalAreaOpen = false; }

  guardarArea(): void {
    if (!this.formArea.nombre.trim()) { this.formAreaError = 'Nombre de zona obligatorio.'; return; }
    this.isSaving = true; this.formAreaError = '';

    const payload = {
      nombre:    this.formArea.nombre.trim(),
      ubicacion: this.formArea.ubicacion || null,
      camara_ip: this.formArea.camara_ip || null,
    };

    const req = this.areaEditando
      ? this.http.put<Area>(`${this.BASE}/audit/areas/${this.areaEditando.area_id}/`, payload)
      : this.http.post<Area>(`${this.BASE}/audit/areas/`, payload);

    req.subscribe({
      next: () => {
        this.formAreaSuccess = this.areaEditando ? '✓ Zona actualizada.' : '✓ Zona creada.';
        this.isSaving = false; this.loadAll();
        setTimeout(() => this.cerrarModalArea(), 1400);
      },
      error: (err) => { this.formAreaError = this.parseApiError(err); this.isSaving = false; }
    });
  }

  confirmarEliminarArea(a: AreaActivity): void  { this.areaAEliminar = a; this.modalEliminarAreaOpen = true; }
  cancelarEliminarArea(): void                  { this.areaAEliminar = null; this.modalEliminarAreaOpen = false; }

  eliminarArea(): void {
    if (!this.areaAEliminar) return;
    this.isSaving = true;
    this.http.delete(`${this.BASE}/audit/areas/${this.areaAEliminar.area_id}/`).subscribe({
      next: () => {
        this.isSaving = false; this.modalEliminarAreaOpen = false;
        this.areaAEliminar = null; this.areaPermisoSeleccionada = null;
        this.loadAll();
      },
      error: () => { this.isSaving = false; this.modalEliminarAreaOpen = false; }
    });
  }

  /* ════════════════════════════════════════════════════════
     PERMISOS DE ÁREA — Matriz Rol × Área
     
     Modelo PermisoArea:
       permiso_id (PK), rol(FK), area(FK), puede_acceder, fecha_modificacion
       unique_together = ('rol', 'area')
     
     Lógica:
       - Carga todos los permisos del área seleccionada
         GET /api/audit/permisosarea/?area={area_id}
       - Para cada rol disponible muestra el estado actual
       - Si el permiso YA existe (permiso_id != undefined): PATCH
       - Si NO existe: POST (crea el registro)
       - unique_together garantiza que no habrá duplicados
  ════════════════════════════════════════════════════════ */

  abrirPermisosArea(a: AreaActivity): void {
    this.areaPermisoSeleccionada = a;
    this.permisosArea = [];
    this.permisoSaveMsg = '';

    this.http.get<any[]>(`${this.BASE}/audit/permisosarea/?area=${a.area_id}`)
      .pipe(catchError(() => of([])))
      .subscribe((existentes: any[]) => {
        // Construye la lista completa: un PermisoArea por cada Rol
        this.permisosArea = this.roles.map(rol => {
          const encontrado = existentes.find(p => p.rol === rol.rol_id || p.rol_id === rol.rol_id);
          return {
            permiso_id:        encontrado?.permiso_id,
            rol:               rol.rol_id,
            rol_nombre:        rol.nombre,
            area:              a.area_id,
            puede_acceder:     encontrado ? encontrado.puede_acceder : false,
            fecha_modificacion: encontrado?.fecha_modificacion,
            guardando:         false,
          } as PermisoArea;
        });
        this.cdr.detectChanges();
      });
  }

  /**
   * Cambia el permiso de acceso de un rol sobre el área seleccionada.
   * Si permiso_id existe → PATCH (actualiza)
   * Si no existe → POST (crea — backend aplica unique_together)
   */
  togglePermiso(pr: PermisoArea): void {
    const nuevoEstado = !pr.puede_acceder;
    pr.guardando = true;
    this.cdr.detectChanges();

    if (pr.permiso_id) {
      // Actualizar permiso existente
      this.http.patch<any>(`${this.BASE}/audit/permisosarea/${pr.permiso_id}/`, { puede_acceder: nuevoEstado })
        .subscribe({
          next: (res) => {
            pr.puede_acceder     = nuevoEstado;
            pr.fecha_modificacion = res.fecha_modificacion;
            pr.guardando          = false;
            this.mostrarPermisoMsg(`✓ Acceso ${nuevoEstado?'concedido':'revocado'} para ${pr.rol_nombre}`);
            this.cdr.detectChanges();
          },
          error: () => { pr.guardando = false; this.cdr.detectChanges(); }
        });
    } else {
      // Crear permiso nuevo
      this.http.post<any>(`${this.BASE}/audit/permisosarea/`, {
        rol: pr.rol, area: pr.area, puede_acceder: nuevoEstado
      }).subscribe({
        next: (res) => {
          pr.permiso_id         = res.permiso_id;
          pr.puede_acceder      = nuevoEstado;
          pr.fecha_modificacion = res.fecha_modificacion;
          pr.guardando           = false;
          this.mostrarPermisoMsg(`✓ Permiso creado para ${pr.rol_nombre}`);
          this.cdr.detectChanges();
        },
        error: () => { pr.guardando = false; this.cdr.detectChanges(); }
      });
    }
  }

  private mostrarPermisoMsg(msg: string): void {
    this.permisoSaveMsg = msg;
    if (this.permisoSaveMsgTimer) clearTimeout(this.permisoSaveMsgTimer);
    this.permisoSaveMsgTimer = setTimeout(() => {
      this.permisoSaveMsg = '';
      this.cdr.detectChanges();
    }, 2500);
  }

  /* ════════════════════════════════════════════════════════
     USUARIOS DE SISTEMA
  ════════════════════════════════════════════════════════ */

  openModalUsuarioSistema(): void {
    this.usuarioSistemaEditando = null;
    this.formUsuarioSistemaError = ''; this.formUsuarioSistemaSuccess = '';
    this.formUsuarioSistema = { username:'', password:'', perfil_id:'', is_active:true };
    this.modalUsuarioSistemaOpen = true;
  }

  editarUsuarioSistema(u: UsuarioSistema): void {
    this.usuarioSistemaEditando = u;
    this.formUsuarioSistemaError = ''; this.formUsuarioSistemaSuccess = '';
    this.formUsuarioSistema = { username:u.username, password:'', perfil_id:u.perfil_id??'', is_active:u.is_active };
    this.modalUsuarioSistemaOpen = true;
  }

  cerrarModalUsuarioSistema(): void { this.modalUsuarioSistemaOpen = false; }

  guardarUsuarioSistema(): void {
    if (!this.formUsuarioSistema.username.trim())                       { this.formUsuarioSistemaError='Username obligatorio.'; return; }
    if (!this.usuarioSistemaEditando && !this.formUsuarioSistema.password) { this.formUsuarioSistemaError='Contraseña obligatoria.'; return; }
    if (!this.formUsuarioSistema.perfil_id)                             { this.formUsuarioSistemaError='Vincule a un empleado.'; return; }

    this.isSaving = true; this.formUsuarioSistemaError = '';
    const payload: any = {
      username:  this.formUsuarioSistema.username.trim(),
      perfil:    Number(this.formUsuarioSistema.perfil_id),
      is_active: this.formUsuarioSistema.is_active,
    };
    if (this.formUsuarioSistema.password) payload['password'] = this.formUsuarioSistema.password;

    const req = this.usuarioSistemaEditando
      ? this.http.put<UsuarioSistema>(`${this.BASE}/auth-interfaz/usuarios/${this.usuarioSistemaEditando.id}/`, payload)
      : this.http.post<UsuarioSistema>(`${this.BASE}/auth-interfaz/usuarios/`, payload);

    req.subscribe({
      next: () => {
        this.formUsuarioSistemaSuccess = this.usuarioSistemaEditando ? '✓ Cuenta actualizada.' : '✓ Cuenta creada.';
        this.isSaving = false; this.loadAll();
        setTimeout(() => this.cerrarModalUsuarioSistema(), 1500);
      },
      error: (err) => { this.formUsuarioSistemaError = this.parseApiError(err); this.isSaving = false; }
    });
  }

  toggleActivoUsuarioSistema(u: UsuarioSistema): void {
    this.http.patch(`${this.BASE}/auth-interfaz/usuarios/${u.id}/`, { is_active: !u.is_active })
      .subscribe({ next: () => { u.is_active = !u.is_active; this.cdr.detectChanges(); } });
  }

  confirmarEliminarUsuarioSistema(u: UsuarioSistema): void {
    if (confirm(`¿Eliminar la cuenta "${u.username}"? Acción irreversible.`)) {
      this.http.delete(`${this.BASE}/auth-interfaz/usuarios/${u.id}/`)
        .subscribe({ next: () => this.loadAll() });
    }
  }

  /* ════════════════════════════════════════════════════════
     CAPTURA BIOMÉTRICA — MODAL EMPLEADO
     
     PRIORIDAD:
     1. Si hay cámara seleccionada (camaraCaptura != '') →
        Usa el stream M-JPEG de camera_hub.
        capturarDesdeStream() dibuja el <img> en canvas con drawImage().
        NOTA: Requiere que el backend sirva CORS headers o sea same-origin.
     
     2. Si no hay cámara (camaraCaptura === '') →
        Fallback a getUserMedia (cámara local del navegador).
  ════════════════════════════════════════════════════════ */

  /** Cuando el usuario cambia el selector de cámara */
  onCamaraCapturaChange(): void {
    this.fotoCapturada  = false;
    this.fotoBase64     = '';
    this.streamCapturaError = false;
    // Si se deselecciona la cámara y hay stream local activo, lo mantiene
    this.cdr.detectChanges();
  }

  /**
   * Captura un frame desde el stream M-JPEG.
   * Usa drawImage() del <img #streamPreview> en el canvas.
   * Funciona mientras el browser tenga cargado el frame actual.
   */
  capturarDesdeStream(): void {
    const imgEl  = this.streamPreviewRef?.nativeElement;
    const canvas = this.canvasRef?.nativeElement;
    if (!imgEl || !canvas) { this.formError = 'Error: referencia al stream no disponible.'; return; }

    canvas.width  = imgEl.naturalWidth  || 640;
    canvas.height = imgEl.naturalHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
      this.fotoBase64    = canvas.toDataURL('image/jpeg', 0.92);
      this.fotoCapturada = true;
      this.cdr.detectChanges();
    } catch (err) {
      // Si hay error de CORS, el canvas queda "tainted" y toDataURL() lanza SecurityError
      this.formError = 'Error de captura. Asegúrate de que el backend tenga CORS habilitado para el stream.';
      console.error('Canvas tainted:', err);
    }
  }

  /** Descarta el frame capturado desde el stream y permite repetir */
  repetirCapturaStream(): void {
    this.fotoCapturada  = false;
    this.fotoBase64     = '';
    this.streamCapturaError = false;
    const canvas = this.canvasRef?.nativeElement;
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    this.cdr.detectChanges();
  }

  /* ── Cámara local (getUserMedia) — fallback ── */

  async iniciarWebcam(): Promise<void> {
    this.formError = '';
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      });
      await new Promise(r => setTimeout(r, 100));
      const v = this.videoRef?.nativeElement;
      if (!v) { this.formError = 'Error: elemento de video no disponible.'; return; }
      v.srcObject = this.localStream;
      await v.play();
      this.webcamActiva = true;
      this.cdr.detectChanges();
    } catch (err: any) {
      this.formError = err?.name === 'NotAllowedError'
        ? 'Sin permisos de cámara. Habilítalos en el navegador.'
        : `Error de cámara: ${err?.message||err}`;
      this.cdr.detectChanges();
    }
  }

  /** Captura frame del video local con espejo horizontal */
  capturarFoto(): void {
    const v = this.videoRef?.nativeElement;
    const c = this.canvasRef?.nativeElement;
    if (!v || !c) return;

    c.width  = v.videoWidth  || 640;
    c.height = v.videoHeight || 480;

    const ctx = c.getContext('2d');
    if (!ctx) return;

    // Espejo horizontal para selfie natural
    ctx.save(); ctx.scale(-1, 1); ctx.drawImage(v, -c.width, 0, c.width, c.height); ctx.restore();

    this.fotoBase64    = c.toDataURL('image/jpeg', 0.92);
    this.fotoCapturada = true;
    this.detenerStreamLocal();
    this.cdr.detectChanges();
  }

  async repetirCaptura(): Promise<void> {
    this.fotoCapturada = false; this.fotoBase64 = '';
    this.canvasRef?.nativeElement?.getContext('2d')?.clearRect(0, 0, 9999, 9999);
    await this.iniciarWebcam();
  }

  detenerWebcam(): void { this.detenerStreamLocal(); this.webcamActiva = false; this.cdr.detectChanges(); }

  private detenerStreamLocal(): void {
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
    this.webcamActiva = false;
  }

  /* ════════════════════════════════════════════════════════
     REPORTES
  ════════════════════════════════════════════════════════ */

  generarReporte(): void {
    let data = [...this.registros];
    if (this.reporteTipo === 'denegados') data = data.filter(r => !r.permitido);
    if (this.reporteTipo === 'empleado' && this.reporteEmpleadoId) {
      const emp = this.empleados.find(e => String(e.usuario_id) === String(this.reporteEmpleadoId));
      if (emp) data = data.filter(r => r.usuario_nombre === emp.nombre_completo);
    }
    if (this.reporteTipo === 'area' && this.reporteAreaId) {
      const area = this.areas.find(a => String(a.area_id) === String(this.reporteAreaId));
      if (area) data = data.filter(r => r.area_nombre === area.nombre);
    }
    if (this.reporteDesde) data = data.filter(r => r.fecha_formateada >= this.reporteDesde);
    if (this.reporteHasta) data = data.filter(r => r.fecha_formateada <= this.reporteHasta + ' 23:59');

    const aprobados = data.filter(r => r.permitido).length;
    this.reporteStats = {
      total: data.length, aprobados,
      denegados: data.length - aprobados,
      tasa: data.length > 0 ? Math.round((aprobados / data.length) * 100) : 0,
    };
    this.reporteData = data; this.reporteGenerado = true;
    this.cdr.detectChanges();
  }

  /**
   * Genera un PDF imprimible con los datos del reporte.
   * Construye HTML completo A4 landscape y usa window.print().
   */
  exportPDF(source?: RegistroAcceso[]): void {
    const data = source || this.reporteData;
    if (!data.length) { alert('Sin datos para exportar.'); return; }

    const tipoLabel: Record<string,string> = {
      general:'REPORTE GENERAL', empleado:'REPORTE POR EMPLEADO',
      area:'REPORTE POR ÁREA',   denegados:'ACCESOS DENEGADOS',
    };

    const rows = data.map(r => `
      <tr>
        <td>${r.usuario_nombre||'DESCONOCIDO'}</td>
        <td>${r.rol_nombre||'—'}</td>
        <td>${r.area_nombre||'—'}</td>
        <td>${r.fecha_formateada}</td>
        <td class="${r.permitido?'ok':'deny'}">${r.estado}</td>
        <td>${r.motivo_denegacion||'—'}</td>
      </tr>`).join('');

    const aprobados = data.filter(r => r.permitido).length;
    const tasa      = data.length > 0 ? Math.round(aprobados/data.length*100) : 0;

    const html = `<!DOCTYPE html><html lang="es">
<head><meta charset="UTF-8"/><title>KinelaID · ${tipoLabel[this.reporteTipo]||'Reporte'}</title>
<style>
  @page{size:A4 landscape;margin:14mm}*{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Courier New',monospace;font-size:10px;color:#111}
  .header{border-bottom:2px solid #007a99;padding-bottom:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-end}
  .header h1{font-size:17px;letter-spacing:3px;color:#005f77}
  .header p{font-size:9px;color:#666;margin-top:3px}.meta{text-align:right;font-size:9px;color:#888;line-height:1.7}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}
  .kpi{border:1px solid #cce8ef;padding:10px 14px;border-left:3px solid #007a99}
  .kpi.green{border-left-color:#006633}.kpi.red{border-left-color:#cc0033}.kpi.amber{border-left-color:#996600}
  .kpi .n{font-size:22px;font-weight:900;color:#007a99}.kpi.green .n{color:#006633}.kpi.red .n{color:#cc0033}.kpi.amber .n{color:#996600}
  .kpi .l{font-size:7px;letter-spacing:3px;color:#888;margin-top:2px}
  table{width:100%;border-collapse:collapse}th{background:#007a99;color:#fff;padding:6px 8px;text-align:left;font-size:8px;letter-spacing:2px}
  td{padding:5px 8px;border-bottom:1px solid #eee;font-size:9px}tr:nth-child(even) td{background:#f7fcfe}
  .ok{color:#006633;font-weight:700}.deny{color:#cc0033;font-weight:700}
  .footer{margin-top:14px;font-size:8px;color:#aaa;border-top:1px solid #eee;padding-top:8px;display:flex;justify-content:space-between}
</style></head><body>
<div class="header">
  <div><h1>KINELAID · ${tipoLabel[this.reporteTipo]||'REPORTE'}</h1><p>Sistema de Control de Acceso Biométrico</p></div>
  <div class="meta">
    <div>Generado: ${new Date().toLocaleString('es-CO')}</div>
    <div>Período: ${this.reporteDesde||'Inicio'} → ${this.reporteHasta||'Hoy'}</div>
    <div>Operador: ${this.currentUser?.nombre_completo||'—'} (${this.currentUser?.rol_nombre||'—'})</div>
  </div>
</div>
<div class="kpis">
  <div class="kpi"><div class="n">${data.length}</div><div class="l">TOTAL EVENTOS</div></div>
  <div class="kpi green"><div class="n">${aprobados}</div><div class="l">APROBADOS</div></div>
  <div class="kpi red"><div class="n">${data.length-aprobados}</div><div class="l">DENEGADOS</div></div>
  <div class="kpi amber"><div class="n">${tasa}%</div><div class="l">TASA DE ÉXITO</div></div>
</div>
<table><thead><tr><th>EMPLEADO</th><th>ROL</th><th>ÁREA</th><th>TIMESTAMP</th><th>ESTADO</th><th>MOTIVO</th></tr></thead><tbody>${rows}</tbody></table>
<div class="footer"><span>KinelaID · Documento confidencial</span><span>${data.length} registros</span></div>
</body></html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html); win.document.close(); win.focus();
      setTimeout(() => { win.print(); win.close(); }, 600);
    }
  }

  exportLogsAsPDF(): void { this.exportPDF(this.registrosFiltrados); }

  /** Descarga el CSV desde el endpoint del backend (ya formateado en español) */
  exportCSV(): void { window.open(`${this.BASE}/audit/registros/exportar_csv/`, '_blank'); }

  /* ════════════════════════════════════════════════════════
     LOGOUT
  ════════════════════════════════════════════════════════ */

  logout(): void {
    this.authService.logout();
    gsap.to('.db-shell', {
      opacity: 0, y: -10, duration: 0.4, ease: 'power2.in',
      onComplete: () => {this.router.navigate(['/login'])}
    });
  }

  /* ════════════════════════════════════════════════════════
     UTILIDADES
  ════════════════════════════════════════════════════════ */

  getInitials(name: string): string {
    if (!name?.trim()) return '??';
    return name.trim().split(' ').slice(0,2).map(n => n[0]?.toUpperCase()||'').join('');
  }

  private parseApiError(err: any): string {
    const b = err?.error;
    if (!b) return 'Error de conexión con el servidor.';
    if (b.detalle) return `${b.error}: ${b.detalle}`;
    if (b.error)   return b.error;
    if (typeof b === 'string') return b;
    const keys = Object.keys(b);
    if (keys.length) return `${keys[0]}: ${Array.isArray(b[keys[0]])?b[keys[0]][0]:b[keys[0]]}`;
    return JSON.stringify(b);
  }
}