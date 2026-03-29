# KinelaID™
### Sistema de Control de Acceso Biométrico
**Kinela Future Tech® · Daniel Rodriguez · 2026**

---

![KinelaID Banner](https://img.shields.io/badge/KinelaID™-Beta%20Funcional-00f0ff?style=for-the-badge&labelColor=020202)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)
![Django](https://img.shields.io/badge/Django-5.2-092E20?style=flat-square&logo=django&logoColor=white)
![Angular](https://img.shields.io/badge/Angular-20-DD0031?style=flat-square&logo=angular&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-0.182-black?style=flat-square&logo=three.js&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?style=flat-square&logo=postgresql&logoColor=white)

---

## ¿Qué es KinelaID?

KinelaID es un sistema de control de acceso físico basado en reconocimiento facial desarrollado
como proyecto productivo de la etapa final del programa Tecnólogo en Análisis y Desarrollo de 
Software (ADSO). Reemplaza los mecanismos tradicionales de identificación por autenticación 
biométrica en tiempo real, combinando visión por computadora, inteligencia artificial y una 
interfaz de administración web de alto rendimiento.

El sistema garantiza que solo el personal autorizado, verificado mediante su rostro, pueda 
acceder a las áreas restringidas definidas por la organización. Cada intento de acceso queda 
registrado en auditoría con el resultado, la confianza biométrica obtenida y el motivo de 
denegación en caso de fallo.

---

## Stack Tecnológico

### Backend
| Tecnología | Versión | Uso |
|------------|---------|-----|
| Python | 3.11+ | Lenguaje principal |
| Django | 5.2.10 | Framework web y ORM |
| Django REST Framework | 3.16.1 | API REST |
| face_recognition | 1.3.0 | Motor biométrico sobre dlib |
| OpenCV | 4.13.0.90 | Captura y procesamiento de imagen |
| NumPy | 2.4.2 | Operaciones vectoriales sobre embeddings |
| django-filter | 25.2 | Filtrado avanzado en ViewSets |
| PostgreSQL | 15+ | Base de datos principal |

### Frontend
| Tecnología | Versión | Uso |
|------------|---------|-----|
| Angular | 20.1.0 | Framework SPA standalone |
| Three.js | 0.182.0 | Renderizado 3D WebGL |
| GSAP + ScrollTrigger | Latest | Animaciones de interfaz |
| RxJS | 7.8.0 | Reactividad y polling |
| Leaflet | 1.9.4 | Mapa interactivo |
| Tailwind CSS | 3.4.1 | Utilidades de layout |

### Herramientas de Producción y Desarrollo
| Herramienta | Uso |
|-------------|-----|
| Blender | Modelado, animación y exportación .glb de maqueta |
| Draco (Google) | Compresión de geometría 3D para web |
| Ngrok | Túnel local→internet para demos y prototipos |
| Gunicorn | Servidor WSGI para producción |
| Nginx | Proxy inverso y archivos estáticos |

---

## Módulos del Sistema
```
kinelaid/
├── users_hub/          # Empleados y roles — fuente de verdad del directorio
├── access_control/     # Motor biométrico — registro y verificación facial
├── audit_log/          # Trazabilidad — áreas, permisos y registros de acceso
├── interface_auth/     # Autenticación 2FA para operadores del panel
└── camera_hub/         # Streaming MJPEG, gestión de hardware y CameraManager
```

---

## Requisitos del Sistema

- **Sistema Operativo:** Windows 10/11 o Ubuntu 22.04 LTS
- **Python:** 3.11 o superior
- **Node.js:** 20.x LTS
- **RAM:** 8 GB mínimo (16 GB recomendado para múltiples cámaras)
- **CPU:** Con soporte AVX (requerido por dlib)
- **PostgreSQL:** 15 o superior
- **Cámaras:** USB 720p mínimo con driver WDM (Windows) o V4L2 (Linux)

---

## Instalación

### Backend
```bash
# 1. Clonar el repositorio
git clone https://github.com/kinela-future-tech/kinelaid-backend.git
cd kinelaid-backend

# 2. Crear y activar entorno virtual
python -m venv venv
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate     # Windows

# 3. Instalar dependencias
pip install -r requirements.txt

# 4. Configurar variables de entorno
cp .env.example .env
# Editar .env con los valores reales

# 5. Aplicar migraciones
python manage.py migrate

# 6. Crear superusuario
python manage.py createsuperuser

# 7. Levantar el servidor
python manage.py runserver 0.0.0.0:8000
```

### Frontend
```bash
# 1. Clonar el repositorio
git clone https://github.com/kinela-future-tech/kinelaid-frontend.git
cd kinelaid-frontend

# 2. Instalar dependencias
npm install

# 3. Configurar entorno
# Editar src/environments/environment.ts con la URL del backend

# 4. Levantar en desarrollo
ng serve

# 5. Compilar para producción
ng build --configuration production
```




---

## Configuración para Demo con Ngrok

Para exponer el backend local a internet sin infraestructura en la nube:
```bash
# Instalar ngrok y autenticarse
ngrok config add-authtoken <tu-token>

# Iniciar el túnel
ngrok http 8000

# Con licencia de pago — dominio fijo
ngrok http 8000 --domain=kinelaid.ngrok.app
```

En el frontend, actualizar `src/environments/environment.ts`:
```typescript
export const environment = {
  apiUrl: 'https://tu-subdominio.ngrok-free.app/api',
  useNgrokBypass: true
};
```

Para producción local sin ngrok:
```typescript
export const environment = {
  apiUrl: 'http://localhost:8000/api',
  useNgrokBypass: false
};
```

---

## Producción
```bash
# Backend con Gunicorn
gunicorn kinelaid.wsgi:application --workers 4 --bind 0.0.0.0:8000

# Colectar archivos estáticos
python manage.py collectstatic

# Frontend compilado
# Servir la carpeta dist/ con Nginx
```

---

## Endpoints Principales

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/api/access/registrar-empleado/` | Registro biométrico de empleado |
| `POST` | `/api/access/verificar-live/` | Verificación de acceso en tiempo real |
| `GET` | `/api/cameras/stream/{idx}/` | Stream MJPEG en vivo |
| `GET` | `/api/cameras/capture/{idx}/` | Snapshot JPEG del frame actual |
| `POST` | `/api/cameras/reset-service/` | Reinicio del servicio de cámaras |
| `POST` | `/api/auth-interfaz/step-one/` | Login — validación de credenciales |
| `POST` | `/api/auth-interfaz/step-two/` | Login — verificación facial 2FA |
| `GET` | `/api/audit/registros/` | Historial de accesos con filtros |
| `GET` | `/api/audit/registros/exportar_csv/` | Exportación de auditoría a CSV |
| `GET` | `/api/cameras/status/` | Estado en tiempo real de cada cámara |

---

## Arquitectura del CameraManager
```
CameraManager (Singleton)
├── cameras{}      → instancias cv2.VideoCapture por índice
├── frames{}       → último frame capturado por índice  
├── threads{}      → hilo daemon por cámara
└── running_flags{}→ señales de control de ciclo de vida

Hilo cam-0 → captura continua → frames[0]
Hilo cam-1 → captura continua → frames[1]
                    ↓
         Consumidores independientes:
         ├── Stream MJPEG → cliente navegador
         └── Motor biométrico → verificación de acceso
```

---

## Pipeline Biométrico
```
Imagen en Base64
      ↓
Decodificación y conversión RGB
      ↓
Control de calidad — Varianza Laplaciano (umbral: 40)
      ↓
Detección de rostro — face_recognition
      ↓
Liveness check — Eye Aspect Ratio (umbral: 0.15)
      ↓
Generación de embedding — red ResNet 128D
      ↓
Comparación por distancia euclidiana (umbral: 0.5)
      ↓
Validación de permisos de rol en PermisoArea
      ↓
SUCCESS / DENIED + registro en auditoría
```

---

## Características del Sistema de Diseño

- Paleta de color definida en CSS custom properties (`--db-neon`, `--db-green`, `--db-amber`)
- Glassmorphism con `backdrop-filter: blur()` en todos los paneles
- Tipografía: **JetBrains Mono** para valores técnicos · **Rajdhani** para títulos
- Cursor personalizado con inercia diferenciada (punto 20ms · anillo 120ms)
- Renderizado 3D adaptativo: PBR completo en desktop · Phong optimizado en móvil
- Animaciones GSAP ejecutadas fuera del ciclo de Angular con `ngZone.runOutsideAngular()`
- Sistema responsive con 6 breakpoints definidos (1280 · 1024 · 768 · 640 · 480px)

---

## Estado del Proyecto

| Módulo | Estado |
|--------|--------|
| Motor biométrico | ✅ Completo |
| Streaming de cámaras | ✅ Completo |
| Autenticación 2FA | ✅ Completo |
| Dashboard y panel | ✅ Completo |
| Auditoría y reportes | ✅ Completo |
| Modelos 3D y landing | ✅ Completo |
| Anti-spoofing con deep learning | 🔄 Mejora futura |
| Soporte multi-servidor | 🔄 Roadmap v2 |

---

## Deuda Técnica Documentada

- El liveness detection basado en EAR es efectivo contra fotos estáticas pero puede mejorarse con un modelo dedicado de anti-spoofing.
- El `CameraManager` usa backends MSMF y DSHOW exclusivos de Windows. En Linux verificar disponibilidad del backend V4L2.
- La sesión del panel no persiste entre recargas por decisión de seguridad. Para sesiones persistentes implementar cookie httpOnly con JWT.

---

## Licencia y Propiedad Intelectual
```
© 2026 Kinela Future Tech® — Todos los derechos reservados.

KinelaID™ y Kinela Future Tech® son marcas en proceso de registro.
Queda prohibida la reproducción total o parcial del código fuente,
diseño de interfaz, modelos 3D o cualquier componente del sistema
sin autorización expresa y por escrito del autor.
```

---

## Autor

**Daniel Rodriguez**
 Software Developer · CEO
**Kinela Future Tech®**

Mosquera, Cundinamarca, Colombia · 2026

---

*Proyecto productivo desarrollado como entrega final del programa*
*Tecnólogo en Análisis y Desarrollo de Software — ADSO*

---

**KinelaID™ · Kinela Future Tech® · 2026**
