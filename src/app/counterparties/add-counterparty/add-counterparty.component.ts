import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, signal } from '@angular/core';
import { AbstractControl, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import {
  AttachmentUploadRequest,
  Counterparty,
  CounterpartyAttachment,
  CounterpartyAttachmentControlName,
  CounterpartyUpsertRequest,
  CounterpartyStatus,
  CounterpartyType
} from '../../shared/models/counterparty.model';
import { CounterpartiesService } from '../../shared/services/counterparties.service';

const urlValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = typeof control.value === 'string' ? control.value.trim() : '';

  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? null : { invalidUrl: true };
  } catch {
    return { invalidUrl: true };
  }
};

const integerValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = control.value;

  if (value == null || value === '') {
    return null;
  }

  return Number.isInteger(Number(value)) ? null : { integer: true };
};

type AttachmentFormValue = {
  originalFileName: string;
};

type AttachmentFormGroup = FormGroup<{
  originalFileName: FormControl<string>;
}>;

type CounterpartyFormValue = {
  name: string;
  type: CounterpartyType | '';
  activity: string;
  status: CounterpartyStatus;
  isActive: boolean;
  website: string;
  cedantLegalEntity: string;
  commercialRegisterAttachment: AttachmentFormValue;
  taxIdentificationNumberAttachment: AttachmentFormValue;
  email: string;
  phoneNumber: string;
  addressLine: string;
  city: string;
  postalCode: string;
  country: string;
  legacyClientId: string;
  legacyCompanyCode: string;
  observations: string;
};

const supportedAttachmentExtensions = new Set(['.pdf', '.png', '.jpg', '.jpeg']);
const maxAttachmentSizeBytes = 10 * 1024 * 1024;

@Component({
  selector: 'app-add-counterparty',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './add-counterparty.component.html',
  styles: ``
})
export class AddCounterpartyComponent implements OnInit {
  readonly counterpartyTypes: CounterpartyType[] = ['Cedent', 'Reinsurer', 'Client'];
  readonly statusOptions: CounterpartyStatus[] = ['Active', 'Inactive', 'Pending', 'Suspended'];
  readonly attachmentAccept = '.pdf,.png,.jpg,.jpeg';
  readonly maxAttachmentSizeInMb = 10;
  readonly countries = [
    'Algeria', 'Belgium', 'Canada', 'Egypt', 'France', 'Germany', 'Italy', 'Japan', 'Kenya', 'Luxembourg',
    'Morocco', 'Netherlands', 'Nigeria', 'Portugal', 'Qatar', 'Saudi Arabia', 'Senegal', 'South Africa',
    'Spain', 'Switzerland', 'Tunisia', 'United Arab Emirates', 'United Kingdom', 'United States'
  ];
  readonly listRoute = '/workspace/reassurance/front-officer/counterparties';
  readonly dashboardRoute = '/workspace/reassurance/front-officer';

  counterpartyForm!: FormGroup<{
    name: FormControl<string>;
    type: FormControl<CounterpartyType | ''>;
    activity: FormControl<string>;
    status: FormControl<CounterpartyStatus>;
    isActive: FormControl<boolean>;
    website: FormControl<string>;
    cedantLegalEntity: FormControl<string>;
    commercialRegisterAttachment: AttachmentFormGroup;
    taxIdentificationNumberAttachment: AttachmentFormGroup;
    email: FormControl<string>;
    phoneNumber: FormControl<string>;
    addressLine: FormControl<string>;
    city: FormControl<string>;
    postalCode: FormControl<string>;
    country: FormControl<string>;
    legacyClientId: FormControl<string>;
    legacyCompanyCode: FormControl<string>;
    observations: FormControl<string>;
  }>;

