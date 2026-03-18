import { Component, signal, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common'; // Agregado
import { Registros } from './components/registros/registros';
import { Background } from './services/background';
import { Footer } from './components/footer/footer/footer';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, Footer],
  templateUrl: './app.html',
  styleUrl: './app.css'
})

export class App implements AfterViewInit {

    showFooter = true;

  constructor(private bg: Background, private router: Router) {
     this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => {
        // Oculta el footer en rutas del dashboard
        this.showFooter = !e.url.startsWith('/dashboard');
      });
  }
  
  ngAfterViewInit(): void {

    // Esperamos a que Angular termine de renderizar el DOM
    requestAnimationFrame(() => {
      this.bg.initAnimatedBackground();
    });

  }
}