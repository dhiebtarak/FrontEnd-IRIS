import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, takeUntil, throwError } from 'rxjs';
import { Auth } from '../services/auth';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const url = new URL(req.url, window.location.origin);
  const ownApi = url.origin === window.location.origin && url.pathname.startsWith('/api/');
  const publicRequest = /^\/api\/(auth\/(login|register|logout)|health)(\/|$)/.test(url.pathname);
  if (!ownApi || publicRequest) return next(req);
  const auth = inject(Auth);
  if (auth.sessionExpired()) return throwError(() => new HttpErrorResponse({ status: 401, error: { code: 'SESSION_EXPIRED' } }));
  const token = auth.getToken();
  if (!token) return next(req);
  if (auth.checkExpiration()) return throwError(() => new HttpErrorResponse({ status: 401, error: { code: 'SESSION_EXPIRED' } }));
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })).pipe(
    takeUntil(auth.sessionEnded),
    catchError(error => {
      if (error.status === 401 && auth.getToken() === token) {
        if (error.error?.code === 'SESSION_EXPIRED') auth.expireSession();
        else if (['SESSION_REVOKED', 'SESSION_UNAVAILABLE'].includes(error.error?.code)) auth.clearSession();
      }
      return throwError(() => error);
    })
  );
};
