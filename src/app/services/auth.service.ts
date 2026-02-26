import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, tap, map } from 'rxjs';

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
  private baseUrl = 'http://127.0.0.1:8000/api/auth-interfaz';
  
  // EL BLINDAJE: Estado en memoria volátil (Private)
  // Nadie puede acceder a esto desde la consola del navegador fácilmente
  private currentUserSubject = new BehaviorSubject<any>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) { }

  // PASO 1: Credenciales
  loginStepOne(credentials: any): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/step-one/`, credentials).pipe(
      tap(res => {
        if (res.status === 'SUCCESS') {
          this.updateUserState(res.user_data);
        }
      })
    );
  }

  // PASO 2: Biometría (2FA Facial)
  loginStepTwoFace(user_id: number, foto: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/step-two-face/`, { user_id, foto }).pipe(
      tap(res => {
        if (res.status === 'SUCCESS') {
          this.updateUserState(res.user_data);
        }
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