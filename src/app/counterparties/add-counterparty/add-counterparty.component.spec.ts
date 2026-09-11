import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { CounterpartiesService } from '../../shared/services/counterparties.service';
import { AddCounterpartyComponent } from './add-counterparty.component';

describe('AddCounterpartyComponent', () => {
  let fixture: ComponentFixture<AddCounterpartyComponent>;
  let component: AddCounterpartyComponent;
  let counterpartiesService: Pick<CounterpartiesService, 'createCounterparty' | 'getCounterpartyById' | 'updateCounterparty'>;

  beforeEach(async () => {
    counterpartiesService = {
      createCounterparty: vi.fn().mockReturnValue(of({})),
      getCounterpartyById: vi.fn().mockReturnValue(of({})),
      updateCounterparty: vi.fn().mockReturnValue(of({}))
    };

    await TestBed.configureTestingModule({
      imports: [AddCounterpartyComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => null } } }
        },
        { provide: CounterpartiesService, useValue: counterpartiesService },
        { provide: ToastrService, useValue: { success: vi.fn(), error: vi.fn() } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AddCounterpartyComponent);
    component = fixture.componentInstance;
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture.detectChanges();
  });

  it('renders all supported types and requires at least one selection', () => {
    expect(fixture.nativeElement.textContent).toContain('Cedent');
    expect(fixture.nativeElement.textContent).toContain('Reinsurer');
    expect(fixture.nativeElement.textContent).toContain('Client');
    expect(fixture.nativeElement.textContent).toContain('Partner');
    expect(component.f.types.value).toEqual([]);
    expect(component.f.types.hasError('required')).toBe(true);
  });

  it('toggles multiple types and submits the selected array exactly', async () => {
    component.f.name.setValue('STAR Assurances');
    component.toggleCounterpartyType('Cedent');
    component.toggleCounterpartyType('Reinsurer');

    await component.onSubmit();

    expect(counterpartiesService.createCounterparty).toHaveBeenCalledWith(
      expect.objectContaining({ types: ['Cedent', 'Reinsurer'] })
    );
    const payload = (counterpartiesService.createCounterparty as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload).not.toHaveProperty('type');
  });
});
