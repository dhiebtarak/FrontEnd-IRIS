import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ContractCreationStepperComponent } from '../contract-creation-stepper/contract-creation-stepper.component';

@Component({
  selector: 'app-contract-conditions-placeholder',
  standalone: true,
  imports: [CommonModule, RouterLink, ContractCreationStepperComponent],
  templateUrl: './contract-conditions-placeholder.component.html',
  styles: ``
})
export class ContractConditionsPlaceholderComponent {
  private readonly route = inject(ActivatedRoute);
  readonly informationRoute = '/workspace/reassurance/front-officer/contracts/new/facultative';
  readonly contractId = this.route.snapshot.queryParamMap.get('contractId');
}
