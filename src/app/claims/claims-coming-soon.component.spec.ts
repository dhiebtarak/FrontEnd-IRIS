import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ClaimsComingSoonComponent } from './claims-coming-soon.component';

describe('ClaimsComingSoonComponent', () => {
  let fixture: ComponentFixture<ClaimsComingSoonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClaimsComingSoonComponent],
      providers: [provideRouter([])]
    }).compileComponents();

    fixture = TestBed.createComponent(ClaimsComingSoonComponent);
    fixture.detectChanges();
  });

  it('renders the Coming Soon message and dashboard action', () => {
    expect(fixture.nativeElement.textContent).toContain('Claims Management Coming Soon');

    const dashboardLink = fixture.nativeElement.querySelector('a');
    expect(dashboardLink.getAttribute('href')).toBe('/workspace/reassurance/front-officer');
  });
});
