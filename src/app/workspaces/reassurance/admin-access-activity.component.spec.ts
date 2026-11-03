import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { AdminAccessActivityComponent } from './admin-access-activity.component';
import { AccessActivityService, ActivityRow, formatDuration } from '../../shared/services/access-activity.service';
import { Auth } from '../../shared/services/auth';
import { AdminWorkspaceComponent } from './admin-workspace.component';
import { RoleWorkspaceShellComponent } from './shared/role-workspace-shell.component';
import { ToastrService } from 'ngx-toastr';

describe('Administrator Access Activity', () => {
  const row: ActivityRow = { sessionId:'session-1',userId:'user-1',fullName:'Jane Doe',username:'jane',email:'jane@example.test',role:'Front officer',department:'Reassurance',accountStatus:'Enabled',loginAtUtc:new Date(Date.now()-720000).toISOString(),lastActivityAtUtc:null,logoutAtUtc:null,expiresAtUtc:null,revokedAtUtc:null,durationSeconds:720,sessionStatus:'Active',ipAddress:'127.0.0.1',userAgent:'Test browser',browser:'Test',operatingSystem:null,deviceType:null,revocationReason:null,revokedByUserId:null,result:'Successful',eventType:'LoginSuccessful',isCurrentSession:false };
  let api: { list: ReturnType<typeof vi.fn>; summary: ReturnType<typeof vi.fn>; detail: ReturnType<typeof vi.fn>; history: ReturnType<typeof vi.fn>; revoke: ReturnType<typeof vi.fn>; revokeAll: ReturnType<typeof vi.fn> };
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  beforeEach(() => {
    params = new BehaviorSubject(convertToParamMap({ userId:'user-1' }));
    api = { list:vi.fn().mockReturnValue(of({ items:[row],totalCount:41,pageNumber:1,pageSize:20 })), summary:vi.fn().mockReturnValue(of({activeSessions:1,successfulLoginsToday:2,failedLoginsLast24Hours:3,lockedOrDisabledAccounts:0,revokedSessionsToday:0,averageSessionDurationSeconds:720})), detail:vi.fn().mockReturnValue(of(row)),history:vi.fn().mockReturnValue(of({items:[],totalCount:0,pageNumber:1,pageSize:20})),revoke:vi.fn().mockReturnValue(of({revokedCount:1,currentSessionRevoked:false})),revokeAll:vi.fn().mockReturnValue(of({revokedCount:1})) };
    TestBed.configureTestingModule({ providers:[provideRouter([]),{provide:AccessActivityService,useValue:api},{provide:Auth,useValue:{getCurrentUser:()=>({id:'admin'}),clearSession:vi.fn(),isAdmin:()=>true,hasModule:()=>true}},{provide:ActivatedRoute,useValue:{snapshot:{queryParamMap:params.value},queryParamMap:params}},{provide:ToastrService,useValue:{}}] });
  });
  it('has exactly the four administration links even when all modules are granted', () => {
    const admin = new AdminWorkspaceComponent();
    const shell = TestBed.createComponent(RoleWorkspaceShellComponent).componentInstance;
    shell.navigationItems = admin.navigationItems;
    expect(shell.visibleNavigationItems.map(i=>i.label)).toEqual(['Create User','Accounts','Permissions','Access Activity']);
    expect(shell.visibleNavigationItems.every(i=>i.route.startsWith('/workspace/administrator/'))).toBe(true);
  });
  it('loads backend data once with the Accounts user filter and renders badges', () => {
    const fixture = TestBed.createComponent(AdminAccessActivityComponent);fixture.detectChanges();
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.list.mock.calls[0][0].userId).toBe('user-1');
    expect(fixture.nativeElement.textContent).toContain('Jane Doe');
    expect(fixture.nativeElement.querySelector('.badge.active')).toBeTruthy();
    expect(fixture.componentInstance.statusLabel('LoggedOut')).toBe('Logged Out');
  });
  it('sends filters, sorting and pagination to the backend', () => {
    const component = TestBed.createComponent(AdminAccessActivityComponent).componentInstance;
    component.filter('sessionStatus','Revoked');component.sort('username');component.page(1);
    expect(api.list.mock.lastCall?.[0]).toMatchObject({sessionStatus:'Revoked',sortBy:'username',pageNumber:2});
  });
  it('debounces search', async () => {
    const component = TestBed.createComponent(AdminAccessActivityComponent).componentInstance;
    component.searchChanged('j');component.searchChanged('jane');
    await new Promise(resolve=>setTimeout(resolve,350));
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.list.mock.lastCall?.[0].search).toBe('jane');
  });
  it('requires confirmation before revoking and prevents duplicate requests', () => {
    const component = TestBed.createComponent(AdminAccessActivityComponent).componentInstance;
    component.askRevoke(row);expect(api.revoke).not.toHaveBeenCalled();
    component.confirmRevoke();expect(api.revoke).toHaveBeenCalledTimes(1);expect(component.confirmation()).toBeNull();
    component.confirmRevoke();expect(api.revoke).toHaveBeenCalledTimes(1);
  });
  it('shows warning before revoking the current session', () => {
    const fixture=TestBed.createComponent(AdminAccessActivityComponent);
    fixture.componentInstance.askRevoke({...row,isCurrentSession:true});fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('You will be signed out.');
  });
  it('renders loading, empty and API errors distinctly', () => {
    const pending = new BehaviorSubject({items:[],totalCount:0,pageNumber:1,pageSize:20});
    api.list.mockReturnValue(pending);
    const fixture=TestBed.createComponent(AdminAccessActivityComponent);fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Loading access activity');
    pending.complete();fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No access activity found.');
    api.list.mockReturnValue(throwError(()=>({status:500,error:{message:'Server unavailable'}})));
    fixture.componentInstance.apply({});fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Server unavailable');
    expect(fixture.nativeElement.textContent).not.toContain('No access activity found.');
  });
  it('formats duration and updates active duration against the local clock', () => {
    expect(formatDuration(720)).toBe('12 minutes');expect(formatDuration(4800)).toBe('1 hour 20 minutes');expect(formatDuration(187200)).toBe('2 days 4 hours');
    const component=TestBed.createComponent(AdminAccessActivityComponent).componentInstance;
    component.now.set(Date.parse(row.loginAtUtc)+780000);expect(component.duration(row)).toBe('13 minutes');
  });
});
