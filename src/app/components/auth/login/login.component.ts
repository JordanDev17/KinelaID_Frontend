import { Component, OnInit, AfterViewInit, ElementRef, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { Router } from '@angular/router';
import { gsap } from 'gsap';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit, AfterViewInit {
  @ViewChild('loginCard') loginCard!: ElementRef;
  @ViewChild('videoFeed') videoFeed!: ElementRef<HTMLVideoElement>;

  step: 'CREDENTIALS' | 'BIOMETRIC' = 'CREDENTIALS';
  isLoading = false;
  errorMessage: string | null = null;

  credentials = { username: '', password: '' };
  tempUserId: number | null = null;

  constructor(private auth: AuthService, private router: Router, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    gsap.from(this.loginCard.nativeElement, {
      duration: 1,
      y: 30,
      opacity: 0,
      ease: 'power4.out',
      delay: 0.2
    });
  }

  onSubmit(): void {
    this.isLoading = true;
    this.errorMessage = null;

    this.auth.loginStepOne(this.credentials).subscribe({
      next: (res) => {
        if (res.status === 'SUCCESS') {
          this.successTransition();
        } else if (res.status === 'FACE_2FA_REQUIRED') {
          this.tempUserId = res.user_id!;
          this.changeToBiometric();
        }
      },
      error: (err) => {
        this.errorMessage = err.error?.error || 'Credenciales inválidas';
        this.isLoading = false;
        gsap.to(this.loginCard.nativeElement, { x: 10, duration: 0.1, repeat: 3, yoyo: true });
      }
    });
  }

  private changeToBiometric(): void {
    // Animación de salida del formulario
    gsap.to('.form-content', { 
      opacity: 0, 
      x: -20, 
      duration: 0.3, 
      onComplete: () => {
        this.step = 'BIOMETRIC';
        this.isLoading = false;
        this.cdr.detectChanges(); // Forzar render de Angular para que exista #videoFeed

        // Animación de entrada de biometría
        gsap.from('.biometric-content', { 
          opacity: 0, 
          x: 20, 
          duration: 0.4,
          onComplete: () => {
            // USAMOS UNA FUNCIÓN NORMAL PARA EVITAR EL ERROR DE PROMISE
            this.initCamera();
          }
        });
      }
    });
  }

  // Separamos la lógica asíncrona en un método aparte
  private initCamera(): void {
    navigator.mediaDevices.getUserMedia({ video: { width: 400, height: 400 } })
      .then(stream => {
        if (this.videoFeed) {
          this.videoFeed.nativeElement.srcObject = stream;
        }
      })
      .catch(err => {
        this.errorMessage = "Error al activar la cámara";
        console.error(err);
      });
  }

captureAndVerify(): void {
  if (!this.videoFeed) return;
  this.isLoading = true;

  const video = this.videoFeed.nativeElement;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d')?.drawImage(video, 0, 0);
  
  const fotoBase64 = canvas.toDataURL('image/jpeg');

  // Enviamos al backend (usando la clave 'foto' que espera tu view)
   this.auth.loginStepTwoFace(this.tempUserId!, fotoBase64).subscribe({
    next: (res) => {
      // 1. Debug: Ver qué llega exactamente
      console.log("Respuesta completa del servidor:", res);
    
      if (res.status === 'SUCCESS') {
        const conf = res.confidence ?? 0;
        
        // LOG SÚPER CLARO
        console.log(
          `%c KINELAID SECURITY %c 👤 ${res.user_data?.username} %c 🛡️ CONFIDENCIA: ${(conf * 100).toFixed(2)}%`,
          "background: #00ff88; color: #000; font-weight: bold; padding: 4px; border-radius: 4px 0 0 4px;",
          "background: #1e293b; color: #fff; padding: 4px;",
          "background: #3b82f6; color: #fff; padding: 4px; border-radius: 0 4px 4px 0;"
        );
      
        this.stopCamera();
        this.successTransition();
      }
    },
    error: (err) => {
      console.error("Fallo en verificación:", err);
      this.errorMessage = "Identidad no reconocida";
      this.isLoading = false;
    }
  });
}

  private stopCamera(): void {
    if (this.videoFeed?.nativeElement.srcObject) {
      const stream = this.videoFeed.nativeElement.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
  }

  private successTransition(): void {
    gsap.to(this.loginCard.nativeElement, {
      scale: 0.8,
      opacity: 0,
      duration: 0.5,
      ease: 'expo.in',
      onComplete: () => {
        // Navegación envuelta en función void
        this.router.navigate(['/dashboard']); 
      }
    });
  }
}