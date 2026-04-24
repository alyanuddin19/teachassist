import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';

import { GapAnalysisComponent } from './components/gap-analysis.component';
import { GapAnalysisRoutingModule } from './gap-analysis-routing.module';

@NgModule({
  declarations: [GapAnalysisComponent],
  imports: [
    CommonModule,
    FormsModule,
    HttpClientModule,
    GapAnalysisRoutingModule
  ]
})
export class GapAnalysisModule {}
