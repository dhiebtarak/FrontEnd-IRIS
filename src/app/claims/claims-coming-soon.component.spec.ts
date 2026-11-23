import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ClaimsComingSoonComponent } from './claims-coming-soon.component';
import { provideHttpClient } from '@angular/common/http';
import { Auth } from '../shared/services/auth';

describe('ClaimsComingSoonComponent', () => {
  let fixture: ComponentFixture<ClaimsComingSoonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClaimsComingSoonComponent],
      providers: [provideRouter([]), provideHttpClient(), { provide: Auth, useValue: { hasModule: () => false } }]
    }).compileComponents();

    fixture = TestBed.createComponent(ClaimsComingSoonComponent);
    fixture.detectChanges();
  });

  it('renders the claims workspace instead of the placeholder', () => {
    expect(fixture.nativeElement.textContent).toContain('Claims');
    expect(fixture.nativeElement.textContent).toContain('Bound contract overview');
    expect(fixture.nativeElement.textContent).not.toContain('Coming Soon');
  });
});
