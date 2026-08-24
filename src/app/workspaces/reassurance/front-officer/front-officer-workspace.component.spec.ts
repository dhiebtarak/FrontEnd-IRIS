import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { FrontOfficerWorkspaceComponent } from './front-officer-workspace.component';
import { Auth } from '../../../shared/services/auth';

describe('FrontOfficerWorkspaceComponent', () => {
  let fixture: ComponentFixture<FrontOfficerWorkspaceComponent>;
  let authService: Pick<Auth, 'getWorkspaceRoute' | 'logout'>;

  beforeEach(async () => {
    authService = {
      getWorkspaceRoute: vi.fn(),
      logout: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [FrontOfficerWorkspaceComponent],
      providers: [
        provideRouter([]),
        { provide: Auth, useValue: authService },
        { provide: ToastrService, useValue: { success: vi.fn() } }
      ]
    }).compileComponents();
  });

  it('shows the Create Contract button for Front Officer users', () => {
    vi.mocked(authService.getWorkspaceRoute).mockReturnValue('/workspace/reassurance/front-officer');
    fixture = TestBed.createComponent(FrontOfficerWorkspaceComponent);
    fixture.detectChanges();

    const button = Array.from<HTMLAnchorElement>(fixture.nativeElement.querySelectorAll('a')).find(anchor =>
      anchor.textContent?.includes('Create Contract')
    );

    expect(button).toBeTruthy();
  });

  it('does not show the Create Contract button for other roles', () => {
    vi.mocked(authService.getWorkspaceRoute).mockReturnValue('/workspace/reassurance/back-officer');
    fixture = TestBed.createComponent(FrontOfficerWorkspaceComponent);
    fixture.detectChanges();

    const button = Array.from<HTMLAnchorElement>(fixture.nativeElement.querySelectorAll('a')).find(anchor =>
      anchor.textContent?.includes('Create Contract')
    );

    expect(button).toBeUndefined();
  });
});
