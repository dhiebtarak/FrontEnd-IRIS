import { CommonModule } from '@angular/common';
import {
  Component,
  Input,
  ViewChild,
  ElementRef,
  AfterViewInit,
  HostListener,
  inject,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { ContractReferenceState } from './contract-reference-state';
@Component({
  selector: 'app-contract-cedent-selector',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './contract-cedent-selector.html',
})
export class ContractCedentSelectorComponent {
  @Input({ required: true }) state!: ContractReferenceState;
  private readonly element = inject(ElementRef<HTMLElement>);
  focusOut(event: FocusEvent) {
    if (!this.element.nativeElement.contains(event.relatedTarget as Node | null))
      this.state.closeCedentDropdown();
  }
  @HostListener('document:pointerdown', ['$event']) outside(event: PointerEvent) {
    if (!this.element.nativeElement.contains(event.target as Node | null))
      this.state.closeCedentDropdown();
  }
}
@Component({
  selector: 'app-contract-coverage-selector',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './contract-coverage-selector.html',
})
export class ContractCoverageSelectorComponent implements AfterViewInit {
  @Input({ required: true }) state!: ContractReferenceState;
  @ViewChild('coveragePicker') picker?: ElementRef<HTMLElement>;
  ngAfterViewInit() {
    this.state.coveragePicker = this.picker;
  }
  @HostListener('document:pointerdown', ['$event']) outside(event: PointerEvent) {
    if (!this.picker?.nativeElement.contains(event.target as Node | null))
      this.state.closeCoverageDropdown();
  }
}
