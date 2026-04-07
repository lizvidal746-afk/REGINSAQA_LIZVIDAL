// @ts-nocheck — Angular CT deshabilitado (@angular/core no instalado en QA project).
// DESHABILITADO: Angular CT no soportado por Playwright.
// Este archivo es referencia histórica — ver git log para la implementacion Angular.
// La cobertura equivalente esta en tests/casos-prueba (test:02, test:04).

export {}; // Silenciar TS sin imports de @angular/core (removido de package.json)

/**
 * Fixture standalone para probar las validaciones del formulario de sancion.
 * Replica la logica de campos requeridos de InfractorComponent sin PrimeNG ni servicios.
 */
@Component({
  selector: 'ct-sancion-form',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <form [formGroup]="form" data-testid="frm-sancion">

      <div>
        <label>Numero de Expediente</label>
        <input data-testid="inp-expediente" formControlName="numeroExpediente" maxlength="50" />
        <span data-testid="err-expediente"
          *ngIf="form.get('numeroExpediente')?.invalid && form.get('numeroExpediente')?.touched">
          Requerido
        </span>
      </div>

      <div>
        <label>Numero de Resolucion</label>
        <input data-testid="inp-resolucion" formControlName="numeroResolucion" maxlength="50" />
        <span data-testid="err-resolucion"
          *ngIf="form.get('numeroResolucion')?.invalid && form.get('numeroResolucion')?.touched">
          Requerido
        </span>
      </div>

      <div>
        <label>Fecha de Resolucion</label>
        <input data-testid="inp-fecha" type="date" formControlName="fechaResolucion" />
        <span data-testid="err-fecha"
          *ngIf="form.get('fechaResolucion')?.invalid && form.get('fechaResolucion')?.touched">
          Requerido
        </span>
      </div>

      <button
        data-testid="btn-submit"
        type="button"
        [disabled]="form.invalid || saving"
        (click)="submit()">
        Guardar Sancion
      </button>

    </form>
  `,
})
export class SancionFormFixture implements OnInit {
  @Input() saving = false;
  @Output() submitted = new EventEmitter<Record<string, unknown>>();

  form!: FormGroup;

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      numeroExpediente: ['', [Validators.required, Validators.maxLength(50)]],
      numeroResolucion: ['', [Validators.required, Validators.maxLength(50)]],
      fechaResolucion:  [null, Validators.required],
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitted.emit(this.form.value as Record<string, unknown>);
  }
}
