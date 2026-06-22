import { Pipe, PipeTransform } from '@angular/core';
import { ValidationErrors } from '@angular/forms';

@Pipe({
  name: 'firstKey',
  standalone: true,
})
export class FirstKeyPipe implements PipeTransform {
  transform(value: ValidationErrors | null | undefined): string | null {
    if (!value) {
      return null;
    }

    return Object.keys(value)[0] ?? null;
  }
}
