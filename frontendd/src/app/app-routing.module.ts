import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { ExamforgeGenerateComponent } from './pages/examforge-generate/examforge-generate.component';
import { MainLayoutComponent } from './layout/main-layout/main-layout.component';
import { SetupComponent } from './pages/setup/setup.component';
import { StudentTasksComponent } from './pages/student-tasks/student-tasks.component';
import { AdminDashboardComponent } from './pages/admin-dashboard/admin-dashboard.component';
import { HodDashboardComponent } from './pages/hod-dashboard/hod-dashboard.component';

const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'admin/dashboard', component: AdminDashboardComponent },
  { path: 'hod/dashboard', component: HodDashboardComponent },
  { path: 'student/tasks', component: StudentTasksComponent },
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      { path: 'profile', component: SetupComponent },
      { path: 'setup', redirectTo: 'profile', pathMatch: 'full' },
      { path: 'generate', component: ExamforgeGenerateComponent },
      { path: 'gap-analysis', loadChildren: () =>
          import('./modules/gap-analysis/gap-analysis.module')
          .then(m => m.GapAnalysisModule)
      },
      { path: 'transform', loadChildren: () =>
          import('./modules/transform/transform.module')
          .then(m => m.TransformModule)
      },
      { path: '', redirectTo: 'profile', pathMatch: 'full' }
    ]
  },
  { path: '**', redirectTo: 'login' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
