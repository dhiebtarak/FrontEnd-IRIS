import { DestroyRef, ElementRef, signal, computed } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  Subject,
  of,
  merge,
  map,
  tap,
  debounceTime,
  distinctUntilChanged,
  switchMap,
  catchError,
  finalize,
  forkJoin,
} from 'rxjs';
import { CedentReference, CoverageOption } from '../../shared/models/contract.model';
import { ContractsService } from '../../shared/services/contracts.service';
export type CoverageSelectionForm = FormGroup<{
  primaryMainCoverId: FormControl<number | null>;
  coverageIds: FormControl<number[]>;
  mainCoverId: FormControl<number | null>;
  sectionIds: FormControl<number[]>;
  extensionIds: FormControl<number[]>;
}>;
type ReferenceForm = {
  controls: {
    counterpartyId: FormControl<number | null>;
    coverageSelection: CoverageSelectionForm;
  };
};
type CoverageOptionGroup = { parentLabel: string; items: CoverageOption[] };
// Extracted from Facultative intake. Both contract forms share the same reference behavior.
export class ContractReferenceState {
  constructor(
    private readonly getForm: () => ReferenceForm,
    private readonly contractsService: ContractsService,
    private readonly destroyRef: DestroyRef,
  ) {}
  get form() {
    return this.getForm();
  }
  selectedCedentName = '';
  isHydratingCoverage = false;
  coveragePicker?: ElementRef<HTMLElement>;
  readonly selectionSnapshot = signal({
    primaryMainCoverId: null as number | null,
    coverageIds: [] as number[],
    mainCoverId: null as number | null,
    sectionIds: [] as number[],
    extensionIds: [] as number[],
  });
  refreshSnapshot() {
    this.selectionSnapshot.set(this.form.controls.coverageSelection.getRawValue());
  }
  hasError(path: string, errorName: string): boolean {
    const control = path.startsWith('coverageSelection.')
      ? this.form.controls.coverageSelection.get(path.slice(18))
      : this.form.controls.counterpartyId;
    return !!control && (control.touched || control.dirty) && control.hasError(errorName);
  }
  readonly cedentSearchControl = new FormControl('', { nonNullable: true });

  readonly isCedentLoading = signal(false);

  readonly isMainCoverLoading = signal(false);

  readonly isSectionsLoading = signal(false);

  readonly isExtensionsLoading = signal(false);

  readonly isCedentDropdownOpen = signal(false);

  readonly isMainCoverDropdownOpen = signal(false);

  readonly isCoverageDropdownOpen = signal(false);

  readonly coverageSearch = signal('');

  readonly sectionSearch = signal('');

  readonly extensionSearch = signal('');

  readonly cedentLookupError = signal(false);

  readonly mainCoverLookupError = signal(false);

  readonly sectionsError = signal('');

  readonly extensionsError = signal('');

  readonly cedentResults = signal<CedentReference[]>([]);

  readonly coverageCatalog = signal<CoverageOption[]>([]);

  readonly mainCovers = computed(() =>
    this.coverageCatalog().filter((option) => this.isMainCoverageLevel(option)),
  );

  readonly sections = signal<CoverageOption[]>([]);

  readonly extensions = signal<CoverageOption[]>([]);

  readonly activeCedentIndex = signal(-1);

  readonly activeMainCoverIndex = signal(-1);

  readonly filteredCoverages = computed(() => {
    const search = this.coverageSearch().trim().toLowerCase();

    if (!search) {
      return this.mainCovers();
    }

    return this.mainCovers().filter((option) => {
      const description = option.description ?? option.name;
      return (
        option.code.toLowerCase().includes(search) ||
        option.name.toLowerCase().includes(search) ||
        description.toLowerCase().includes(search)
      );
    });
  });

  readonly filteredMainCovers = computed(() => this.filteredCoverages());

  readonly selectedCoverageIds = computed(() => this.selectionSnapshot().coverageIds);

  readonly selectedSectionIds = computed(() => this.selectionSnapshot().sectionIds);

