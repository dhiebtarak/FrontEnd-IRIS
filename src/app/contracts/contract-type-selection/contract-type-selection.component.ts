import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ContractCreationStepperComponent } from '../contract-creation-stepper/contract-creation-stepper.component';
import { ContractTypeReference } from '../../shared/models/contract.model';
import { ContractsService } from '../../shared/services/contracts.service';

@Component({
  selector: 'app-contract-type-selection',
  standalone: true,
  imports: [CommonModule, RouterLink, MatSnackBarModule, ContractCreationStepperComponent],
  templateUrl: './contract-type-selection.component.html',
  styles: ``
})
export class ContractTypeSelectionComponent implements OnInit {
  readonly dashboardRoute = '/workspace/reassurance/front-officer';
  readonly facultativeRoute = '/workspace/reassurance/front-officer/contracts/new/facultative';
  readonly contractTypes = signal<ContractTypeReference[]>([]);
  readonly selectedTypeId = signal<number | null>(null);
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');

  constructor(
    private readonly contractsService: ContractsService,
    private readonly router: Router,
    private readonly snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadContractTypes();
  }

  get selectedType(): ContractTypeReference | undefined {
    return this.contractTypes().find(type => type.id === this.selectedTypeId());
  }

  get canContinue(): boolean {
    const selectedType = this.selectedType;
    return !!selectedType && this.isFacultative(selectedType) && selectedType.isImplemented;
  }

  loadContractTypes(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.contractsService.getContractTypes().subscribe({
      next: types => {
        this.contractTypes.set(types);
        this.selectedTypeId.set(null);
        this.isLoading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage.set(this.getLoadErrorMessage(error));
        this.isLoading.set(false);
      }
    });
  }

  selectType(type: ContractTypeReference): void {
    if (!type.isImplemented || !this.isFacultative(type)) {
      this.snackBar.open('This contract type is currently under development.', 'Dismiss', {
        duration: 3500,
        horizontalPosition: 'end',
        verticalPosition: 'top'
      });
      return;
    }

    this.selectedTypeId.set(type.id);
  }

  continue(): void {
    if (!this.canContinue) {
      return;
    }

    void this.router.navigateByUrl(this.facultativeRoute);
  }

  private isFacultative(type: ContractTypeReference): boolean {
    const normalizedText = `${type.code} ${type.name}`.toLowerCase();
    return normalizedText.includes('facultative');
  }

  private getLoadErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 0) {
      return 'Contract types could not be loaded right now. Check the connection and try again.';
    }

    return 'Contract types could not be loaded. Please retry.';
  }
}
