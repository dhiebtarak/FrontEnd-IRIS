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

  it('adds contact rows from the plus button, validates them and submits every pair', async () => {
    component.f.name.setValue('Multiple contacts');
    component.toggleCounterpartyType('Cedent');
    component.f.email.setValue('primary@example.test');
    const add = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(button => button.textContent?.includes('Add another contact'))!;
    add.click();
    fixture.detectChanges();
    expect(component.f.additionalContacts.length).toBe(1);
    expect(component.f.additionalContacts.at(0).hasError('emptyContact')).toBe(true);
    component.f.additionalContacts.at(0).patchValue({ email: 'bad email', phoneNumber: '+21611111111' });
    expect(component.f.additionalContacts.at(0).invalid).toBe(true);
    component.f.additionalContacts.at(0).patchValue({ email: 'second@example.test' });
    component.addContact();
    component.f.additionalContacts.at(1).patchValue({ email: 'third@example.test', phoneNumber: '+21622222222' });
    await component.onSubmit();
    expect(counterpartiesService.createCounterparty).toHaveBeenCalledWith(expect.objectContaining({
      email: 'primary@example.test',
      additionalContacts: [
        { email: 'second@example.test', phoneNumber: '+21611111111' },
        { email: 'third@example.test', phoneNumber: '+21622222222' }
      ]
    }));
  });

  it('removes an extra contact without changing the primary contact', () => {
    component.f.email.setValue('primary@example.test');
    component.addContact();
    component.removeContact(0);
    expect(component.f.additionalContacts.length).toBe(0);
    expect(component.f.email.value).toBe('primary@example.test');
  });

  it('reloads extra contacts for editing and restores them when the form is reset', async () => {
    vi.spyOn(TestBed.inject(ActivatedRoute).snapshot.paramMap, 'get').mockReturnValue('8');
    (counterpartiesService.getCounterpartyById as ReturnType<typeof vi.fn>).mockReturnValue(of({
      id: 8, name: 'Existing counterparty', types: ['Cedent'], email: 'primary@example.test',
      additionalContacts: [{ email: 'second@example.test', phoneNumber: '+21611111111' }]
    }));
    component.ngOnInit();
    expect(component.f.additionalContacts.at(0).controls.email.value).toBe('second@example.test');
    component.removeContact(0);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    component.resetForm();
    expect(component.f.additionalContacts.length).toBe(1);
    component.f.additionalContacts.at(0).controls.phoneNumber.setValue('+21622222222');
    await component.onSubmit();
    expect(counterpartiesService.updateCounterparty).toHaveBeenCalledWith('8', expect.objectContaining({
      additionalContacts: [{ email: 'second@example.test', phoneNumber: '+21622222222' }]
    }));
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
