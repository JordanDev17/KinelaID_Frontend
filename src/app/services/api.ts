import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

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
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

 private get headers(): HttpHeaders {
    let headers = new HttpHeaders();
    if (environment.useNgrokBypass) {
      headers = headers.set('ngrok-skip-browser-warning', 'true');
    }
    return headers;
  }
  getRegistros(): Observable<RegistroAcceso[]> {
      // Petición limpia y profesional
      return this.http.get<RegistroAcceso[]>(`${this.baseUrl}/audit/registros/`, { headers: this.headers });
    }

}