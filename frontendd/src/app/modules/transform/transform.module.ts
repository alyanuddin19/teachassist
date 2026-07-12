import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';

import { TransformComponent } from './components/transform.component';
import { TransformRoutingModule } from './transform-routing.module';
import { TeacherFormComponent } from './components/teacher-form.component';
import { LiveSheetComponent } from './components/live-sheet.component';
import { ColumnMappingComponent } from './components/column-mapping.component';
import { DocumentConverterComponent } from './components/document-converter.component';

@NgModule({
  declarations: [
    TransformComponent,
    ColumnMappingComponent,
    DocumentConverterComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    HttpClientModule,
    TransformRoutingModule,
    TeacherFormComponent,
    LiveSheetComponent
  ]
})
export class TransformModule {}
