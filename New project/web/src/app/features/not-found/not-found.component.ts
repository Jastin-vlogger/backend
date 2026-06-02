import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PrimaryButtonDirective } from '../../shared/directives/button.directive';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, PrimaryButtonDirective],
  templateUrl: './not-found.component.html',
  styleUrls: ['./not-found.component.scss']
})
export class NotFoundComponent {}
