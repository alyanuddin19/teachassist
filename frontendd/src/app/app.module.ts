import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { LoginComponent } from './components/login/login.component';
import { MainLayoutComponent } from './layout/main-layout/main-layout.component';
import { SetupComponent } from './pages/setup/setup.component';
import { StudentTasksComponent } from './pages/student-tasks/student-tasks.component';
import { AdminDashboardComponent } from './pages/admin-dashboard/admin-dashboard.component';
import { HodDashboardComponent } from './pages/hod-dashboard/hod-dashboard.component';
import { ExamforgeGenerateComponent } from './pages/examforge-generate/examforge-generate.component';



@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    MainLayoutComponent,
    SetupComponent,
    StudentTasksComponent,
    AdminDashboardComponent,
    HodDashboardComponent,
    ExamforgeGenerateComponent
  ],
  imports: [
    BrowserModule,
    FormsModule,
    HttpClientModule,
    AppRoutingModule   // ✅ routing enabled
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
