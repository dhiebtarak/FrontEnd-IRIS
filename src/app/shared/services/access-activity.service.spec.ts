import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AccessActivityService } from './access-activity.service';
import { Auth } from './auth';
describe('AccessActivityService',()=>{
  beforeEach(()=>TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting(),{provide:Auth,useValue:{baseUrl:'/api'}}]}));
  afterEach(()=>TestBed.inject(HttpTestingController).verify());
  it('sends user filters and paging through the configured API base',()=>{
    TestBed.inject(AccessActivityService).list({pageNumber:2,pageSize:50,sortBy:'username',sortDirection:'asc',userId:'user/id',search:'Jane Doe'}).subscribe();
    const request=TestBed.inject(HttpTestingController).expectOne(r=>r.url==='/api/admin/access-activity/sessions');
    expect(request.request.params.get('userId')).toBe('user/id');expect(request.request.params.get('pageNumber')).toBe('2');expect(request.request.params.get('search')).toBe('Jane Doe');
    request.flush({items:[],totalCount:0,pageNumber:2,pageSize:50});
  });
  it('posts a revocation reason without credentials',()=>{
    TestBed.inject(AccessActivityService).revoke('session-id','Security review').subscribe();
    const request=TestBed.inject(HttpTestingController).expectOne('/api/admin/access-activity/sessions/session-id/revoke');
    expect(request.request.method).toBe('POST');expect(request.request.body).toEqual({reason:'Security review'});request.flush({revokedCount:1,currentSessionRevoked:false});
  });
});
