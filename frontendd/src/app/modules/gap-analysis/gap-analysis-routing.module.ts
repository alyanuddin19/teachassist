import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { GapAnalysisComponent } from './components/gap-analysis.component';

const routes: Routes = [
  { path: '', component: GapAnalysisComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class GapAnalysisRoutingModule {}
