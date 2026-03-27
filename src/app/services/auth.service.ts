import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, tap, map } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AuthResponse {
  status: 'SUCCESS' | 'FACE_2FA_REQUIRED';
  user_id?: number;
  user_data?: any;
  message?: string;
  confidence?: number;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private baseUrl = `${environment.apiUrl}/auth-interfaz`;
  
  private currentUserSubject = new BehaviorSubject<any>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) { }

  // Método privado para no repetir lógica de headers
  private get headers(): HttpHeaders {
    let headers = new HttpHeaders();
    if (environment.useNgrokBypass) {
      headers = headers.set('ngrok-skip-browser-warning', 'true');
    }
    return headers;
  }

  // PASO 1: Credenciales
  loginStepOne(credentials: any): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/step-one/`, credentials, { headers: this.headers }).pipe(
      tap(res => {
        if (res.status === 'SUCCESS') this.updateUserState(res.user_data);
      })
    );
  }

  // PASO 2: Biometría (2FA Facial)
  loginStepTwoFace(user_id: number, foto: string): Observable<AuthResponse> {
      const payload = { user_id, foto };
      return this.http.post<AuthResponse>(`${this.baseUrl}/step-two-face/`, payload, { headers: this.headers }).pipe(
        tap(res => {
          if (res.status === 'SUCCESS') this.updateUserState(res.user_data);
        })
      );
    }

  // Actualiza el estado en memoria y no en texto plano expuesto
  private updateUserState(user: any) {
      this.currentUserSubject.next(user);
    }

  // Método para obtener el valor actual de forma segura
  get userValue() {
    return this.currentUserSubject.value;
  }

  // Verificador de roles robusto
  hasRole(roleName: string): boolean {
    const user = this.userValue;
    return user?.rol_nombre === roleName;
  }

  // Verificador de permisos específicos
  canAccess(permissionKey: string): boolean {
    const user = this.userValue;
    return user?.permisos ? !!user.permisos[permissionKey] : false;
  }

  logout() {
    this.currentUserSubject.next(null);
    // Aquí podrías limpiar cookies de sesión si el backend las usa
  }
}