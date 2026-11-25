import { ContractStyleDirective } from '../shared/contract-style.directive';
import { xolDecimalLabel } from './xol-preview';
import { CommonModule } from '@angular/common';
import { Component, input, output, signal } from '@angular/core';
import {
  XolDecimal,
  XolLayer,
  XolLayerResponse,
  XOL_REINSTATEMENT_CONDITIONS,
} from '../../shared/models/xol.model';
@Component({
  selector: 'app-xol-layers',
  standalone: true,
  imports: [ContractStyleDirective, CommonModule],
  templateUrl: './xol-layers.component.html',
})
export class XolLayersComponent {
  readonly layers = input<XolLayerResponse[]>([]);
  readonly currency = input('');
  readonly editable = input(false);
  readonly edit = output<XolLayer>();
  readonly remove = output<XolLayer>();
  readonly expanded = signal(new Set<number>());
  toggle(index: number) {
    this.expanded.update((values) => {
      const next = new Set(values);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }
  fullAmount(value: XolDecimal | null): string {
    return value === null ? 'Not provided' : `${this.currency()} ${xolDecimalLabel(value)}`;
  }
  reinstatementLabel(code: string): string {
    return XOL_REINSTATEMENT_CONDITIONS.find((option) => option.code === code)?.name ?? code;
  }
  money(value: XolDecimal | null): string {
    return value === null ? 'Not provided' : `${this.currency()} ${xolDecimalLabel(value)}`;
  }
  percent(value: XolDecimal | null): string {
    return value === null ? 'Not provided' : xolDecimalLabel(value) + '%';
  }
}
