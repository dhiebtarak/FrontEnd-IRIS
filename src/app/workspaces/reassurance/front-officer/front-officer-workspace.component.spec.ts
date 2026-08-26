import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { DashboardSummary } from '../../../shared/models/contract.model';
import { Auth } from '../../../shared/services/auth';
import { ContractsService } from '../../../shared/services/contracts.service';
import { FrontOfficerWorkspaceComponent } from './front-officer-workspace.component';

describe('FrontOfficerWorkspaceComponent', () => {
  let fixture: ComponentFixture<FrontOfficerWorkspaceComponent>;
  let dashboardResponse: Subject<DashboardSummary>;
  let authService: Pick<Auth, 'getWorkspaceRoute'>;
  let contractsService: Pick<ContractsService, 'getDashboardSummary'>;

  const summary: DashboardSummary = {
    totalContracts: 2,
    pendingReviewContracts: 2,
    boundActiveContracts: 0,
    actionRequiredContracts: 0,
    workflowDistribution: [
      { status: 'Draft', count: 2, percentage: 100 }
    ],
    recentContracts: [
      {
        idContract: 2,
        umr: 'B1235FAC2026-X',
        name: 'Property Facultative Contract STAR',
        cedentId: 2,
        cedentName: 'STAR Assurances',
        contractType: 'Facultative',
        status: 'Draft',
        currencyCode: 'TND',
        inceptionDate: '2026-09-20',
        expiryDate: '2027-08-10',
        updatedAt: '2026-08-20T11:24:44.4214526'
      }
    ]
  };

  beforeEach(async () => {
    dashboardResponse = new Subject<DashboardSummary>();
    authService = {
      getWorkspaceRoute: vi.fn().mockReturnValue('/workspace/reassurance/front-officer')
    };
    contractsService = {
      getDashboardSummary: vi.fn().mockReturnValue(dashboardResponse)
    };

    await TestBed.configureTestingModule({
      imports: [FrontOfficerWorkspaceComponent],
      providers: [
        provideRouter([]),
        { provide: Auth, useValue: authService },
        { provide: ContractsService, useValue: contractsService }
      ]
    }).compileComponents();
  });

  it('loads the dashboard summary on initialization', () => {
    fixture = TestBed.createComponent(FrontOfficerWorkspaceComponent);
    fixture.detectChanges();

    expect(contractsService.getDashboardSummary).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.dashboardState()).toBe('loading');
    expect(fixture.nativeElement.textContent).not.toContain('Awaiting dashboard API');
  });

  it('renders real totals, including zero values, workflow, and recent contracts', () => {
    fixture = TestBed.createComponent(FrontOfficerWorkspaceComponent);
    fixture.detectChanges();

    dashboardResponse.next(summary);
    fixture.detectChanges();

    const value = (testId: string) =>
      fixture.nativeElement.querySelector(`[data-testid="${testId}"]`).textContent.trim();

    expect(value('total-contracts')).toBe('2');
    expect(value('pending-review')).toBe('2');
    expect(value('bound-active')).toBe('0');
    expect(value('action-required')).toBe('0');
    expect(fixture.nativeElement.textContent).toContain('Draft');
    expect(fixture.nativeElement.textContent).toContain('2 contracts');
    expect(fixture.nativeElement.textContent).toContain('100%');
    expect(fixture.nativeElement.textContent).toContain('B1235FAC2026-X');
    expect(fixture.nativeElement.textContent).toContain('Property Facultative Contract STAR');
    expect(fixture.nativeElement.textContent).toContain('STAR Assurances');
  });

  it('shows an error state and can retry the dashboard request', () => {
    vi.mocked(contractsService.getDashboardSummary)
      .mockReset()
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })))
      .mockReturnValueOnce(of(summary));

    fixture = TestBed.createComponent(FrontOfficerWorkspaceComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Unable to load dashboard');

    fixture.componentInstance.loadDashboardSummary();
    fixture.detectChanges();

    expect(contractsService.getDashboardSummary).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.dashboardState()).toBe('loaded');
    expect(fixture.nativeElement.querySelector('[data-testid="total-contracts"]').textContent.trim()).toBe('2');
  });

  it('shows the Create New Contract button for Front Officer users', () => {
    fixture = TestBed.createComponent(FrontOfficerWorkspaceComponent);
    fixture.detectChanges();

    const button = Array.from<HTMLAnchorElement>(fixture.nativeElement.querySelectorAll('a')).find(anchor =>
      anchor.textContent?.includes('Create New Contract')
    );

    expect(button).toBeTruthy();
  });

  it('does not show the Create Contract button for other roles', () => {
    vi.mocked(authService.getWorkspaceRoute).mockReturnValue('/workspace/reassurance/back-officer');
    fixture = TestBed.createComponent(FrontOfficerWorkspaceComponent);
    fixture.detectChanges();

    const button = Array.from<HTMLAnchorElement>(fixture.nativeElement.querySelectorAll('a')).find(anchor =>
      anchor.textContent?.includes('Create New Contract')
    );

    expect(button).toBeUndefined();
  });
});