  submitted = false;
  readonly isSubmitting = signal(false);
  readonly isEncodingFiles = signal(false);
  readonly isLoadingRecord = signal(false);
  readonly isLegacyOpen = signal(false);
  isEditMode = false;
  readonly formErrorMessage = signal('');
  counterpartyId: number | string | null = null;
  readonly emptyAttachmentValue: AttachmentFormValue = {
    originalFileName: ''
  };
  readonly emptyFormValue: CounterpartyFormValue = {
    name: '',
    type: '' as CounterpartyType | '',
    activity: '',
    status: 'Active' as CounterpartyStatus,
    isActive: true,
    website: '',
    cedantLegalEntity: '',
    commercialRegisterAttachment: { ...this.emptyAttachmentValue },
    taxIdentificationNumberAttachment: { ...this.emptyAttachmentValue },
    email: '',
    phoneNumber: '',
    addressLine: '',
    city: '',
    postalCode: '',
    country: '',
    legacyClientId: '',
    legacyCompanyCode: '',
    observations: ''
  };
  private initialFormValue: CounterpartyFormValue = {
    ...this.emptyFormValue,
    commercialRegisterAttachment: { ...this.emptyAttachmentValue },
    taxIdentificationNumberAttachment: { ...this.emptyAttachmentValue }
  };
  private selectedAttachmentFiles: Record<CounterpartyAttachmentControlName, File | null> = {
    commercialRegisterAttachment: null,
    taxIdentificationNumberAttachment: null
  };
  private existingAttachmentNames: Record<CounterpartyAttachmentControlName, string> = {
    commercialRegisterAttachment: '',
    taxIdentificationNumberAttachment: ''
  };

  constructor(
    private readonly fb: FormBuilder,
    private readonly route: ActivatedRoute,
    private readonly counterpartiesService: CounterpartiesService,
    private readonly toastr: ToastrService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    const routeCounterpartyId = this.route.snapshot.paramMap.get('id');

    this.isEditMode = !!routeCounterpartyId;
    this.counterpartyId = routeCounterpartyId;

    this.counterpartyForm = this.fb.group({
      name: this.fb.nonNullable.control(this.emptyFormValue.name, [Validators.required]),
      type: this.fb.nonNullable.control(this.emptyFormValue.type, [Validators.required]),
      activity: this.fb.nonNullable.control(this.emptyFormValue.activity),
      status: this.fb.nonNullable.control(this.emptyFormValue.status),
      isActive: this.fb.nonNullable.control(this.emptyFormValue.isActive),
      website: this.fb.nonNullable.control(this.emptyFormValue.website, [urlValidator]),
      cedantLegalEntity: this.fb.nonNullable.control(this.emptyFormValue.cedantLegalEntity),
      commercialRegisterAttachment: this.createAttachmentGroup(this.emptyFormValue.commercialRegisterAttachment),
      taxIdentificationNumberAttachment: this.createAttachmentGroup(this.emptyFormValue.taxIdentificationNumberAttachment),
      email: this.fb.nonNullable.control(this.emptyFormValue.email, [Validators.email]),
      phoneNumber: this.fb.nonNullable.control(this.emptyFormValue.phoneNumber),
      addressLine: this.fb.nonNullable.control(this.emptyFormValue.addressLine),
      city: this.fb.nonNullable.control(this.emptyFormValue.city),
      postalCode: this.fb.nonNullable.control(this.emptyFormValue.postalCode),
      country: this.fb.nonNullable.control(this.emptyFormValue.country),
      legacyClientId: this.fb.nonNullable.control(this.emptyFormValue.legacyClientId, [integerValidator]),
      legacyCompanyCode: this.fb.nonNullable.control(this.emptyFormValue.legacyCompanyCode),
      observations: this.fb.nonNullable.control(this.emptyFormValue.observations)
    });

    if (this.isEditMode && this.counterpartyId != null) {
      console.log('Loading counterparty...');
      this.loadCounterparty(this.counterpartyId);
      return;
    }

    this.initialFormValue = this.createInitialFormValue(this.emptyFormValue);
  }

  get f() {
    return this.counterpartyForm.controls;
  }

  get selectedType(): CounterpartyType | '' {
    return this.f.type.value;
  }

  get pageTitle(): string {
    return this.isEditMode ? 'Counterparty Details' : 'Add Counterparty';
  }

  get pageSubtitle(): string {
    return this.isEditMode ? 'Review and update counterparty information.' : 'Create a cedent, reinsurer, or client.';
  }

  get breadcrumbLabel(): string {
    return this.isEditMode ? (this.f.name.value || 'Counterparty Details') : 'Add Counterparty';
  }

  get canConfirmUpdate(): boolean {
    return this.isEditMode && this.counterpartyForm.dirty && !this.isBusy;
  }