  readonly selectedExtensionIds = computed(() => this.selectionSnapshot().extensionIds);

  readonly availableSections = computed(() => {
    const selectedCoverageIds = new Set(this.selectedCoverageIds());
    return this.sections().filter(
      (section) =>
        section.level === 'SECTION' &&
        section.parentId != null &&
        selectedCoverageIds.has(section.parentId) &&
        section.relationType === 'HAS_SECTION',
    );
  });

  readonly availableExtensions = computed(() => {
    const selectedCoverageIds = new Set(this.selectedCoverageIds());
    const selectedSectionIds = new Set(this.selectedSectionIds());

    return this.extensions().filter((extension) => {
      if (
        extension.level !== 'EXTENSION' ||
        extension.parentId == null ||
        extension.relationType !== 'HAS_EXTENSION'
      ) {
        return false;
      }

      return (
        selectedCoverageIds.has(extension.parentId) || selectedSectionIds.has(extension.parentId)
      );
    });
  });

  readonly groupedSections = computed(() =>
    this.groupCoverageOptionsByParent(this.availableSections()),
  );

  readonly groupedExtensions = computed(() =>
    this.groupCoverageOptionsByParent(this.availableExtensions()),
  );

  readonly filteredSections = computed(() =>
    this.filterCoverageOptions(this.availableSections(), this.sectionSearch()),
  );

  readonly filteredExtensions = computed(() =>
    this.filterCoverageOptions(this.availableExtensions(), this.extensionSearch()),
  );

  readonly groupedFilteredSections = computed(() =>
    this.groupCoverageOptionsByParent(this.filteredSections()),
  );

  readonly groupedFilteredExtensions = computed(() =>
    this.groupCoverageOptionsByParent(this.filteredExtensions()),
  );

  readonly selectedMainCovers = computed(() =>
    this.findCoverageOptions(this.mainCovers(), this.selectedCoverageIds()),
  );

  readonly selectedMainCover = computed(() =>
    this.findCoverageOption(this.mainCovers(), this.selectionSnapshot().primaryMainCoverId),
  );

  readonly selectedSections = computed(() =>
    this.findCoverageOptions(this.availableSections(), this.selectedSectionIds()),
  );

  readonly selectedExtensions = computed(() =>
    this.findCoverageOptions(this.availableExtensions(), this.selectedExtensionIds()),
  );

  readonly cedentOpenRequests = new Subject<void>();

  readonly mainCoverOpenRequests = new Subject<void>();

  openCedentDropdown(): void {
    const shouldRefresh =
      !this.isCedentDropdownOpen() || this.cedentLookupError() || this.cedentResults().length === 0;
    this.isCedentDropdownOpen.set(true);

    if (shouldRefresh) {
      this.cedentOpenRequests.next();
    }
  }

  closeCedentDropdown(): void {
    this.isCedentDropdownOpen.set(false);
    this.activeCedentIndex.set(-1);
  }

  openMainCoverDropdown(): void {
    this.openCoverageDropdown();
  }

  openCoverageDropdown(): void {
    const shouldRefresh =
      !this.isCoverageDropdownOpen() ||
      this.mainCoverLookupError() ||
      this.mainCovers().length === 0;
    this.isCoverageDropdownOpen.set(true);
    this.isMainCoverDropdownOpen.set(true);

    if (shouldRefresh) {
      this.mainCoverOpenRequests.next();
    }
  }

  closeMainCoverDropdown(): void {
    this.closeCoverageDropdown();
  }

  closeCoverageDropdown(): void {
    this.isCoverageDropdownOpen.set(false);
    this.isMainCoverDropdownOpen.set(false);
    this.activeMainCoverIndex.set(-1);
    this.coverageSearch.set('');
  }

  onCoverageSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.coverageSearch.set(input.value);
    this.openCoverageDropdown();
    this.activeMainCoverIndex.set(this.filteredCoverages().length > 0 ? 0 : -1);
  }

  onCoverageFocusOut(event: FocusEvent): void {
    const nextTarget = event.relatedTarget as Node | null;

    if (nextTarget && this.coveragePicker?.nativeElement.contains(nextTarget)) {
      return;
    }

    this.closeCoverageDropdown();
  }

  selectMainCover(mainCover: CoverageOption): void {
    this.toggleMainCover(mainCover);
  }

  toggleMainCover(mainCover: CoverageOption): void {
    const controls = this.form.controls.coverageSelection.controls;
    const selectedIds = controls.coverageIds.value;
    const isSelected = selectedIds.includes(mainCover.id);
    const nextCoverageIds = isSelected
      ? selectedIds.filter((id) => id !== mainCover.id)
      : [...selectedIds, mainCover.id];
    let nextPrimaryMainCoverId = controls.primaryMainCoverId.value;

    if (!nextCoverageIds.length) {
      nextPrimaryMainCoverId = null;
    } else if (!nextPrimaryMainCoverId || !nextCoverageIds.includes(nextPrimaryMainCoverId)) {
      nextPrimaryMainCoverId = nextCoverageIds[0];
    }

    controls.coverageIds.setValue(nextCoverageIds);
    controls.primaryMainCoverId.setValue(nextPrimaryMainCoverId);
    controls.mainCoverId.setValue(nextPrimaryMainCoverId);
    controls.coverageIds.markAsDirty();
    controls.coverageIds.markAsTouched();
    controls.primaryMainCoverId.markAsTouched();
  }

  clearMainCoverSelection(): void {
    this.coverageSearch.set('');
    this.form.controls.coverageSelection.controls.coverageIds.setValue([]);
    this.form.controls.coverageSelection.controls.primaryMainCoverId.setValue(null);
    this.form.controls.coverageSelection.controls.mainCoverId.setValue(null);
    this.mainCoverLookupError.set(false);
    this.closeMainCoverDropdown();
  }

  removeMainCover(mainCoverId: number): void {
    const mainCover = this.mainCovers().find((option) => option.id === mainCoverId);
    if (mainCover) {
      this.toggleMainCover(mainCover);
    }
  }

  makePrimaryMainCover(mainCoverId: number): void {
    const controls = this.form.controls.coverageSelection.controls;
    if (!controls.coverageIds.value.includes(mainCoverId)) {
      return;
    }

    controls.primaryMainCoverId.setValue(mainCoverId);
    controls.mainCoverId.setValue(mainCoverId);
    controls.primaryMainCoverId.markAsDirty();
    controls.primaryMainCoverId.markAsTouched();
  }

  isMainCoverSelected(mainCoverId: number): boolean {
    return this.form.controls.coverageSelection.controls.coverageIds.value.includes(mainCoverId);
  }

  isPrimaryMainCover(mainCoverId: number): boolean {
    return this.form.controls.coverageSelection.controls.primaryMainCoverId.value === mainCoverId;
  }

  toggleSection(section: CoverageOption): void {
    const control = this.form.controls.coverageSelection.controls.sectionIds;
    const selectedIds = control.value;
    const nextSectionIds = selectedIds.includes(section.id)
      ? selectedIds.filter((id) => id !== section.id)
      : [...selectedIds, section.id];

    control.setValue(this.uniquePositiveNumberArray(nextSectionIds));
    control.markAsDirty();
    control.markAsTouched();
  }

  onSectionSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.sectionSearch.set(input.value);
  }

  removeSection(sectionId: number): void {
    const control = this.form.controls.coverageSelection.controls.sectionIds;
    control.setValue(control.value.filter((id) => id !== sectionId));
    control.markAsDirty();
    control.markAsTouched();
  }

  isSectionSelected(sectionId: number): boolean {
    return this.form.controls.coverageSelection.controls.sectionIds.value.includes(sectionId);
  }

  toggleExtension(extension: CoverageOption): void {
    const control = this.form.controls.coverageSelection.controls.extensionIds;
    const selectedIds = control.value;
    const nextExtensionIds = selectedIds.includes(extension.id)
      ? selectedIds.filter((id) => id !== extension.id)
      : [...selectedIds, extension.id];

    control.setValue(this.uniquePositiveNumberArray(nextExtensionIds));
    control.markAsDirty();
    control.markAsTouched();
  }

  onExtensionSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.extensionSearch.set(input.value);
  }

  removeExtension(extensionId: number): void {
    const control = this.form.controls.coverageSelection.controls.extensionIds;
    control.setValue(control.value.filter((id) => id !== extensionId));
    control.markAsDirty();
    control.markAsTouched();
  }

  isExtensionSelected(extensionId: number): boolean {
    return this.form.controls.coverageSelection.controls.extensionIds.value.includes(extensionId);
  }

  handleMainCoverKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.isCoverageDropdownOpen()) {
          this.openCoverageDropdown();
          return;
        }
        this.moveActiveMainCover(1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        if (!this.isCoverageDropdownOpen()) {
          this.openCoverageDropdown();
          return;
        }
        this.moveActiveMainCover(-1);
        return;
      case 'Enter': {
        if (!this.isCoverageDropdownOpen()) {
          return;
        }

        const activeMainCover = this.filteredCoverages()[this.activeMainCoverIndex()];

        if (!activeMainCover) {
          return;
        }

        event.preventDefault();
        this.toggleMainCover(activeMainCover);
        return;
      }
      case ' ':
      case 'Spacebar': {
        if (!this.isCoverageDropdownOpen()) {
          return;
        }

        const activeMainCover = this.filteredCoverages()[this.activeMainCoverIndex()];

        if (!activeMainCover) {
          return;
        }

        event.preventDefault();
        this.toggleMainCover(activeMainCover);
        return;
      }
      case 'Escape':
        if (!this.isCoverageDropdownOpen()) {
          return;
        }

        event.preventDefault();
        this.closeCoverageDropdown();
        return;
      default:
        return;
    }
  }

  setActiveMainCoverIndex(index: number): void {
    this.activeMainCoverIndex.set(index);
  }

  formatCoverageLabel(option: CoverageOption): string {
    return `${option.code} — ${option.name}`;
  }

  isMandatorySection(section: CoverageOption): boolean {
    return section.isMandatory;
  }

  isMandatoryExtension(extension: CoverageOption): boolean {
    return extension.isMandatory;
  }

  getCoverageParentLabel(option: CoverageOption): string {
    if (option.parentId == null) {
      return 'Coverage';
    }

    const parent = [...this.mainCovers(), ...this.availableSections()].find(
      (item) => item.id === option.parentId,
    );
    return parent ? this.formatCoverageLabel(parent) : 'Coverage';
  }

  getSelectedCoverageDescription(option: CoverageOption): string {
    return option.description ?? option.name;
  }

  selectCedent(cedent: CedentReference): void {
    this.selectedCedentName = cedent.name;
    this.cedentSearchControl.setValue(cedent.name, { emitEvent: false });
    this.form.controls.counterpartyId.setValue(cedent.id);
    this.form.controls.counterpartyId.markAsDirty();
    this.form.controls.counterpartyId.markAsTouched();
    this.syncCedentValidation();
    this.closeCedentDropdown();
  }

  clearCedentSelection(): void {
    this.selectedCedentName = '';
    this.cedentSearchControl.setValue('', { emitEvent: false });
    this.form.controls.counterpartyId.setValue(null);
    this.cedentResults.set([]);
    this.cedentLookupError.set(false);
    this.closeCedentDropdown();
  }

  handleCedentKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.isCedentDropdownOpen()) {
          this.openCedentDropdown();
          return;
        }
        this.moveActiveCedent(1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        if (!this.isCedentDropdownOpen()) {
          this.openCedentDropdown();
          return;
        }
        this.moveActiveCedent(-1);
        return;
      case 'Enter': {
        if (!this.isCedentDropdownOpen()) {
          return;
        }

        const activeCedent = this.cedentResults()[this.activeCedentIndex()];

        if (!activeCedent) {
          return;
        }

        event.preventDefault();
        this.selectCedent(activeCedent);
        return;
      }
      case 'Escape':
        if (!this.isCedentDropdownOpen()) {
          return;
        }

        event.preventDefault();
        this.closeCedentDropdown();
        return;
      default:
        return;
    }
  }

  setActiveCedentIndex(index: number): void {
    this.activeCedentIndex.set(index);
  }

  cedentLocationLabel(cedent: CedentReference): string {
    return [cedent.city, cedent.country]
      .filter((value): value is string => !!value && value.trim().length > 0)
      .join(', ');
  }

  bindCedentSearch(): void {
    const typedSearches$ = this.cedentSearchControl.valueChanges.pipe(
      tap((value) => {
        if (value !== this.selectedCedentName && this.form.controls.counterpartyId.value !== null) {
          this.form.controls.counterpartyId.setValue(null);
        }
      }),
      tap(() => {
        this.isCedentDropdownOpen.set(true);
      }),
      map(() => this.getCedentLookupTerm()),
      debounceTime(300),
      distinctUntilChanged(),
    );

    const openSearches$ = this.cedentOpenRequests.pipe(map(() => this.getCedentLookupTerm()));

    merge(openSearches$, typedSearches$)
      .pipe(
        tap(() => {
          this.isCedentLoading.set(true);
          this.cedentLookupError.set(false);
        }),
        switchMap((search) =>
          this.contractsService.searchCedents(search, 1, 20).pipe(
            map((response) => response.items),
            catchError(() => {
              this.cedentLookupError.set(true);
              return of([] as CedentReference[]);
            }),
            finalize(() => this.isCedentLoading.set(false)),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((results) => {
        this.cedentResults.set(results);
        this.activeCedentIndex.set(results.length > 0 ? 0 : -1);
      });
  }

  bindMainCoverSearch(): void {
    this.mainCoverOpenRequests
      .pipe(
        tap(() => {
          this.mainCoverLookupError.set(false);
          this.activeMainCoverIndex.set(this.filteredCoverages().length > 0 ? 0 : -1);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  bindCoverageSelection(): void {
    this.form.controls.coverageSelection.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refreshSnapshot());
    this.refreshSnapshot();
    const coverageControls = this.form.controls.coverageSelection.controls;

    coverageControls.coverageIds.valueChanges
      .pipe(
        distinctUntilChanged((previous, current) => this.areNumberArraysEqual(previous, current)),
        tap((coverageIds) => {
          if (this.isHydratingCoverage) {
            return;
          }

          if (!coverageIds.length) {
            this.clearCoverageChildren();
            coverageControls.primaryMainCoverId.setValue(null, { emitEvent: false });
            coverageControls.mainCoverId.setValue(null, { emitEvent: false });
            return;
          }

          const primaryMainCoverId = coverageControls.primaryMainCoverId.value;
          if (!primaryMainCoverId || !coverageIds.includes(primaryMainCoverId)) {
            const nextPrimaryMainCoverId = coverageIds[0];
            coverageControls.primaryMainCoverId.setValue(nextPrimaryMainCoverId, {
              emitEvent: false,
            });
            coverageControls.mainCoverId.setValue(nextPrimaryMainCoverId, { emitEvent: false });
          }
        }),
        switchMap((coverageIds) => {
          if (this.isHydratingCoverage || coverageIds.length === 0) {
            return of(null);
          }

          return this.loadCoverageChildren(
            coverageIds,
            coverageControls.sectionIds.value,
            coverageControls.extensionIds.value,
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();

    coverageControls.primaryMainCoverId.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((primaryMainCoverId) => {
        coverageControls.mainCoverId.setValue(primaryMainCoverId, { emitEvent: false });
      });

    coverageControls.sectionIds.valueChanges
      .pipe(
        distinctUntilChanged((previous, current) => this.areNumberArraysEqual(previous, current)),
        switchMap((sectionIds) => {
          if (this.isHydratingCoverage) {
            return of(null);
          }

          const normalizedSectionIds = this.mergeMandatoryIds(sectionIds, this.availableSections());

          if (!this.areNumberArraysEqual(sectionIds, normalizedSectionIds)) {
            coverageControls.sectionIds.setValue(normalizedSectionIds, { emitEvent: false });
          }

          return this.loadExtensionsForSelection(
            normalizedSectionIds,
            coverageControls.extensionIds.value,
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();

    coverageControls.extensionIds.valueChanges
      .pipe(
        distinctUntilChanged((previous, current) => this.areNumberArraysEqual(previous, current)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((extensionIds) => {
        if (this.isHydratingCoverage) {
          return;
        }

        const normalizedExtensionIds = this.mergeMandatoryIds(
          extensionIds,
          this.availableExtensions(),
        );

        if (!this.areNumberArraysEqual(extensionIds, normalizedExtensionIds)) {
          coverageControls.extensionIds.setValue(normalizedExtensionIds, { emitEvent: false });
        }
      });
  }

  loadCoverageChildren(
    mainCoverIds: number[],
    savedSectionIds: number[],
    savedExtensionIds: number[],
  ) {
    this.refreshSnapshot();
    const validMainCoverIds = this.uniquePositiveNumberArray(mainCoverIds);

    if (!validMainCoverIds.length) {
      this.clearCoverageChildren();
      return of(null);
    }

    this.isSectionsLoading.set(true);
    this.isExtensionsLoading.set(true);
    this.sectionsError.set('');
    this.extensionsError.set('');

    return forkJoin({
      sectionsByCoverage: forkJoin(
        validMainCoverIds.map((mainCoverId) =>
          this.contractsService.getCoverageChildren(mainCoverId, 'SECTION').pipe(
            catchError(() => {
              this.sectionsError.set('Sections could not be loaded for the selected coverages.');
              return of([] as CoverageOption[]);
            }),
          ),
        ),
      ),
      directExtensionsByCoverage: forkJoin(
        validMainCoverIds.map((mainCoverId) =>
          this.contractsService.getCoverageChildren(mainCoverId, 'EXTENSION').pipe(
            catchError(() => {
              this.extensionsError.set(
                'Extensions could not be loaded for the selected coverages.',
              );
              return of([] as CoverageOption[]);
            }),
          ),
        ),
      ),
    }).pipe(
      switchMap(({ sectionsByCoverage, directExtensionsByCoverage }) => {
        const sections = this.uniqueCoverageOptions(
          sectionsByCoverage
            .flat()
            .filter(
              (section) =>
                section.level === 'SECTION' &&
                section.parentId != null &&
                validMainCoverIds.includes(section.parentId) &&
                section.relationType === 'HAS_SECTION',
            ),
        );
        const directExtensions = this.uniqueCoverageOptions(
          directExtensionsByCoverage
            .flat()
            .filter(
              (extension) =>
                extension.level === 'EXTENSION' &&
                extension.parentId != null &&
                validMainCoverIds.includes(extension.parentId) &&
                extension.relationType === 'HAS_EXTENSION',
            ),
        );
        this.sections.set(sections);
        this.setSectionsEnabled(sections.length > 0);

        const sectionIds = this.mergeMandatoryIds(savedSectionIds, sections);
        this.form.controls.coverageSelection.controls.sectionIds.setValue(sectionIds, {
          emitEvent: false,
        });
        this.refreshSnapshot();

        return this.loadExtensionsForSelection(sectionIds, savedExtensionIds, directExtensions);
      }),
      finalize(() => {
        this.isSectionsLoading.set(false);
        this.isExtensionsLoading.set(false);
      }),
    );
  }

  loadExtensionsForSelection(
    sectionIds: number[],
    savedExtensionIds: number[],
    directExtensions?: CoverageOption[],
  ) {
    const mainCoverIds = this.uniquePositiveNumberArray(
      this.form.controls.coverageSelection.controls.coverageIds.value,
    );
    const validSectionIds = this.uniquePositiveNumberArray(sectionIds);

    if (!mainCoverIds.length) {
      this.extensions.set([]);
      this.setExtensionsEnabled(false);
      this.form.controls.coverageSelection.controls.extensionIds.setValue([], { emitEvent: false });
      return of(null);
    }

    this.isExtensionsLoading.set(true);
    if (!directExtensions) {
      this.extensionsError.set('');
    }

    const directExtensions$ = directExtensions
      ? of(directExtensions)
      : forkJoin(
          mainCoverIds.map((mainCoverId) =>
            this.contractsService.getCoverageChildren(mainCoverId, 'EXTENSION').pipe(
              catchError(() => {
                this.extensionsError.set(
                  'Extensions could not be loaded for the selected coverages.',
                );
                return of([] as CoverageOption[]);
              }),
            ),
          ),
        ).pipe(map((results) => this.uniqueCoverageOptions(results.flat())));

    const sectionExtensionRequests = validSectionIds.map((sectionId) =>
      this.contractsService.getCoverageChildren(sectionId, 'EXTENSION').pipe(
        catchError(() => {
          this.extensionsError.set('Some section extensions could not be loaded.');
          return of([] as CoverageOption[]);
        }),
      ),
    );

    return forkJoin([
      directExtensions$,
      sectionExtensionRequests.length > 0
        ? forkJoin(sectionExtensionRequests)
        : of([] as CoverageOption[][]),
    ]).pipe(
      tap(([mainCoverExtensions, sectionExtensions]) => {
        const selectedMainCoverIds = new Set(mainCoverIds);
        const selectedSectionIds = new Set(validSectionIds);
        const extensions = this.uniqueCoverageOptions(
          [...mainCoverExtensions, ...sectionExtensions.flat()].filter((extension) => {
            if (
              extension.level !== 'EXTENSION' ||
              extension.parentId == null ||
              extension.relationType !== 'HAS_EXTENSION'
            ) {
              return false;
            }

            return (
              selectedMainCoverIds.has(extension.parentId) ||
              selectedSectionIds.has(extension.parentId)
            );
          }),
        );
        this.extensions.set(extensions);
        this.setExtensionsEnabled(extensions.length > 0);

        const validSavedExtensionIds = savedExtensionIds.filter((id) =>
          extensions.some((option) => option.id === id),
        );
        const extensionIds = this.mergeMandatoryIds(validSavedExtensionIds, extensions);
        this.form.controls.coverageSelection.controls.extensionIds.setValue(extensionIds, {
          emitEvent: false,
        });
        this.refreshSnapshot();
      }),
      finalize(() => this.isExtensionsLoading.set(false)),
      map(() => null),
    );
  }

  syncCedentValidation(): void {
    this.clearCedentSelectionError();
  }

  hasSelectedCedent(): boolean {
    return (
      this.form.controls.counterpartyId.value != null &&
      this.cedentSearchControl.value.trim() === this.selectedCedentName
    );
  }

  getCedentLookupTerm(): string | null {
    const trimmedValue = this.cedentSearchControl.value.trim();

    if (!trimmedValue) {
      return null;
    }

    return this.hasSelectedCedent() ? null : trimmedValue;
  }

  moveActiveCedent(direction: number): void {
    const results = this.cedentResults();

    if (results.length === 0) {
      this.activeCedentIndex.set(-1);
      return;
    }

    const currentIndex = this.activeCedentIndex();
    const nextIndex =
      currentIndex < 0 ? 0 : (currentIndex + direction + results.length) % results.length;

    this.activeCedentIndex.set(nextIndex);
  }

  moveActiveMainCover(direction: number): void {
    const results = this.filteredCoverages();

    if (results.length === 0) {
      this.activeMainCoverIndex.set(-1);
      return;
    }

    const currentIndex = this.activeMainCoverIndex();
    const nextIndex =
      currentIndex < 0 ? 0 : (currentIndex + direction + results.length) % results.length;

    this.activeMainCoverIndex.set(nextIndex);
  }

  groupCoverageOptionsByParent(options: CoverageOption[]): CoverageOptionGroup[] {
    const groups = new Map<string, CoverageOption[]>();

    for (const option of options) {
      const parentLabel = this.getCoverageParentLabel(option);
      groups.set(parentLabel, [...(groups.get(parentLabel) ?? []), option]);
    }

    return Array.from(groups.entries()).map(([parentLabel, items]) => ({ parentLabel, items }));
  }

  clearCoverageChildren(): void {
    this.sections.set([]);
    this.extensions.set([]);
    this.sectionSearch.set('');
    this.extensionSearch.set('');
    this.sectionsError.set('');
    this.extensionsError.set('');
    this.form.controls.coverageSelection.controls.sectionIds.setValue([], { emitEvent: false });
    this.form.controls.coverageSelection.controls.extensionIds.setValue([], { emitEvent: false });
    this.setSectionsEnabled(false);
    this.setExtensionsEnabled(false);
  }

  setSectionsEnabled(isEnabled: boolean): void {
    const control = this.form.controls.coverageSelection.controls.sectionIds;

    if (isEnabled) {
      control.enable({ emitEvent: false });
    } else {
      control.disable({ emitEvent: false });
    }
  }

  setExtensionsEnabled(isEnabled: boolean): void {
    const control = this.form.controls.coverageSelection.controls.extensionIds;

    if (isEnabled) {
      control.enable({ emitEvent: false });
    } else {
      control.disable({ emitEvent: false });
    }
  }

  mergeMandatoryIds(selectedIds: number[], options: CoverageOption[]): number[] {
    const availableIds = new Set(options.map((option) => option.id));
    const selectedAvailableIds = selectedIds.filter((id) => availableIds.has(id));
    const mandatoryIds = options.filter((option) => option.isMandatory).map((option) => option.id);

    return [...new Set([...selectedAvailableIds, ...mandatoryIds])];
  }

  uniqueCoverageOptions(options: CoverageOption[]): CoverageOption[] {
    const seenIds = new Set<number>();

    return options.filter((option) => {
      if (option.id <= 0 || seenIds.has(option.id)) {
        return false;
      }

      seenIds.add(option.id);
      return true;
    });
  }

  findCoverageOption(options: CoverageOption[], id: number | null): CoverageOption | null {
    if (id == null) {
      return null;
    }

    return options.find((option) => option.id === id) ?? null;
  }

  findCoverageOptions(options: CoverageOption[], ids: number[]): CoverageOption[] {
    const selectedIds = new Set(ids);
    return options.filter((option) => selectedIds.has(option.id));
  }

  filterCoverageOptions(options: CoverageOption[], searchValue: string): CoverageOption[] {
    const search = searchValue.trim().toLowerCase();

    if (!search) {
      return options;
    }

    return options.filter((option) => {
      const description = option.description ?? option.name;
      return (
        option.code.toLowerCase().includes(search) ||
        option.name.toLowerCase().includes(search) ||
        description.toLowerCase().includes(search)
      );
    });
  }

  isMainCoverageLevel(option: CoverageOption): boolean {
    return option.level === 'MAIN' || option.level === 'MAIN_COVER';
  }

  areNumberArraysEqual(previous: number[], current: number[]): boolean {
    if (previous.length !== current.length) {
      return false;
    }

    return previous.every((value, index) => value === current[index]);
  }

  clearCedentSelectionError(): void {
    if (!this.form.controls.counterpartyId.hasError('invalidSelection')) {
      return;
    }

    const errors = { ...(this.form.controls.counterpartyId.errors ?? {}) };
    delete errors['invalidSelection'];
    this.form.controls.counterpartyId.setErrors(Object.keys(errors).length > 0 ? errors : null);
  }

  uniquePositiveNumberArray(values: number[]): number[] {
    return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))];
  }
}
