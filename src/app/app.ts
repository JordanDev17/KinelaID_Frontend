import { Component, signal, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common'; // Agregado
import { Registros } from './components/registros/registros';
import { Background } from './services/background';



@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule],
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