  get submitButtonLabel(): string {
    if (this.isEncodingFiles()) {
      return 'Preparing upload...';
    }

    if (this.isSubmitting()) {
      return this.isEditMode ? 'Updating...' : 'Saving...';
    }

    return this.isEditMode ? 'Update Counterparty' : 'Save Counterparty';
  }

  get topActionLabel(): string {
    return this.isBusy ? 'Confirming...' : 'Confirm Update';
  }

  get isBusy(): boolean {
    return this.isSubmitting() || this.isEncodingFiles() || this.isLoadingRecord();
  }

  get observationsLength(): number {
    return this.f.observations.value.length;
  }

  get completionPercentage(): number {
    const trackedValues = [
      this.f.name.value,
      this.f.type.value,
      this.f.activity.value,
      this.f.status.value,
      this.f.cedantLegalEntity.value,
      this.f.email.value,
      this.f.phoneNumber.value,
      this.f.addressLine.value,
      this.f.city.value,
      this.f.postalCode.value,
      this.f.country.value,
      this.f.commercialRegisterAttachment.controls.originalFileName.value,
      this.f.taxIdentificationNumberAttachment.controls.originalFileName.value
    ];
    const completedFields = trackedValues.filter(value => typeof value === 'string' ? value.trim().length > 0 : !!value).length;

    return Math.round((completedFields / trackedValues.length) * 100);
  }

  toggleLegacySection(): void {
    this.isLegacyOpen.set(!this.isLegacyOpen());
  }

  resetForm(): void {
    if (this.isSubmitting()) {
      return;
    }

    if (!window.confirm('Clear all entered counterparty information?')) {
      return;
    }

    this.counterpartyForm.reset(this.createInitialFormValue(this.initialFormValue));
    this.counterpartyForm.markAsPristine();
    this.counterpartyForm.markAsUntouched();
    this.counterpartyForm.updateValueAndValidity();
    this.clearSelectedAttachmentFiles();
    this.syncExistingAttachmentNames(this.initialFormValue);
    this.submitted = false;
    this.formErrorMessage.set('');
    this.clearAllServerErrors();
    this.isLegacyOpen.set(false);
  }

  onCancel(): void {
    if (this.isSubmitting()) {
      return;
    }

    this.router.navigateByUrl(this.listRoute);
  }

  async onSubmit(): Promise<void> {
    this.submitted = true;
    this.formErrorMessage.set('');
    this.clearAllServerErrors();
    this.trimFormValues();

    if (this.counterpartyForm.invalid) {
      this.counterpartyForm.markAllAsTouched();
      return;
    }

    this.isEncodingFiles.set(true);
    let payload: CounterpartyUpsertRequest;

    try {
      payload = await this.buildJsonPayload();
    } catch {
      this.isEncodingFiles.set(false);
      const message = 'A selected file could not be prepared for upload. Please choose the file again.';
      this.formErrorMessage.set(message);
      this.toastr.error(message, 'Error');
      return;
    }

    this.isEncodingFiles.set(false);
    this.isSubmitting.set(true);

    const request = this.isEditMode && this.counterpartyId != null
      ? this.counterpartiesService.updateCounterparty(this.counterpartyId, payload)
      : this.counterpartiesService.createCounterparty(payload);

    request.subscribe({
      next: counterparty => {
        if (this.isEditMode) {
          const formValue = this.mapCounterpartyToFormValue(counterparty);
          this.applyFormValue(formValue);
          this.toastr.success('Counterparty updated successfully.', 'Success');
        } else {
          this.toastr.success('Counterparty created successfully.', 'Success');
          void this.router.navigateByUrl(this.listRoute);
        }

        this.isSubmitting.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.handleSubmissionError(error);
        this.isSubmitting.set(false);
      }
    });
  }

  hasError(controlPath: string, errorName: string): boolean {
    const control = this.counterpartyForm.get(controlPath);
    return !!(control && control.hasError(errorName) && (control.touched || this.submitted));
  }

  getAttachmentGroup(controlName: 'commercialRegisterAttachment' | 'taxIdentificationNumberAttachment'): AttachmentFormGroup {
    return this.counterpartyForm.controls[controlName];
  }

  getAttachmentDisplayName(controlName: CounterpartyAttachmentControlName): string {
    return this.getAttachmentGroup(controlName).controls.originalFileName.value || 'Not provided';
  }

  hasPendingAttachmentFile(controlName: CounterpartyAttachmentControlName): boolean {
    return this.selectedAttachmentFiles[controlName] instanceof File;
  }

