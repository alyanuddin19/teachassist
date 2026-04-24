import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TransformComponent } from './components/transform.component';

const routes: Routes = [
  {
    path: '',
    component: TransformComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TransformRoutingModule {}
