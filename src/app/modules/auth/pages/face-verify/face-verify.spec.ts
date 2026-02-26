import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FaceVerify } from './face-verify';

describe('FaceVerify', () => {
  let component: FaceVerify;
  let fixture: ComponentFixture<FaceVerify>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FaceVerify]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FaceVerify);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
