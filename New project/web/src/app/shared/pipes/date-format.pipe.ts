import { Pipe, PipeTransform } from '@angular/core';
@Pipe({ name: 'dateFormat', standalone: true })
export class DateFormatPipe implements PipeTransform { transform(value: unknown): unknown { return null; } }