  onAttachmentSelected(controlName: CounterpartyAttachmentControlName, event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.item(0) ?? null;

    if (!input || !file) {
      return;
    }

    const attachmentControl = this.getAttachmentGroup(controlName).controls.originalFileName;
    const previousFile = this.selectedAttachmentFiles[controlName];
    const previousFileName = attachmentControl.value;
    this.clearAttachmentValidationErrors(controlName);

    if (!this.isSupportedAttachmentType(file)) {
      this.selectedAttachmentFiles[controlName] = previousFile;
      attachmentControl.setValue(previousFileName, { emitEvent: false });
      attachmentControl.setErrors({
        ...(attachmentControl.errors ?? {}),
        invalidAttachmentType: true
      });
      attachmentControl.markAsTouched();
      input.value = '';
      return;
    }

    if (file.size > maxAttachmentSizeBytes) {
      this.selectedAttachmentFiles[controlName] = previousFile;
      attachmentControl.setValue(previousFileName, { emitEvent: false });
      attachmentControl.setErrors({
        ...(attachmentControl.errors ?? {}),
        attachmentTooLarge: true
      });
      attachmentControl.markAsTouched();
      input.value = '';
      return;
    }

    this.selectedAttachmentFiles[controlName] = file;
    attachmentControl.setValue(file.name, { emitEvent: false });
    attachmentControl.markAsDirty();
    attachmentControl.markAsTouched();
    this.counterpartyForm.markAsDirty();
  }

  removeSelectedFile(controlName: CounterpartyAttachmentControlName, input: HTMLInputElement): void {
    if (this.isSubmitting()) {
      return;
    }

    this.selectedAttachmentFiles[controlName] = null;
    this.clearAttachmentValidationErrors(controlName);

    const attachmentControl = this.getAttachmentGroup(controlName).controls.originalFileName;
    attachmentControl.setValue(this.existingAttachmentNames[controlName], { emitEvent: false });
    attachmentControl.markAsDirty();
    attachmentControl.markAsTouched();
    this.counterpartyForm.markAsDirty();
    input.value = '';
  }

  private createAttachmentGroup(value: AttachmentFormValue): AttachmentFormGroup {
    return this.fb.group({
      originalFileName: this.fb.nonNullable.control(value.originalFileName)
    });
  }

  private async buildJsonPayload(): Promise<CounterpartyUpsertRequest> {
    const rawValue = this.counterpartyForm.getRawValue();
    const commercialRegister = await this.createAttachmentUploadRequest(this.selectedAttachmentFiles.commercialRegisterAttachment);
    const taxIdAttachment = await this.createAttachmentUploadRequest(this.selectedAttachmentFiles.taxIdentificationNumberAttachment);

    return {
      name: rawValue.name,
      type: rawValue.type,
      email: rawValue.email,
      phoneNumber: rawValue.phoneNumber,
      addressLine: rawValue.addressLine,
      city: rawValue.city,
      country: rawValue.country,
      isActive: rawValue.isActive,
      activity: rawValue.activity,
      cedantLegalEntity: rawValue.cedantLegalEntity,
      legacyClientId: rawValue.legacyClientId === '' ? null : Number(rawValue.legacyClientId),
      legacyCompanyCode: rawValue.legacyCompanyCode,
      observations: rawValue.observations,
      postalCode: rawValue.postalCode,
      status: rawValue.status,
      website: rawValue.website,
      commercialRegister,
      taxIdAttachment
    };
  }

  private clearSelectedAttachmentFiles(): void {
    this.selectedAttachmentFiles = {
      commercialRegisterAttachment: null,
      taxIdentificationNumberAttachment: null
    };
  }

  private loadCounterparty(id: number | string): void {
    this.isLoadingRecord.set(true);

    this.counterpartiesService.getCounterpartyById(id).subscribe({
      next: counterparty => {
        console.log('Loaded counterparty:', counterparty);
        const formValue = this.mapCounterpartyToFormValue(counterparty);

        this.applyFormValue(formValue);
        this.isLoadingRecord.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.toastr.error(this.getLoadErrorMessage(error), 'Error');
        this.isLoadingRecord.set(false);
        void this.router.navigateByUrl(this.listRoute);
      }
    });
  }

