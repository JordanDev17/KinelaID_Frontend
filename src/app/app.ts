import { Component, signal, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common'; // Agregado
import { Registros } from './components/registros/registros';
import { Background } from './services/background';
import { Footer } from './components/footer/footer/footer';
import { Monitoreo } from "./components/camera_streaming/monitoreo/monitoreo";


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, Footer, Monitoreo],
  templateUrl: './app.html',
  styleUrl: './app.css'
})

export class App implements AfterViewInit {

  constructor(private bg: Background) {}

  ngAfterViewInit(): void {

    // Esperamos a que Angular termine de renderizar el DOM
    requestAnimationFrame(() => {
      this.bg.initAnimatedBackground();
    });

  }
}