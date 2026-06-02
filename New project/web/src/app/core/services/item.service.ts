import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Item, ItemListResponse, ItemLookupResponse } from '../models/item.model';

@Injectable({
  providedIn: 'root'
})
export class ItemService {
  private apiUrl = 'item';

  constructor(private http: HttpClient) {}

  getAllItems(page: number = 1, limit: number = 20): Observable<ItemListResponse> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());
    
    return this.http.get<ItemListResponse>(`${this.apiUrl}/all`, { params });
  }

  getItemById(id: string): Observable<Item> {
    return this.http.get<Item>(`${this.apiUrl}/${id}`);
  }

  getItemByCode(itemCode: string): Observable<ItemLookupResponse> {
    return this.http.get<ItemLookupResponse>(`${this.apiUrl}/by-code/${encodeURIComponent(itemCode)}`);
  }

  createItem(payload: Partial<Item>): Observable<{ message: string; item: Item }> {
    return this.http.post<{ message: string; item: Item }>(`${this.apiUrl}/create`, payload);
  }

  updateItem(id: string, payload: Partial<Item>): Observable<{ message: string; item: Item }> {
    return this.http.put<{ message: string; item: Item }>(`${this.apiUrl}/${id}`, payload);
  }

  deleteItem(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }
}
