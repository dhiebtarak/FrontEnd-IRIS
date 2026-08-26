import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-claims-coming-soon',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './claims-coming-soon.component.html',
  styles: ``
})
export class ClaimsComingSoonComponent {
  readonly dashboardRoute = '/workspace/reassurance/front-officer';
}
