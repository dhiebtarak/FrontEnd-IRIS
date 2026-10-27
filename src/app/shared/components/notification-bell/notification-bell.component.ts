import { CommonModule, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationItem } from '../../models/financial-workflow.model';
import { FinancialWorkflowService } from '../../services/financial-workflow.service';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './notification-bell.component.html',
  styles: `:host { display: block; position: relative; }`
})
export class NotificationBellComponent implements OnInit {
  private readonly service = inject(FinancialWorkflowService);
  private readonly router = inject(Router);

  readonly notifications = signal<NotificationItem[]>([]);
  readonly isOpen = signal(false);
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly unreadCount = computed(() => this.notifications().filter(item => !item.isRead).length);

  ngOnInit(): void {
    this.loadNotifications();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.isOpen.set(false);
  }

  @HostListener('window:iris-notifications-refresh')
  onNotificationsRefresh(): void {
    this.loadNotifications();
  }

  toggle(): void {
    this.isOpen.update(value => !value);

    if (this.isOpen()) {
      this.loadNotifications();
    }
  }

  loadNotifications(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.service.getNotifications(false).subscribe({
      next: notifications => {
        this.notifications.set(notifications);
        this.isLoading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage.set(this.getErrorMessage(error));
        this.isLoading.set(false);
      }
    });
  }

  markRead(notification: NotificationItem, event?: Event): void {
    event?.stopPropagation();

    if (this.isReceiptPairingNotification(notification)) {
      this.navigateToNotification(notification);
      return;
    }

    if (notification.isRead) {
      this.navigateToNotification(notification);
      return;
    }

    this.service.markNotificationRead(notification.idNotification).subscribe({
      next: updated => {
        this.notifications.update(items =>
          items.map(item => item.idNotification === notification.idNotification ? { ...item, ...updated, isRead: true } : item)
        );
        this.navigateToNotification(notification);
      },
      error: (error: HttpErrorResponse) => this.errorMessage.set(this.getErrorMessage(error))
    });
  }

  markAllRead(): void {
    this.service.markAllNotificationsRead().subscribe({
      next: () => this.notifications.update(items => items.map(item => ({ ...item, isRead: true }))),
      error: (error: HttpErrorResponse) => this.errorMessage.set(this.getErrorMessage(error))
    });
  }

  navigateToNotification(notification: NotificationItem): void {
    const route = this.getNotificationRoute(notification);

    if (route) {
      this.isOpen.set(false);
      void this.router.navigate(route.commands, { queryParams: route.queryParams });
    }
  }

  getNotificationTitle(notification: NotificationItem): string {
    return this.isReceiptPairingNotification(notification)
      ? 'New encaissement to pair'
      : notification.title;
  }

  getNotificationMessage(notification: NotificationItem): string {
    if (this.isContractReadyForInvoiceNotification(notification) || this.isContractReadyForDebitNoteNotification(notification)) {
      const record = notification as NotificationItem & { umr?: string; contractUmr?: string; contractName?: string; name?: string };
      const umr = record.umr || record.contractUmr;
      const contractName = record.contractName || record.name;

      if (umr && contractName) {
        return this.isContractReadyForDebitNoteNotification(notification)
          ? `Contract ${umr} - ${contractName} is bound and ready for debit note.`
          : `Contract ${umr} - ${contractName} is bound and ready to invoice.`;
      }
    }

    return notification.message;
  }

  getNotificationAction(notification: NotificationItem): string | null {
    const type = `${notification.notificationType} ${notification.entityType}`.toLowerCase();
    if (notification.closingId != null || type.includes('outgoing_closing')) return 'Open Closing';
    if (type.includes('contractreadyforinvoice') || type.includes('contractreadyfordebitnote')) {
      return 'Open Contract';
    }

    if (this.isReceiptPairingNotification(notification)) {
      return 'Open';
    }

    return type.includes('remittance') ? 'Make Disbursement' : null;
  }

  isReceiptPairingNotification(notification: NotificationItem): boolean {
    const type = `${notification.notificationType} ${notification.entityType}`.toLowerCase();
    return type.includes('receiptrequirespairing') || type.includes('bank_receipt') || type.includes('receipt');
  }

  private getNotificationRoute(notification: NotificationItem): { commands: string[]; queryParams?: Record<string, number | string> } | null {
    const type = `${notification.notificationType} ${notification.entityType}`.trim().toLowerCase();
    const id = this.getNotificationContractId(notification) ?? notification.entityId;
    const workspace = this.router.url.includes('/finance-officer')
      ? '/workspace/reassurance/finance-officer'
      : '/workspace/reassurance/back-officer';

    const isClosingEntity = notification.entityType.trim().toUpperCase() === 'OUTGOING_CLOSING';
    if (notification.closingId != null || isClosingEntity) {
      const closingId = notification.closingId ?? (isClosingEntity ? notification.entityId : null);
      return closingId && closingId > 0 ? {
        commands: ['/workspace/reassurance/finance-officer/disbursement-queue'],
        queryParams: { closingId, notificationId: notification.idNotification }
      } : null;
    }

    if (type.includes('contractreadyforinvoice') || type.includes('contractreadyfordebitnote')) {
      return id
        ? { commands: ['/workspace/reassurance/back-officer/contracts', String(id), 'overview'], queryParams: { notificationId: notification.idNotification } }
        : { commands: ['/workspace/reassurance/back-officer/contracts'] };
    }

    if (type.includes('receipt') || type.includes('bank_receipt')) {
      const queryParams = id ? { receiptId: id, notificationId: notification.idNotification } : undefined;
      return workspace.includes('finance')
        ? { commands: [`${workspace}/incoming-remittances`], queryParams }
        : { commands: [`${workspace}/receipt-pairing`], queryParams };
    }

    if (type.includes('invoice')) {
      return { commands: [`${workspace}/invoices`], queryParams: id ? { invoiceId: id } : undefined };
    }

    if (type.includes('remittance')) {
      const remittanceReference = this.getNotificationRemittanceReference(notification);
      const queryParams = remittanceReference != null
        ? { remittanceReference, notificationId: notification.idNotification }
        : undefined;
      return workspace.includes('finance')
        ? { commands: [`${workspace}/disbursement-queue`], queryParams }
        : { commands: [`${workspace}/outgoing-remittances`], queryParams };
    }

    return null;
  }

  private isContractReadyForInvoiceNotification(notification: NotificationItem): boolean {
    return `${notification.notificationType} ${notification.entityType}`.toLowerCase().includes('contractreadyforinvoice');
  }

  private isContractReadyForDebitNoteNotification(notification: NotificationItem): boolean {
    return `${notification.notificationType} ${notification.entityType}`.toLowerCase().includes('contractreadyfordebitnote');
  }

  private getNotificationContractId(notification: NotificationItem): number | null {
    const id = notification.contractId ?? notification.entityId;
    return typeof id === 'number' && Number.isFinite(id) && id > 0 ? id : null;
  }

  private getNotificationRemittanceReference(notification: NotificationItem): number | null {
    const type = notification.entityType.trim().toUpperCase();
    if (type !== 'REMITTANCE_REF') {
      return null;
    }

    const reference = Number(notification.entityId);
    return Number.isSafeInteger(reference) && reference > 0 ? reference : null;
  }

  private getErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 401) {
      return 'Session expired. Sign in again to view notifications.';
    }

    if (error.status === 403) {
      return 'You do not have permission to view these notifications.';
    }

    return 'Notifications could not be loaded.';
  }

}
