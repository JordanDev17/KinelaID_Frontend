import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface RegistroAcceso {
  registro_id: number;
  usuario_nombre: string;
  rol_nombre: string;
  area_nombre: string;
  fecha_formateada: string;
  permitido: boolean;
  estado: string;
  motivo_denegacion: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class Api {
  private baseUrl = 'http://127.0.0.1:8000/api';

  constructor(private http: HttpClient) { }

  getRegistros(): Observable<RegistroAcceso[]> {
    return this.http.get<RegistroAcceso[]>(`${this.baseUrl}/audit/registros/`);
  }
}