import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface Step {
  label: string;
  subLabel?: string;
  icon?: string;
  completed?: boolean;
  /**
   * When true the step is not rendered in the stepper at all.
   * The consumer is responsible for filtering these out before passing
   * the array, or setting this flag per entry.
   */
  hidden?: boolean;
}

@Component({
  selector: 'app-stepper',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './stepper.component.html',
  styleUrls: ['./stepper.component.scss']
})
export class StepperComponent {
  @Input() steps: Step[] = [];
  @Input() currentStep = 0;
  /** When set, steps with index > maxEnabledStep are rendered disabled and cannot be clicked. */
  @Input() maxEnabledStep: number | null = null;
  @Output() stepChange = new EventEmitter<number>();

  /** Steps that should actually be rendered (hidden ones are excluded). */
  get visibleSteps(): Step[] {
    return this.steps.filter((s) => !s.hidden);
  }

  /**
   * Map a visible-list index back to the original index so stepChange
   * always emits the original step index (used by the parent for content switching).
   */
  getOriginalIndex(visibleIndex: number): number {
    let count = 0;
    for (let i = 0; i < this.steps.length; i++) {
      if (!this.steps[i].hidden) {
        if (count === visibleIndex) return i;
        count++;
      }
    }
    return visibleIndex;
  }

  /**
   * Convert the original currentStep index to a visible-list index
   * so the stepper highlights the correct pill.
   */
  get visibleCurrentStep(): number {
    let count = 0;
    for (let i = 0; i < this.steps.length; i++) {
      if (!this.steps[i].hidden) {
        if (i === this.currentStep) return count;
        count++;
      }
    }
    return 0;
  }

  onStepClick(visibleIndex: number): void {
    const originalIndex = this.getOriginalIndex(visibleIndex);
    if (this.maxEnabledStep != null && originalIndex > this.maxEnabledStep) {
      return;
    }
    this.stepChange.emit(originalIndex);
  }
}
