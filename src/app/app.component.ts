import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppUpdateService } from './shared/services/app-update.service';
import { ApplicationNoticesComponent } from './shared/components/application-notices.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ApplicationNoticesComponent],
  templateUrl: './app.component.html',
  styles: [],
})
export class AppComponent {
  constructor() { inject(AppUpdateService).start(); }
  title = 'FrontAuthIRIS';

}
