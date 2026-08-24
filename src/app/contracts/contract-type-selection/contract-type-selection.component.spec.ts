import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { provideRouter, Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ContractTypeSelectionComponent } from './contract-type-selection.component';
import { ContractsService } from '../../shared/services/contracts.service';
import { ContractTypeReference } from '../../shared/models/contract.model';

describe('ContractTypeSelectionComponent', () => {
  let fixture: ComponentFixture<ContractTypeSelectionComponent>;
  let component: ContractTypeSelectionComponent;
  let router: Router;
  let contractsService: Pick<ContractsService, 'getContractTypes'>;
  const snackBar = {
    open: vi.fn()
  };

  const contractTypes: ContractTypeReference[] = [
    { id: 1, code: 'FACULTATIVE', name: 'Facultative', description: 'Facultative contract.', categoryTags: ['Proportional'], isImplemented: true },
    { id: 2, code: 'QUOTA_SHARE', name: 'Quota Share', description: 'Quota share contract.', categoryTags: ['Proportional'], isImplemented: false },
    { id: 3, code: 'SURPLUS', name: 'Surplus', description: 'Surplus contract.', categoryTags: ['Proportional'], isImplemented: false },
    { id: 4, code: 'NON_PROP', name: 'Non-Proportional', description: 'Non-proportional contract.', categoryTags: ['Non-Proportional'], isImplemented: false }
  ];

  beforeEach(async () => {
    contractsService = {
      getContractTypes: vi.fn(() => of(contractTypes))
    };
    await TestBed.configureTestingModule({
      imports: [ContractTypeSelectionComponent],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: ContractsService, useValue: contractsService }
      ]
    })
      .overrideComponent(ContractTypeSelectionComponent, {
        add: {
          providers: [{ provide: MatSnackBar, useValue: snackBar }]
        }
      })
      .compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(ContractTypeSelectionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders four contract cards and only enables continuing for Facultative', () => {
    const buttons = fixture.nativeElement.querySelectorAll('section button[type="button"]');
    expect(component.contractTypes().length).toBe(4);
    expect(buttons.length).toBeGreaterThanOrEqual(4);
    expect(component.canContinue).toBe(false);

    component.selectType(contractTypes[0]);
    expect(component.canContinue).toBe(true);
  });

  it('shows the development message when an unavailable type is clicked', () => {
    snackBar.open.mockClear();
    component.selectType(contractTypes[1]);

    expect(snackBar.open).toHaveBeenCalledWith(
      'This contract type is currently under development.',
      'Dismiss',
      expect.objectContaining({ duration: 3500 })
    );
    expect(component.selectedTypeId()).toBeNull();
  });

  it('navigates to the Facultative form after selecting Facultative', () => {
    component.selectType(contractTypes[0]);
    component.continue();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/workspace/reassurance/front-officer/contracts/new/facultative');
  });
});