  private applyFormValue(formValue: CounterpartyFormValue): void {
    this.initialFormValue = this.createInitialFormValue(formValue);
    this.counterpartyForm.reset(this.createInitialFormValue(formValue));
    this.counterpartyForm.markAsPristine();
    this.counterpartyForm.markAsUntouched();
    this.counterpartyForm.updateValueAndValidity();
    this.clearSelectedAttachmentFiles();
    this.syncExistingAttachmentNames(formValue);
    this.isLegacyOpen.set(this.shouldOpenLegacySection(formValue));
    this.submitted = false;
    this.formErrorMessage.set('');
  }

  private mapCounterpartyToFormValue(counterparty: Partial<Counterparty> | null | undefined): CounterpartyFormValue {
    return {
      name: this.toText(counterparty?.name),
      type: this.toCounterpartyType(counterparty?.type),
      activity: this.toText(counterparty?.activity),
      status: this.toCounterpartyStatus(counterparty?.status),
      isActive: counterparty?.isActive ?? true,
      website: this.toText(counterparty?.website),
      cedantLegalEntity: this.toText(counterparty?.cedantLegalEntity),
      commercialRegisterAttachment: this.mapAttachmentToFormValue(counterparty?.commercialRegisterAttachment),
      taxIdentificationNumberAttachment: this.mapAttachmentToFormValue(counterparty?.taxIdentificationNumberAttachment),
      email: this.toText(counterparty?.email),
      phoneNumber: this.toText(counterparty?.phoneNumber),
      addressLine: this.toText(counterparty?.addressLine),
      city: this.toText(counterparty?.city),
      postalCode: this.toText(counterparty?.postalCode),
      country: this.toText(counterparty?.country),
      legacyClientId: counterparty?.legacyClientId == null ? '' : String(counterparty.legacyClientId),
      legacyCompanyCode: this.toText(counterparty?.legacyCompanyCode),
      observations: this.toText(counterparty?.observations)
    };
  }

  private mapAttachmentToFormValue(attachment: CounterpartyAttachment | null | undefined): AttachmentFormValue {
    return {
      originalFileName: this.toText(attachment?.originalFileName)
    };
  }

  private shouldOpenLegacySection(formValue: CounterpartyFormValue): boolean {
    return formValue.type === 'Client' || !!formValue.legacyClientId || !!formValue.legacyCompanyCode;
  }

  private trimFormValues(): void {
    for (const key of Object.keys(this.counterpartyForm.controls) as Array<keyof typeof this.counterpartyForm.controls>) {
      const control = this.counterpartyForm.controls[key];

      if (control instanceof FormGroup) {
        for (const nestedControl of Object.values(control.controls)) {
          if (typeof nestedControl.value === 'string') {
            nestedControl.setValue(nestedControl.value.trim() as never, { emitEvent: false });
          }
        }

        continue;
      }

      if (typeof control.value === 'string') {
        control.setValue(control.value.trim() as never, { emitEvent: false });
      }
    }
  }

  private clearAllServerErrors(): void {
    this.clearServerErrorsRecursive(this.counterpartyForm);
  }

  private clearServerErrorsRecursive(control: AbstractControl): void {
    const errors = { ...(control.errors ?? {}) };

    if ('serverError' in errors) {
      delete errors['serverError'];
      control.setErrors(Object.keys(errors).length ? errors : null);
    }

    if (control instanceof FormGroup) {
      for (const childControl of Object.values(control.controls)) {
        this.clearServerErrorsRecursive(childControl);
      }
    }
  }

  private handleSubmissionError(error: HttpErrorResponse): void {
    const backendErrors = this.extractBackendErrors(error.error);
    let mappedAtLeastOneField = false;

    for (const [key, messages] of Object.entries(backendErrors.fieldErrors)) {
      const controlPath = this.mapBackendField(key);

      if (!controlPath) {
        continue;
      }

      const control = this.counterpartyForm.get(controlPath);

      if (!control) {
        continue;
      }

      control.setErrors({
        ...(control.errors ?? {}),
        serverError: messages.join(' ')
      });
      control.markAsTouched();
      mappedAtLeastOneField = true;
    }

    const genericMessage = backendErrors.generalErrors[0] ?? this.getGenericErrorMessage(error);
    this.formErrorMessage.set(genericMessage);
    this.toastr.error(genericMessage, 'Error');

    if (!mappedAtLeastOneField && !backendErrors.generalErrors.length) {
      this.formErrorMessage.set(this.getGenericErrorMessage(error));
    }
  }

