import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';

type ContractCreationStep = 1 | 2 | 3 | 4;

@Component({
  selector: 'app-contract-creation-stepper',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './contract-creation-stepper.component.html',
  styles: ``
})
export class ContractCreationStepperComponent {
  readonly activeStep = input<ContractCreationStep>(1);

  readonly steps = [
    { index: 1, label: 'Type' },
    { index: 2, label: 'Information' },
    { index: 3, label: 'Conditions' },
    { index: 4, label: 'Review' }
  ] as const;
}
