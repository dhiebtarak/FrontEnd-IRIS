import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { Auth } from '../../../shared/services/auth';
import { FrontOfficerLayoutComponent } from './front-officer-layout.component';

describe('FrontOfficerLayoutComponent', () => {
  let fixture: ComponentFixture<FrontOfficerLayoutComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FrontOfficerLayoutComponent],
      providers: [
        provideRouter([]),
        { provide: Auth, useValue: { logout: vi.fn().mockReturnValue(of({})) } },
        { provide: ToastrService, useValue: { success: vi.fn() } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(FrontOfficerLayoutComponent);
    fixture.detectChanges();
  });

  it('renders the four Front Officer navigation destinations', () => {
    const text = fixture.nativeElement.textContent;

    expect(text).toContain('Dashboard');
    expect(text).toContain('Counterparties');
    expect(text).toContain('Contracts');
    expect(text).toContain('Claims');
  });

  it('closes the mobile navigation when Escape is handled', () => {
    fixture.componentInstance.openMobileNavigation();

    fixture.componentInstance.onEscape();

    expect(fixture.componentInstance.isMobileNavigationOpen()).toBe(false);
  });
});
