import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Prototipo } from './prototipo';

describe('Prototipo', () => {
  let component: Prototipo;
  let fixture: ComponentFixture<Prototipo>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Prototipo]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Prototipo);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
