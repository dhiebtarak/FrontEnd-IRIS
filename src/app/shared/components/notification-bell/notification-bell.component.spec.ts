import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { FinancialWorkflowService } from '../../services/financial-workflow.service';
import { NotificationBellComponent } from './notification-bell.component';

describe('NotificationBellComponent', () => {
  let fixture: ComponentFixture<NotificationBellComponent>;
  let service: {
    getNotifications: ReturnType<typeof vi.fn>;
    markNotificationRead: ReturnType<typeof vi.fn>;
    markAllNotificationsRead: ReturnType<typeof vi.fn>;
    downloadContractDebitNote: ReturnType<typeof vi.fn>;
  };
  let router: {
    url: string;
    navigate: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    service = {
      getNotifications: vi.fn().mockReturnValue(of([
        {
          idNotification: 5,
          notificationType: 'ReceiptRequiresPairing',
          title: 'Backend title',
          message: 'Ami - TND 1250.1234 - 2026-09-15',
          entityType: 'BANK_RECEIPT',
          entityId: 42,
          isRead: false,
          createdAt: '2026-09-15T08:00:00Z'
        }
      ])),
      markNotificationRead: vi.fn().mockReturnValue(of({
        idNotification: 5,
        notificationType: 'ReceiptRequiresPairing',
        title: 'Backend title',
        message: 'Ami - TND 1250.1234 - 2026-09-15',
        entityType: 'BANK_RECEIPT',
        entityId: 42,
        isRead: true,
        createdAt: '2026-09-15T08:00:00Z'
      })),
      markAllNotificationsRead: vi.fn().mockReturnValue(of(null)),
      downloadContractDebitNote: vi.fn().mockReturnValue(of({ blob: new Blob(['pdf'], { type: 'application/pdf' }), fileName: 'DebitNote-123.pdf', contentType: 'application/pdf' }))
    };
    router = {
      url: '/workspace/reassurance/back-officer',
      navigate: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [NotificationBellComponent],
      providers: [
        { provide: FinancialWorkflowService, useValue: service },
        { provide: Router, useValue: router }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationBellComponent);
    vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:debit-note');
    vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows receipt-pairing notifications and navigates Back Officer to receipt pairing', () => {
    fixture.componentInstance.toggle();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('New encaissement to pair');
    expect(fixture.nativeElement.textContent).toContain('Ami - TND 1250.1234 - 2026-09-15');

    fixture.componentInstance.markRead(fixture.componentInstance.notifications()[0]);

    expect(service.markNotificationRead).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(
      ['/workspace/reassurance/back-officer/receipt-pairing'],
      { queryParams: { receiptId: 42, notificationId: 5 } }
    );
  });

  it('shows the Finance remittance action and navigates to the referenced disbursement', () => {
    router.url = '/workspace/reassurance/finance-officer';
    const notification = {
      idNotification: 9,
      notificationType: 'RemittanceReadyForDisbursement',
      title: 'Remittance ready for disbursement',
      message: 'Reinsurer AMI - Contract IT26-F-PD-0001 - TND 1620.000',
      entityType: 'REMITTANCE_REF',
      entityId: 77,
      isRead: false,
      createdAt: '2026-09-23T10:30:00Z'
    };
    service.getNotifications.mockReturnValue(of([notification]));
    service.markNotificationRead.mockReturnValue(of({
      ...notification,
      isRead: true
    }));
    fixture.componentInstance.notifications.set([
      {
        idNotification: 9,
        notificationType: 'RemittanceReadyForDisbursement',
        title: 'Remittance ready for disbursement',
        message: 'Reinsurer AMI - Contract IT26-F-PD-0001 - TND 1620.000',
        entityType: 'REMITTANCE_REF',
        entityId: 77,
        isRead: false,
        createdAt: '2026-09-23T10:30:00Z'
      }
    ]);
    fixture.componentInstance.toggle();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Remittance ready for disbursement');
    expect(fixture.nativeElement.textContent).toContain('Make Disbursement');

    fixture.componentInstance.markRead(fixture.componentInstance.notifications()[0]);

    expect(service.markNotificationRead).toHaveBeenCalledWith(9);
    expect(router.navigate).toHaveBeenCalledWith(
      ['/workspace/reassurance/finance-officer/disbursement-queue'],
      { queryParams: { remittanceRef: 77, notificationId: 9 } }
    );
  });

  it('uses explicit closingId instead of notification or remittance IDs', () => {
    router.url = '/workspace/reassurance/finance-officer';
    const notification = { idNotification: 23, notificationType: 'CLOSING_DISBURSEMENT_REQUIRED',
      title: 'Closing issued', message: 'Closing CL-1', entityType: 'OUTGOING_CLOSING',
      entityId: 6, closingId: 1, isRead: false, createdAt: '2026-10-12T08:00:00Z' };
    service.markNotificationRead.mockReturnValue(of({ ...notification, isRead: true }));
    expect(fixture.componentInstance.getNotificationAction(notification)).toBe('Open Closing');
    fixture.componentInstance.markRead(notification);
    expect(router.navigate).toHaveBeenCalledWith(
      ['/workspace/reassurance/finance-officer/disbursement-queue'],
      { queryParams: { closingId: 1, notificationId: 23 } }
    );
  });

  it('shows ContractReadyForDebitNote actions and downloads the contract debit note', () => {
    const notification = {
      idNotification: 12,
      notificationType: 'ContractReadyForDebitNote',
      title: 'Contract ready for debit note',
      message: 'Backend message',
      entityType: 'CONTRACT',
      entityId: 123,
      contractId: 123,
      umr: 'IT26-F-PD-0003',
      contractName: 'Facultative contract Star',
      isRead: false,
      createdAt: '2026-10-05T10:30:00Z'
    };
    service.getNotifications.mockReturnValue(of([notification]));
    fixture.componentInstance.notifications.set([notification]);
    fixture.componentInstance.toggle();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Contract IT26-F-PD-0003 - Facultative contract Star is bound and ready for debit note.');
    expect(fixture.nativeElement.textContent).toContain('Open Contract');
    expect(fixture.nativeElement.textContent).toContain('Download Debit Note');

    fixture.componentInstance.downloadNotificationDebitNote(notification);

    expect(service.downloadContractDebitNote).toHaveBeenCalledWith(123);
    expect(service.downloadContractDebitNote).toHaveBeenCalledTimes(1);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });
});
