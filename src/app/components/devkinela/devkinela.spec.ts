import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Devkinela } from './devkinela';

describe('Devkinela', () => {
  let component: Devkinela;
  let fixture: ComponentFixture<Devkinela>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Devkinela]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Devkinela);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
