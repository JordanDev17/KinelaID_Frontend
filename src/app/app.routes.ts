import { Routes } from '@angular/router';
import { LoginComponent } from './components/auth/login/login.component';
import { Home } from './components/home-kinela/home/home';
// Importa también tu componente de registros si ya lo tienes creado
// import { RegistrosComponent } from './components/registros/registros.component';

export const routes: Routes = [
  { path: 'home-kinela', component: Home},
  { path: 'login', component: LoginComponent },
  { path: '', redirectTo: 'home-kinela', pathMatch: 'full' },
  // { path: 'dashboard', component: RegistrosComponent }, // Ejemplo para después
];