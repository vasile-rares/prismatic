import { Component, ElementRef, Optional, Self, input, viewChild } from '@angular/core';
import { ControlValueAccessor, FormsModule, NgControl } from '@angular/forms';

@Component({
  selector: 'app-text-input',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './text-input.component.html',
  styleUrl: './text-input.component.css',
})
export class TextInputComponent implements ControlValueAccessor {
  readonly id = input<string | undefined>(undefined);
  readonly label = input('');
  readonly placeholder = input('');
  readonly type = input<'text' | 'email' | 'password' | 'url' | 'search'>('text');
  readonly autocomplete = input('off');
  readonly requiredMarker = input(false);
  readonly maxLength = input<number | undefined>(undefined);
  readonly errorText = input('');
  readonly forceInvalid = input(false);
  readonly enablePasswordToggle = input(false);
  readonly readonly = input(false);

  readonly multiline = input(false);
  readonly rows = input(3);

  value = '';
  disabled = false;
  passwordVisible = false;

  readonly inputElement =
    viewChild<ElementRef<HTMLInputElement | HTMLTextAreaElement>>('inputElement');

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor(@Optional() @Self() private readonly ngControl: NgControl) {
    if (this.ngControl) {
      this.ngControl.valueAccessor = this;
    }
  }

  get isInvalid(): boolean {
    if (this.forceInvalid()) {
      return true;
    }

    const control = this.ngControl?.control;
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  get computedType(): string {
    if (this.type() === 'password' && this.enablePasswordToggle() && this.passwordVisible) {
      return 'text';
    }

    return this.type();
  }

  writeValue(value: string | null): void {
    this.value = value ?? '';
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  handleInput(event: Event): void {
    const nextValue = (event.target as HTMLInputElement).value;
    this.value = nextValue;
    this.onChange(nextValue);
  }

  handleBlur(): void {
    // onTouched() intentionally omitted — validation errors are shown
    // only after the form is submitted via markAllAsTouched(), not on blur.
  }

  togglePasswordVisibility(): void {
    if (this.disabled || this.type() !== 'password' || !this.enablePasswordToggle()) {
      return;
    }

    this.passwordVisible = !this.passwordVisible;
  }

  focus(selectText = false): void {
    const input = this.inputElement()?.nativeElement;
    if (!input || this.disabled) {
      return;
    }

    input.focus();

    if (selectText && typeof input.select === 'function') {
      input.select();
    }
  }
}
