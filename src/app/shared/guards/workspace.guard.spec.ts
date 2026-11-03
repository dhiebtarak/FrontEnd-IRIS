import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom, Observable, of } from 'rxjs';
import { workspaceGuard } from './workspace.guard';
import { Auth } from '../services/auth';
describe('workspaceGuard Administrator isolation',()=>{
  it('redirects administrators away from manually entered operational routes',async()=>{
    TestBed.configureTestingModule({providers:[provideRouter([]),{provide:Auth,useValue:{isLoggedIn:()=>true,refreshCurrentWorkspace:()=>of({}),isAdmin:()=>true}}]});
    const result=TestBed.runInInjectionContext(()=>workspaceGuard({} as never,{url:'/workspace/reassurance/back-officer'} as never));
    const tree=await firstValueFrom(result as Observable<ReturnType<Router['createUrlTree']>>);
    expect(TestBed.inject(Router).serializeUrl(tree)).toBe('/workspace/administrator');
  });
});