  private extractBackendErrors(payload: unknown): { generalErrors: string[]; fieldErrors: Record<string, string[]> } {
    const result: { generalErrors: string[]; fieldErrors: Record<string, string[]> } = {
      generalErrors: [],
      fieldErrors: {}
    };

    if (typeof payload === 'string' && payload.trim()) {
      result.generalErrors.push(payload);
      return result;
    }

    if (!payload || typeof payload !== 'object') {
      return result;
    }

    const body = payload as Record<string, unknown>;
    const errors = body['errors'];

    if (errors && typeof errors === 'object' && !Array.isArray(errors)) {
      for (const [key, value] of Object.entries(errors as Record<string, unknown>)) {
        const messages = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [String(value)];
        result.fieldErrors[key] = messages;
      }
    }

    const message = body['message'] ?? body['title'] ?? body['detail'];

    if (typeof message === 'string' && message.trim()) {
      result.generalErrors.push(message);
    }

    return result;
  }

  private mapBackendField(fieldName: string): string | null {
    const normalizedField = fieldName.toLowerCase().replace(/\[(\w+)\]/g, '.$1');
    const map: Record<string, string> = {
      name: 'name',
      type: 'type',
      email: 'email',
      phonenumber: 'phoneNumber',
      addressline: 'addressLine',
      city: 'city',
      country: 'country',
      isactive: 'isActive',
      activity: 'activity',
      cedantlegalentity: 'cedantLegalEntity',
      cedantlegalentityid: 'cedantLegalEntity',
      cedantlegalentityname: 'cedantLegalEntity',
      legacyclientid: 'legacyClientId',
      legacycompanycode: 'legacyCompanyCode',
      observations: 'observations',
      postalcode: 'postalCode',
      status: 'status',
      website: 'website',
      commercialregister: 'commercialRegisterAttachment.originalFileName',
      'commercialregister.filename': 'commercialRegisterAttachment.originalFileName',
      'commercialregister.contenttype': 'commercialRegisterAttachment.originalFileName',
      'commercialregister.base64content': 'commercialRegisterAttachment.originalFileName',
      taxidattachment: 'taxIdentificationNumberAttachment.originalFileName',
      'taxidattachment.filename': 'taxIdentificationNumberAttachment.originalFileName',
      'taxidattachment.contenttype': 'taxIdentificationNumberAttachment.originalFileName',
      'taxidattachment.base64content': 'taxIdentificationNumberAttachment.originalFileName',
      'commercialregisterattachment': 'commercialRegisterAttachment.originalFileName',
      'commercialregisterattachment.originalfilename': 'commercialRegisterAttachment.originalFileName',
      'commercialregisterattachment.filename': 'commercialRegisterAttachment.originalFileName',
      'commercialregisterattachment.fileextension': 'commercialRegisterAttachment.originalFileName',
      'commercialregisterattachment.mimetype': 'commercialRegisterAttachment.originalFileName',
      'commercialregisterattachment.storageprovider': 'commercialRegisterAttachment.originalFileName',
      'commercialregisterattachment.filepath': 'commercialRegisterAttachment.originalFileName',
      'commercialregisterattachment.notecontent': 'commercialRegisterAttachment.originalFileName',
      'commercialregisterattachment.confidentialitylevel': 'commercialRegisterAttachment.originalFileName',
      'commercialregisterattachment.status': 'commercialRegisterAttachment.originalFileName',
      'commercialregisterattachment.isactive': 'commercialRegisterAttachment.originalFileName',
      commercialregisterfile: 'commercialRegisterAttachment.originalFileName',
      'taxidentificationnumberattachment': 'taxIdentificationNumberAttachment.originalFileName',
      'taxidentificationnumberattachment.originalfilename': 'taxIdentificationNumberAttachment.originalFileName',
      'taxidentificationnumberattachment.filename': 'taxIdentificationNumberAttachment.originalFileName',
      'taxidentificationnumberattachment.fileextension': 'taxIdentificationNumberAttachment.originalFileName',
      'taxidentificationnumberattachment.mimetype': 'taxIdentificationNumberAttachment.originalFileName',
      'taxidentificationnumberattachment.storageprovider': 'taxIdentificationNumberAttachment.originalFileName',
      'taxidentificationnumberattachment.filepath': 'taxIdentificationNumberAttachment.originalFileName',
      'taxidentificationnumberattachment.notecontent': 'taxIdentificationNumberAttachment.originalFileName',
      'taxidentificationnumberattachment.confidentialitylevel': 'taxIdentificationNumberAttachment.originalFileName',
      'taxidentificationnumberattachment.status': 'taxIdentificationNumberAttachment.originalFileName',
      'taxidentificationnumberattachment.isactive': 'taxIdentificationNumberAttachment.originalFileName',
      taxidattachmentfile: 'taxIdentificationNumberAttachment.originalFileName'
    };

    return map[normalizedField] ?? null;
  }

