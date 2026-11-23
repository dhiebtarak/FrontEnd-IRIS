import { Component } from '@angular/core';
import { ContractClaimsComponent } from './contract-claims.component';

@Component({
  selector: 'app-claims-coming-soon',
  standalone: true,
  imports: [ContractClaimsComponent],
  templateUrl: './claims-coming-soon.component.html',
  styles: ``
})
export class ClaimsComingSoonComponent {
  readonly dashboardRoute = '/workspace/reassurance/front-officer';
}
