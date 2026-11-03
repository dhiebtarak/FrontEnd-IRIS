import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { Auth } from '../../shared/services/auth';
import { AdminAccountManagementComponent } from './admin-account-management.component';
describe('Accounts access history integration',()=>{
  it('shows login metrics and links to Access Activity with the real user ID',()=>{
    TestBed.configureTestingModule({providers:[provideRouter([]),{provide:Auth,useValue:{listAdminUsers:()=>of([{id:'actual-user-id',fullName:'Jane Doe',email:'jane@example.test',username:'jane',department:'Reassurance',position:'Front officer',roles:['Employee'],modules:[],isEnabled:false,lastSuccessfulLoginAtUtc:'2026-11-03T08:00:00Z',activeSessionCount:2,accountStatus:'Locked',isLocked:true}])}}]});
    const fixture=TestBed.createComponent(AdminAccountManagementComponent);fixture.detectChanges();
    const link: HTMLAnchorElement=fixture.nativeElement.querySelector('a');
    expect(link.getAttribute('href')).toBe('/workspace/administrator/access-activity?userId=actual-user-id');
    expect(fixture.nativeElement.textContent).toContain('Locked');
    expect(fixture.nativeElement.textContent).toContain('Active sessions');
    expect(fixture.nativeElement.textContent).toContain('Last successful login');
  });
});