  private getGenericErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 0) {
      return 'Unable to reach the counterparty service. Please try again.';
    }

    if (error.status >= 500) {
      return 'The counterparty could not be saved because the server returned an error.';
    }

    return 'The counterparty could not be saved. Review the form and try again.';
  }

  private getLoadErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 404) {
      return 'The requested counterparty could not be found.';
    }

    if (error.status === 0) {
      return 'Unable to load counterparty details right now.';
    }

    return 'Counterparty details could not be loaded.';
  }

  private toText(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private toCounterpartyType(value: unknown): CounterpartyType | '' {
    return value === 'Cedent' || value === 'Reinsurer' || value === 'Client' ? value : '';
  }

  private toCounterpartyStatus(value: unknown): CounterpartyStatus {
    return value === 'Active' || value === 'Inactive' || value === 'Pending' || value === 'Suspended' ? value : 'Active';
  }

  private cloneAttachmentValue(value: AttachmentFormValue): AttachmentFormValue {
    return {
      originalFileName: value.originalFileName
    };
  }

  private createInitialFormValue(value: CounterpartyFormValue): CounterpartyFormValue {
    return {
      ...value,
      commercialRegisterAttachment: this.cloneAttachmentValue(value.commercialRegisterAttachment),
      taxIdentificationNumberAttachment: this.cloneAttachmentValue(value.taxIdentificationNumberAttachment)
    };
  }

  private syncExistingAttachmentNames(formValue: CounterpartyFormValue): void {
    this.existingAttachmentNames = {
      commercialRegisterAttachment: formValue.commercialRegisterAttachment.originalFileName,
      taxIdentificationNumberAttachment: formValue.taxIdentificationNumberAttachment.originalFileName
    };
  }

  private clearAttachmentValidationErrors(controlName: CounterpartyAttachmentControlName): void {
    const attachmentControl = this.getAttachmentGroup(controlName).controls.originalFileName;
    const errors = { ...(attachmentControl.errors ?? {}) };

    delete errors['invalidAttachmentType'];
    delete errors['attachmentTooLarge'];
    delete errors['serverError'];

      attachmentControl.setErrors(Object.keys(errors).length ? errors : null);
  }

  private async createAttachmentUploadRequest(file: File | null): Promise<AttachmentUploadRequest | null> {
    if (!file) {
      return null;
    }

    return {
      fileName: file.name,
      contentType: file.type || this.getAttachmentContentType(file.name),
      base64Content: await this.readFileAsBase64(file)
    };
  }

  private readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result !== 'string') {
          reject(new Error('Invalid file reader result.'));
          return;
        }

        const [, base64Content] = reader.result.split(',', 2);

        if (!base64Content) {
          reject(new Error('Invalid data URL.'));
          return;
        }

        resolve(base64Content);
      };

      reader.onerror = () => reject(reader.error ?? new Error('Unable to read file.'));
      reader.readAsDataURL(file);
    });
  }

  private isSupportedAttachmentType(file: File): boolean {
    const extension = file.name.includes('.') ? `.${file.name.split('.').pop()?.toLowerCase()}` : '';

    if (supportedAttachmentExtensions.has(extension)) {
      return true;
    }

    return ['application/pdf', 'image/png', 'image/jpg', 'image/jpeg'].includes(file.type);
  }

  private getAttachmentContentType(fileName: string): string {
    const extension = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : '';

    switch (extension) {
      case 'pdf':
        return 'application/pdf';
      case 'png':
        return 'image/png';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      default:
        return 'application/octet-stream';
    }
  }
}
