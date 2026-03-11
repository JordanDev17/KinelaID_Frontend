import { Routes } from '@angular/router';
import { LoginComponent } from './components/auth/login/login.component';
import { Home } from './components/home-kinela/home/home';
import { Dashboard } from './components/dashboard/dashboard';


export const routes: Routes = [
  { path: 'home-kinela', component: Home},
  { path: 'login', component: LoginComponent },
  { path: 'dashboard', component: Dashboard},
  { path: '', redirectTo: 'home-kinela', pathMatch: 'full' },
];