import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Api, RegistroAcceso } from '../../services/api';

@Component({
  selector: 'app-registros',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './registros.html',
  styleUrl: './registros.css',
})
export class Registros implements OnInit {
  registros: RegistroAcceso[] = [];
    loading: boolean = true;
    error: string | null = null;

    constructor(private api: Api) {}

    ngOnInit(): void {
      this.cargarRegistros();
    }

    cargarRegistros(): void {
      this.api.getRegistros().subscribe({
        next: (data) => {
          this.registros = data;
          this.loading = false;
        },
        error: (err) => {
          this.error = "No se pudo conectar con el servidor de KinelaID";
          this.loading = false;
          console.error(err);
        }
      });
    }
}
