import { Directive, ElementRef, HostListener, Renderer2 } from '@angular/core';

@Directive({
  selector: '[appButton]',
  standalone: true,
  host: {
    '[class]': 'buttonClasses'
  }
})
export class PrimaryButtonDirective {
  protected readonly buttonClasses = `
    relative overflow-hidden
    inline-flex items-center justify-center gap-2 
    px-4 py-2.5 rounded-xl font-medium text-sm 
    bg-[#0F172A] text-white cursor-pointer
    transition-all duration-200 ease-in-out
    hover:bg-slate-800 hover:shadow-lg
    focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2
    active:scale-[0.98]
    disabled:opacity-50 disabled:cursor-not-allowed
  `;

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent): void {
    const button = this.el.nativeElement;
    
    // Create the ripple element
    const ripple = this.renderer.createElement('span');
    const diameter = Math.max(button.clientWidth, button.clientHeight);
    const radius = diameter / 2;

    const rect = button.getBoundingClientRect();

    // Style the ripple
    this.renderer.setStyle(ripple, 'width', `${diameter}px`);
    this.renderer.setStyle(ripple, 'height', `${diameter}px`);
    this.renderer.setStyle(ripple, 'left', `${event.clientX - rect.left - radius}px`);
    this.renderer.setStyle(ripple, 'top', `${event.clientY - rect.top - radius}px`);
    
    // Custom ripple style (No theme needed)
    this.renderer.addClass(ripple, 'absolute');
    this.renderer.addClass(ripple, 'rounded-full');
    this.renderer.addClass(ripple, 'bg-white/30');
    this.renderer.addClass(ripple, 'pointer-events-none');
    this.renderer.addClass(ripple, 'animate-ripple');

    // Add to button
    this.renderer.appendChild(button, ripple);

    // Remove after animation
    setTimeout(() => {
      this.renderer.removeChild(button, ripple);
    }, 600);
  }
}
