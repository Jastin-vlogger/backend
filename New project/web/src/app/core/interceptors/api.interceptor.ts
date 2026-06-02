import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  // If URL is relative, prefix it with apiUrl
  if (!req.url.startsWith('http') && !req.url.startsWith('assets/')) {
    const baseUrl = environment.apiUrl.endsWith('/') 
      ? environment.apiUrl.slice(0, -1) 
      : environment.apiUrl;
      
    const relativeUrl = req.url.startsWith('/') 
      ? req.url.slice(1) 
      : req.url;

    const apiReq = req.clone({
      url: `${baseUrl}/${relativeUrl}`
    });
    
    return next(apiReq);
  }
  
  return next(req);
};
