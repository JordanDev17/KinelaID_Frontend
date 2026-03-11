import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-monitoreo',
  standalone: true,
  imports: [CommonModule, HttpClientModule, FormsModule],
  templateUrl: './monitoreo.html' 
})
export class Monitoreo implements OnInit, OnDestroy {
  listaCamaras: any[] = [];
  areas: any[] = [];
  puertosDisponibles: any[] = [];
  baseUrl: string = 'http://127.0.0.1:8000';
  loading: boolean = false;
  private autoRefresh: any;

  nuevaCamara = { nombre: '', hardware_index: 0, area: '', descripcion: '' };

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.cargarDatos();
    // Escaneo silencioso de hardware cada 10 segundos
    this.autoRefresh = setInterval(() => this.detectarHardware(), 10000);
  }

  ngOnDestroy() {
    if (this.autoRefresh) clearInterval(this.autoRefresh);
  }

  cargarDatos() {
    this.loading = true;
    this.http.get(`${this.baseUrl}/api/cameras/`).subscribe({
      next: (res: any) => {
        this.listaCamaras = res;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => this.loading = false
    });

    this.http.get(`${this.baseUrl}/api/audit/areas/`).subscribe((res: any) => this.areas = res);
    this.detectarHardware();
  }

  detectarHardware() {
    this.http.get(`${this.baseUrl}/api/cameras/detectar/`).subscribe((res: any) => {
      this.puertosDisponibles = res;
    });
  }

  handleSignalLoss(event: any) {
    const parent = event.target.parentNode;
    const overlay = parent.querySelector('.signal-loss-ui');
    if (overlay) overlay.classList.remove('hidden');
    event.target.classList.add('invisible');
  }

  registrarCamara() {
    if (!this.nuevaCamara.nombre || !this.nuevaCamara.area) return;
    this.http.post(`${this.baseUrl}/api/cameras/`, this.nuevaCamara).subscribe(() => {
      this.cargarDatos();
      this.nuevaCamara = { nombre: '', hardware_index: 0, area: '', descripcion: '' };
    });
  }

  eliminarCamara(id: number) {
    if (confirm('¿Dar de baja este punto de acceso?')) {
      this.http.delete(`${this.baseUrl}/api/cameras/${id}/`).subscribe(() => this.cargarDatos());
    }
  }
}